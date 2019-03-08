/*
*   Key details:
*   For scaling purposes this code takes 1 unit to be 1 physical meter. (0.3 units = 1 foot)
*
*   I acknowledge that code snippets from provided lectures, practicals and the WebGL Programming Guide have been
*   used. Those code snippets that could be modified reasonably have been so that they can be considered my own
*   work product. Those code snippets that are directly used correspond to geometric data and helper function. In
*   those cases the code snippets are not large enough to change to make my own. All this work is my own.
*
* */

var modelMatrix = new Matrix4(); // The model matrix
var viewMatrix = new Matrix4();  // The view matrix
var projMatrix = new Matrix4();  // The projection matrix
var g_normalMatrix = new Matrix4();  // Coordinate transformation matrix for normals

// Classroom size for help scaling all objects - 16 * 28 * 10 feet
const WIDTH = 16*0.3+0.08, LENGTH = 28*0.3, HEIGHT = 10*0.3;

// LIGHTING VARIABLES
// xyz position for each of the 3 point light, the sun, and the blind bottoms (x is back, y is middle, z is front)
const LIGHT_POSITIONS = [16*0.15, 2.65, 14*0.15,
                         16*0.15, 2.65, 2*14*0.15,
                         16*0.15, 2.65, 3*14*0.15,
                        -5, 3, LENGTH/2, 2.1, 2.1, 2.1];

// RGB for each ceiling light brightness and the sun
const LIGHT_CONST = [255/255, 241/255, 224/255];
var LIGHT_COLORS = [255/255, 241/255, 224/255,
                    255/255, 241/255, 224/255,
                    255/255, 241/255, 224/255,
                    253/255, 184/255, 19/255];

// DYNAMIC OBJECT VARIABLES
// Offset from original position in feet of whiteboard pairs (left, centre, right). Max 2.75
var BOARD_OFFSET = [0, 0, 0];
// Store state of each chair. Value ranges in [-UN_TUCK_BY,0].
const UN_TUCK_BY = 0.6;
var TUCKED_IN = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
// Used to animate door proximity opening
var OPEN_BY = 0, IN_DOOR_RANGE = false;

// MOTION VARIABLES
/*             +z
 *      ROOM    |
 *      FLOOR   |
 *      HERE    |
 *              |
 *  +x ---------+-- -x
 *             -z
 */
// Initial camera position - looking along +z axis, +x on left, -x on right. Use +x and +z as walls
var at_x = 8*0.3, at_z = 0.1, at_y = 1.5;
// Initial camera angles, yaw (+ left, - right) and pitch (0 up, 180 down)
var yaw = 0, pitch = 90;
// Rotation and 3 axis step sizes
const ANGLE_STEP = 5, STEP_SIZE = 0.2;

// Track if all textures have been loaded (currently 7)
var INIT_TEXTURE_COUNT = 0, TEXTURES_ON = true;

// For smooth actions - keep track of which keys are held down
var keys = {};

// Uniforms and contexts - made global for easy reference
var gl, ctx;
var u_ModelMatrix, u_NormalMatrix, u_ViewMatrix, u_ProjMatrix;
var u_UseTextures, u_Sampler;
var u_LightColor, u_LightPosition;

// Control if instructions displayed on screen
var INSTRUCTIONS_ON = true, CAMERA_LOCK = true;

// Timing variables for tick functions used in animation
var last_call, lastFPSTime = 0, frame_time = 0;

function main() {
    // Retrieve <canvas> element
    var canvas = document.getElementById('webgl');
    var hud = document.getElementById('hud');

    // Get the rendering context for WebGL
    gl = getWebGLContext(canvas, false);
    // Get the rendering context for 2DCG
    ctx = hud.getContext('2d');

    if (!gl || !ctx) {
        console.log('Failed to get the rendering context for WebGL');
        return;
    }

    // Initialize shaders - store source in html as its easier to format and read
    var VSHADER_SOURCE = document.getElementById("vertex").innerText;
    var FSHADER_SOURCE = document.getElementById("fragment").innerText;

    if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
        console.log('Failed to intialize shaders.');
        return;
    }

    // Set clear color and enable the depth test
    gl.clearColor(0.49, 0.75, 0.93, 1); // sky blue
    gl.enable(gl.DEPTH_TEST);

    // Enable alpha blend for transparent windows
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Get the storage locations of uniform attributes
    u_ModelMatrix = gl.getUniformLocation(gl.program, 'u_ModelMatrix');
    u_NormalMatrix = gl.getUniformLocation(gl.program, 'u_NormalMatrix');
    u_UseTextures = gl.getUniformLocation(gl.program, 'u_UseTextures');
    u_ViewMatrix = gl.getUniformLocation(gl.program, 'u_ViewMatrix');
    u_ProjMatrix = gl.getUniformLocation(gl.program, 'u_ProjMatrix');
    u_LightColor = gl.getUniformLocation(gl.program, 'u_LightColor');
    u_LightPosition = gl.getUniformLocation(gl.program, 'u_LightPosition');
    var u_AmbientLight = gl.getUniformLocation(gl.program, 'u_AmbientLight');

    if (!u_ModelMatrix || !u_NormalMatrix || !u_UseTextures ||
        !u_ViewMatrix || !u_ProjMatrix || !u_LightColor ||
        !u_LightPosition || !u_AmbientLight) {
        console.log('Failed to get the storage locations of a uniform.');
        return;
    }

    // Calculate the projection matrix and pass it to the uniform variable
    projMatrix.setPerspective(60, canvas.width / canvas.height, 0.1, 20);
    gl.uniformMatrix4fv(u_ProjMatrix, false, projMatrix.elements);

    // Lighting setup
    gl.uniform3f(u_AmbientLight, 0.2, 0.2, 0.2); // Set the ambient light colour
    gl.uniform3fv(u_LightColor, LIGHT_COLORS); // Set point light colours
    gl.uniform3fv(u_LightPosition, LIGHT_POSITIONS); // Set point light positions

    // Initialise textures
    if (!initTextures()){
        console.log("Failed to initialise textures.");
        return;
    }

    // Register keyboard event handlers
    document.onkeydown = function (ev) {
        keys[ev.keyCode] = true; // Track key is down

        // Instantaneous events

        // 7 -> Toggle textures
        if (ev.keyCode === 48) TEXTURES_ON = !TEXTURES_ON;

        // Enter -> Toggle HUD
        if (ev.keyCode === 13) INSTRUCTIONS_ON = !INSTRUCTIONS_ON;

        // c -> Disable camera lock
        if (ev.keyCode === 67) CAMERA_LOCK = !CAMERA_LOCK;

        // 1 2 3 -> Turn lights on/off (back, middle, front)
        for (var i=49; i<52; i++){
            if (ev.keyCode === i) {
                var light_start_ind = (i - 49)*3; // key (1, 2, 3) -> index (0, 3, 6)
                if (LIGHT_COLORS[light_start_ind] === LIGHT_CONST[0]) {
                    LIGHT_COLORS.splice(light_start_ind, 3, 0, 0, 0); // light off.
                } else {
                    LIGHT_COLORS.splice(light_start_ind, 3, LIGHT_CONST[0], LIGHT_CONST[1], LIGHT_CONST[2]); // light on.
                }
                gl.uniform3fv(u_LightColor,LIGHT_COLORS); // pass to shaders
            }
        }

        // Space -> Try to tuck in/ pull out chair.
        if (ev.keyCode === 32) {
            // Call draw looking for a chair in the interactive region
            var chair_num = draw();
            if (chair_num > -1){
                // Assign direction to move chair depending on if it is in or out
                var sign = (TUCKED_IN[chair_num] === -0.6) ? 1 : -1;
                // Initialise a start time for the animation
                last_call = Date.now();

                // Setup callback for requestAnimationFrame that can be called as each request is received
                var tick_chair = function() {
                    // Update chair's tucked state and update draw frame
                    TUCKED_IN[chair_num] = animate_chair(TUCKED_IN[chair_num], sign);
                    draw();

                    // keep moving chair until animation complete and chair is in a final state (0 or -0.6 offset)
                    if ( (sign === 1 && TUCKED_IN[chair_num] !== 0) || (sign === -1 && TUCKED_IN[chair_num] !== -0.6)) {
                        requestAnimationFrame(tick_chair); // request browser to call for next frame
                    }
                };
                tick_chair(); // perform animation
            }
        }

    };

    document.onkeyup = function (ev) {
        keys[ev.keyCode] = false; // Track key is no longer down
    };

    // Start repeated draw calls
    tick();
}

