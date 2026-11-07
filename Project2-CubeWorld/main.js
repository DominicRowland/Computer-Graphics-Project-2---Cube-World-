// Project 2 - Cube World Roller Coaster!!!
// Author: Dominic Rowland

// === Canvas Creation ===
const canvas = document.getElementById("c");
const gl = canvas.getContext("webgl2");

if (!gl) {
  throw new Error("WebGL 2 is not available in this browser.");
}

// === Shaders ===
const vertexShaderSource = `#version 300 es
  in vec3 aPosition;
  in vec3 aNormal;

  in vec3 aOffset;
  in vec3 aScale;
  in vec3 aColor;
  in vec3 aRotation;

  uniform mat4 uView;
  uniform mat4 uProjection;

  out vec3 vNormal;
  out vec3 vColor;
  out float vFogDistance;

  vec3 rotateCube(vec3 value) {
    float cx = cos(aRotation.x);
    float sx = sin(aRotation.x);
    float cy = cos(aRotation.y);
    float sy = sin(aRotation.y);
    float cz = cos(aRotation.z);
    float sz = sin(aRotation.z);

    value = vec3(value.x, value.y * cx - value.z * sx, value.y * sx + value.z * cx);
    value = vec3(value.x * cy + value.z * sy, value.y, -value.x * sy + value.z * cy);
    value = vec3(value.x * cz - value.y * sz, value.x * sz + value.y * cz, value.z);
    return value;
  }

  void main() {
    // Center the shared cube before scaling and rotating it.
    vec3 localPosition = (aPosition - vec3(0.0, 0.5, 0.0)) * aScale;
    vec3 worldPosition = rotateCube(localPosition) + aOffset;

    // Correct the normal when a cube is stretched in any direction.
    vec3 adjustedNormal = aNormal / max(aScale, vec3(0.001));
    adjustedNormal = rotateCube(adjustedNormal);
    vNormal = normalize(adjustedNormal);
    vColor = aColor;

    vec4 viewPosition = uView * vec4(worldPosition, 1.0);
    vFogDistance = length(viewPosition.xyz);
    gl_Position = uProjection * viewPosition;
  }
`;

const fragmentShaderSource = `#version 300 es
  precision highp float;

  in vec3 vNormal;
  in vec3 vColor;
  in float vFogDistance;

  uniform vec3 uLightDirection;
  uniform vec3 uFogColor;
  uniform float uAmbientStrength;
  uniform float uFogNear;
  uniform float uFogFar;

  out vec4 outColor;

  void main() {
    // Level 4: directional light plus ambient light keeps shadowed faces visible.
    vec3 normal = normalize(vNormal);
    float diffuse = max(dot(normal, normalize(-uLightDirection)), 0.0);
    float lighting = uAmbientStrength + (1.0 - uAmbientStrength) * diffuse;
    vec3 litColor = vColor * lighting;

    // Fade distant geometry into the sky color for atmospheric depth.
    float fogAmount = smoothstep(uFogNear, uFogFar, vFogDistance);
    vec3 finalColor = mix(litColor, uFogColor, fogAmount);
    outColor = vec4(finalColor, 1.0);
  }
`;

// === Sky Gradient ===
const skyVertexShaderSource = `#version 300 es
  const vec2 positions[3] = vec2[3](
    vec2(-1.0, -1.0),
    vec2( 3.0, -1.0),
    vec2(-1.0,  3.0)
  );
  void main() {
    gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
  }
`;

const skyFragmentShaderSource = `#version 300 es
  precision highp float;
  uniform vec2 uSkyResolution;
  out vec4 outColor;
  void main() {
    vec2 uv = gl_FragCoord.xy / uSkyResolution;
    vec3 horizon = vec3(0.78, 0.87, 0.94);
    vec3 zenith = vec3(0.16, 0.36, 0.62);
    vec3 sky = mix(horizon, zenith, smoothstep(0.0, 1.0, uv.y));

    // Soft sunlight glow in the upper-right portion of the sky.
    vec2 sunPosition = vec2(0.78, 0.78);
    float sunGlow = exp(-distance(uv, sunPosition) * 10.0) * 0.22;
    sky += vec3(1.0, 0.78, 0.48) * sunGlow;
    outColor = vec4(sky, 1.0);
  }
`;

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error("Shader compile error: " + message);
  }

  return shader;
}

const program = gl.createProgram();
gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexShaderSource));
gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource));
gl.linkProgram(program);

if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
  throw new Error("Program link error: " + gl.getProgramInfoLog(program));
}
gl.useProgram(program);

// === Lvl 4 Sky Gradient ===
const skyProgram = gl.createProgram();
gl.attachShader(skyProgram, compileShader(gl.VERTEX_SHADER, skyVertexShaderSource));
gl.attachShader(skyProgram, compileShader(gl.FRAGMENT_SHADER, skyFragmentShaderSource));
gl.linkProgram(skyProgram);
if (!gl.getProgramParameter(skyProgram, gl.LINK_STATUS)) {
  throw new Error("Sky shader link error: " + gl.getProgramInfoLog(skyProgram));
}
const uSkyResolution = gl.getUniformLocation(skyProgram, "uSkyResolution");

// ---------------------------------------------------------------------
// 2. CUBE GEOMETRY → BUFFER
//    One cube, 1 unit wide, with its bottom at y = 0 (so it sits on the
//    ground). Every cube in the scene reuses this same data; uModel is
//    what makes each one different.
//
//    Each face = 2 triangles = 6 vertices. Each vertex has 6 numbers:
//         x,    y,    z,      nx, ny, nz   (position, then normal)
// ---------------------------------------------------------------------
const cubeVertices = new Float32Array([
  // Front face (normal points toward +z)
  -0.5, 0,  0.5,  0, 0, 1,
   0.5, 0,  0.5,  0, 0, 1,
   0.5, 1,  0.5,  0, 0, 1,
  -0.5, 0,  0.5,  0, 0, 1,
   0.5, 1,  0.5,  0, 0, 1,
  -0.5, 1,  0.5,  0, 0, 1,

  // Back face (-z)
  -0.5, 0, -0.5,  0, 0, -1,
   0.5, 1, -0.5,  0, 0, -1,
   0.5, 0, -0.5,  0, 0, -1,
  -0.5, 0, -0.5,  0, 0, -1,
  -0.5, 1, -0.5,  0, 0, -1,
   0.5, 1, -0.5,  0, 0, -1,

  // Top face (+y)
  -0.5, 1, -0.5,  0, 1, 0,
  -0.5, 1,  0.5,  0, 1, 0,
   0.5, 1,  0.5,  0, 1, 0,
  -0.5, 1, -0.5,  0, 1, 0,
   0.5, 1,  0.5,  0, 1, 0,
   0.5, 1, -0.5,  0, 1, 0,

  // Bottom face (-y)
  -0.5, 0, -0.5,  0, -1, 0,
   0.5, 0,  0.5,  0, -1, 0,
  -0.5, 0,  0.5,  0, -1, 0,
  -0.5, 0, -0.5,  0, -1, 0,
   0.5, 0, -0.5,  0, -1, 0,
   0.5, 0,  0.5,  0, -1, 0,

  // Right face (+x)
   0.5, 0, -0.5,  1, 0, 0,
   0.5, 1, -0.5,  1, 0, 0,
   0.5, 1,  0.5,  1, 0, 0,
   0.5, 0, -0.5,  1, 0, 0,
   0.5, 1,  0.5,  1, 0, 0,
   0.5, 0,  0.5,  1, 0, 0,

  // Left face (-x)
  -0.5, 0, -0.5, -1, 0, 0,
  -0.5, 1,  0.5, -1, 0, 0,
  -0.5, 1, -0.5, -1, 0, 0,
  -0.5, 0, -0.5, -1, 0, 0,
  -0.5, 0,  0.5, -1, 0, 0,
  -0.5, 1,  0.5, -1, 0, 0
]);

