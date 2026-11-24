(() => {
  const root = (typeof GameGlobal !== "undefined" && GameGlobal) || {};
  const TAU = Math.PI * 2;
  const DEFAULT_HUD_CHARS =
    "天空战机微信用户房间阵营击杀排名全员死亡胜利惜败结算冠军拆除开火地雷机身颜色选一种开战方式" +
    "复活生命护盾导弹机炮速度得分时间剩余等待加入离开连接断线重连观战返回继续确认取消";
  const ASCII = (() => {
    let value = "";
    for (let code = 32; code <= 126; code++) value += String.fromCharCode(code);
    return value;
  })();

  function finite(value, fallback) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, finite(value, 1)));
  }

  function color(value, alpha) {
    let r = 1, g = 1, b = 1, a = 1;
    if (Array.isArray(value) || (value && typeof value !== "string" && typeof value.length === "number")) {
      r = finite(value[0], 1);
      g = finite(value[1], 1);
      b = finite(value[2], 1);
      a = finite(value[3], 1);
      if (r > 1 || g > 1 || b > 1) {
        r /= 255; g /= 255; b /= 255;
      }
    } else if (value && typeof value === "object") {
      r = finite(value.r, 1); g = finite(value.g, 1); b = finite(value.b, 1);
      a = finite(value.a, 1);
      if (r > 1 || g > 1 || b > 1) {
        r /= 255; g /= 255; b /= 255;
      }
    } else if (typeof value === "string") {
      const text = value.trim();
      const hex = text.charAt(0) === "#" ? text.slice(1) : "";
      if (hex.length === 3 || hex.length === 4) {
        r = parseInt(hex.charAt(0) + hex.charAt(0), 16) / 255;
        g = parseInt(hex.charAt(1) + hex.charAt(1), 16) / 255;
        b = parseInt(hex.charAt(2) + hex.charAt(2), 16) / 255;
        if (hex.length === 4) a = parseInt(hex.charAt(3) + hex.charAt(3), 16) / 255;
      } else if (hex.length === 6 || hex.length === 8) {
        r = parseInt(hex.slice(0, 2), 16) / 255;
        g = parseInt(hex.slice(2, 4), 16) / 255;
        b = parseInt(hex.slice(4, 6), 16) / 255;
        if (hex.length === 8) a = parseInt(hex.slice(6, 8), 16) / 255;
      } else {
        const rgb = text.match(/^rgba?\(([^)]+)\)$/i);
        if (rgb) {
          const parts = rgb[1].split(",");
          r = finite(parts[0], 255) / 255;
          g = finite(parts[1], 255) / 255;
          b = finite(parts[2], 255) / 255;
          a = finite(parts[3], 1);
        }
      }
    }
    return [clamp01(r), clamp01(g), clamp01(b), clamp01(a * finite(alpha, 1))];
  }

  class WebGLHud {
    constructor() {
      this.width = 1;
      this.height = 1;
      this.dpr = 1;
      this._normal = [];
      this._additive = [];
      this._texts = [];
      this._sprites = [];
      this._highWater = { normal: 0, additive: 0, texts: 0, sprites: 0 };
      this._chars = [];
      this._charFrames = new Map();
      this._atlas = null;
      this._atlasDirty = true;
      this._atlasRevision = 0;
      this._atlasKey = "papa:webgl-hud:atlas";
      this._atlasCols = 1;
      this._atlasRows = 1;
      this._cellPx = 1;
      this._cellUnits = 1;
      this._fontUnits = 32;
      this._advanceUnits = [];
      this._seed(DEFAULT_HUD_CHARS + ASCII);
    }

    _seed(text) {
      for (const ch of Array.from(String(text || ""))) {
        if (!this._charFrames.has(ch)) {
          this._charFrames.set(ch, this._chars.length);
          this._chars.push(ch);
          this._atlasDirty = true;
        }
      }
    }

    begin(width, height, dpr) {
      this.width = Math.max(1, finite(width, 1));
      this.height = Math.max(1, finite(height, 1));
      const nextDpr = Math.max(0.5, finite(dpr, 1));
      if (Math.abs(nextDpr - this.dpr) > 0.001) this._atlasDirty = true;
      this.dpr = nextDpr;
      return this.clear();
    }

    clear() {
      this._normal.length = 0;
      this._additive.length = 0;
      this._texts.length = 0;
      this._sprites.length = 0;
      return this;
    }

    _target(options) {
      return options === true || (options && (options.additive || options.layer === "additive"))
        ? this._additive : this._normal;
    }

    _tri(target, p0, p1, p2, c) {
      target.push(
        p0[0], p0[1], c[0], c[1], c[2], c[3],
        p1[0], p1[1], c[0], c[1], c[2], c[3],
        p2[0], p2[1], c[0], c[1], c[2], c[3]
      );
    }

    _quad(target, p0, p1, p2, p3, c) {
      this._tri(target, p0, p1, p2, c);
      this._tri(target, p2, p1, p3, c);
    }

    rect(x, y, width, height, fill, options) {
      const target = this._target(options);
      const c = color(fill, options && options.alpha);
      const x1 = finite(x, 0), y1 = finite(y, 0);
      const x2 = x1 + finite(width, 0), y2 = y1 + finite(height, 0);
      this._quad(target, [x1, y1], [x2, y1], [x1, y2], [x2, y2], c);
      return this;
    }

    line(x1, y1, x2, y2, width, stroke, options) {
      const ax = finite(x1, 0), ay = finite(y1, 0);
      const bx = finite(x2, 0), by = finite(y2, 0);
      const dx = bx - ax, dy = by - ay;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (!(length > 0)) return this;
      const half = Math.max(0.001, finite(width, 1)) * 0.5;
      const nx = -dy / length * half, ny = dx / length * half;
      this._quad(this._target(options),
        [ax + nx, ay + ny], [bx + nx, by + ny],
        [ax - nx, ay - ny], [bx - nx, by - ny],
        color(stroke, options && options.alpha));
      return this;
    }

    ellipse(cx, cy, radiusX, radiusY, fill, options) {
      const rx = Math.abs(finite(radiusX, 0)), ry = Math.abs(finite(radiusY, 0));
      if (!(rx > 0 && ry > 0)) return this;
      const target = this._target(options);
      const c = color(fill, options && options.alpha);
      const segments = Math.max(8, (options && options.segments) | 0 || Math.ceil(Math.max(rx, ry) * 0.35));
      const center = [finite(cx, 0), finite(cy, 0)];
      let previous = [center[0] + rx, center[1]];
      for (let i = 1; i <= segments; i++) {
        const angle = i / segments * TAU;
        const next = [center[0] + Math.cos(angle) * rx, center[1] + Math.sin(angle) * ry];
        this._tri(target, center, previous, next, c);
        previous = next;
      }
      return this;
    }

    circle(cx, cy, radius, fill, options) {
      return this.ellipse(cx, cy, radius, radius, fill, options);
    }

    ring(cx, cy, radius, thickness, stroke, options) {
      const rx = Math.abs(finite(radius, 0));
      const ry = rx;
      const lineWidth = Math.max(0.001, Math.abs(finite(thickness, 1)));
      if (!(rx > 0 && ry > 0)) return this;
      const innerX = Math.max(0, rx - lineWidth);
      const innerY = Math.max(0, ry - lineWidth);
      const target = this._target(options);
      const c = color(stroke, options && options.alpha);
      const segments = Math.max(8, (options && options.segments) | 0 || Math.ceil(Math.max(rx, ry) * 0.35));
      const x = finite(cx, 0), y = finite(cy, 0);
      for (let i = 0; i < segments; i++) {
        const a0 = i / segments * TAU, a1 = (i + 1) / segments * TAU;
        this._quad(target,
          [x + Math.cos(a0) * rx, y + Math.sin(a0) * ry],
          [x + Math.cos(a1) * rx, y + Math.sin(a1) * ry],
          [x + Math.cos(a0) * innerX, y + Math.sin(a0) * innerY],
          [x + Math.cos(a1) * innerX, y + Math.sin(a1) * innerY], c);
      }
      return this;
    }

    roundedRect(x, y, width, height, radius, fill, options) {
      const left = finite(x, 0), top = finite(y, 0);
      const w = finite(width, 0), h = finite(height, 0);
      if (!(w > 0 && h > 0)) return this;
      const r = Math.max(0, Math.min(Math.abs(finite(radius, 0)), w * 0.5, h * 0.5));
      if (!r) return this.rect(left, top, w, h, fill, options);
      const perCorner = Math.max(2, (options && options.segments) | 0 || Math.ceil(r * 0.25));
      const points = [];
      const corners = [
        [left + w - r, top + r, -Math.PI * 0.5],
        [left + w - r, top + h - r, 0],
        [left + r, top + h - r, Math.PI * 0.5],
        [left + r, top + r, Math.PI],
      ];
      for (let corner = 0; corner < corners.length; corner++) {
        for (let i = 0; i <= perCorner; i++) {
          const angle = corners[corner][2] + i / perCorner * Math.PI * 0.5;
          points.push([corners[corner][0] + Math.cos(angle) * r, corners[corner][1] + Math.sin(angle) * r]);
        }
      }
      const target = this._target(options);
      const c = color(fill, options && options.alpha);
      const center = [left + w * 0.5, top + h * 0.5];
      for (let i = 0; i < points.length; i++) this._tri(target, center, points[i], points[(i + 1) % points.length], c);
      return this;
    }

    text(value, x, y, options) {
      const text = String(value == null ? "" : value);
      if (!text) return this;
      this._seed(text);
      this._texts.push({ text, x: finite(x, 0), y: finite(y, 0), options: options || null });
      return this;
    }

    _createCanvas(width, height) {
      if (typeof wx === "undefined") return null;
      let canvas = null;
      if (typeof wx.createOffscreenCanvas === "function") {
        try { canvas = wx.createOffscreenCanvas({ type: "2d", width, height }); } catch (e) {
          try { canvas = wx.createOffscreenCanvas(); } catch (ignored) {}
        }
      }
      if (!canvas && typeof wx.createCanvas === "function") {
        try { canvas = wx.createCanvas(); } catch (e) {}
      }
      if (!canvas) return null;
      canvas.width = width;
      canvas.height = height;
      return canvas;
    }

    _rebuildAtlas() {
      const count = Math.max(1, this._chars.length);
      const rasterFont = Math.max(16, Math.ceil(this._fontUnits * this.dpr));
      const cell = Math.max(24, Math.ceil(rasterFont * 1.5));
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      const canvas = this._createCanvas(cols * cell, rows * cell);
      if (!canvas || typeof canvas.getContext !== "function") return false;
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${rasterFont}px sans-serif`;
      this._advanceUnits.length = count;
      for (let i = 0; i < count; i++) {
        const ch = this._chars[i];
        const col = i % cols, row = Math.floor(i / cols);
        ctx.fillText(ch, col * cell + cell * 0.5, row * cell + cell * 0.52);
        let measured = rasterFont;
        try { measured = finite(ctx.measureText(ch).width, rasterFont); } catch (e) {}
        this._advanceUnits[i] = Math.max(rasterFont * 0.2, measured) / this.dpr;
      }
      this._atlas = canvas;
      this._atlasCols = cols;
      this._atlasRows = rows;
      this._cellPx = cell;
      this._cellUnits = cell / this.dpr;
      this._atlasRevision++;
      this._atlasDirty = false;
      return true;
    }

    _buildSprites() {
      this._sprites.length = 0;
      for (let i = 0; i < this._texts.length; i++) {
        const command = this._texts[i];
        const options = command.options || {};
        const size = Math.max(1, finite(options.size, 16));
        const scale = size / this._fontUnits;
        const spacing = finite(options.letterSpacing, 0);
        const chars = Array.from(command.text);
        let total = 0;
        for (let j = 0; j < chars.length; j++) {
          const frame = this._charFrames.get(chars[j]);
          total += (this._advanceUnits[frame] || this._fontUnits) * scale;
          if (j + 1 < chars.length) total += spacing;
        }
        let cursor = command.x;
        if (options.align === "center") cursor -= total * 0.5;
        else if (options.align === "right" || options.align === "end") cursor -= total;
        const cellHeight = this._cellUnits * scale;
        let centerY = command.y + cellHeight * 0.5;
        if (options.baseline === "middle") centerY = command.y;
        else if (options.baseline === "bottom" || options.baseline === "ideographic") centerY = command.y - cellHeight * 0.5;
        else if (options.baseline === "alphabetic") centerY = command.y - size * 0.32;
        const c = color(options.color || options.fill || "#ffffff", options.alpha);
        for (let j = 0; j < chars.length; j++) {
          const frame = this._charFrames.get(chars[j]);
          const advance = (this._advanceUnits[frame] || this._fontUnits) * scale;
          this._sprites.push({
            x: cursor + advance * 0.5,
            y: centerY,
            w: this._cellUnits * scale,
            h: cellHeight,
            frame,
            tint: [c[0], c[1], c[2]],
            strength: 1,
            alpha: c[3],
          });
          cursor += advance + spacing;
        }
      }
    }

    flush(world) {
      if (!world) return false;
      let drew = false;
      if (this._normal.length >= 18 && typeof world.drawColorTriangles === "function") {
        drew = world.drawColorTriangles(this._normal, false) || drew;
      }
      if (this._additive.length >= 18 && typeof world.drawColorTriangles === "function") {
        drew = world.drawColorTriangles(this._additive, true) || drew;
      }
      if (this._texts.length && typeof world.drawSprites === "function") {
        if ((!this._atlas || this._atlasDirty) && !this._rebuildAtlas()) return drew;
        this._buildSprites();
        if (this._sprites.length) {
          drew = world.drawSprites(this._atlasKey, this._atlas, this._sprites, {
            cols: this._atlasCols,
            rows: this._atlasRows,
            dynamic: false,
            pinned: true,
            revision: this._atlasRevision,
          }) || drew;
        }
      }
      this._highWater.normal = Math.max(this._highWater.normal, this._normal.length);
      this._highWater.additive = Math.max(this._highWater.additive, this._additive.length);
      this._highWater.texts = Math.max(this._highWater.texts, this._texts.length);
      this._highWater.sprites = Math.max(this._highWater.sprites, this._sprites.length);
      return drew;
    }

    status() {
      return {
        width: this.width,
        height: this.height,
        dpr: this.dpr,
        atlasRevision: this._atlasRevision,
        atlasKey: this._atlasKey,
        glyphs: this._chars.length,
        normalVertices: Math.floor(this._normal.length / 6),
        additiveVertices: Math.floor(this._additive.length / 6),
        textSprites: this._sprites.length,
        highWater: { ...this._highWater },
      };
    }
  }

  root.PapaWebGLHud = new WebGLHud();
})();