function keydown() {
    // Continuous events

    // Down arrow key -> Look down (max vertical)
    if (keys[40]) pitch = Math.min(pitch+ANGLE_STEP,179.9);
    // Up arrow key -> Look up (max vertical)
    if (keys[38]) pitch = Math.max(pitch-ANGLE_STEP,0.1);
    // Right arrow key -> Look right
    if (keys[39]) yaw = (yaw - ANGLE_STEP) % 360;
    // Left arrow key -> Look left
    if (keys[37]) yaw = (yaw + ANGLE_STEP) % 360;

    if (keys[87]) { // w key -> Move forward in direction looking
        at_x += STEP_SIZE*Math.sin((yaw)*Math.PI/180);
        at_z += STEP_SIZE*Math.cos((yaw)*Math.PI/180);
    }
    if (keys[68]) { // d key -> Move to the right in direction looking
        at_x -= STEP_SIZE*Math.cos(yaw*Math.PI/180);
        at_z += STEP_SIZE*Math.sin(yaw*Math.PI/180);
    }
    if (keys[65]) { // a key -> Move to the left in direction looking
        at_x += STEP_SIZE*Math.cos(yaw*Math.PI/180);
        at_z -= STEP_SIZE*Math.sin(yaw*Math.PI/180);
    }
    if (keys[83]) { // s key -> Move backward from direction looking
        at_x -= STEP_SIZE*Math.sin((yaw)*Math.PI/180);
        at_z -= STEP_SIZE*Math.cos((yaw)*Math.PI/180);
    }

    // q key -> head height up
    if (keys[81]) at_y += STEP_SIZE;
    // e key -> head height down
    if (keys[69]) at_y -= STEP_SIZE;

    if (CAMERA_LOCK){
        at_x = Math.max(Math.min(at_x, WIDTH-0.25), 0.25);
        at_z = Math.max(Math.min(at_z, LENGTH-0.25), 0.25);
        at_y = Math.max(Math.min(at_y, HEIGHT-0.2), 0.2);
    }

    // Check if moved into area of effect for door such that it should open/close
    check_door();

    // 4 5 6 -> Move boards (left, centre, right)
    for (var i=52; i<55; i++){
        if (keys[i]) {
            var board_ind = (i-52) % 3;
            var direction = keys[16] ? -1: 1; // If shift pressed move front board down instead of up

            // Update the current height offset of board being moved
            var newHeight = BOARD_OFFSET[board_ind] + (frame_time * direction*0.0005); // Half speed of step
            newHeight = Math.max( Math.min(2.75, newHeight), 0.0); // Confine to board frame.
            BOARD_OFFSET[board_ind] = newHeight;
        }
    }

    // 7 8 9 -> Move blinds (back, centre, front)
    for (i=55; i<58; i++){
        if (keys[i]) {
            var blind_ind = 12+ (i-55);
            direction = keys[16] ? 1: -1; // If shift pressed move blind up instead of down

            var newBottom = LIGHT_POSITIONS[blind_ind] + (frame_time * direction*0.0005);
            newBottom = Math.max( Math.min(2.1, newBottom), 0.85); // Confine to window.
            LIGHT_POSITIONS[blind_ind] = newBottom;
        }
    }

    // p key -> sun up
    if (keys[80]) LIGHT_POSITIONS[10] += 0.2;
    // o key -> sun down
    if (keys[79]) LIGHT_POSITIONS[10] -= 0.2;

    // Send sun and blind positions to shader after update
    gl.uniform3fv(u_LightPosition, LIGHT_POSITIONS);

}

