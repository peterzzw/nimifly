const assert = require("assert");

function makeGl() {
  let textureId = 0;
  let contextLost = false;
  const deletedTextures = [];
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    TEXTURE_2D: 5, RGBA: 6, UNSIGNED_BYTE: 7, LINEAR: 8, CLAMP_TO_EDGE: 9,
    TEXTURE_MIN_FILTER: 10, TEXTURE_MAG_FILTER: 11, TEXTURE_WRAP_S: 12, TEXTURE_WRAP_T: 13,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 14, UNPACK_FLIP_Y_WEBGL: 15,
    DEPTH_TEST: 16, CULL_FACE: 17, BLEND: 18, SCISSOR_TEST: 28,
    SRC_ALPHA: 19, ONE_MINUS_SRC_ALPHA: 20, ONE: 21,
    COLOR_BUFFER_BIT: 22, ARRAY_BUFFER: 23, FLOAT: 24, DYNAMIC_DRAW: 25,
    TRIANGLES: 26, TEXTURE0: 27,
    createTexture: () => ({ id: ++textureId }),
    deleteTexture: (texture) => deletedTextures.push(texture.id),
    bindTexture() {}, pixelStorei() {}, texParameteri() {}, texImage2D() {}, texSubImage2D() {},
    createShader: () => ({}), shaderSource() {}, compileShader() {},
    getShaderParameter: () => true, getShaderInfoLog: () => "",
    createProgram: () => ({}), attachShader() {}, linkProgram() {}, deleteShader() {},
    getProgramParameter: () => true, getProgramInfoLog: () => "",
    createBuffer: () => ({}), bindBuffer() {}, bufferData() {},
    useProgram() {}, getAttribLocation: () => 1, enableVertexAttribArray() {}, vertexAttribPointer() {},
    getUniformLocation: () => ({}), uniform2f() {}, uniform1f() {}, uniform1i() {}, uniformMatrix3fv() {},
    activeTexture() {}, drawArrays() {}, viewport() {}, clearColor() {}, clear() {}, flush() {},
    disable() {}, enable() {}, scissor() {}, blendFuncSeparate() {},
    isContextLost: () => contextLost, getError: () => 0,
    _setLost: (value) => { contextLost = value; },
    _deletedTextures: deletedTextures,
  };
  return gl;
}

const listeners = Object.create(null);
const gl = makeGl();
const canvas = {
  width: 1,
  height: 1,
  getContext: () => gl,
  addEventListener: (name, fn) => { listeners[name] = fn; },
};

global.GameGlobal = { performance: { now: () => Date.now() }, screenCanvas: canvas };
global.wx = {
  createOffscreenCanvas: () => canvas,
  getDeviceInfo: () => ({ benchmarkLevel: 30 }),
  onMemoryWarning(fn) { this._memoryWarning = fn; },
  onShow() {},
};

require("../js/render/webglWorld.js");
const world = global.GameGlobal.PapaWebGLWorld;
assert(world, "renderer should be exported");
assert(world.beginFrame(320, 240), "renderer should initialize");
assert.strictEqual(world.isDirect(), true);

const imageA = { width: 64, height: 64 };
const imageB = { width: 64, height: 64 };
assert(world.drawSprites("test", imageA, [{
  x: 20, y: 20, w: 16, h: 16, frame: 0,
  tint: [1, 0, 0], strength: 0.8, alpha: 0.5,
}], { cols: 1, rows: 1, pinned: false }));
assert(world.drawColorTriangles([
  0, 0, 1, 0, 0, 1,
  10, 0, 0, 1, 0, 1,
  0, 10, 0, 0, 1, 1,
], false));
assert.strictEqual(world.status().drawCalls, 2);
assert(world.endFrame());

assert(world.beginFrame(320, 240));
assert(world.drawSprites("test", imageB, [{
  x: 20, y: 20, w: 16, h: 16, frame: 0,
}], { cols: 1, rows: 1, pinned: false }));
assert(gl._deletedTextures.length >= 1, "replacing an atlas should delete its previous texture");
world.endFrame();

wx._memoryWarning();
assert(world.status().textureBudget >= 16 * 1024 * 1024);

gl._setLost(true);
listeners.webglcontextlost({ preventDefault() {} });
assert.strictEqual(world.status().state, "lost");
gl._setLost(false);
listeners.webglcontextrestored();
assert.strictEqual(world.status().state, "ready");

for (let frame = 0; frame < 5000; frame++) {
  assert(world.beginFrame(320, 240));
  assert(world.drawSprites("stress", imageA, [{
    x: frame % 320, y: frame % 240, w: 16, h: 16, frame: 0,
    tint: [0.2, 0.7, 1], strength: 0.85, alpha: 0.9,
  }], { cols: 1, rows: 1, pinned: false }));
  assert(world.endFrame());
}
assert.strictEqual(world.status().textureBytes, 64 * 64 * 4, "stable frames must not leak textures");

assert(world.beginScene(320, 240));
assert(world.drawCanvasLayer("screen:test", imageA));
world.setViewScale(0.75);
assert(world.drawColorTriangles([
  0, 0, 1, 1, 1, 1,
  10, 0, 1, 1, 1, 1,
  0, 10, 1, 1, 1, 1,
], false));
assert(world.endScene());

console.log("webglWorld mock regression passed");