const VERTEX_COUNT = 36;
const cubeBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuffer);
gl.bufferData(gl.ARRAY_BUFFER, cubeVertices, gl.STATIC_DRAW);

const BYTES_PER_FLOAT = 4;
const vertexStride = 6 * BYTES_PER_FLOAT;

const aPosition = gl.getAttribLocation(program, "aPosition");
gl.enableVertexAttribArray(aPosition);
gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, vertexStride, 0);

const aNormal = gl.getAttribLocation(program, "aNormal");
gl.enableVertexAttribArray(aNormal);
gl.vertexAttribPointer(
  aNormal, 3, gl.FLOAT, false, vertexStride, 3 * BYTES_PER_FLOAT
);

// === Instance Buffers ===
// Each cube has an offset, a height, and an RGB color.
// The divisor of 1 means each attribute advances once per cube instance.
const uView = gl.getUniformLocation(program, "uView");
const uProjection = gl.getUniformLocation(program, "uProjection");

const aOffset = gl.getAttribLocation(program, "aOffset");
const aScale = gl.getAttribLocation(program, "aScale");
const aColor = gl.getAttribLocation(program, "aColor");
const aRotation = gl.getAttribLocation(program, "aRotation");

const offsetBuffer = gl.createBuffer();
const scaleBuffer = gl.createBuffer();
const colorBuffer = gl.createBuffer();
const rotationBuffer = gl.createBuffer();

const uLightDirection = gl.getUniformLocation(program, "uLightDirection");
const uFogColor = gl.getUniformLocation(program, "uFogColor");
const uAmbientStrength = gl.getUniformLocation(program, "uAmbientStrength");
const uFogNear = gl.getUniformLocation(program, "uFogNear");
const uFogFar = gl.getUniformLocation(program, "uFogFar");

function setInstancedAttribute(location, buffer, data, size) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(location, 1);
}

// === Image loading ===
// Each image is drawn into an offscreen 2D canvas, then I use getImageData()
// to read the RGBA value of every source pixel.
const colorCanvas = document.createElement("canvas");
const heightCanvas = document.createElement("canvas");
const colorContext = colorCanvas.getContext("2d", { willReadFrequently: true });
const heightContext = heightCanvas.getContext("2d", { willReadFrequently: true });

let colorImageData = null;
let heightImageData = null;
let colorImageName = "Sample color map";
let heightImageName = "Sample height map";

function loadImageFromSource(source, kind, displayName) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const targetCanvas = kind === "color" ? colorCanvas : heightCanvas;
      const context = kind === "color" ? colorContext : heightContext;

      targetCanvas.width = image.naturalWidth;
      targetCanvas.height = image.naturalHeight;
      context.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
      context.drawImage(image, 0, 0);

      // This is the actual pixel array: R, G, B, A for each pixel.
      const pixels = context.getImageData(
        0, 0, targetCanvas.width, targetCanvas.height
      );

      if (kind === "color") {
        colorImageData = pixels;
        colorImageName = displayName;
      } else {
        heightImageData = pixels;
        heightImageName = displayName;
      }

      updateImageStatus();
      resolve();
    };

    image.onerror = () => reject(new Error(`Could not load ${displayName}.`));
    image.src = source;
  });
}

// Maps a grid cell to a pixel in an image of any size.
// Ex: 50x50 grid can sample a 512x512 image by selecting
// one representative pixel near the center of each corresponding region.
function samplePixel(imageData, col, row, gridResolution) {
  const imageWidth = imageData.width;
  const imageHeight = imageData.height;

  const pixelX = Math.min(
    imageWidth - 1,
    Math.floor((col + 0.5) * imageWidth / gridResolution)
  );
  const pixelY = Math.min(
    imageHeight - 1,
    Math.floor((row + 0.5) * imageHeight / gridResolution)
  );

  const pixelIndex = (pixelY * imageWidth + pixelX) * 4;
  return [
    imageData.data[pixelIndex],
    imageData.data[pixelIndex + 1],
    imageData.data[pixelIndex + 2],
    imageData.data[pixelIndex + 3]
  ];
}

// === Build Terrain ===
let gridSize = 50;
const SPACING = 1.15;
let maxTerrainHeight = 9;

let offsetData;
let scaleData;
let colorData;
let instanceCount = 0;

function makeTerrain(size) {
  if (!colorImageData || !heightImageData) return;

  gridSize = size;
  instanceCount = gridSize * gridSize;

  offsetData = new Float32Array(instanceCount * 3);
  scaleData = new Float32Array(instanceCount * 3);
  colorData = new Float32Array(instanceCount * 3);

  let index = 0;

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const x = (col - (gridSize - 1) / 2) * SPACING;
      const z = (row - (gridSize - 1) / 2) * SPACING;

      const colorPixel = samplePixel(colorImageData, col, row, gridSize);
      const heightPixel = samplePixel(heightImageData, col, row, gridSize);

      // Convert sampled RGB values from 0-255 into WebGL color values 0-1.
      colorData[index * 3] = colorPixel[0] / 255;
      colorData[index * 3 + 1] = colorPixel[1] / 255;
      colorData[index * 3 + 2] = colorPixel[2] / 255;

      const brightness = (
        heightPixel[0] + heightPixel[1] + heightPixel[2]
      ) / (3 * 255);

      // Maps black to a short cube and white to the selected maximum height.
      const cubeHeight = 0.35 + brightness * maxTerrainHeight;
      scaleData[index * 3] = 1;
      scaleData[index * 3 + 1] = cubeHeight;
      scaleData[index * 3 + 2] = 1;

      offsetData[index * 3] = x;
      offsetData[index * 3 + 1] = cubeHeight / 2;
      offsetData[index * 3 + 2] = z;

      index++;
    }
  }

  // Upload updated per-cube values to GPU memory.
  setInstancedAttribute(aOffset, offsetBuffer, offsetData, 3);
  setInstancedAttribute(aScale, scaleBuffer, scaleData, 3);
  setInstancedAttribute(aColor, colorBuffer, colorData, 3);
  setInstancedAttribute(aRotation, rotationBuffer, new Float32Array(instanceCount * 3), 3);

  updateStats();
}