// Vertex initialisation functions
function initCubeVertexBuffers(gl, r, g, b, a=1) {
    // Create a cube
    //    v6----- v5
    //   /|      /|
    //  v1------v0|
    //  | |     | |
    //  | |v7---|-|v4
    //  |/      |/
    //  v2------v3

    var vertices = new Float32Array([   // Coordinates
        0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, // v0-v1-v2-v3 front
        0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, // v0-v3-v4-v5 right
        0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, // v0-v5-v6-v1 up
        -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, // v1-v6-v7-v2 left
        -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5, // v7-v4-v3-v2 down
        0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5  // v4-v7-v6-v5 back
    ]);

    var colors = new Float32Array([    // Colors
        r, g, b, a, r, g, b, a, r, g, b, a, r, g, b, a,     // v0-v1-v2-v3 front
        r, g, b, a, r, g, b, a, r, g, b, a, r, g, b, a,     // v0-v3-v4-v5 right
        r, g, b, a, r, g, b, a, r, g, b, a, r, g, b, a,     // v0-v5-v6-v1 up
        r, g, b, a, r, g, b, a, r, g, b, a, r, g, b, a,     // v1-v6-v7-v2 left
        r, g, b, a, r, g, b, a, r, g, b, a, r, g, b, a,     // v7-v4-v3-v2 down
        r, g, b, a, r, g, b, a, r, g, b, a, r, g, b, a     // v4-v7-v6-v5 back
    ]);

    var normals = new Float32Array([    // Normal
        0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0,  // v0-v1-v2-v3 front
        1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0,  // v0-v3-v4-v5 right
        0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0,  // v0-v5-v6-v1 up
        -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0,  // v1-v6-v7-v2 left
        0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0,  // v7-v4-v3-v2 down
        0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0   // v4-v7-v6-v5 back
    ]);

    // Texture Coordinates - front mirrors back
    var texCoords = new Float32Array([
        1.0, 1.0,    0.0, 1.0,   0.0, 0.0,   1.0, 0.0,  // v0-v1-v2-v3 front
        0.0, 1.0,    0.0, 0.0,   1.0, 0.0,   1.0, 1.0,  // v0-v3-v4-v5 right
        1.0, 0.0,    1.0, 1.0,   0.0, 1.0,   0.0, 0.0,  // v0-v5-v6-v1 up
        1.0, 1.0,    0.0, 1.0,   0.0, 0.0,   1.0, 0.0,  // v1-v6-v7-v2 left
        0.0, 0.0,    1.0, 0.0,   1.0, 1.0,   0.0, 1.0,  // v7-v4-v3-v2 down
        1.0, 0.0,    0.0, 0.0,   0.0, 1.0,   1.0, 1.0   // v4-v7-v6-v5 back
    ]);

    // Indices of the vertices
    var indices = new Uint8Array([
        0, 1, 2, 0, 2, 3,    // front
        4, 5, 6, 4, 6, 7,    // right
        8, 9, 10, 8, 10, 11,    // up
        12, 13, 14, 12, 14, 15,    // left
        16, 17, 18, 16, 18, 19,    // down
        20, 21, 22, 20, 22, 23     // back
    ]);

    // Write the vertex property to buffers (coordinates, colors and normals)
    if (!initArrayBuffer(gl, 'a_Position', vertices, 3, gl.FLOAT)) return -1;
    if (!initArrayBuffer(gl, 'a_Color', colors, 4, gl.FLOAT)) return -1;
    if (!initArrayBuffer(gl, 'a_Normal', normals, 3, gl.FLOAT)) return -1;
    if (!initArrayBuffer(gl, 'a_TexCoords', texCoords, 2, gl.FLOAT)) return -1;

    // Write the indices to the buffer object
    var indexBuffer = gl.createBuffer();
    if (!indexBuffer) {
        console.log('Failed to create the buffer object');
        return false;
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    return indices.length;
}

function initPlaneVertexBuffers(gl, r, g, b, a=1) {
    // A single square in the x-y plane. Used to reduce vertices where possible

    // Coordinates, colors, normals and indices; line 1 - triangle 1, line 2 - triangle 2
    var vertices = new Float32Array([
        0.5, 0.5, 0, -0.5, 0.5, 0, -0.5, -0.5, 0,
        -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0
    ]);

    var colors = new Float32Array([
        r, g, b, a, r, g, b, a, r, g, b, a,
        r, g, b, a, r, g, b, a, r, g, b, a
    ]);

    var normal = new Float32Array([
       0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0,
       0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0
    ]);

    var indices = new Uint8Array([
        0, 1, 2,
        0, 2, 3
    ]);

    // Write the vertex property to buffers (coordinates, colors and normals)
    if (!initArrayBuffer(gl, 'a_Position', vertices, 3, gl.FLOAT)) return -1;
    if (!initArrayBuffer(gl, 'a_Color', colors, 4, gl.FLOAT)) return -1;
    if (!initArrayBuffer(gl, 'a_Normal', normal, 3, gl.FLOAT)) return -1;

    // Write the indices to the buffer object
    var indexBuffer = gl.createBuffer();
    if (!indexBuffer) {
        console.log('Failed to create the buffer object');
        return false;
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    return indices.length;
}

function initArrayBuffer(gl, attribute, data, num, type) {
    // Create a buffer object
    var buffer = gl.createBuffer();
    if (!buffer) {
        console.log('Failed to create the buffer object');
        return false;
    }
    // Write date into the buffer object
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    // Assign the buffer object to the attribute variable
    var a_attribute = gl.getAttribLocation(gl.program, attribute);
    if (a_attribute < 0) {
        console.log('Failed to get the storage location of ' + attribute);
        return false;
    }

    gl.vertexAttribPointer(a_attribute, num, type, false, 0, 0);
    // Enable the assignment of the buffer object to the attribute variable
    gl.enableVertexAttribArray(a_attribute);

    // Unbind the buffer object
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    return true;
}

// Model matrix helper functions: simulated stack
var g_matrixStack = []; // Array for storing a matrix

function pushMatrix(m) { // Store the specified matrix to the array
    var m2 = new Matrix4(m); // Make new object so changes don't propagate
    g_matrixStack.push(m2);
}

function popMatrix() { // Retrieve the matrix from the array
    return g_matrixStack.pop();
}

// Main scene draw function
function draw() {

    if (INIT_TEXTURE_COUNT < 7){
        return; // Don't draw scene until all textures have been loaded
    }

    // Clear color and depth buffer
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Look a unit length in front of eye, use spherical polars to determine orientation.
    var sphere_x = Math.sin(yaw*Math.PI/180)*Math.sin(pitch*Math.PI/180); //r*sin(theta)sin(phi)
    var sphere_y = Math.cos(pitch*Math.PI/180); //r*cos(phi)
    var sphere_z = Math.cos(yaw*Math.PI/180)*Math.sin(pitch*Math.PI/180); //r*cos(theta)sin(phi)

    // Calculate the view matrix and pass it to the uniform variable
    viewMatrix.setLookAt(at_x,at_y,at_z, at_x+sphere_x, at_y+sphere_y, at_z+sphere_z, 0, 1, 0);
    gl.uniformMatrix4fv(u_ViewMatrix, false, viewMatrix.elements);

    // Move furniture into room.
    modelMatrix.setTranslate(0.31,0,1.05);

    // Make sure person is reasonably looking at the chair, within +-15deg off forward.
    var min_angle = 15*Math.PI/180, chair_num = 0, selected = -1;
    var in_range = false;

    // Find unit vector pointing forward from camera
    var in_front_x = Math.sin((yaw)*Math.PI/180);
    var in_front_z = Math.cos((yaw)*Math.PI/180);

    for (var x_off=0; x_off<=3; x_off+=3) {         // Left bank and right bank of chairs
        for (var z = 0; z <= 3.3; z += 1.65) {      // Repeat row of chairs
            for (var x = 0; x <= 1.22; x += 0.61) { // Make row of chairs

                // Set z_co of chair to its original position plus its tucked in state
                var z_co = z+TUCKED_IN[chair_num];

                    // Make normal vector from camera position to chair centre position (using world coordinates)
                    var dist_x = (x+x_off+0.3)-at_x;
                    var dist_z = (z_co+1.05)-at_z;
                    var norm = Math.sqrt(Math.pow(dist_x,2) + Math.pow(dist_z,2));
                    // If the chair is suitably close
                    if (norm < 1.5){
                        // Angle between line of sight and object - use arccos of dot product of normalised vectors
                        var angle = Math.acos((dist_x * in_front_x + dist_z * in_front_z) / norm);
                        // If find a candidate chair set in_range to true for HUD, if searching store chair_num;
                        if (angle < min_angle) {
                            min_angle = angle;
                            in_range = true;
                            selected = chair_num;
                        }

                    }

                draw_chair(x+x_off, 0, z_co);
                draw_table(x+x_off, 0, z + 0.2);
                chair_num ++;
            }
        }
    }

    const window_width = 2.4;
    const window_height = 1.2;

    // Set origin to centre of room facing down +z axis.
    modelMatrix.setTranslate(WIDTH/2, 0, LENGTH/2);
    draw_room((LENGTH - 3*window_width)/4, window_height);

    // Draw white boards (right, centre, left if facing front).
    draw_whiteboard(-1.65, 2, LENGTH/2-0.05, 1.2, BOARD_OFFSET[2]);
    draw_whiteboard(0, 2, LENGTH/2-0.05, 1.5, BOARD_OFFSET[1]);
    draw_whiteboard(1.65, 2, LENGTH/2-0.05, 1.2, BOARD_OFFSET[0]);

    // Draw teaching platform.
    draw_teachplatform(0, 0.06, LENGTH/2-0.75);

    // Draw lecturn
    draw_lecturn(-0.85,0.12, LENGTH/2-1.23);

    // Draw light shades (centre, front, back)
    draw_light(0, 0, 0.5);
    draw_light(0, LENGTH/4, 0.5);
    draw_light(0, -LENGTH/4, 0.5);

    // Face the left wall - draw door and windows
    modelMatrix.rotate(-90,0,1,0);

    // Draw a single door
    draw_door(1.65, 1, -WIDTH/2, 0.84, 1.98);

    // Draw a blind per window (back, middle, front)
    draw_blind(-2.7,WIDTH/2-0.05, LIGHT_POSITIONS[12]);
    draw_blind(0,WIDTH/2-0.05, LIGHT_POSITIONS[13]);
    draw_blind(2.7,WIDTH/2-0.05, LIGHT_POSITIONS[14]);

    // Draw windows (front, middle, back) last due to transparency and alpha blending
    draw_window(LENGTH/2-1.5,1.5,WIDTH/2, window_width,window_height, 0.25);
    draw_window(0,           1.5,WIDTH/2, window_width,window_height, 0.25);
    draw_window(1.5-LENGTH/2,1.5,WIDTH/2, window_width,window_height, 0.25);


    // Draw HUD now since all variables have been updated
    draw2D(in_range);

    return selected; // Only used to animate chairs, otherwise ignored.
}

// Elementary drawing functions for cubes and planes
function draw_box(n, texture) {
    // Texture must be an integer i such that gl.TEXTUREi is used
    if (texture != null && TEXTURES_ON){
        gl.uniform1i(u_Sampler, texture);
        gl.uniform1i(u_UseTextures, 1);
    }

    pushMatrix(modelMatrix);

    // Pass the model matrix to the uniform variable
    gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);

    // Calculate the normal transformation matrix and pass it to u_NormalMatrix
    g_normalMatrix.setInverseOf(modelMatrix);
    g_normalMatrix.transpose();
    gl.uniformMatrix4fv(u_NormalMatrix, false, g_normalMatrix.elements);

    // Draw the cube
    gl.drawElements(gl.TRIANGLES, n, gl.UNSIGNED_BYTE, 0);

    modelMatrix = popMatrix();

    // Turn off texture if used
    if (texture != null && TEXTURES_ON){
        gl.uniform1i(u_UseTextures, 0);
    }

}

function draw_plane(n){
    pushMatrix(modelMatrix);

    // Pass the model matrix to the uniform variable
    gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);

    // Calculate the normal transformation matrix and pass it to u_NormalMatrix
    g_normalMatrix.setInverseOf(modelMatrix);
    g_normalMatrix.transpose();
    gl.uniformMatrix4fv(u_NormalMatrix, false, g_normalMatrix.elements);

    // Draw the plane
    gl.drawArrays(gl.TRIANGLES, 0, n);

    modelMatrix = popMatrix();
}

