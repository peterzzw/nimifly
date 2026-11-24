(() => {
  const root = (typeof GameGlobal !== "undefined" && GameGlobal) || {};
  const STATE = Object.freeze({
    IDLE: "idle",
    READY: "ready",
    LOST: "lost",
    RESTORING: "restoring",
    FAILED: "failed",
  });

  function now() {
    try {
      if (root.performance && typeof root.performance.now === "function") return root.performance.now();
    } catch (e) {}
    return Date.now();
  }

  function deviceBudgetBytes() {
    let benchmark = 0;
    try {
      const info = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync();
      benchmark = Number(info && info.benchmarkLevel) || 0;
    } catch (e) {}
    return (benchmark > 0 && benchmark < 25 ? 32 : 64) * 1024 * 1024;
  }

  /** 小游戏离屏 WebGL：优先 createOffscreenCanvas，否则二次 createCanvas（首个已是上屏 2D）。 */
  function createWebGlCanvas(width, height) {
    const w = Math.max(1, width | 0);
    const h = Math.max(1, height | 0);
    const attrs = {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    };
    const tryGl = (canvas, backend) => {
      if (!canvas) return null;
      try { canvas.width = w; canvas.height = h; } catch (e) {}
      const gl = canvas.getContext("webgl", attrs)
        || canvas.getContext("experimental-webgl", attrs);
      return gl ? { canvas, gl, backend: backend || "unknown" } : null;
    };

    if (typeof wx !== "undefined" && typeof wx.createOffscreenCanvas === "function") {
      try {
        const got = tryGl(wx.createOffscreenCanvas({ type: "webgl", width: w, height: h }), "offscreen");
        if (got) return got;
      } catch (e) {}
      try {
        const got = tryGl(wx.createOffscreenCanvas(), "offscreen");
        if (got) return got;
      } catch (e) {}
    }
    // 兼容：很多真机基础库没有 createOffscreenCanvas，但第二次 createCanvas 就是离屏。
    // 部分机型这条路径 gl 能建、合成到 2D 却全透明，调用方需按 backend 决定是否信任。
    if (typeof wx !== "undefined" && typeof wx.createCanvas === "function") {
      try {
        const got = tryGl(wx.createCanvas(), "canvas2");
        if (got) return got;
      } catch (e) {}
    }
    return null;
  }

  class TextureStore {
    constructor(gl, budget) {
      this.gl = gl;
      this.budget = budget;
      this.bytes = 0;
      this.frame = 0;
      this.items = new Map();
    }

    beginFrame(frame) {
      this.frame = frame | 0;
    }

    get(key) {
      const item = this.items.get(key);
      if (!item) return null;
      item.lastFrame = this.frame;
      return item.texture;
    }

    upload(key, image, opts) {
      if (!key || !image || !(image.width > 0) || !(image.height > 0)) return null;
      const old = this.items.get(key);
      if (old && old.image === image) {
        old.lastFrame = this.frame;
        return old.texture;
      }
      if (old) this.remove(key);
      const gl = this.gl;
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, !!(opts && opts.flipY));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      const bytes = Math.max(1, image.width | 0) * Math.max(1, image.height | 0) * 4;
      this.items.set(key, {
        texture, image, bytes,
        width: Math.max(1, image.width | 0),
        height: Math.max(1, image.height | 0),
        lastFrame: this.frame,
        pinned: !!(opts && opts.pinned),
      });
      this.bytes += bytes;
      this.trim(undefined, key);
      return texture;
    }

    update(key, image, opts) {
      if (!key || !image || !(image.width > 0) || !(image.height > 0)) return null;
      const item = this.items.get(key);
      if (!item) return this.upload(key, image, opts);
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, item.texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, !!(opts && opts.flipY));
      const width = Math.max(1, image.width | 0);
      const height = Math.max(1, image.height | 0);
      if (item.width === width && item.height === height && typeof gl.texSubImage2D === "function") {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, image);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      }
      const bytes = width * height * 4;
      this.bytes = Math.max(0, this.bytes - item.bytes) + bytes;
      item.image = image;
      item.width = width;
      item.height = height;
      item.bytes = bytes;
      item.lastFrame = this.frame;
      item.pinned = !!(opts && opts.pinned);
      return item.texture;
    }

    remove(key) {
      const item = this.items.get(key);
      if (!item) return;
      try { this.gl.deleteTexture(item.texture); } catch (e) {}
      this.bytes = Math.max(0, this.bytes - item.bytes);
      this.items.delete(key);
    }

    trim(target, protectedKey) {
      const limit = Number.isFinite(target) ? Math.max(0, target) : this.budget;
      if (this.bytes <= limit) return;
      const candidates = [];
      this.items.forEach((item, key) => {
        if (!item.pinned && key !== protectedKey) candidates.push({ key, lastFrame: item.lastFrame });
      });
      candidates.sort((a, b) => a.lastFrame - b.lastFrame);
      for (let i = 0; i < candidates.length && this.bytes > limit; i++) this.remove(candidates[i].key);
    }

    clear() {
      Array.from(this.items.keys()).forEach((key) => this.remove(key));
    }
  }

  class WebGLWorld {
    constructor() {
      this.state = STATE.IDLE;
      this.canvas = null;
      this.gl = null;
      this.textures = null;
      this.width = 1;
      this.height = 1;
      this.frame = 0;
      this.restoreAttempts = 0;
      this.failure = "";
      this.metrics = {
        frameMs: 0,
        drawCalls: 0,
        triangles: 0,
        textureUploads: 0,
        textureBytes: 0,
      };
      this._frameStartedAt = 0;
      this._onLost = null;
      this._onRestored = null;
      this._sprite = null;
      this._color = null;
      this.sceneActive = false;
      this.direct = false;
      this.glBackend = "";
      this.viewScale = 1;
      this.coordinateScale = 1;
      this.transform = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    }

    init(width, height) {
      if (this.state === STATE.READY) {
        this.resize(width, height);
        return true;
      }
      if (this.state === STATE.FAILED) return false;
      try {
        this.width = Math.max(1, width | 0);
        this.height = Math.max(1, height | 0);
        this.direct = !!root.screenCanvas;
        this.glBackend = "";
        if (root.screenCanvas) {
          this.canvas = root.screenCanvas;
          const directAttrs = {
            alpha: false,
            antialias: true,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
            powerPreference: "high-performance",
          };
          this.gl = this.canvas.getContext("webgl", directAttrs)
            || this.canvas.getContext("experimental-webgl", directAttrs);
          this.glBackend = "direct";
        } else {
          const got = createWebGlCanvas(this.width, this.height);
          if (!got) throw new Error("webgl canvas unavailable");
          this.canvas = got.canvas;
          this.gl = got.gl;
          this.glBackend = got.backend || "unknown";
        }
        if (!this.gl) throw new Error("webgl context unavailable");
        this.textures = new TextureStore(this.gl, deviceBudgetBytes());
        this._bindContextEvents();
        this.gl.disable(this.gl.DEPTH_TEST);
        this.gl.disable(this.gl.CULL_FACE);
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFuncSeparate(
          this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA,
          this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA
        );
        this.gl.viewport(0, 0, this.width, this.height);
        this.state = STATE.READY;
        this.failure = "";
        this.restoreAttempts = 0;
        return true;
      } catch (e) {
        this.fail(e && e.message ? e.message : "webgl init failed");
        return false;
      }
    }

    _bindContextEvents() {
      if (!this.canvas || typeof this.canvas.addEventListener !== "function") return;
      this._onLost = (event) => {
        try { event.preventDefault && event.preventDefault(); } catch (e) {}
        this.state = STATE.LOST;
      };
      this._onRestored = () => {
        this.state = STATE.RESTORING;
        this.restore();
      };
      this.canvas.addEventListener("webglcontextlost", this._onLost);
      this.canvas.addEventListener("webglcontextrestored", this._onRestored);
    }

    resize(width, height) {
      const w = Math.max(1, width | 0);
      const h = Math.max(1, height | 0);
      if (!this.canvas || (w === this.width && h === this.height)) return;
      this.width = w;
      this.height = h;
      this.canvas.width = w;
      this.canvas.height = h;
      if (this.gl) this.gl.viewport(0, 0, w, h);
    }

    beginFrame(width, height) {
      if (this.sceneActive) return this.state === STATE.READY;
      if (this.state !== STATE.READY && !this.init(width, height)) return false;
      if (this.gl.isContextLost && this.gl.isContextLost()) {
        this.state = STATE.LOST;
        return false;
      }
      this.resize(width, height);
      this.frame++;
      this._frameStartedAt = now();
      this.metrics.drawCalls = 0;
      this.metrics.triangles = 0;
      this.metrics.textureUploads = 0;
      this.textures.beginFrame(this.frame);
      this.gl.viewport(0, 0, this.width, this.height);
      this.gl.clearColor(0, 0, 0, 1);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      return true;
    }

    beginScene(width, height) {
      if (!this.beginFrame(width, height)) return false;
      this.sceneActive = true;
      this.viewScale = 1;
      this.coordinateScale = 1;
      this.setTransform(null);
      this.setScissor(null);
      return true;
    }

    setViewScale(scale) {
      this.viewScale = Number.isFinite(scale) ? Math.max(0.01, scale) : 1;
    }

    setCoordinateScale(scale) {
      this.coordinateScale = Number.isFinite(scale) ? Math.max(0.01, scale) : 1;
    }

    setTransform(matrix) {
      const src = matrix && matrix.length === 9 ? matrix : [1, 0, 0, 0, 1, 0, 0, 0, 1];
      this.transform.set(src);
    }

    setScissor(rect) {
      if (!this.gl) return;
      if (!rect) {
        this.gl.disable(this.gl.SCISSOR_TEST);
        return;
      }
      this.gl.enable(this.gl.SCISSOR_TEST);
      this.gl.scissor(rect.x | 0, rect.y | 0, Math.max(1, rect.w | 0), Math.max(1, rect.h | 0));
    }

    endFrame() {
      if (this.state !== STATE.READY) return null;
      if (this.sceneActive) return this.canvas;
      this.gl.flush();
      this.metrics.frameMs = Math.max(0, now() - this._frameStartedAt);
      this.metrics.textureBytes = this.textures ? this.textures.bytes : 0;
      return this.canvas;
    }

    endScene() {
      if (this.state !== STATE.READY) return null;
      this.gl.flush();
      this.sceneActive = false;
      this.metrics.frameMs = Math.max(0, now() - this._frameStartedAt);
      this.metrics.textureBytes = this.textures ? this.textures.bytes : 0;
      return this.canvas;
    }

    isDirect() {
      return !!this.direct;
    }

    /** offscreen | canvas2 | direct | unknown —— canvas2 在部分真机合成到 2D 会全透明 */
    getGlBackend() {
      return this.glBackend || (this.direct ? "direct" : "");
    }

    uploadTexture(key, image, opts) {
      if (this.state !== STATE.READY || !this.textures) return null;
      const current = this.textures.items.get(key);
      if (current && current.image === image) return this.textures.get(key);
      const texture = this.textures.upload(key, image, opts);
      if (texture) this.metrics.textureUploads++;
      return texture;
    }

    updateTexture(key, image, opts) {
      if (this.state !== STATE.READY || !this.textures) return null;
      const texture = this.textures.update(key, image, opts);
      if (texture) this.metrics.textureUploads++;
      return texture;
    }

    compileProgram(vertexSource, fragmentSource) {
      if (this.state !== STATE.READY) return null;
      const gl = this.gl;
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          throw new Error(gl.getShaderInfoLog(shader) || "shader compile failed");
        }
        return shader;
      };
      const vs = compile(gl.VERTEX_SHADER, vertexSource);
      const fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || "program link failed");
      }
      return program;
    }

    _ensureSpritePipeline() {
      if (this._sprite) return this._sprite;
      const gl = this.gl;
      const program = this.compileProgram([
        "attribute vec2 aPos;",
        "attribute vec2 aUv;",
        "attribute vec3 aTint;",
        "attribute float aStrength;",
        "attribute float aAlpha;",
        "uniform vec2 uResolution;",
        "uniform float uViewScale;",
        "uniform float uCoordinateScale;",
        "uniform mat3 uTransform;",
        "varying vec2 vUv;",
        "varying vec3 vTint;",
        "varying float vStrength;",
        "varying float vAlpha;",
        "void main(){",
        "  vec2 pos=(aPos*uCoordinateScale-uResolution*0.5)*uViewScale+uResolution*0.5;",
        "  pos=(uTransform*vec3(pos,1.0)).xy;",
        "  vec2 clip=vec2(pos.x/uResolution.x*2.0-1.0,1.0-pos.y/uResolution.y*2.0);",
        "  gl_Position=vec4(clip,0.0,1.0);",
        "  vUv=aUv;",
        "  vTint=aTint;",
        "  vStrength=aStrength;",
        "  vAlpha=aAlpha;",
        "}",
      ].join("\n"), [
        "precision mediump float;",
        "uniform sampler2D uTex;",
        "varying vec2 vUv;",
        "varying vec3 vTint;",
        "varying float vStrength;",
        "varying float vAlpha;",
        "void main(){",
        "  vec4 p=texture2D(uTex,vUv);",
        "  float lum=dot(p.rgb,vec3(0.2126,0.7152,0.0722));",
        "  vec3 colored=vTint*clamp(lum*1.18,0.0,1.0);",
        "  gl_FragColor=vec4(mix(p.rgb,colored,vStrength),p.a*vAlpha);",
        "}",
      ].join("\n"));
      const buffer = gl.createBuffer();
      const stride = 9 * 4;
      const bindAttr = (name, size, offset) => {
        const loc = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
      };
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      bindAttr("aPos", 2, 0);
      bindAttr("aUv", 2, 8);
      bindAttr("aTint", 3, 16);
      bindAttr("aStrength", 1, 28);
      bindAttr("aAlpha", 1, 32);
      this._sprite = {
        program,
        buffer,
        resolution: gl.getUniformLocation(program, "uResolution"),
        viewScale: gl.getUniformLocation(program, "uViewScale"),
        coordinateScale: gl.getUniformLocation(program, "uCoordinateScale"),
        transform: gl.getUniformLocation(program, "uTransform"),
        sampler: gl.getUniformLocation(program, "uTex"),
      };
      return this._sprite;
    }

    drawSprites(textureKey, image, sprites, atlas) {
      if (this.state !== STATE.READY || !sprites || !sprites.length) return false;
      const gl = this.gl;
      const pipe = this._ensureSpritePipeline();
      const textureOpts = {
        flipY: true,
        pinned: !(atlas && atlas.pinned === false),
      };
      const texture = atlas && atlas.dynamic
        ? this.updateTexture(textureKey, image, textureOpts)
        : this.uploadTexture(textureKey, image, textureOpts);
      if (!texture) return false;
      const cols = Math.max(1, atlas && atlas.cols || 1);
      const rows = Math.max(1, atlas && atlas.rows || 1);
      const data = new Float32Array(sprites.length * 6 * 9);
      let at = 0;
      const write = (x, y, u, v, tint, strength, alpha) => {
        data[at++] = x;
        data[at++] = y;
        data[at++] = u;
        data[at++] = v;
        data[at++] = tint[0];
        data[at++] = tint[1];
        data[at++] = tint[2];
        data[at++] = strength;
        data[at++] = alpha;
      };
      for (let i = 0; i < sprites.length; i++) {
        const s = sprites[i];
        const halfW = Number(s.w || s.size || 1) * 0.5;
        const halfH = Number(s.h || s.size || 1) * 0.5;
        const cs = Math.cos(Number(s.rotation) || 0);
        const sn = Math.sin(Number(s.rotation) || 0);
        const point = (lx, ly) => ({
          x: s.x + lx * cs - ly * sn,
          y: s.y + lx * sn + ly * cs,
        });
        const p0 = point(-halfW, -halfH);
        const p1 = point(halfW, -halfH);
        const p2 = point(-halfW, halfH);
        const p3 = point(halfW, halfH);
        const index = Math.max(0, Number(s.frame) | 0);
        const col = index % cols;
        const row = Math.floor(index / cols);
        const u0 = col / cols;
        const u1 = (col + 1) / cols;
        const vTop = 1 - row / rows;
        const vBottom = 1 - (row + 1) / rows;
        const tint = s.tint || [1, 1, 1];
        const strength = Number(s.strength) || 0;
        const alpha = Number.isFinite(s.alpha) ? Math.max(0, Math.min(1, s.alpha)) : 1;
        write(p0.x, p0.y, u0, vTop, tint, strength, alpha);
        write(p1.x, p1.y, u1, vTop, tint, strength, alpha);
        write(p2.x, p2.y, u0, vBottom, tint, strength, alpha);
        write(p2.x, p2.y, u0, vBottom, tint, strength, alpha);
        write(p1.x, p1.y, u1, vTop, tint, strength, alpha);
        write(p3.x, p3.y, u1, vBottom, tint, strength, alpha);
      }
      gl.useProgram(pipe.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, pipe.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      const stride = 9 * 4;
      const rebind = (name, size, offset) => {
        const loc = gl.getAttribLocation(pipe.program, name);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
      };
      rebind("aPos", 2, 0);
      rebind("aUv", 2, 8);
      rebind("aTint", 3, 16);
      rebind("aStrength", 1, 28);
      rebind("aAlpha", 1, 32);
      gl.uniform2f(pipe.resolution, this.width, this.height);
      gl.uniform1f(pipe.viewScale, this.viewScale);
      gl.uniform1f(pipe.coordinateScale, this.coordinateScale);
      gl.uniformMatrix3fv(pipe.transform, false, this.transform);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(pipe.sampler, 0);
      gl.drawArrays(gl.TRIANGLES, 0, sprites.length * 6);
      if (typeof gl.getError === "function") {
        const error = gl.getError();
        if (error) throw new Error("WebGL sprite error " + error);
      }
      this.noteDraw(sprites.length * 2);
      return true;
    }

    drawCanvasLayer(textureKey, image, update = true) {
      if (!image || !(image.width > 0) || !(image.height > 0)) return false;
      const previousScale = this.coordinateScale;
      this.coordinateScale = 1;
      const drew = this.drawSprites(textureKey, image, [{
        x: this.width * 0.5,
        y: this.height * 0.5,
        w: this.width,
        h: this.height,
        rotation: 0,
        frame: 0,
        tint: [1, 1, 1],
        strength: 0,
        alpha: 1,
      }], { cols: 1, rows: 1, dynamic: !!update, pinned: true });
      this.coordinateScale = previousScale;
      return drew;
    }

    _ensureColorPipeline() {
      if (this._color) return this._color;
      const gl = this.gl;
      const program = this.compileProgram([
        "attribute vec2 aPos;",
        "attribute vec4 aColor;",
        "uniform vec2 uResolution;",
        "uniform float uViewScale;",
        "uniform float uCoordinateScale;",
        "uniform mat3 uTransform;",
        "varying vec4 vColor;",
        "void main(){",
        "  vec2 pos=(aPos*uCoordinateScale-uResolution*0.5)*uViewScale+uResolution*0.5;",
        "  pos=(uTransform*vec3(pos,1.0)).xy;",
        "  vec2 clip=vec2(pos.x/uResolution.x*2.0-1.0,1.0-pos.y/uResolution.y*2.0);",
        "  gl_Position=vec4(clip,0.0,1.0);",
        "  vColor=aColor;",
        "}",
      ].join("\n"), [
        "precision mediump float;",
        "varying vec4 vColor;",
        "void main(){ gl_FragColor=vColor; }",
      ].join("\n"));
      this._color = {
        program,
        buffer: gl.createBuffer(),
        resolution: gl.getUniformLocation(program, "uResolution"),
        viewScale: gl.getUniformLocation(program, "uViewScale"),
        coordinateScale: gl.getUniformLocation(program, "uCoordinateScale"),
        transform: gl.getUniformLocation(program, "uTransform"),
      };
      return this._color;
    }

    drawColorTriangles(vertices, additive) {
      if (this.state !== STATE.READY || !vertices || vertices.length < 18) return false;
      const gl = this.gl;
      const pipe = this._ensureColorPipeline();
      const data = vertices instanceof Float32Array ? vertices : new Float32Array(vertices);
      gl.useProgram(pipe.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, pipe.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      const stride = 6 * 4;
      const pos = gl.getAttribLocation(pipe.program, "aPos");
      const color = gl.getAttribLocation(pipe.program, "aColor");
      gl.enableVertexAttribArray(pos);
      gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(color);
      gl.vertexAttribPointer(color, 4, gl.FLOAT, false, stride, 8);
      gl.uniform2f(pipe.resolution, this.width, this.height);
      gl.uniform1f(pipe.viewScale, this.viewScale);
      gl.uniform1f(pipe.coordinateScale, this.coordinateScale);
      gl.uniformMatrix3fv(pipe.transform, false, this.transform);
      if (additive) {
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      } else {
        gl.blendFuncSeparate(
          gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
          gl.ONE, gl.ONE_MINUS_SRC_ALPHA
        );
      }
      const count = Math.floor(data.length / 6);
      gl.drawArrays(gl.TRIANGLES, 0, count);
      this.noteDraw(Math.floor(count / 3));
      if (additive) {
        gl.blendFuncSeparate(
          gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
          gl.ONE, gl.ONE_MINUS_SRC_ALPHA
        );
      }
      return true;
    }

    noteDraw(triangles) {
      this.metrics.drawCalls++;
      this.metrics.triangles += Math.max(0, triangles | 0);
    }

    restore() {
      if (this.restoreAttempts >= 2) {
        this.fail("webgl restore failed");
        return false;
      }
      this.restoreAttempts++;
      this.destroy(false);
      this.state = STATE.IDLE;
      return this.init(this.width, this.height);
    }

    onMemoryWarning() {
      if (!this.textures) return;
      this.textures.budget = Math.max(16 * 1024 * 1024, Math.floor(this.textures.budget * 0.5));
      this.textures.trim(Math.floor(this.textures.budget * 0.75));
    }

    fail(reason) {
      this.failure = String(reason || "webgl unavailable");
      this.state = STATE.FAILED;
      this.destroy(false);
      // 无 offscreen/WebGL 时静默失败，飞机回退 Canvas 2D，不再弹 Toast 吓人。
      try { console.warn("[webglWorld] unavailable:", this.failure); } catch (e) {}
    }

    destroy(markIdle = true) {
      if (this.textures) this.textures.clear();
      this.textures = null;
      this._sprite = null;
      this._color = null;
      this.gl = null;
      this.canvas = null;
      this.sceneActive = false;
      this.direct = false;
      this.glBackend = "";
      this.viewScale = 1;
      this.coordinateScale = 1;
      this.setTransform(null);
      if (markIdle) this.state = STATE.IDLE;
    }

    status() {
      return {
        state: this.state,
        failure: this.failure,
        backend: this.glBackend || "",
        width: this.width,
        height: this.height,
        textureBudget: this.textures ? this.textures.budget : deviceBudgetBytes(),
        ...this.metrics,
      };
    }
  }

  const renderer = new WebGLWorld();
  try {
    if (typeof wx !== "undefined" && typeof wx.onMemoryWarning === "function") {
      wx.onMemoryWarning(() => renderer.onMemoryWarning());
    }
    if (typeof wx !== "undefined" && typeof wx.onShow === "function") {
      wx.onShow(() => {
        if (renderer.state === STATE.LOST || renderer.state === STATE.RESTORING) renderer.restore();
      });
    }
  } catch (e) {}

  root.PapaWebGLWorld = renderer;
  root.PapaWebGLState = STATE;
})();