// === Clouds/Airship + Bezier ===
// Clouds and the airship are made from the same cube geometry as the terrain.
// They use their own instance buffers so the terrain data stays untouched.
function makeInstanceSet(offsets, scales, colors, rotations = []) {
  const buffers = {
    offset: gl.createBuffer(),
    scale: gl.createBuffer(),
    color: gl.createBuffer(),
    rotation: gl.createBuffer(),
    count: offsets.length / 3
  };
  setInstancedAttribute(aOffset, buffers.offset, new Float32Array(offsets), 3);
  setInstancedAttribute(aScale, buffers.scale, new Float32Array(scales), 3);
  setInstancedAttribute(aColor, buffers.color, new Float32Array(colors), 3);
  setInstancedAttribute(aRotation, buffers.rotation, new Float32Array(rotations.length ? rotations : offsets.length).fill(0), 3);
  return buffers;
}

function addCube(offsets, scales, colors, x, y, z, sx, sy, sz, color) {
  // Instance offsets now mark the center of each cube.
  offsets.push(x, y + sy / 2, z);
  scales.push(sx, sy, sz);
  colors.push(color[0], color[1], color[2]);
}

let cloudInstances = null;
let airshipInstances = null;
let airshipBaseY = 0;
let airshipPath = [];
let coasterInstances = null;
let trainInstances = null;
let coasterPoints = [];
let coasterFrames = [];
let coasterLengths = [];
let coasterTotalLength = 0;
let coasterMaxHeight = 0;
let rideDistance = 0;
let rideRunning = true;
let coasterSpeedMultiplier = 1.0;
let rideCameraMode = "chase";

function buildSkyObjects() {
  // Remove the previous sky-object buffers before making replacements.
  // This prevents unnecessary GPU memory from building up when controls change.
  for (const oldSet of [cloudInstances, airshipInstances]) {
    if (oldSet) {
      gl.deleteBuffer(oldSet.offset);
      gl.deleteBuffer(oldSet.scale);
      gl.deleteBuffer(oldSet.color);
      gl.deleteBuffer(oldSet.rotation);
    }
  }

  const span = gridSize * SPACING;
  const size = Math.max(0.55, gridSize / 50);
  const cloudOffsets = [];
  const cloudScales = [];
  const cloudColors = [];
  const cloudColor = [0.91, 0.95, 0.98];
  const cloudY = (maxTerrainHeight + 7) * size;
  const cloudCenters = [
    [-span * 0.34, cloudY, -span * 0.25],
    [ span * 0.32, cloudY + size * 1.2, -span * 0.12],
    [-span * 0.18, cloudY - size * 0.5,  span * 0.34]
  ];

  for (const [cx, cy, cz] of cloudCenters) {
    const pieces = [
      [-1.5, 0.0, 0.0, 2.2, 1.0, 1.5],
      [ 0.0, 0.4, 0.0, 2.0, 1.3, 1.7],
      [ 1.4, 0.0, 0.0, 2.0, 0.9, 1.5],
      [ 0.0, 0.0, 1.0, 1.8, 0.8, 1.4]
    ];
    for (const [dx, dy, dz, sx, sy, sz] of pieces) {
      addCube(
        cloudOffsets, cloudScales, cloudColors,
        (cx + dx * size) - sx * size / 2,
        (cy + dy * size) - sy * size / 2,
        (cz + dz * size) - sz * size / 2,
        sx * size, sy * size, sz * size, cloudColor
      );
    }
  }
  cloudInstances = makeInstanceSet(cloudOffsets, cloudScales, cloudColors);

  const shipOffsets = [];
  const shipScales = [];
  const shipColors = [];
  const shipSize = size * 1.35;
  const brass = [0.72, 0.39, 0.16];
  const darkBrass = [0.35, 0.22, 0.16];
  const cloth = [0.73, 0.23, 0.16];
  const glass = [0.35, 0.68, 0.78];
  const addShipPart = (x, y, z, sx, sy, sz, color) => {
    addCube(shipOffsets, shipScales, shipColors,
      x * shipSize - sx * shipSize / 2,
      y * shipSize - sy * shipSize / 2,
      z * shipSize - sz * shipSize / 2,
      sx * shipSize, sy * shipSize, sz * shipSize, color);
  };

  addShipPart(0, 0, 0, 5.0, 1.0, 1.25, brass);       // Main hull
  addShipPart(0, 0.85, 0, 2.0, 0.8, 1.1, darkBrass); // Cabin
  addShipPart(0, 1.0, 0.58, 1.3, 0.45, 0.12, glass); // Front window
  addShipPart(-2.65, 0.1, 0, 1.0, 0.35, 1.8, cloth); // Rear fin
  addShipPart(-2.7, 0.65, 0, 0.9, 1.2, 0.3, cloth);  // Tail rudder
  addShipPart(2.55, -0.1, 0, 0.6, 0.35, 0.9, darkBrass);

  airshipInstances = makeInstanceSet(shipOffsets, shipScales, shipColors);
  airshipBaseY = Math.max(7, maxTerrainHeight + 5) * size;

  // The airship follows a cubic Bezier curve in the X/Z plane.
  airshipPath = [
    [-span * 0.48, -span * 0.28],
    [-span * 0.18, -span * 0.58],
    [ span * 0.28,  span * 0.45],
    [ span * 0.48, -span * 0.12]
  ];
}

function cubicBezier(p0, p1, p2, p3, t) {
  const oneMinusT = 1 - t;
  const a = oneMinusT * oneMinusT * oneMinusT;
  const b = 3 * oneMinusT * oneMinusT * t;
  const c = 3 * oneMinusT * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]
  ];
}

// === Roller Coaster ===
// The track, supports, and train are built from the same cube mesh.
// Cubic Bezier sections define the centerline, including a vertical loop.
// Note: A lot of AI was used on this part
function cubicBezier3(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2]
  ];
}

function coasterArc(center, radius, startAngle, endAngle, z) {
  const angle = endAngle - startAngle;
  const k = (4 / 3) * Math.tan(angle / 4) * radius;
  const p0 = [center[0] + radius * Math.cos(startAngle), center[1] + radius * Math.sin(startAngle), z];
  const p3 = [center[0] + radius * Math.cos(endAngle), center[1] + radius * Math.sin(endAngle), z];
  const p1 = [p0[0] - Math.sin(startAngle) * k, p0[1] + Math.cos(startAngle) * k, z];
  const p2 = [p3[0] + Math.sin(endAngle) * k, p3[1] - Math.cos(endAngle) * k, z];
  return [p0, p1, p2, p3];
}