// Compositions of cubes and planes to form objects
function draw_chair(x, y, z) {
    // Form chair - x, y, z gives floor point under centre of seat.
    // Total size - .48*.84*.45

    pushMatrix(modelMatrix);
    modelMatrix.translate(x, y, z); // Translate to floor point below centre of seat.

    // Model chair frame
    var n = initCubeVertexBuffers(gl,44/255, 53/255, 57/255);
    if (n < 0) {
        console.log('Failed to set the vertex information');
        return;
    }

    // Reflection across centre of chair
    for (var i=0; i<=1; i++){
        var sign = Math.pow(-1, i);
        // Back legs
        pushMatrix(modelMatrix);
        modelMatrix.translate(sign*0.18, 0.27, -0.215);
        modelMatrix.scale(0.02, 0.54, 0.02);
        draw_box(n);
        modelMatrix = popMatrix();

        // Front legs
        pushMatrix(modelMatrix);
        modelMatrix.translate(sign*0.18, 0.2, 0.185);
        modelMatrix.scale(0.02, 0.4, 0.02);
        draw_box(n);
        modelMatrix = popMatrix();
    }

    // Model the chair cushions
    n = initCubeVertexBuffers(gl, 0, 99/255, 126/255);
    if (n < 0) {
        console.log('Failed to set the vertex information');
        return;
    }

    // Seat
    pushMatrix(modelMatrix);
    modelMatrix.translate(0, 0.43, 0);
    modelMatrix.scale(0.48, 0.06, 0.41);
    draw_box(n, 5); // Fabric texture
    modelMatrix = popMatrix();

    // Back
    modelMatrix.translate(0, 0.69, -0.215);
    modelMatrix.scale(0.48, 0.3, 0.06);
    draw_box(n, 5); // Fabric texture

    modelMatrix = popMatrix(); // Undo general transformation

}

