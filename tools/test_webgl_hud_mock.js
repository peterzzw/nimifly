const assert = require("assert");

let canvasCreates = 0;
let fillTextCalls = 0;

function makeCanvas() {
  canvasCreates++;
  return {
    width: 1,
    height: 1,
    getContext(type) {
      assert.strictEqual(type, "2d");
      return {
        clearRect() {},
        fillText() { fillTextCalls++; },
        measureText(text) { return { width: text.codePointAt(0) > 127 ? 32 : 18 }; },
        set fillStyle(value) { this._fillStyle = value; },
        set textAlign(value) { this._textAlign = value; },
        set textBaseline(value) { this._textBaseline = value; },
        set font(value) { this._font = value; },
      };
    },
  };
}

// Deliberately omit createOffscreenCanvas: the HUD must use the later
// Mini Game wx.createCanvas fallback for its small glyph atlas.
global.GameGlobal = {};
global.wx = { createCanvas: makeCanvas };

require("../js/render/webglHud.js");
const hud = global.GameGlobal.PapaWebGLHud;
assert(hud, "HUD renderer should be exported");

function makeWorld() {
  const calls = [];
  const textures = new Map();
  let uploads = 0;
  return {
    calls,
    get uploads() { return uploads; },
    drawColorTriangles(vertices, additive) {
      calls.push({ kind: "geometry", additive, vertices: Array.from(vertices) });
      return true;
    },
    drawSprites(key, image, sprites, atlas) {
      if (textures.get(key) !== image) {
        textures.set(key, image);
        uploads++;
      }
      calls.push({ kind: "text", key, image, sprites: sprites.slice(), atlas: { ...atlas } });
      return true;
    },
  };
}

const world = makeWorld();
hud.begin(320, 240, 2);
hud.rect(10, 20, 30, 40, "#ff000080");
hud.line(0, 0, 10, 0, 2, [0, 1, 0, 1], { additive: true });
hud.circle(50, 50, 10, "#fff", { segments: 8 });
hud.ellipse(80, 50, 12, 6, "#fff", { segments: 8 });
hud.ring(110, 50, 10, 3, "#fff", { segments: 8 });
hud.roundedRect(130, 20, 50, 30, 6, "#fff", { segments: 2 });
hud.text("甲甲🙂", 20, 100, { size: 16, color: "#80c0ffff" });
assert.strictEqual(hud.flush(world), true);

assert.deepStrictEqual(world.calls.map((call) => call.kind + (call.additive ? ":add" : "")), [
  "geometry", "geometry:add", "text",
], "flush must submit normal geometry, additive geometry, then text");
assert.strictEqual(world.calls.length, 3, "mixed HUD should use at most three draw calls");
assert.strictEqual(world.calls[0].vertices.length % 18, 0, "geometry must contain complete triangles");
assert.strictEqual(world.calls[1].vertices.length, 6 * 6, "one line quad must contain six vertices");
assert.deepStrictEqual(world.calls[0].vertices.slice(0, 12), [
  10, 20, 1, 0, 0, 128 / 255,
  40, 20, 1, 0, 0, 128 / 255,
]);
assert.strictEqual(world.calls[2].sprites.length, 3);
assert.strictEqual(world.calls[2].sprites[0].frame, world.calls[2].sprites[1].frame,
  "duplicate glyphs must share one atlas frame");
assert.strictEqual(world.uploads, 1);
assert.strictEqual(canvasCreates, 1);
const firstRevision = hud.status().atlasRevision;
const firstGlyphCount = hud.status().glyphs;
const firstFillCount = fillTextCalls;

world.calls.length = 0;
hud.begin(320, 240, 2).text("甲🙂", 20, 100);
hud.flush(world);
assert.strictEqual(hud.status().atlasRevision, firstRevision,
  "ordinary frames must not rebuild the glyph atlas");
assert.strictEqual(hud.status().glyphs, firstGlyphCount);
assert.strictEqual(world.uploads, 1, "ordinary frames must not upload the atlas");
assert.strictEqual(canvasCreates, 1);
assert.strictEqual(fillTextCalls, firstFillCount);

hud.begin(320, 240, 2).text("甲𠮷𠮷", 20, 100);
hud.flush(world);
assert.strictEqual(hud.status().atlasRevision, firstRevision + 1,
  "one or more new characters should cause exactly one atlas rebuild");
assert.strictEqual(hud.status().glyphs, firstGlyphCount + 1,
  "new astral Unicode characters must be deduplicated by code point");
assert.strictEqual(world.uploads, 2);
assert.strictEqual(world.calls[world.calls.length - 1].key, "papa:webgl-hud:atlas",
  "atlas rebuilds must replace one stable texture key instead of leaking pinned revisions");

const normalArray = hud._normal;
const additiveArray = hud._additive;
const textArray = hud._texts;
const spriteArray = hud._sprites;
hud.begin(320, 240, 2).rect(0, 0, 5, 5, "#fff").text("HUD 123", 5, 5);
hud.flush(world);
const stableHighWater = { ...hud.status().highWater };

for (let frame = 0; frame < 5000; frame++) {
  hud.begin(320, 240, 2);
  hud.rect(frame % 320, 0, 5, 5, "#fff");
  hud.text("HUD 123", 5, 5);
  hud.flush(world);
}

assert.strictEqual(hud._normal, normalArray, "normal geometry array must be reused");
assert.strictEqual(hud._additive, additiveArray, "additive geometry array must be reused");
assert.strictEqual(hud._texts, textArray, "text command array must be reused");
assert.strictEqual(hud._sprites, spriteArray, "sprite array must be reused");
assert.deepStrictEqual(hud.status().highWater, stableHighWater,
  "stable 5000-frame workloads must not increase retained array capacity");
assert.strictEqual(hud.status().atlasRevision, firstRevision + 1);
assert.strictEqual(world.uploads, 2);

console.log("webglHud mock regression passed");