function vectorLength(v) {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalizeVector(v) {
  const length = vectorLength(v) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function coasterSide(tangent) {
  let side = [tangent[2], 0, -tangent[0]];
  if (vectorLength(side) < 0.0001) side = [0, 0, 1];
  return normalizeVector(side);
}

function dotVector(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function crossVector(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function buildCoasterFrames() {
  coasterFrames = [];
  for (let i = 0; i < coasterPoints.length; i++) {
    const previous = coasterPoints[Math.max(0, i - 1)];
    const next = coasterPoints[Math.min(coasterPoints.length - 1, i + 1)];
    const tangent = normalizeVector([
      next[0] - previous[0], next[1] - previous[1], next[2] - previous[2]
    ]);
    let side;
    if (i === 0) {
      side = coasterSide(tangent);
    } else {
      const oldSide = coasterFrames[i - 1].side;
      const alongTangent = dotVector(oldSide, tangent);
      side = normalizeVector([
        oldSide[0] - tangent[0] * alongTangent,
        oldSide[1] - tangent[1] * alongTangent,
        oldSide[2] - tangent[2] * alongTangent
      ]);
      if (vectorLength(side) < 0.0001) side = coasterSide(tangent);
    }
    const up = normalizeVector(crossVector(tangent, side));
    coasterFrames.push({ tangent, side, up });
  }

  const first = coasterFrames[0];
  const last = coasterFrames[coasterFrames.length - 1];
  const seamAngle = Math.atan2(
    dotVector(crossVector(last.side, first.side), first.tangent),
    dotVector(last.side, first.side)
  );
  coasterFrames.forEach((frame, index) => {
    const correction = seamAngle * index / Math.max(1, coasterFrames.length - 1);
    const c = Math.cos(correction);
    const sn = Math.sin(correction);
    const rotate = vector => {
      const crossed = crossVector(frame.tangent, vector);
      const along = dotVector(frame.tangent, vector);
      return normalizeVector([
        vector[0] * c + crossed[0] * sn + frame.tangent[0] * along * (1 - c),
        vector[1] * c + crossed[1] * sn + frame.tangent[1] * along * (1 - c),
        vector[2] * c + crossed[2] * sn + frame.tangent[2] * along * (1 - c)
      ]);
    };
    frame.side = rotate(frame.side);
    frame.up = normalizeVector(crossVector(frame.tangent, frame.side));
  });
}

function rotationFromFrame(side, up, tangent) {
  const horizontal = Math.hypot(side[0], side[1]);
  if (horizontal < 0.0001) {
    const yaw = side[2] < 0 ? Math.PI / 2 : -Math.PI / 2;
    const roll = Math.atan2(-up[0], up[1]);
    return [0, yaw, roll];
  }
  const pitch = Math.atan2(up[2], tangent[2]);
  const yaw = Math.atan2(-side[2], horizontal);
  const roll = Math.atan2(side[1], side[0]);
  return [pitch, yaw, roll];
}

function frameAtDistance(distance) {
  const d = ((distance % coasterTotalLength) + coasterTotalLength) % coasterTotalLength;
  let index = 1;
  while (index < coasterLengths.length - 1 && coasterLengths[index] < d) index++;
  const span = Math.max(0.0001, coasterLengths[index] - coasterLengths[index - 1]);
  const t = (d - coasterLengths[index - 1]) / span;
  const a = coasterFrames[index - 1];
  const b = coasterFrames[index];
  const tangent = normalizeVector([
    a.tangent[0] + (b.tangent[0] - a.tangent[0]) * t,
    a.tangent[1] + (b.tangent[1] - a.tangent[1]) * t,
    a.tangent[2] + (b.tangent[2] - a.tangent[2]) * t
  ]);
  const sideGuess = normalizeVector([
    a.side[0] + (b.side[0] - a.side[0]) * t,
    a.side[1] + (b.side[1] - a.side[1]) * t,
    a.side[2] + (b.side[2] - a.side[2]) * t
  ]);
  const alongTangent = dotVector(sideGuess, tangent);
  const side = normalizeVector([
    sideGuess[0] - tangent[0] * alongTangent,
    sideGuess[1] - tangent[1] * alongTangent,
    sideGuess[2] - tangent[2] * alongTangent
  ]);
  return { tangent, side, up: normalizeVector(crossVector(tangent, side)) };
}

function terrainHeightAtWorld(x, z) {
  const col = Math.max(0, Math.min(gridSize - 1, Math.round(x / SPACING + (gridSize - 1) / 2)));
  const row = Math.max(0, Math.min(gridSize - 1, Math.round(z / SPACING + (gridSize - 1) / 2)));
  const pixel = samplePixel(heightImageData, col, row, gridSize);
  const brightness = (pixel[0] + pixel[1] + pixel[2]) / (3 * 255);
  return 0.35 + brightness * maxTerrainHeight;
}

function addTrackCube(offsets, scales, colors, rotations, center, dimensions, direction, color, bank = 0) {
  const tangent = normalizeVector(direction);
  const pitch = -Math.asin(Math.max(-1, Math.min(1, tangent[1])));
  const yaw = Math.atan2(tangent[0], tangent[2]);
  offsets.push(center[0], center[1], center[2]);
  scales.push(dimensions[0], dimensions[1], dimensions[2]);
  colors.push(color[0], color[1], color[2]);
  rotations.push(pitch, yaw, bank);
}

function smoothCoasterSectionJoins(segments) {
  for (let i = 0; i < segments.length; i++) {
    const previous = segments[(i - 1 + segments.length) % segments.length];
    const current = segments[i];
    const incoming = normalizeVector([
      previous[3][0] - previous[2][0],
      previous[3][1] - previous[2][1],
      previous[3][2] - previous[2][2]
    ]);
    const outgoing = normalizeVector([
      current[1][0] - current[0][0],
      current[1][1] - current[0][1],
      current[1][2] - current[0][2]
    ]);
    let tangent = normalizeVector([
      incoming[0] + outgoing[0],
      incoming[1] + outgoing[1],
      incoming[2] + outgoing[2]
    ]);
    if (vectorLength(tangent) < 0.0001) tangent = outgoing;

    const incomingLength = vectorLength([
      previous[3][0] - previous[2][0],
      previous[3][1] - previous[2][1],
      previous[3][2] - previous[2][2]
    ]);
    const outgoingLength = vectorLength([
      current[1][0] - current[0][0],
      current[1][1] - current[0][1],
      current[1][2] - current[0][2]
    ]);
    const handleLength = Math.max(0.05, (incomingLength + outgoingLength) * 0.5);
    const join = current[0];
    previous[2] = [
      join[0] - tangent[0] * handleLength,
      join[1] - tangent[1] * handleLength,
      join[2] - tangent[2] * handleLength
    ];
    current[1] = [
      join[0] + tangent[0] * handleLength,
      join[1] + tangent[1] * handleLength,
      join[2] + tangent[2] * handleLength
    ];
  }
}

function buildCoaster() {
  for (const oldSet of [coasterInstances, trainInstances]) {
    if (!oldSet) continue;
    gl.deleteBuffer(oldSet.offset);
    gl.deleteBuffer(oldSet.scale);
    gl.deleteBuffer(oldSet.color);
    gl.deleteBuffer(oldSet.rotation);
  }

  const worldScale = gridSize * SPACING / 50;
  const baseY = maxTerrainHeight + 2.5;
  const radius = 4.2 * worldScale;
  const loopCenter = [0, baseY + radius, -5 * worldScale];
  const segments = [];

  // Lift hill, first drop, and approach to the vertical inversion.
  segments.push([
    [-16 * worldScale, baseY, -8 * worldScale],
    [-13.5 * worldScale, baseY + 0.25 * worldScale, -8 * worldScale],
    [-11 * worldScale, baseY + 12 * worldScale, -7.2 * worldScale],
    [-9 * worldScale, baseY + 12 * worldScale, -7 * worldScale]
  ]);
  segments.push([
    [-9 * worldScale, baseY + 12 * worldScale, -7 * worldScale],
    [-7 * worldScale, baseY + 12 * worldScale, -7 * worldScale],
    [-5.2 * worldScale, baseY + 0.1 * worldScale, -5.5 * worldScale],
    [-radius, baseY, -5 * worldScale]
  ]);
  segments.push([
    [-radius, baseY, -5 * worldScale],
    [-2 * worldScale, baseY, -5 * worldScale],
    [-1 * worldScale, baseY, -5 * worldScale],
    [0, baseY, -5 * worldScale]
  ]);

  // Four cubic Bezier arcs form a complete vertical loop.
  for (let quarter = 0; quarter < 4; quarter++) {
    segments.push(coasterArc(
      loopCenter, radius,
      -Math.PI / 2 + quarter * Math.PI / 2,
      -Math.PI / 2 + (quarter + 1) * Math.PI / 2,
      -5 * worldScale
    ));
  }

  // A second camelback, sweeping drop, and broad return turn.
  segments.push([
    [0, baseY, -5 * worldScale],
    [3 * worldScale, baseY + 1 * worldScale, -4.5 * worldScale],
    [6 * worldScale, baseY + 11 * worldScale, -2 * worldScale],
    [10 * worldScale, baseY + 9 * worldScale, 1 * worldScale]
  ]);
  segments.push([
    [10 * worldScale, baseY + 9 * worldScale, 1 * worldScale],
    [14 * worldScale, baseY + 8 * worldScale, 4 * worldScale],
    [17 * worldScale, baseY + 2 * worldScale, 8 * worldScale],
    [15 * worldScale, baseY + 1 * worldScale, 12 * worldScale]
  ]);
  segments.push([
    [15 * worldScale, baseY + 1 * worldScale, 12 * worldScale],
    [13 * worldScale, baseY + 1 * worldScale, 17 * worldScale],
    [6 * worldScale, baseY + 1 * worldScale, 19 * worldScale],
    [0, baseY + 1 * worldScale, 18 * worldScale]
  ]);
  segments.push([
    [0, baseY + 1 * worldScale, 18 * worldScale],
    [-9 * worldScale, baseY + 1 * worldScale, 17 * worldScale],
    [-17 * worldScale, baseY + 1 * worldScale, 12 * worldScale],
    [-18 * worldScale, baseY, 7 * worldScale]
  ]);
  segments.push([
    [-18 * worldScale, baseY, 7 * worldScale],
    [-20 * worldScale, baseY, 2 * worldScale],
    [-18.5 * worldScale, baseY, -8 * worldScale],
    [-16 * worldScale, baseY, -8 * worldScale]
  ]);

  smoothCoasterSectionJoins(segments);

  const loopSideOffset = 2.4 * worldScale;
  const loopExitZ = -5 * worldScale + loopSideOffset;
  segments[7][0][2] = loopExitZ;
  segments[7][1][2] += loopSideOffset;

  coasterPoints = [];
  const samplesPerSegment = 720;
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
    const segment = segments[segmentIndex];
    for (let i = 0; i < samplesPerSegment; i++) {
      const t = i / samplesPerSegment;
      const point = cubicBezier3(...segment, t);
      if (segmentIndex >= 3 && segmentIndex <= 6) {
        const loopProgress = ((segmentIndex - 3) + t) / 4;
        const smoothProgress = loopProgress * loopProgress * (3 - 2 * loopProgress);
        point[2] += loopSideOffset * smoothProgress;
      }
      coasterPoints.push(point);
    }
  }
  coasterPoints.push(coasterPoints[0].slice());

  coasterLengths = [0];
  coasterTotalLength = 0;
  coasterMaxHeight = baseY;
  for (let i = 0; i < coasterPoints.length; i++) {
    coasterMaxHeight = Math.max(coasterMaxHeight, coasterPoints[i][1]);
    if (i > 0) {
      coasterTotalLength += vectorLength([
        coasterPoints[i][0] - coasterPoints[i - 1][0],
        coasterPoints[i][1] - coasterPoints[i - 1][1],
        coasterPoints[i][2] - coasterPoints[i - 1][2]
      ]);
      coasterLengths.push(coasterTotalLength);
    }
  }

  buildCoasterFrames();

  const offsets = [], scales = [], colors = [], rotations = [];
  const railColor = [0.78, 0.12, 0.09];
  const tieColor = [0.22, 0.25, 0.29];
  const supportColor = [0.35, 0.39, 0.43];
  const railWidth = 0.16 * worldScale;
  const railGap = 0.42 * worldScale;

  for (let i = 0; i < coasterPoints.length - 1; i++) {
    const a = coasterPoints[i];
    const b = coasterPoints[i + 1];
    const direction = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const length = vectorLength(direction);
    const tangent = normalizeVector(direction);
    const frame = coasterFrames[i];
    const side = frame.side;
    const up = frame.up;
    const nextFrame = coasterFrames[Math.min(i + 1, coasterFrames.length - 1)];
    const turnAmount = dotVector(crossVector(frame.tangent, nextFrame.tangent), frame.up);
    const bank = Math.max(-0.48, Math.min(0.48, turnAmount * 3.0));
    const bankedSide = normalizeVector([
      side[0] * Math.cos(bank) + up[0] * Math.sin(bank),
      side[1] * Math.cos(bank) + up[1] * Math.sin(bank),
      side[2] * Math.cos(bank) + up[2] * Math.sin(bank)
    ]);
    const bankedUp = normalizeVector([
      up[0] * Math.cos(bank) - side[0] * Math.sin(bank),
      up[1] * Math.cos(bank) - side[1] * Math.sin(bank),
      up[2] * Math.cos(bank) - side[2] * Math.sin(bank)
    ]);
    const trackRotation = rotationFromFrame(bankedSide, bankedUp, tangent);
    const midpoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

    // Two continuous running rails on either side of the track centerline.
    for (const sideSign of [-1, 1]) {
      const railCenter = [
        midpoint[0] + bankedSide[0] * railGap * sideSign,
        midpoint[1] + 0.10 * worldScale + bankedSide[1] * railGap * sideSign,
        midpoint[2] + bankedSide[2] * railGap * sideSign
      ];
      offsets.push(...railCenter);
      scales.push(railWidth, railWidth, length + 0.12 * worldScale);
      colors.push(...railColor);
      rotations.push(...trackRotation);
    }

    // Cross ties connect the rails at regular intervals. Their long cube
    // axis is aimed directly across the track, rather than using the full
    // track frame (which could twist them at steep loop angles).
    if (i % 8 === 0) {
      addTrackCube(
        offsets, scales, colors, rotations,
        [midpoint[0], midpoint[1], midpoint[2]],
        [0.12 * worldScale, 0.12 * worldScale, 1.15 * worldScale],
        bankedSide, tieColor
      );
    }

    // Keep the vertical support structure off the loop itself. Supports on
    // the inversion crossed through the track and could not reach the ground.
    const isLoopSection = i >= 3 * samplesPerSegment && i < 7 * samplesPerSegment;
    if (!isLoopSection && i % 32 === 0 && midpoint[1] > 1.4 * worldScale) {
      const supportTop = midpoint[1] - 0.28 * worldScale;
      const supportHeight = Math.max(0.5 * worldScale, supportTop - 0.15 * worldScale);
      for (const sideSign of [-1, 1]) {
        const supportCenter = [
          midpoint[0] + bankedSide[0] * 1.05 * worldScale * sideSign,
          supportHeight / 2,
          midpoint[2] + bankedSide[2] * 1.05 * worldScale * sideSign
        ];
        offsets.push(...supportCenter);
        scales.push(0.17 * worldScale, supportHeight, 0.17 * worldScale);
        colors.push(...supportColor);
        rotations.push(0, 0, 0);
      }

      // This crossbeam spans between the two ground-level columns. Use the
      // horizontal projection because the columns themselves stay vertical.
      const supportSide = normalizeVector([bankedSide[0], 0, bankedSide[2]]);
      const supportSpan = 2.1 * worldScale * Math.hypot(bankedSide[0], bankedSide[2]);
      addTrackCube(
        offsets, scales, colors, rotations,
        [midpoint[0], supportTop - 0.08 * worldScale, midpoint[2]],
        [0.16 * worldScale, 0.16 * worldScale, supportSpan],
        supportSide, supportColor
      );
    }
  }

  // Cube-built scenery around the outside of the ride. Tree bases follow
  // the sampled height map so they sit on the landscape instead of floating.
  const treePositions = [];
  for (const z of [-23, -15, -7, 2, 11, 20]) {
    treePositions.push([-23.0 * worldScale, z * worldScale]);
    treePositions.push([23.0 * worldScale, z * worldScale]);
  }
  for (const x of [-18, -8, 4, 16]) {
    treePositions.push([x * worldScale, -23.0 * worldScale]);
    treePositions.push([x * worldScale, 23.0 * worldScale]);
  }
  const trunkColor = [0.28, 0.16, 0.09];
  const leafColors = [[0.12, 0.34, 0.18], [0.17, 0.42, 0.20], [0.22, 0.38, 0.16]];
  treePositions.forEach(([x, z], index) => {
    const ground = terrainHeightAtWorld(x, z);
    const height = (2.2 + (index % 3) * 0.35) * worldScale;
    offsets.push(x, ground + height * 0.35, z);
    scales.push(0.42 * worldScale, height * 0.7, 0.42 * worldScale);
    colors.push(...trunkColor);
    rotations.push(0, 0, 0);
    const crown = leafColors[index % leafColors.length];
    for (const [dx, dy, dz, size] of [[0, 0, 0, 1.8], [0.48, 0.35, 0, 1.15], [-0.48, 0.35, 0, 1.15], [0, 0.35, 0.48, 1.15], [0, 0.35, -0.48, 1.15]]) {
      offsets.push(x + dx * worldScale, ground + height + dy * worldScale, z + dz * worldScale);
      scales.push(size * worldScale, size * worldScale, size * worldScale);
      colors.push(...crown);
      rotations.push(0, 0, 0);
    }
  });

  // A few low rock clusters add scale around the track perimeter.
  for (const [x, z] of [[-23, -22], [23, -20], [-24, 18], [22, 23], [0, 25]]) {
    const wx = x * worldScale, wz = z * worldScale;
    const ground = terrainHeightAtWorld(wx, wz);
    offsets.push(wx, ground + 0.32 * worldScale, wz);
    scales.push(1.25 * worldScale, 0.65 * worldScale, 1.0 * worldScale);
    colors.push(0.34, 0.37, 0.39);
    rotations.push(0, 0.3, 0.08);
  }

  coasterInstances = makeInstanceSet(offsets, scales, colors, rotations);

  // Four connected cars, each assembled from cubes for the chassis, seats,
  // headrests, and wheel blocks. Their positions are updated every frame.
  const trainOffsets = [], trainScales = [], trainColors = [], trainRotations = [];
  const trainParts = [];
  const carColor = [0.12, 0.25, 0.52];
  const seatColor = [0.83, 0.84, 0.87];
  const wheelColor = [0.08, 0.09, 0.11];
  for (let car = 0; car < 4; car++) {
    trainParts.push({ car, local: [0, 0.50, 0], size: [1.25, 0.45, 1.9], color: carColor });
    trainParts.push({ car, local: [0, 0.88, 0.25], size: [1.05, 0.30, 0.62], color: seatColor });
    trainParts.push({ car, local: [0, 1.15, 0.62], size: [1.05, 0.55, 0.16], color: carColor });
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) {
        trainParts.push({ car, local: [side * 0.52, 0.15, end * 0.62], size: [0.28, 0.28, 0.34], color: wheelColor });
      }
    }
  }
  for (const part of trainParts) {
    trainOffsets.push(0, 0, 0);
    trainScales.push(part.size[0] * worldScale, part.size[1] * worldScale, part.size[2] * worldScale);
    trainColors.push(...part.color);
    trainRotations.push(0, 0, 0);
  }
  trainInstances = makeInstanceSet(trainOffsets, trainScales, trainColors, trainRotations);
  trainInstances.parts = trainParts;
  trainInstances.worldScale = worldScale;
  updateTrainInstances();
}

function coasterPositionAtDistance(distance) {
  const d = ((distance % coasterTotalLength) + coasterTotalLength) % coasterTotalLength;
  let index = 1;
  while (index < coasterLengths.length - 1 && coasterLengths[index] < d) index++;
  const startLength = coasterLengths[index - 1];
  const segmentLength = Math.max(0.0001, coasterLengths[index] - startLength);
  const t = (d - startLength) / segmentLength;
  const a = coasterPoints[index - 1];
  const b = coasterPoints[index];
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

function pointOnCoaster(distance) {
  const position = coasterPositionAtDistance(distance);
  const frame = frameAtDistance(distance);
  return { position, ...frame };
}

function coasterBankAt(distance) {
  const before = pointOnCoaster(distance - 0.35);
  const after = pointOnCoaster(distance + 0.35);
  const turn = before.tangent[2] * after.tangent[0] - before.tangent[0] * after.tangent[2];
  return Math.max(-0.38, Math.min(0.38, turn * 1.5));
}

function updateTrainInstances() {
  if (!trainInstances || !coasterTotalLength) return;
  const worldScale = trainInstances.worldScale;
  const offsets = [];
  const rotations = [];
  const maxCarSpacing = 2.45 * worldScale;

  for (const part of trainInstances.parts) {
    const carDistance = rideDistance - part.car * maxCarSpacing;
    const { position, tangent, side, up } = pointOnCoaster(carDistance);
    const bank = coasterBankAt(carDistance);
    const bankedSide = normalizeVector([
      side[0] * Math.cos(bank) + up[0] * Math.sin(bank),
      side[1] * Math.cos(bank) + up[1] * Math.sin(bank),
      side[2] * Math.cos(bank) + up[2] * Math.sin(bank)
    ]);
    const bankedUp = normalizeVector([
      up[0] * Math.cos(bank) - side[0] * Math.sin(bank),
      up[1] * Math.cos(bank) - side[1] * Math.sin(bank),
      up[2] * Math.cos(bank) - side[2] * Math.sin(bank)
    ]);
    const local = part.local;
    const center = [
      position[0] + tangent[0] * local[2] * worldScale + bankedUp[0] * local[1] * worldScale + bankedSide[0] * local[0] * worldScale,
      position[1] + tangent[1] * local[2] * worldScale + bankedUp[1] * local[1] * worldScale + bankedSide[1] * local[0] * worldScale,
      position[2] + tangent[2] * local[2] * worldScale + bankedUp[2] * local[1] * worldScale + bankedSide[2] * local[0] * worldScale
    ];
    offsets.push(...center);
    rotations.push(...rotationFromFrame(bankedSide, bankedUp, tangent));
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, trainInstances.offset);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(offsets), gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, trainInstances.rotation);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(rotations), gl.DYNAMIC_DRAW);
}