function draw_table(x, y, z) {
    // Form table - x, y, z gives floor point under centre of table.
    // Total size - 0.6*0.74*0.6

    pushMatrix(modelMatrix);
    modelMatrix.translate(x,y,z); // Translate to floor below centre of table.

    // Model the table legs and supports
    var n = initCubeVertexBuffers(gl, 44/255, 53/255, 57/255);
    if (n < 0) {
        console.log('Failed to set the vertex information');
        return;
    }

    for (var i=0; i<360; i+=90) {
        pushMatrix(modelMatrix); // push general translation
        modelMatrix.rotate(i, 0, 1, 0);
        // Leg
        pushMatrix(modelMatrix);
        modelMatrix.translate(0.29, 0.35, 0.29);
        modelMatrix.scale(0.02, 0.7, 0.02);
        draw_box(n);
        modelMatrix=popMatrix();
        // Support
        pushMatrix(modelMatrix);
        modelMatrix.translate(0.29, 0.69, 0);
        modelMatrix.scale(0.02, 0.02, 0.56);
        draw_box(n);
        modelMatrix = popMatrix();

        modelMatrix = popMatrix(); // back to general translation
    }

    // Model the table top
    n = initCubeVertexBuffers(gl, 207/255, 218/255, 209/255);
    if (n < 0) {
        console.log('Failed to set the vertex information');
        return;
    }

    modelMatrix.translate(0, 0.72, 0);
    modelMatrix.scale(0.6, 0.04, 0.6);
    draw_box(n);

    modelMatrix = popMatrix(); // Undo general transform.

}

function draw_whiteboard(x, y, z, width, offset){
    // Form a double story whiteboard - x, y, z gives centre of whole whiteboard unit
    // Total size - width+0.2 * 1.8 * 0.1

    pushMatrix(modelMatrix);
    modelMatrix.translate(x,y,z); // Translate to centre of unit.

    // Model the side runners
    var n = initCubeVertexBuffers(gl, 182/255, 155/255, 76/255);
    if (n < 0) {
        console.log('Failed to set the vertex information');
        return;
    }

    for (var i=0; i<=1; i++) {
        var sign = Math.pow(-1, i);
        pushMatrix(modelMatrix);
        modelMatrix.translate(sign * (width / 2 + 0.05), 0, 0);
        modelMatrix.scale(0.1, 1.8, 0.1);
        draw_box(n, 1); // Beech wood texture
        modelMatrix = popMatrix();
    }

    // Model the boards
    n = initCubeVertexBuffers(gl, 1, 250/255, 250/255);
    if (n < 0) {
        console.log('Failed to set the vertex information');
        return;
    }

    for (i=0; i<=1; i++) {
        sign = Math.pow(-1, i);
        pushMatrix(modelMatrix);
        // Translate w.r.t user defined position - as one board moves up the other moves down
        modelMatrix.translate(0,sign*(2.75*0.15 - offset*0.3),sign*0.025);
        modelMatrix.scale(width, 2.75*0.3, 0.03);
        draw_box(n, 2); // Whiteboard texture
        modelMatrix = popMatrix();

    }

    modelMatrix = popMatrix(); // Undo general transform.
}

function draw_teachplatform(x, y, z) {
    // Form a teaching platform - x,y,z gives centre of cube that forms platform
    // Total size - WIDTH (of room) * 0.12 * 1.5

    // Model platform
    var n = initCubeVertexBuffers(gl, 134/255, 109/255, 87/255);
    if (n < 0) {
        console.log('Failed to set the vertex information');
        return;
    }

    pushMatrix(modelMatrix);
    modelMatrix.translate(x,y,z);
    modelMatrix.scale(WIDTH, 0.12, 1.5);
    draw_box(n, 0); // Wood floor texture
    modelMatrix = popMatrix(); // Undo model transforms.
}

