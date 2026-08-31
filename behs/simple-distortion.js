/* MoMath Math Square Behavior
 * © 2026 National Museum of Mathematics. All rights reserved.
 *
 *        Title: Simple Sensors
 *  Description: Minimal example of raw sensor grid rendering with pure Canvas2D.
 *               Each active sensor cell is drawn as a colored rectangle.
 *               No blobbing — shows the raw 80x80 grid data directly.
 *    Framework: Canvas2D (native)
 */

import * as Display from 'display';
import * as Sensors from 'sensors';

let gl;
let program;
let sensorTexture;
let time;
let resolution;
let sensorCenterLocation;
let sensorLocation;
let imageTexture, imageLocation;
let userCentersLocation, userCountLocation;

var canvas, ctx;

const MAX_USERS = 10;

const vertexShader = `#version 300 es
in vec2 a_position;
out vec2 v_uv;


void main() {
  // v_uv = a_position * 0.5 + 0.5; // Convert from [-1, 1] to [0, 1]
  
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const fragmentShader = `#version 300 es
precision highp float;

#define MAX_USERS 10

uniform sampler2D u_sensors;
uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform vec2 u_userCenters[MAX_USERS];
uniform int u_userCount;
uniform float u_time;

in vec2 v_uv;
out vec4 v_color;

void main() {
  // can either use v_uv from fragment or use uv straight from gl_FragCoord, but v_uv is flipped vertically, so we need to flip it back 
  vec2 sensorUv = gl_FragCoord.xy / u_resolution; // Convert from [0, resolution] to [0, 1]
  
  sensorUv = vec2(sensorUv.x, 1.0 - sensorUv.y);

  float userMarker = 0.;

  float aspect = u_resolution.x / u_resolution.y;

  vec2 tileSpace = vec2(sensorUv.x * aspect, sensorUv.y);

  float distortionStrength = 0.08;

  vec2 totalDistortion = vec2(0.);

  float totalGlow = 0.;

  for (int i = 0; i < MAX_USERS; i++){
    if (i >= u_userCount) break;

    // Vector from user center to this pixel
    vec2 userCenter = vec2(u_userCenters[i].x * aspect, u_userCenters[i].y); // Normalize to 0-1 and adjust for aspect ratio
    vec2 difference = tileSpace - userCenter;
    float distanceToUser = length(difference);
    vec2 direction = difference / (distanceToUser + 0.0001);

    // How much distortion? depending on the distance to the user center. 1 at the center, fading to 0 at radius xx
    float influence = 1. - smoothstep(0., .5, distanceToUser);
    vec2 userDistortedSpace = direction * influence * distortionStrength;

    // Accumulate the distortion from all users
    totalDistortion += userDistortedSpace;

    float userGlow = exp(-distanceToUser * distanceToUser * 20.); // gaussian falloff (symmetrical)
    totalGlow += userGlow;
    
  }

  // Create the tiles from distorted coordinates
  float tileCount = 10.;
  vec2 distortedSpace = tileSpace + totalDistortion;
  vec2 tiledUv = distortedSpace * tileCount;
  vec2 tileIdx = floor(tiledUv);
  float imageTileCount = 600.;
  vec2 imageTiledUv = distortedSpace * imageTileCount;
  vec2 imageTileIdx = floor(imageTiledUv);
  
  // How many tiles per row and column, based on aspect ratio
  vec2 gridSize = vec2(tileCount * aspect, tileCount);
  vec2 imageGridSize = vec2(imageTileCount * aspect, imageTileCount);

  vec3 glowColor = vec3(1., 0., 0.); // only for debugging

  float glowAmount = min(totalGlow, 1.);

  // Version 1: Grid
  vec2 boxUv = tileIdx / gridSize; // 0-1
  // Create a simple grid pattern
  float checker = mod(tileIdx.x + tileIdx.y, 2.0);

  vec3 color = mix(vec3(1.), vec3(0.), checker);
  
  // Version 2: Image
  // Sample the image at the center of this tile
  vec2 imageUv = (imageTileIdx + .5) / imageGridSize; // 0-1 for texture sampling!
  imageUv = vec2(imageUv.x, 1.0 - imageUv.y); // Flip Y for texture sampling

  imageUv = clamp(imageUv, 0.0, 1.0); // Ensure UVs are within [0, 1]

  vec3 imageColor = texture(u_image, imageUv).rgb;
  color = mix(color, imageColor, glowAmount);
  // color = mix(color, glowColor, glowAmount); // only for debugging, the image to be revealed takes up the glow space.

  v_color = vec4(color, 1.);
}
`;


function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation error: ${message}`);
  }
  return shader;
}

async function init(container) {
  canvas = document.createElement('canvas');
  canvas.width = Display.width;
  canvas.height = Display.height;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  container.appendChild(canvas);

  gl = canvas.getContext('webgl2');

  const vertex = compile(gl.VERTEX_SHADER, vertexShader);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentShader);

  program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.useProgram(program);

  const positions = new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
     1,  1
  ]);
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  sensorTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, sensorTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  resolution = gl.getUniformLocation(program, 'u_resolution');

  // Sensors
  sensorLocation = gl.getUniformLocation(program, 'u_sensors');
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sensorTexture);
  gl.uniform1i(sensorLocation, 0); // Bind the texture to texture unit 0
  sensorCenterLocation = gl.getUniformLocation(program, 'u_sensorCenter');
  userCentersLocation = gl.getUniformLocation(program, 'u_userCenters[0]');
  userCountLocation = gl.getUniformLocation(program, 'u_userCount');

  // Image
  imageLocation = gl.getUniformLocation(program, 'u_image');
  imageTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, imageTexture);
    gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.NEAREST
    );

    gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MAG_FILTER,
    gl.NEAREST
    );

    gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_WRAP_S,
    gl.CLAMP_TO_EDGE
    );

    gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_WRAP_T,
    gl.CLAMP_TO_EDGE
    );

    const image = new Image();
    image.src = '../bg.webp';
    await image.decode();

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    image
    );

    // u_image reads texture unit 1.
    gl.uniform1i(imageLocation, 1);
  time = gl.getUniformLocation(program, 'u_time');
}

function render(floor) {
  // convert sensor values of 0/1 to 0/255
  const pixels = Uint8Array.from(floor.sensors.data, value => value ? 255 : 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sensorTexture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.R8,
    Sensors.width,
    Sensors.height,
    0,
    gl.RED,
    gl.UNSIGNED_BYTE,
    pixels
  );

  const resolutionValue = [Display.width, Display.height];
  gl.uniform2fv(resolution, resolutionValue);

  const userCount = Math.min(floor.users.length, MAX_USERS);

  const centers = new Float32Array(MAX_USERS * 2); // [x0, y0, x1, y1, x2, y2, ...]

  for (let i = 0; i < userCount; i++) {
    const user = floor.users[i];
    centers[i * 2] = user.x / Display.width; // Normalize to 0-1 
    centers[i * 2 + 1] = user.y / Display.height; // Normalize to 0-1
  }
  gl.uniform2fv(userCentersLocation, centers);
  gl.uniform1i(userCountLocation, userCount);
    
  const timeSeconds = performance.now() / 1000;
  gl.uniform1f(time, timeSeconds);

  gl.viewport(0, 0, Display.width, Display.height);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

}

export const behavior = {
  title: "Noise GLSL",
  frameRate: 'sensors',
  maxUsers: MAX_USERS,
  init: init,
  render: render
};
export default behavior;