function updateCoaster(deltaTime) {
  if (!rideRunning || !coasterTotalLength) return;
  const { position } = pointOnCoaster(rideDistance);
  // The train speeds up after drops and slows slightly while climbing.
  const speed = (5.5 + Math.max(0, coasterMaxHeight - position[1]) * 0.32)
    * trainInstances.worldScale * coasterSpeedMultiplier;
  rideDistance = (rideDistance + speed * deltaTime) % coasterTotalLength;
}

function drawInstanceSet(instances) {
  if (!instances) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, instances.offset);
  gl.vertexAttribPointer(aOffset, 3, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(aOffset, 1);

  gl.bindBuffer(gl.ARRAY_BUFFER, instances.scale);
  gl.vertexAttribPointer(aScale, 3, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(aScale, 1);

  gl.bindBuffer(gl.ARRAY_BUFFER, instances.color);
  gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(aColor, 1);

  gl.bindBuffer(gl.ARRAY_BUFFER, instances.rotation);
  gl.vertexAttribPointer(aRotation, 3, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(aRotation, 1);

  gl.drawArraysInstanced(gl.TRIANGLES, 0, VERTEX_COUNT, instances.count);
}

// === Airship Movement ===
function updateAirship(timeSeconds) {
  if (!airshipInstances) return;

  // Repeat the curve smoothly instead of stopping at the final control point.
  const phase = (timeSeconds * 0.035) % 2;
  const t = phase <= 1 ? phase : 2 - phase;
  const [x, z] = cubicBezier(
    airshipPath[0], airshipPath[1], airshipPath[2], airshipPath[3], t
  );
  const bob = Math.sin(timeSeconds * 1.4) * Math.max(0.25, gridSize / 80);
  const size = Math.max(0.55, gridSize / 50) * 1.35;
  const baseY = airshipBaseY + bob;

  const localParts = [
    [0, 0, 0, 5.0, 1.0, 1.25],
    [0, 0.85, 0, 2.0, 0.8, 1.1],
    [0, 1.0, 0.58, 1.3, 0.45, 0.12],
    [-2.65, 0.1, 0, 1.0, 0.35, 1.8],
    [-2.7, 0.65, 0, 0.9, 1.2, 0.3],
    [2.55, -0.1, 0, 0.6, 0.35, 0.9]
  ];
  const offsets = [];
  for (const [lx, ly, lz, sx, sy, sz] of localParts) {
    const localX = lx * size;
    const localZ = lz * size;
    const worldX = x + localX;
    const worldZ = z + localZ;
    offsets.push(worldX, baseY + ly * size, worldZ);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, airshipInstances.offset);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(offsets), gl.DYNAMIC_DRAW);
}

// === Draw Gradients/Lighting/Atmosphere ===
function drawSkyBackground() {
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.useProgram(skyProgram);
  gl.uniform2f(uSkyResolution, canvas.width, canvas.height);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.depthMask(true);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.useProgram(program);
}

// ---------------------------------------------------------------------
// 4. MATRIX HELPERS
//    A 4×4 matrix can move, scale, or rotate points. WebGL stores
//    matrices as 16 numbers in "column-major" order: the first 4 numbers
//    are the first COLUMN, not the first row. That's why the translation
//    (x, y, z) appears in the last 4 numbers below.
//
//    (Real projects usually use a library such as glMatrix for this.)
// ---------------------------------------------------------------------
function perspective(fieldOfView, aspect, near, far) {
  const f = 1 / Math.tan(fieldOfView / 2);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0
  ];
}