function draw_room(strip_width, window_height) {
    // Form the room walls and ceilings from planes - centre of floor at current location
    // Total size - WIDTH * HEIGHT * LENGTH
    // 3 windows along the right wall specified by their height and distance between them
    // A door 1.65 units down the left wall from origin toward the front. 0.9*2*0.1 in size

    // Floor and ceiling
    var n = initCubeVertexBuffers(gl, 122/255, 126/255, 140/255);
    if (n < 0) {
        console.log('Failed to set the vertex information');
        return;
    }

    for (var i=0; i<=1; i++) {
        var sign = Math.pow(-1, i);
        pushMatrix(modelMatrix);
        modelMatrix.translate(0, i * HEIGHT, 0); // Move to right HEIGHT
        modelMatrix.scale(WIDTH, 0.01, LENGTH);
        draw_box(n, i === 0 ? 4: null); // Carpet tiles on the floor
        modelMatrix = popMatrix();

    }

    // Walls
    n = initCubeVertexBuffers(gl, 172/255, 191/255, 196/255);
    if (n < 0) {
        console.log('Failed to set the vertex information');
        return;
    }

    // Front and back walls
    for (i=0; i<=1; i++) {
        sign = Math.pow(-1, i);
        pushMatrix(modelMatrix);
        modelMatrix.translate(0, (HEIGHT / 2), sign*(LENGTH / 2)); // To centre of wall
        modelMatrix.scale(WIDTH, HEIGHT, 0.01);
        draw_box(n);
        modelMatrix = popMatrix();

    }

    // Left wall with hole in for door
    pushMatrix(modelMatrix);
    // Face left (normal in) and move to centre of wall
    modelMatrix.rotate(90,0,1,0);
    modelMatrix.translate(0, (HEIGHT / 2), (WIDTH / 2));

    pushMatrix(modelMatrix);
    // Above door
    modelMatrix.translate(-1.65, HEIGHT/2 - ((HEIGHT-2)/2), 0);
    modelMatrix.scale(0.9,HEIGHT-2,0.01);
    draw_box(n);
    modelMatrix = popMatrix();

    pushMatrix(modelMatrix);
    // By white boards
    modelMatrix.translate(-(2.1/2)-LENGTH/4, 0, 0);
    modelMatrix.scale(LENGTH/2-(2.1),HEIGHT,0.01);
    draw_box(n);
    modelMatrix = popMatrix();

    // Remaining left wall
    modelMatrix.translate(LENGTH/4-1.2/2, 0, 0);
    modelMatrix.scale(LENGTH/2+1.2, HEIGHT, 0.01);
    draw_box(n);
    modelMatrix = popMatrix();

    // Right wall with holes in for windows
    pushMatrix(modelMatrix);
    // Face right (normal in) and move to bottom centre of wall
    modelMatrix.rotate(-90,0,1,0);
    modelMatrix.translate(0,0,WIDTH/2);

    pushMatrix(modelMatrix);
    // Centre of first strip centre
    modelMatrix.translate((strip_width-LENGTH)/2, (HEIGHT / 2), 0);
    // Make strips between each of the three windows
    for (i=0; i<4; i++){
        pushMatrix(modelMatrix);
        modelMatrix.translate((LENGTH- strip_width)*i/3, 0, 0);
        modelMatrix.scale(strip_width, window_height, 0.01); // height of glass
        draw_box(n);
        modelMatrix = popMatrix();
    }
    modelMatrix = popMatrix();

    // Make bottom strip
    pushMatrix(modelMatrix);
    modelMatrix.translate(0, (HEIGHT-window_height)/4, 0);
    modelMatrix.scale(LENGTH, 0.9, 0.01);
    draw_box(n);
    modelMatrix = popMatrix();

    // Make top strip
    modelMatrix.translate(0, HEIGHT - (HEIGHT-window_height)/4, 0);
    modelMatrix.scale(LENGTH, 0.9, 0.01);
    draw_box(n);

    modelMatrix = popMatrix();

}

function draw_window(x, y, z, width, height, alpha) {
    // Forms a window frame with transparent pane (alpha) - centre of pane at x, y, z
    // Total size - width+0.09 * height+0.09 * 0.1

    pushMatrix(modelMatrix);
    modelMatrix.translate(x,y,z);

    // Draw frame
    var n = initCubeVertexBuffers(gl, 0, 0, 0);
    if (n < 0) {
        console.log('Failed to set the vertex information');
        return;
    }

    for (var i=0; i<=1; i++){
        var sign = Math.pow(-1,i);
        // Top/bottom
        pushMatrix(modelMatrix);
        modelMatrix.translate(0,sign*height/2,0);
        modelMatrix.rotate(90,0,0,1);
        modelMatrix.scale(0.045,width+0.045,0.1);
        draw_box(n);
        modelMatrix = popMatrix();

        // Left/right
        pushMatrix(modelMatrix);
        modelMatrix.translate(sign*width/2,0,0);
        modelMatrix.scale(0.045,height+0.045,0.1);
        draw_box(n);
        modelMatrix = popMatrix();
    }

    // Draw glass - transparent
    n = initPlaneVertexBuffers(gl, 1, 1, 1, alpha);
    if (n < 0) {
        console.log('Failed to set the vertex information');
        return;
    }

    modelMatrix.scale(width, height, 1);
    draw_plane(n);

    modelMatrix = popMatrix();

}