function lookAt(eye, target, up) {
  const subtract = (a, b) => [
    a[0] - b[0], a[1] - b[1], a[2] - b[2]
  ];
  const dot = (a, b) =>
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
  const normalize = (a) => {
    const length = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / length, a[1] / length, a[2] / length];
  };

  const zAxis = normalize(subtract(eye, target));
  const xAxis = normalize(cross(up, zAxis));
  const yAxis = cross(zAxis, xAxis);

  return [
    xAxis[0], yAxis[0], zAxis[0], 0,
    xAxis[1], yAxis[1], zAxis[1], 0,
    xAxis[2], yAxis[2], zAxis[2], 0,
    -dot(xAxis, eye), -dot(yAxis, eye), -dot(zAxis, eye), 1
  ];
}

// === Camera ===
let cameraAngle = 0;
let cameraDistance = 1.35;
let cameraHeight = 0.8;
let cameraSpeed = 0.18;
let rotating = true;
let lastTime = 0;

function resizeCanvas() {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const displayWidth = Math.floor(canvas.clientWidth * pixelRatio);
  const displayHeight = Math.floor(canvas.clientHeight * pixelRatio);

  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }
}

function draw(time = 0) {
  resizeCanvas();
  gl.viewport(0, 0, canvas.width, canvas.height);

  drawSkyBackground();

  const deltaTime = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
  lastTime = time;

  if (rotating) cameraAngle += cameraSpeed * deltaTime;

  const distance = gridSize * SPACING * cameraDistance;
  const eye = [
    Math.sin(cameraAngle) * distance,
    Math.max(8, gridSize * cameraHeight * 0.55),
    Math.cos(cameraAngle) * distance
  ];
  let cameraEye = eye;
  let cameraTarget = [0, Math.max(1.2, maxTerrainHeight * 0.18), 0];
  let cameraUp = [0, 1, 0];

  if (rideCameraMode !== "orbit" && coasterTotalLength > 0) {
    const { position, tangent } = pointOnCoaster(rideDistance);
    if (rideCameraMode === "first") {
      const frame = frameAtDistance(rideDistance);
      const bank = coasterBankAt(rideDistance);
      cameraUp = normalizeVector([
        frame.up[0] * Math.cos(bank) - frame.side[0] * Math.sin(bank),
        frame.up[1] * Math.cos(bank) - frame.side[1] * Math.sin(bank),
        frame.up[2] * Math.cos(bank) - frame.side[2] * Math.sin(bank)
      ]);
      // Put the viewpoint in front of the lead car and above its restraint.
      cameraEye = [
        position[0] + tangent[0] * 2.0 + cameraUp[0] * 1.75,
        position[1] + tangent[1] * 2.0 + cameraUp[1] * 1.75,
        position[2] + tangent[2] * 2.0 + cameraUp[2] * 1.75
      ];
      cameraTarget = [
        cameraEye[0] + tangent[0] * 16,
        cameraEye[1] + tangent[1] * 16,
        cameraEye[2] + tangent[2] * 16
      ];
    } else {
      cameraEye = [
        position[0] - tangent[0] * 7 + 2.2,
        position[1] + 3.5,
        position[2] - tangent[2] * 7 + 2.2
      ];
      cameraTarget = [
        position[0] + tangent[0] * 2,
        position[1] + 1.1,
        position[2] + tangent[2] * 2
      ];
    }
  }

  const aspect = canvas.width / canvas.height;
  const projection = perspective(Math.PI / 4, aspect, 0.1, distance * 4 + 100);
  const view = lookAt(cameraEye, cameraTarget, cameraUp);

  gl.uniformMatrix4fv(uProjection, false, projection);
  gl.uniformMatrix4fv(uView, false, view);

  // Lighting and atmospheric fog uniforms.
  gl.uniform3f(uLightDirection, -0.45, -1.0, -0.35);
  gl.uniform3f(uFogColor, 0.78, 0.87, 0.94);
  gl.uniform1f(uAmbientStrength, 0.38);
  gl.uniform1f(uFogNear, distance * 0.65);
  gl.uniform1f(uFogFar, distance * 2.15);

  // Terrain remains one instanced draw call.
  gl.bindBuffer(gl.ARRAY_BUFFER, offsetBuffer);
  gl.vertexAttribPointer(aOffset, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, scaleBuffer);
  gl.vertexAttribPointer(aScale, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, rotationBuffer);
  gl.vertexAttribPointer(aRotation, 3, gl.FLOAT, false, 0, 0);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, VERTEX_COUNT, instanceCount);

  // Cube clouds and airship.
  drawInstanceSet(cloudInstances);
  updateAirship(time / 1000);
  drawInstanceSet(airshipInstances);

  // Coaster track and the moving train.
  updateCoaster(deltaTime);
  updateTrainInstances();
  drawInstanceSet(coasterInstances);
  // Hide train in first-person so no cart geometry blocks the view.
  if (rideCameraMode !== "first") drawInstanceSet(trainInstances);

  requestAnimationFrame(draw);
}