function draw_door(x, y, z, width, height) {
    // Forms a door with door frame - x, y, z at centre of door
    // Total size - width + 0.12 * height + 0.06 * 0.1
    // Rotates around a hinge like a real door by angle open_by

    pushMatrix(modelMatrix);
    modelMatrix.translate(x,y,z);

    // Draw frame
    var n = initCubeVertexBuffers(gl, 0.4, 0.4, 0.4);
    if (n < 0) {
        console.log('Failed to set the vertex information');
        return;
    }

    for (var i=0; i<=1; i++){
        var sign = Math.pow(-1,i);

        // Left/right
        pushMatrix(modelMatrix);
        modelMatrix.translate(sign*(width/2+0.03),0.03,0);
        modelMatrix.scale(0.06,height+0.06,0.1);
        draw_box(n);
        modelMatrix = popMatrix();
    }

    // top
    pushMatrix(modelMatrix);
    modelMatrix.translate(0,height/2+0.03,0);
    modelMatrix.scale(width,0.06,0.1);
    draw_box(n);
    modelMatrix = popMatrix();

    // Draw door
    n = initCubeVertexBuffers(gl, 182/255, 155/255, 76/255);
    if (n < 0) {
        console.log('Failed to set the vertex information');
        return;
    }

    // Make door flush with inside frame. Use double translate for easy hinge design
    modelMatrix.translate(width/2,0,0.05);
    modelMatrix.rotate(OPEN_BY,0,1,0); // 0 is shut, 100 fully open - looks better than a square 90
    modelMatrix.translate(-width/2,0,-0.03);
    modelMatrix.scale(width,height,0.06);
    draw_box(n, 3); // Door texture

    modelMatrix = popMatrix();
}

function draw_light(x, z, size){
    // Forms a light fixture hanging on ceiling - x,z is floor position
    // Total size - size * 0.1 * size

    pushMatrix(modelMatrix);
    modelMatrix.translate(x,HEIGHT-0.1,z); // Move to bottom centre of light

    // Bottom plate - transparent plane
    var n = initPlaneVertexBuffers(gl, 0, 0, 0, 0.1);
    if (n < 0) {
        console.log('Failed to set the vertex information');
        return;
    }

    pushMatrix(modelMatrix);
    modelMatrix.rotate(90,1,0,0); // Move into x-z plane
    modelMatrix.scale(size, size, 1);
    draw_plane(n);
    modelMatrix = popMatrix();

    // Sides - tinted cubes to shade light
    n = initCubeVertexBuffers(gl, 0, 0, 0, 0.6);
    if (n < 0) {
        console.log('Failed to set the vertex information');
        return;
    }

    for (var i=0; i<=1; i++){
        var sign = Math.pow(-1, i);
        // Left/right
        pushMatrix(modelMatrix);
        modelMatrix.translate(sign*size/2, 0.05, 0); // Move to centre of side
        modelMatrix.scale(0.01, 0.1, size);
        draw_box(n);
        modelMatrix = popMatrix();

        // Front/back
        pushMatrix(modelMatrix);
        modelMatrix.translate(0, 0.05, sign*size/2); // Move to centre of side
        modelMatrix.scale(size, 0.1, 0.01);
        draw_box(n);
        modelMatrix = popMatrix();
    }

    modelMatrix = popMatrix(); // Undo general transform

}

function draw_lecturn (x, y, z) {
    // Form lecture - x, y, z gives floor point under centre of shelf.
    // Total size - 0.3*1.2*0.6

    pushMatrix(modelMatrix);
    modelMatrix.translate(x,y,z); // Translate to floor below centre of table.

    // Model the surround
    var n = initCubeVertexBuffers(gl, 150/255, 142/255, 133/255);
    if (n < 0) {
        console.log('Failed to set the vertex information');
        return;
    }

    // Back panel
    pushMatrix(modelMatrix);

    modelMatrix.translate(0,0.6,-0.25);
    modelMatrix.scale(0.56,1.2,0.03);
    draw_box(n, 6); // Durham logo texture
    modelMatrix = popMatrix();

    // Front panel
    pushMatrix(modelMatrix);

    modelMatrix.translate(0,0.56,0);
    modelMatrix.scale(0.6,1.0,0.03);
    draw_box(n);
    modelMatrix = popMatrix();

    // Side panels
    for (var i=0; i<=1; i++) {
        var sign = Math.pow(-1, i);
        // Leg
        pushMatrix(modelMatrix);
        modelMatrix.translate(sign*0.29, 0.6, -0.11);
        modelMatrix.scale(0.02, 1.2, 0.31);
        draw_box(n);
        modelMatrix=popMatrix();

    }

    // Model the cover
    n = initPlaneVertexBuffers(gl, 150/255, 142/255, 133/255);
    if (n < 0) {
        console.log('Failed to set the vertex information');
        return;
    }

    pushMatrix(modelMatrix);
    modelMatrix.translate(0,1.20001,-0.25);
    modelMatrix.scale(0.56,1,0.03);
    modelMatrix.rotate(90, 1,0, 0);
    draw_plane(n);
    modelMatrix = popMatrix();


    // Model the surface
    n = initCubeVertexBuffers(gl, 207/255, 218/255, 209/255);
    if (n < 0) {
        console.log('Failed to set the vertex information');
        return;
    }

    modelMatrix.translate(0, 1.05, -0.11);
    modelMatrix.scale(0.56, 0.04, 0.28);
    draw_box(n);

    modelMatrix = popMatrix(); // Undo general transform.
}

function draw_blind (x, z, bottom) {
    // Form blind - x, z gives floor position. Will always have bottom start at 2.1. Blocks out the sun.
    // Min bottom 0.85, max 2.1

    // Model the surround
    var n = initCubeVertexBuffers(gl, 150/255, 142/255, 133/255);
    if (n < 0) {
        console.log('Failed to set the vertex information');
        return;
    }
    // Translate to below blind;
    pushMatrix(modelMatrix);
    modelMatrix.translate(x,0,z);

    // Translate to centre of bar;
    pushMatrix(modelMatrix);
    modelMatrix.translate(0,2.2,0);
    modelMatrix.scale(2.5, 0.1, 0.1);
    draw_box(n);
    modelMatrix = popMatrix();

    // Translate to centre of window cover
    modelMatrix.translate(0,(2.15+bottom)/2,-0.04);
    modelMatrix.scale(2.5, 2.15-bottom, 0.01);
    draw_box(n);

    modelMatrix = popMatrix();
}