// === Controls ===
const resolutionSelect = document.getElementById("resolution");
const rotateButton = document.getElementById("rotateButton");
const speedSlider = document.getElementById("speed");
const speedValue = document.getElementById("speedValue");
const coasterSpeedSlider = document.getElementById("coasterSpeed");
const coasterSpeedValue = document.getElementById("coasterSpeedValue");
const heightSlider = document.getElementById("maxHeight");
const heightValue = document.getElementById("heightValue");

const cubeCountLabel = document.getElementById("cubeCount");
const resolutionLabel = document.getElementById("resolutionLabel");
const colorStatus = document.getElementById("colorStatus");
const heightStatus = document.getElementById("heightStatus");
const loadStatus = document.getElementById("loadStatus");
const rideButton = document.getElementById("rideButton");
const cameraModeButton = document.getElementById("cameraModeButton");
const rideStatus = document.getElementById("rideStatus");

function updateStats() {
  cubeCountLabel.textContent = instanceCount.toLocaleString();
  resolutionLabel.textContent = `${gridSize} × ${gridSize}`;
}

function updateImageStatus() {
  colorStatus.textContent = colorImageName;
  heightStatus.textContent = heightImageName;

  if (colorImageData && heightImageData) {
    loadStatus.textContent = "Both images loaded. Terrain is generated from sampled pixels.";
    loadStatus.classList.add("loaded");
  } else {
    loadStatus.textContent = "Waiting for both terrain images to finish loading…";
    loadStatus.classList.remove("loaded");
  }
}