// Animation
function animate_chair(moved_by, sign) {
    // Positive sign for push in, negative for pull out

    // Calculate time between calls
    var now = Date.now();
    var elapsed = now - last_call;
    last_call = now;
    // Return the move, adjusting for time. 1 second animation total
    var now_moved_by = moved_by + sign * (UN_TUCK_BY * elapsed)/1000.0;

    // Confine chair to be pulled out a maximum of 2 feet.
    if (sign === 1) return Math.min(0, now_moved_by);
    if (sign === -1) return Math.max(-0.6 , now_moved_by);
}

function check_door() {
    var dist_x = WIDTH - at_x;
    var dist_z = LENGTH/2 + 1.65 - at_z;

    // Setup callback for requestAnimationFrame that can be called as each request is received
    var tick_door = function() {
        // Update doors open state and update draw frame
        OPEN_BY = animate_door(OPEN_BY, sign);
        draw();

        // Keep moving door until animation complete (door open or door shut)
        if ( (sign === 1 && OPEN_BY !== 100) || (sign === -1 && OPEN_BY !== 0)) {
            requestAnimationFrame(tick_door); // Request browser to call for next frame
        }
    };

    var sign;
    // If going within 1.2 units and door not open, open it. If going out and door open, close it.
    if (Math.pow(dist_x, 2) + Math.pow(dist_z, 2) < Math.pow(1.2, 2) && !IN_DOOR_RANGE){
        IN_DOOR_RANGE = true;
        sign = 1;
        // animate
    } else if (Math.pow(dist_x, 2) + Math.pow(dist_z, 2) > Math.pow(1.2, 2) && IN_DOOR_RANGE) {
        IN_DOOR_RANGE = false;
        sign = -1;
        // animate shut
    } else {
        return false;
    }
    // Initialise a start time for the animation
    last_call = Date.now();

    tick_door(); // perform animation

}

function animate_door(angle, sign){
    // Calculate time between calls
    var now = Date.now();
    var elapsed = now - last_call;
    last_call = now;
    // Return the new angle, adjusting for time. 1 second animation total (100 degrees swing)
    var now_angle = angle + sign * elapsed/10.0;

    // Confine door to hinges.
    if (sign === 1) return Math.min(100, now_angle);
    if (sign === -1) return Math.max(0 , now_angle);
}

// HUD
function draw2D(in_range) {
    ctx.clearRect(0, 0, 800, 600); // Clear <hud>

    if (INSTRUCTIONS_ON) {
        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = 'rgba(255, 255, 255, 1)'; // Set white text
        ctx.fillText('Instructions', 60, 15);
        ctx.fillText('w/s', 10, 35);
        ctx.fillText('a/d', 10, 50);
        ctx.fillText('q/e', 10, 65);
        ctx.fillText('Arrow keys', 10, 80);
        ctx.fillText('1, 2, 3', 10, 95);
        ctx.fillText('4, 5, 6', 10, 110);
        ctx.fillText('SHIFT  4, 5, 6', 10, 125);
        ctx.fillText('7, 8, 9', 10, 140);
        ctx.fillText('SHIFT  7, 8, 9', 10, 155);
        ctx.fillText('p/o', 10, 170);
        ctx.fillText('0', 10, 185);
        ctx.fillText('ENTER', 10, 200);

        ctx.font = '11px Arial';
        ctx.fillText('Move forwards/ backwards', 40, 35);
        ctx.fillText('Move left/ right', 40, 50);
        ctx.fillText('Move up/ down', 40, 65);
        ctx.fillText('Look around', 80, 80);
        ctx.fillText('Trigger back/ centre/ front lights', 50, 95);
        ctx.fillText('Switch left/ centre/ right boards', 50, 110);
        ctx.fillText('Reverse board motion', 90, 125);
        ctx.fillText('Pull back/ centre/ front blind down', 50, 140);
        ctx.fillText('Pull back/ centre/ front blind up', 90, 155);
        ctx.fillText('Raise/ lower sun altitude', 40, 170);
        ctx.fillText('Toggle textures', 25, 185);
        ctx.fillText('Toggle instructions', 55, 200);
    }

    if (in_range) { // If found a chair to move tell the user
        ctx.font = 'bold 16px Arial';
        ctx.fillText('SPACE', 340,500);
        ctx.font = '16px Arial';
        ctx.fillText('to move chair', 400,500);
    }
}

// Texture initialisation
function initTextures(){
    // Get the storage location of u_Sampler
    u_Sampler = gl.getUniformLocation(gl.program, "u_Sampler");
    if (!u_Sampler) {
        console.log('Failed to get the storage location of u_Sampler');
        return false;
    }

    // Setup texture mappings
    createTexture('../textures/woodfloor.jpg', gl.TEXTURE0);
    createTexture('../textures/beech.jpg', gl.TEXTURE1);
    createTexture('../textures/whiteboard.jpg', gl.TEXTURE2);
    createTexture('../textures/door.png', gl.TEXTURE3);
    createTexture('../textures/carpet.png', gl.TEXTURE4);
    createTexture('../textures/fabric.jpg', gl.TEXTURE5);
    createTexture('../textures/podium_front.png', gl.TEXTURE6);
    return true;
}

function createTexture(name, id){
    var texture = gl.createTexture(); // Create texture
    if(!texture){
        console.log("Failed to create texture object");
        return false;
    }
    var image = new Image(); // Create the image object
    if (!image) {
        console.log('Failed to create the image object');
        return false;
    }
    image.onload = function(){
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1); // Flip the image's y axis
        gl.activeTexture(id); // Assign to right texture

        gl.bindTexture(gl.TEXTURE_2D, texture);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
        gl.generateMipmap(gl.TEXTURE_2D);

        gl.clear(gl.COLOR_BUFFER_BIT); // Clear colour buffer

        INIT_TEXTURE_COUNT++; // Won't render until all textures loaded
    };

    image.src = name;
}

// General tick function
function tick(){
    var cur = new Date().getTime();
    frame_time = (cur - lastFPSTime);
    lastFPSTime = cur;

    keydown();
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT) ;     // Clear <canvas>
    draw();
    requestAnimationFrame(tick);

}