resolutionSelect.addEventListener("change", () => {
  makeTerrain(Number(resolutionSelect.value));
  buildSkyObjects();
  buildCoaster();
});

rotateButton.addEventListener("click", () => {
  rotating = !rotating;
  rotateButton.textContent = rotating ? "Pause camera" : "Resume camera";
});

rideButton.addEventListener("click", () => {
  rideRunning = !rideRunning;
  rideButton.textContent = rideRunning ? "Pause ride" : "Resume ride";
  rideStatus.textContent = rideRunning ? "Train is running" : "Train is paused";
});

cameraModeButton.addEventListener("click", () => {
  const modes = ["chase", "first", "orbit"];
  const labels = { chase: "Chase camera", first: "First-person camera", orbit: "Orbit camera" };
  const next = (modes.indexOf(rideCameraMode) + 1) % modes.length;
  rideCameraMode = modes[next];
  cameraModeButton.textContent = labels[rideCameraMode];
});

speedSlider.addEventListener("input", () => {
  cameraSpeed = Number(speedSlider.value);
  speedValue.textContent = cameraSpeed.toFixed(2);
});

coasterSpeedSlider.addEventListener("input", () => {
  coasterSpeedMultiplier = Number(coasterSpeedSlider.value);
  coasterSpeedValue.textContent = `${coasterSpeedMultiplier.toFixed(1)}×`;
});

heightSlider.addEventListener("input", () => {
  maxTerrainHeight = Number(heightSlider.value);
  heightValue.textContent = maxTerrainHeight.toFixed(1);
  makeTerrain(gridSize);
  buildSkyObjects();
  buildCoaster();
});

function handleImageUpload(input, kind) {
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      loadStatus.textContent = "Please choose a valid image file.";
      loadStatus.classList.remove("loaded");
      return;
    }

    const objectUrl = URL.createObjectURL(file);

    try {
      await loadImageFromSource(objectUrl, kind, file.name);
      if (colorImageData && heightImageData) {
        makeTerrain(gridSize);
        buildCoaster();
      }
    } catch (error) {
      loadStatus.textContent = error.message;
      loadStatus.classList.remove("loaded");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  });
}

handleImageUpload(document.getElementById("colorUpload"), "color");
handleImageUpload(document.getElementById("heightUpload"), "height");

// === Startup ===
// Loads the sample maps and builds scenery
async function start() {
  try {
    await Promise.all([
      loadImageFromSource("assets/color-map.png", "color", "Sample color map"),
      loadImageFromSource("assets/height-map.png", "height", "Sample height map")
    ]);

    makeTerrain(Number(resolutionSelect.value));
    buildSkyObjects();
    buildCoaster();
    requestAnimationFrame(draw);
  } catch (error) {
    loadStatus.textContent = error.message;
    loadStatus.classList.remove("loaded");
    console.error(error);
  }
}

start();