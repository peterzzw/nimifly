(() => {
  const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
  // 对局改回 2D 主画布直出（旧 60 帧路径）。主屏 WebGL 合成在低端机掉帧严重，先关掉。
  const dpr0 = Math.min(sys.pixelRatio || 1, 2);
  const canvas = wx.createCanvas();
  try {
    canvas.width = Math.max(1, Number(sys.windowWidth || sys.screenWidth || 667) * dpr0);
    canvas.height = Math.max(1, Number(sys.windowHeight || sys.screenHeight || 375) * dpr0);
  } catch (e) {}
  GameGlobal.canvas = canvas;
  GameGlobal.uiCanvas = canvas;
  GameGlobal.screenCanvas = null;
  try {
    if (typeof wx.setPreferredFramesPerSecond === "function") wx.setPreferredFramesPerSecond(60);
  } catch (e) {}
  try { wx.setKeepScreenOn({ keepScreenOn: true }); } catch (e) {}

  // 微信胶囊 + 刘海安全区
  // 横屏：左右可让（刘海），上下贴边；胶囊只挡右上，不抬高整条顶边距
  function computeSafeUI() {
    let info = sys;
    try {
      info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    } catch (e) {}
    const ww = Number(info.windowWidth || info.screenWidth || 667);
    const wh = Number(info.windowHeight || info.screenHeight || 375);
    const landscape = ww >= wh;
    let left = 0;
    let top = 0;
    let right = 0;
    let bottom = 0;
    const sa = info.safeArea;
    if (sa) {
      left = Math.max(0, Number(sa.left) || 0);
      top = Math.max(0, Number(sa.top) || 0);
      right = Math.max(0, ww - (Number(sa.right) || ww));
      bottom = Math.max(0, wh - (Number(sa.bottom) || wh));
    }
    const insets = info.safeAreaInsets;
    if (insets) {
      left = Math.max(left, Number(insets.left) || 0);
      top = Math.max(top, Number(insets.top) || 0);
      right = Math.max(right, Number(insets.right) || 0);
      bottom = Math.max(bottom, Number(insets.bottom) || 0);
    }
    // 底栏控件用的右边距：只让刘海，不把整块胶囊宽度算进来（否则右下开火会离边太远）
    let edgeRight = right;
    let edgeLeft = left;
    let capsule = null;
    try {
      const mb = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect();
      if (mb && mb.width > 0) {
        capsule = {
          left: mb.left,
          right: mb.right,
          top: mb.top,
          bottom: mb.bottom,
          width: mb.width,
          height: mb.height,
        };
        // 顶栏/HUD 用：避开胶囊；底栏操作键仍用 edgeRight
        right = Math.max(right, Math.max(8, ww - mb.left + 8));
      }
    } catch (e) {}

    if (landscape) {
      // 横屏灵动岛/刘海在左侧：部分机型把 inset 报到 top，合并进 left，避免左 UI「流进」岛区
      const rawTop = top;
      const rawBottom = bottom;
      if (rawTop > left && rawTop >= 20) left = Math.max(left, Math.min(rawTop, 62));
      // 右侧/底边：iPhone（含 17）偶发把大 inset 报到错误边，限制上限避免开火键被顶飞
      if (rawBottom > edgeRight && rawBottom >= 20 && edgeRight < 20) {
        edgeRight = Math.max(edgeRight, Math.min(rawBottom, 34));
      }
      left = Math.max(left, 6);
      right = Math.max(right, 6);
      edgeLeft = Math.max(edgeLeft, left);
      edgeRight = Math.max(edgeRight, 6);
      // 左侧几乎为 0 但仍有异形屏特征时，给灵动岛保底间距
      if (left < 28 && (rawTop >= 44 || (capsule && capsule.top <= 12 && capsule.height >= 28))) {
        left = Math.max(left, 44);
        edgeLeft = Math.max(edgeLeft, 44);
      }
      edgeLeft = Math.min(Math.max(edgeLeft, 6), 62);
      edgeRight = Math.min(Math.max(edgeRight, 6), 34);
      // 上下贴边（王者式）；大 inset 已并入左右
      top = Math.max(4, Math.min(rawTop, 6));
      bottom = Math.max(4, Math.min(rawBottom, 14));
    } else {
      left = Math.max(left, 8);
      right = Math.max(right, 8);
      edgeLeft = Math.max(edgeLeft, 8);
      edgeRight = Math.max(edgeRight, 8);
      top = Math.max(top, capsule ? Math.min(capsule.bottom + 4, 48) : 8);
      bottom = Math.max(bottom, 8);
    }

    const ui = {
      width: ww,
      height: wh,
      landscape,
      left,
      top,
      right,
      bottom,
      edgeLeft,
      edgeRight,
      contentLeft: left,
      contentTop: top,
      contentRight: ww - right,
      contentBottom: wh - bottom,
      capsule,
    };
    try { GameGlobal.safeUI = ui; } catch (e) {}
    return ui;
  }
  computeSafeUI();

  // 微信小游戏常无全局 performance；HUD/匹配逻辑都依赖 now()
  const performance = (typeof GameGlobal !== "undefined" && GameGlobal.performance && typeof GameGlobal.performance.now === "function")
    ? GameGlobal.performance
    : ((typeof globalThis !== "undefined" && globalThis.performance && typeof globalThis.performance.now === "function")
      ? globalThis.performance
      : { now() { return Date.now(); } });
  try { GameGlobal.performance = performance; } catch (e) {}

  function roundRect(x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    this.beginPath();
    this.moveTo(x + rr, y);
    this.arcTo(x + w, y, x + w, y + h, rr);
    this.arcTo(x + w, y + h, x, y + h, rr);
    this.arcTo(x, y + h, x, y, rr);
    this.arcTo(x, y, x + w, y, rr);
    this.closePath();
    return this;
  }
  function patchCtx(c) {
    if (!c) return c;
    const raw = c.getContext.bind(c);
    c.getContext = function (type, opts) {
      const ctx = raw(type, opts);
      if (ctx && typeof ctx.roundRect !== "function") ctx.roundRect = roundRect;
      return ctx;
    };
    return c;
  }
  patchCtx(canvas);

  function strip(html) {
    return String(html || "").replace(/<[^>]+>/g, "");
  }

  function El(id, tag) {
    this.id = id || "";
    this.tagName = String(tag || "DIV").toUpperCase();
    this.style = {};
    this.className = "";
    this.dataset = {};
    this.children = [];
    this.childNodes = this.children;
    this.parent = null;
    this.value = "";
    this.offsetLeft = 0;
    this.offsetTop = 0;
    this.offsetWidth = 0;
    this.offsetHeight = 0;
    this.scrollTop = 0;
    this._text = "";
    this._html = "";
    this._ln = {};
    this._cls = new Set();
    const self = this;
    this.classList = {
      add(name) {
        if (!name) return;
        self._cls.add(name);
        self.className = [...self._cls].join(" ");
      },
      remove(name) {
        self._cls.delete(name);
        self.className = [...self._cls].join(" ");
      },
      toggle(name, force) {
        if (force === true) this.add(name);
        else if (force === false) this.remove(name);
        else if (self._cls.has(name)) this.remove(name);
        else this.add(name);
      },
      contains(name) {
        return self._cls.has(name);
      },
    };
  }
  El.prototype.addEventListener = function (type, fn) {
    if (!fn) return;
    (this._ln[type] || (this._ln[type] = [])).push(fn);
  };
  El.prototype.removeEventListener = function (type, fn) {
    const list = this._ln[type];
    if (!list) return;
    this._ln[type] = list.filter((x) => x !== fn);
  };
  El.prototype.dispatchEvent = function (ev) {
    const list = this._ln[ev.type] || [];
    for (let i = 0; i < list.length; i++) list[i](ev);
    return true;
  };
  El.prototype.appendChild = function (node) {
    if (!node) return node;
    node.parent = this;
    this.children.push(node);
    return node;
  };
  El.prototype.setPointerCapture = function () {};
  El.prototype.focus = function () {};
  El.prototype.click = function () {
    this.dispatchEvent(makeEvent("click", 0, 0, 0, this));
  };
  Object.defineProperty(El.prototype, "innerHTML", {
    get() {
      return this._html;
    },
    set(v) {
      this._html = String(v == null ? "" : v);
      this._text = strip(this._html);
      if (this._html === "") this.children.length = 0;
    },
  });
  Object.defineProperty(El.prototype, "textContent", {
    get() {
      if (this.children.length) return this.children.map((c) => c.textContent || "").join("");
      return this._text;
    },
    set(v) {
      this._text = String(v == null ? "" : v);
      this._html = this._text;
    },
  });

  const nodes = {};
  function el(id, tag) {
    if (nodes[id]) return nodes[id];
    const n = new El(id, tag);
    nodes[id] = n;
    return n;
  }
  [
    "status", "statusWrap", "kd", "kdKills", "kdDeaths",
    "ammoWrap", "ammoBar", "ammoText", "missileAmmoWrap", "missileAmmoBar", "missileAmmoText",
    "offline", "fullModal", "fullDetail", "fullRetry",
    "matchLostModal", "matchLostHome",
    "levelFailModal", "btnLevelRetry", "btnLevelRevive", "btnLevelFailMap",
    "levelWinModal", "btnLevelWinMap",
    "gearBtn", "mapModeBtn", "lobby", "waiting", "menuModal", "summary", "summaryBody",
    "lobbyErr", "waitCode", "waitList", "waitMeta", "teamPick", "matchTimer",
    "btnStart", "btnRally", "btnPublic", "btnMatch", "btnCreate", "btnJoin", "btnWaitLeave", "btnInvite", "btnSummaryOk", "btnSummaryNext",
    "btnLobbySolo", "btnLobbyParty", "btnLobbyLevels", "btnLobbyBack", "btnLobbyAssist",
    "btnCancel", "btnLeave", "matchDur", "createDur", "teamCount", "perTeam", "roomCodeInput", "assistCodeInput",
    "assistReadyModal", "btnAssistReady", "btnAssistGarage", "btnAssistLeave",
    "assistJoinModal", "btnAssistJoinOk", "btnAssistJoinCancel",
    "assistStarModal", "btnAssistStarOk",
    "nameGear", "nameModal", "nameInput", "btnNameSave", "btnNameCancel",
    "settingsModal", "btnMuteToggle", "btnSettingsClose",
    "profileBtn", "homeAvatarBtn", "homeNameBtn", "btnLobbyTrain", "historyModal", "historyList", "btnHistoryClose",
    "profileHub", "btnHubHistory", "btnHubStats", "btnHubGarage", "btnHubClose", "statsModal", "btnStatsClose",
    "authModal", "btnAuthYes", "btnAuthNo",
    "leaveConfirmModal", "btnLeaveConfirmYes", "btnLeaveConfirmNo",
    "matchLoading", "matchLoadingTip", "matchLoadingCancel",
    "slider", "thumb", "left", "right", "flyBtn", "flyKnob", "brake", "gearF",
    "weapA", "weapB", "lockBtn", "fireBtn", "fireKnob", "fireLabel", "gauge", "hint",
    "trainGuideNext", "trainGuideSkip",
  ].forEach((id) => el(id));

  el("lobby").style.display = "grid";
  el("waiting").style.display = "none";
  el("menuModal").style.display = "none";
  el("summary").style.display = "none";
  el("nameModal").style.display = "none";
  el("settingsModal").style.display = "none";
  el("historyModal").style.display = "none";
  el("profileHub").style.display = "none";
  el("statsModal").style.display = "none";
  el("authModal").style.display = "none";
  el("leaveConfirmModal").style.display = "none";
  el("btnLeaveConfirmYes").textContent = "退出";
  el("btnLeaveConfirmNo").textContent = "取消";
  el("offline").style.display = "none";
  el("profileBtn").style.display = "grid";
  el("homeAvatarBtn").style.display = "none";
  el("btnMuteToggle").textContent = "音效：开";
  el("btnSettingsClose").textContent = "关闭";
  el("btnHistoryClose").textContent = "关闭";
  el("historyList").innerHTML = "";
  el("fullModal").style.display = "none";
  el("matchLostModal").style.display = "none";
  el("levelFailModal").style.display = "none";
  el("levelWinModal").style.display = "none";
  el("gearBtn").style.display = "none";
  el("mapModeBtn").style.display = "none";
  el("nameGear").style.display = "grid";
  el("matchTimer").style.display = "none";
  el("matchLoading").style.display = "none";
  el("matchLoadingTip").textContent = "正在寻找可用对局…";
  el("matchLoadingCancel").textContent = "取消";
  el("matchDur").value = "300";
  el("createDur").value = "300";
  el("teamCount").value = "2";
  el("perTeam").value = "4";
  el("roomCodeInput").value = "";
  el("assistCodeInput").value = "";
  el("nameInput").value = "";
  el("assistReadyModal").style.display = "none";
  el("assistJoinModal").style.display = "none";
  el("assistStarModal").style.display = "none";
  el("btnLobbyAssist").textContent = "去助战";
  el("btnLobbyAssist").style.display = "grid";
  el("btnAssistReady").textContent = "准备";
  el("btnAssistGarage").textContent = "武器改装";
  el("btnAssistLeave").textContent = "离开";
  el("btnAssistJoinOk").textContent = "进入";
  el("btnAssistStarOk").textContent = "确定";
  el("btnAssistJoinCancel").textContent = "取消";
  el("status").textContent = "正在连接服务器…";
  el("kdKills").textContent = "0";
  el("kdDeaths").textContent = "0";
  el("ammoText").textContent = "100";
  el("missileAmmoText").textContent = "5";
  el("waitCode").textContent = "----";
  el("fullDetail").textContent = "房间上限 20 人";
  el("btnStart").textContent = "开始游戏";
  el("btnRally").textContent = "召集";
  el("btnRally").style.display = "none";
  el("btnInvite").textContent = "邀请好友";
  el("btnLobbySolo").textContent = "单人匹配";
  el("btnLobbyParty").textContent = "多人组队";
  el("btnLobbyBack").textContent = "返回";
  el("fireLabel").textContent = "开火";
  try { GameGlobal.lobbyView = "home"; } catch (e) {}
  try { GameGlobal.garageOpen = false; GameGlobal.levelsOpen = false; } catch (e) {}

  const html = new El("html", "HTML");
  html.classList.add("mobile");
  html.classList.add("gun-mode");

  const winListeners = {};
  function winOn(type, fn) {
    (winListeners[type] || (winListeners[type] = [])).push(fn);
  }
  function winOff(type, fn) {
    const list = winListeners[type];
    if (!list) return;
    winListeners[type] = list.filter((x) => x !== fn);
  }
  function winEmit(type, ev) {
    const list = winListeners[type] || [];
    for (let i = 0; i < list.length; i++) list[i](ev);
  }

  mixinEvents(canvas);
  nodes.c = canvas;
  canvas.id = "c";
  canvas.style = canvas.style || {};

  function mixinEvents(obj) {
    obj._ln = obj._ln || {};
    obj.addEventListener = function (type, fn) {
      (this._ln[type] || (this._ln[type] = [])).push(fn);
    };
    obj.removeEventListener = function (type, fn) {
      const list = this._ln[type];
      if (!list) return;
      this._ln[type] = list.filter((x) => x !== fn);
    };
    obj.dispatchEvent = function (ev) {
      const list = this._ln[ev.type] || [];
      for (let i = 0; i < list.length; i++) list[i](ev);
    };
    obj.setPointerCapture = function () {};
  }

  const document = {
    documentElement: html,
    visibilityState: "visible",
    body: new El("body", "BODY"),
    getElementById(id) {
      if (id === "c") return canvas;
      return nodes[id] || el(id);
    },
    querySelector(sel) {
      if (!sel) return null;
      if (sel === 'meta[name="build"]') return { content: "wx" };
      if (sel[0] === "#") return this.getElementById(sel.slice(1));
      return null;
    },
    createElement(tag) {
      const name = String(tag || "div").toLowerCase();
      if (name === "canvas") {
        let c = null;
        try {
          if (typeof wx.createOffscreenCanvas === "function") {
            c = wx.createOffscreenCanvas({ type: "2d", width: 2, height: 2 });
          }
        } catch (e) {}
        if (!c) {
          try { c = wx.createOffscreenCanvas(2, 2); } catch (e) {}
        }
        if (!c) {
          c = {
            width: 2,
            height: 2,
            style: {},
            getContext() {
              return {
                fillRect() {},
                clearRect() {},
                drawImage() {},
                fill() {},
                stroke() {},
                beginPath() {},
                closePath() {},
                moveTo() {},
                lineTo() {},
                arc() {},
                rect() {},
                save() {},
                restore() {},
                translate() {},
                rotate() {},
                scale() {},
                setTransform() {},
                fillText() {},
                strokeText() {},
                createLinearGradient() { return { addColorStop() {} }; },
                createRadialGradient() { return { addColorStop() {} }; },
                fillStyle: "#000",
                strokeStyle: "#000",
                globalAlpha: 1,
                globalCompositeOperation: "source-over",
                lineWidth: 1,
                font: "12px sans-serif",
                textAlign: "left",
                textBaseline: "alphabetic",
              };
            },
          };
        }
        return patchCtx(c);
      }
      return new El("", name);
    },
    createTextNode(text) {
      const n = new El("", "TEXT");
      n.textContent = text;
      return n;
    },
    addEventListener: winOn,
    removeEventListener: winOff,
  };

  function socketText(data) {
    if (data == null) return "";
    if (typeof data === "string") return data;
    try {
      if (typeof TextDecoder === "function" && (data instanceof ArrayBuffer || ArrayBuffer.isView(data))) {
        const buf = data instanceof ArrayBuffer ? data : data.buffer;
        return new TextDecoder("utf-8").decode(buf);
      }
    } catch (e) {}
    try { return String(data); } catch (e) { return ""; }
  }

  let sockFailModalAt = 0;
  class WxWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = WxWebSocket.CONNECTING;
      this.onopen = null;
      this.onclose = null;
      this.onerror = null;
      this.onmessage = null;
      this._closed = false;
      const task = wx.connectSocket({
        url,
        // 不做请求缓存；实时对局/战绩必须走实时通道
        fail: (err) => {
          if (this._closed) return;
          this.readyState = WxWebSocket.CLOSED;
          const msg = (err && err.errMsg) || "connectSocket fail";
          console.error("[papa] socket fail", url, msg);
          const now = Date.now();
          // 真机预览重连很勤，避免弹窗刷屏
          if (now - sockFailModalAt > 8000) {
            sockFailModalAt = now;
            try {
              wx.showModal({
                title: "无法连接服务器",
                content: msg + "\n请确认：1) 开发者工具勾选「不校验合法域名」 2) 小游戏后台 socket 合法域名含 game.hunchun828.top",
                showCancel: false,
              });
            } catch (e) {}
          }
          if (this.onerror) this.onerror(err || { errMsg: msg });
          if (this.onclose) this.onclose({});
        },
      });
      this._task = task;
      task.onOpen(() => {
        if (this._closed) return;
        this.readyState = WxWebSocket.OPEN;
        if (this.onopen) this.onopen({});
      });
      task.onMessage((res) => {
        if (this._closed) return;
        if (this.onmessage) this.onmessage({ data: socketText(res.data) });
      });
      task.onClose(() => {
        this.readyState = WxWebSocket.CLOSED;
        if (this._closed) return;
        if (this.onclose) this.onclose({});
      });
      task.onError((err) => {
        console.error("[papa] socket error", err);
        if (this._closed) return;
        if (this.onerror) this.onerror(err || {});
      });
    }
    send(data) {
      if (this._closed || this.readyState !== WxWebSocket.OPEN) return false;
      try {
        this._task.send({
          data: typeof data === "string" ? data : String(data),
          // 微信半开连接时 send 会 fail 但不抛错；必须回调否则战绩/开房会“假成功”
          fail: (err) => {
            if (this._closed) return;
            console.error("[papa] socket send fail", err);
            this.readyState = WxWebSocket.CLOSED;
            if (this.onerror) this.onerror(err || { errMsg: "send fail" });
            if (this.onclose) this.onclose({});
          },
        });
        return true;
      } catch (e) {
        try {
          this.readyState = WxWebSocket.CLOSED;
          if (this.onerror) this.onerror(e);
          if (this.onclose) this.onclose({});
        } catch (err) {}
        return false;
      }
    }
    close() {
      if (this._closed) return;
      this._closed = true;
      this.readyState = WxWebSocket.CLOSED;
      try { this._task.close({}); } catch (e) {}
    }
  }
  WxWebSocket.CONNECTING = 0;
  WxWebSocket.OPEN = 1;
  WxWebSocket.CLOSING = 2;
  WxWebSocket.CLOSED = 3;

  const store = {
    getItem(key) {
      try {
        const v = wx.getStorageSync(key);
        return v === "" || v == null ? null : String(v);
      } catch (e) {
        return null;
      }
    },
    setItem(key, value) {
      try { wx.setStorageSync(key, String(value)); } catch (e) {}
    },
    removeItem(key) {
      try { wx.removeStorageSync(key); } catch (e) {}
    },
  };

  function uuid() {
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) bytes[i] = Math.random() * 256 | 0;
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return hex;
  }

  const AudioCtx = (typeof wx.createWebAudioContext === "function")
    ? function WxAC() { return wx.createWebAudioContext(); }
    : null;

  const visualViewport = {
    width: sys.windowWidth || sys.screenWidth,
    height: sys.windowHeight || sys.screenHeight,
    addEventListener() {},
  };
  const locationStub = {
    protocol: "https:",
    host: "game.hunchun828.top",
    hostname: "game.hunchun828.top",
    search: "",
    href: "https://game.hunchun828.top/",
  };
  const screenStub = {
    width: sys.screenWidth,
    height: sys.screenHeight,
    orientation: { lock() { return Promise.resolve(); }, unlock() {} },
  };

  function canWrite(target, key) {
    if (!target) return false;
    try {
      let desc = Object.getOwnPropertyDescriptor(target, key);
      let proto = target;
      while (!desc && proto) {
        proto = Object.getPrototypeOf(proto);
        if (!proto) break;
        desc = Object.getOwnPropertyDescriptor(proto, key);
      }
      if (!desc) return true;
      if (desc.writable === true) return true;
      if (typeof desc.set === "function") return true;
      if (desc.configurable === true) return true;
      return false;
    } catch (e) {
      return false;
    }
  }
  function install(target, key, value) {
    if (!target) return false;
    try {
      if (canWrite(target, key)) {
        target[key] = value;
        return target[key] === value || typeof value === "function";
      }
    } catch (e) {}
    return false;
  }
  const win = (typeof globalThis !== "undefined" && globalThis) || GameGlobal;
  function installAll(key, value) {
    install(GameGlobal, key, value);
    if (win && win !== GameGlobal) install(win, key, value);
  }

  const nativeAdd = (win && typeof win.addEventListener === "function")
    ? win.addEventListener.bind(win)
    : (typeof GameGlobal.addEventListener === "function" ? GameGlobal.addEventListener.bind(GameGlobal) : null);
  const nativeRemove = (win && typeof win.removeEventListener === "function")
    ? win.removeEventListener.bind(win)
    : null;
  function addEventListener(type, fn, opt) {
    winOn(type, fn);
    if (nativeAdd) {
      try { nativeAdd(type, fn, opt); } catch (e) {}
    }
  }
  function removeEventListener(type, fn, opt) {
    winOff(type, fn);
    if (nativeRemove) {
      try { nativeRemove(type, fn, opt); } catch (e) {}
    }
  }

  installAll("document", document);
  (function patchNativeDocument() {
    const nativeDoc = (win && win.document) || GameGlobal.document;
    if (!nativeDoc || nativeDoc === document) return;
    const names = [
      ["getElementById", document.getElementById.bind(document)],
      ["querySelector", document.querySelector.bind(document)],
      ["querySelectorAll", function () { return []; }],
      ["createElement", document.createElement.bind(document)],
      ["createTextNode", document.createTextNode.bind(document)],
      ["documentElement", document.documentElement],
      ["body", document.body],
      ["addEventListener", addEventListener],
      ["removeEventListener", removeEventListener],
    ];
    for (const [key, value] of names) {
      try { nativeDoc[key] = value; } catch (e) {}
      try {
        Object.defineProperty(nativeDoc, key, { configurable: true, enumerable: true, writable: true, value });
      } catch (e) {}
    }
    try { nativeDoc.visibilityState = "visible"; } catch (e) {}
  })();
  installAll("localStorage", store);
  installAll("WebSocket", WxWebSocket);
  GameGlobal.WxWebSocket = WxWebSocket;
  installAll("AudioContext", AudioCtx);
  installAll("webkitAudioContext", AudioCtx);
  installAll("visualViewport", visualViewport);
  installAll("Image", function Image() { return wx.createImage(); });
  if (!win.crypto || typeof win.crypto.randomUUID !== "function") {
    installAll("crypto", { randomUUID: uuid });
  }
  installAll("screen", screenStub);
  if (!win.location || !win.location.host) installAll("location", locationStub);
  installAll("performance", performance);
  installAll("getComputedStyle", function () { return { display: "block" }; });
  if (canWrite(GameGlobal, "addEventListener")) installAll("addEventListener", addEventListener);
  else GameGlobal.__wxAddEventListener = addEventListener;
  if (canWrite(GameGlobal, "removeEventListener")) installAll("removeEventListener", removeEventListener);

  const windowObj = win || GameGlobal;
  try { windowObj.SkyAceSfx = windowObj.SkyAceSfx || null; } catch (e) {}

  const DUR = [
    { v: "30", l: "30秒" },
    { v: "180", l: "3分钟" },
    { v: "300", l: "5分钟" },
    { v: "600", l: "10分钟" },
    { v: "900", l: "15分钟" },
  ];
  const MATCH_DUR = [
    { v: "180", l: "3分钟" },
    { v: "300", l: "5分钟" },
    { v: "600", l: "10分钟" },
  ];
  const TEAM_OPTS = ["2"].map((v) => ({ v, l: `${v} 阵营` }));
  const PER_TEAM_OPTS = ["1", "2", "3", "4"].map((v) => ({ v, l: `${v} 人` }));

  let hits = [];
  let overlayW = sys.screenWidth;
  let overlayH = sys.screenHeight;
  const captures = new Map();
  const garageTouches = new Set();
  let kbField = null;
  // 下拉菜单：严格对照 web 移动端 <select>，点开列表选一项
  let selectMenu = null; // { id, list, x, y, w, rowH }

  function shown(node) {
    if (!node || !node.style) return false;
    return node.style.display !== "none";
  }
  function addHit(node, x, y, w, h, z) {
    node.offsetLeft = x;
    node.offsetTop = y;
    node.offsetWidth = w;
    node.offsetHeight = h;
    hits.push({ node, x, y, w, h, z: z || 0 });
  }
  // 弹窗全屏拦截层：挡住下层大厅/操作区点击穿透
  const MODAL_MASK_Z = 25;
  const MODAL_BTN_Z = 30;
  function addModalMask(node) {
    const w = overlayW || 0;
    const h = overlayH || 0;
    if (!node || w <= 0 || h <= 0) return;
    addHit(node, 0, 0, w, h, MODAL_MASK_Z);
  }
  function hitAt(x, y) {
    let best = null;
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      if (x >= h.x && y >= h.y && x <= h.x + h.w && y <= h.y + h.h) {
        if (!best || h.z >= best.z) best = h;
      }
    }
    return best ? best.node : null;
  }
  function makeEvent(type, x, y, pointerId, target) {
    return {
      type,
      clientX: x,
      clientY: y,
      pointerId,
      button: 0,
      buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
      target: target || canvas,
      currentTarget: target || canvas,
      preventDefault() {},
      stopPropagation() {},
    };
  }
  function dispatch(node, type, x, y, pointerId) {
    if (!node) return;
    const ev = makeEvent(type, x, y, pointerId, node);
    if (node.dispatchEvent) node.dispatchEvent(ev);
    if (type === "click" && typeof node.onclick === "function") node.onclick(ev);
  }

  function rrect(ctx, x, y, w, h, r) {
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    roundRect.call(ctx, x, y, w, h, r);
  }
  function fillPanel(ctx, x, y, w, h) {
    ctx.save();
    rrect(ctx, x, y, w, h, 16);
    ctx.fillStyle = "rgba(10, 14, 20, 0.94)";
    ctx.fill();
    ctx.strokeStyle = "rgba(180, 196, 210, 0.28)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
  // 矢量齿轮图标（比 emoji 在真机上更清晰）
  function drawPersonIcon(ctx, cx, cy, r) {
    ctx.save();
    ctx.fillStyle = "#eaf6ff";
    ctx.strokeStyle = "#eaf6ff";
    ctx.lineWidth = Math.max(1.2, r * 0.16);
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.28, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.62, cy + r * 0.72);
    ctx.quadraticCurveTo(cx - r * 0.55, cy + r * 0.08, cx, cy + r * 0.08);
    ctx.quadraticCurveTo(cx + r * 0.55, cy + r * 0.08, cx + r * 0.62, cy + r * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function drawGearIcon(ctx, cx, cy, r) {
    const teeth = 6;
    const outer = r;
    const tip = r * 1.22;
    const hole = r * 0.38;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, outer, 0, Math.PI * 2);
    ctx.fillStyle = "#eaf6ff";
    ctx.fill();
    for (let i = 0; i < teeth; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / teeth;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const px = -s;
      const py = c;
      const w = r * 0.28;
      ctx.beginPath();
      ctx.moveTo(cx + c * outer * 0.72 + px * w, cy + s * outer * 0.72 + py * w);
      ctx.lineTo(cx + c * tip + px * w * 0.7, cy + s * tip + py * w * 0.7);
      ctx.lineTo(cx + c * tip - px * w * 0.7, cy + s * tip - py * w * 0.7);
      ctx.lineTo(cx + c * outer * 0.72 - px * w, cy + s * outer * 0.72 - py * w);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, hole, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(8,14,20,0.96)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, outer * 0.92, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(110, 200, 255, 0.9)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }
  function drawSpeakerIcon(ctx, cx, cy, r, muted) {
    ctx.save();
    ctx.fillStyle = muted ? "#9aa6b2" : "#eaf6ff";
    ctx.strokeStyle = muted ? "#9aa6b2" : "#eaf6ff";
    ctx.lineWidth = Math.max(1.2, r * 0.18);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    // 喇叭主体
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.55, cy - r * 0.28);
    ctx.lineTo(cx - r * 0.18, cy - r * 0.28);
    ctx.lineTo(cx + r * 0.22, cy - r * 0.62);
    ctx.lineTo(cx + r * 0.22, cy + r * 0.62);
    ctx.lineTo(cx - r * 0.18, cy + r * 0.28);
    ctx.lineTo(cx - r * 0.55, cy + r * 0.28);
    ctx.closePath();
    ctx.fill();
    if (muted) {
      // 静音斜杠
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.7, cy + r * 0.7);
      ctx.lineTo(cx + r * 0.75, cy - r * 0.7);
      ctx.strokeStyle = "#ff8a8a";
      ctx.lineWidth = Math.max(1.6, r * 0.22);
      ctx.stroke();
    } else {
      // 声波弧
      ctx.beginPath();
      ctx.arc(cx + r * 0.18, cy, r * 0.42, -Math.PI * 0.45, Math.PI * 0.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + r * 0.18, cy, r * 0.68, -Math.PI * 0.45, Math.PI * 0.45);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawSettingsBtn(ctx, x, y, size) {
    // 游戏中/主页设置按钮统一齿轮外观；静音只在主页设置弹窗里改
    ctx.save();
    rrect(ctx, x, y, size, size, 9);
    ctx.fillStyle = "rgba(12, 22, 32, 0.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(140, 210, 255, 0.75)";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    drawGearIcon(ctx, x + size / 2, y + size / 2 + 0.5, size * 0.26);
    ctx.restore();
  }
  /**
   * 王者式延迟：信号条动画 + ms 数字横排并列。
   * 字号与击杀数一致；返回占用宽度。
   */
  function drawNetSignalHud(ctx, x, midY, fontPx) {
    const hud = (typeof GameGlobal !== "undefined" && GameGlobal.netHud) || null;
    const level = hud ? Math.max(0, Math.min(4, hud.level | 0)) : 0;
    const color = (hud && hud.color) || "#ff6b6b";
    const lost = !!(hud && hud.lost);
    const label = lost ? "断" : ((hud && hud.label) || "--");
    const unit = lost || label === "--" || label === "断" ? "" : "ms";
    const text = label + unit;
    const font = `${fontPx || 13}px sans-serif`;
    const bars = 4;
    const gap = 1.8;
    const barW = 2.8;
    const maxH = 13;
    const blockW = bars * barW + (bars - 1) * gap;
    const t = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
    // 延迟越高，波动越急；满格时缓慢呼吸
    const speed = lost ? 5.2 : (level >= 4 ? 1.6 : level >= 3 ? 2.2 : level >= 2 ? 3.0 : 4.2);
    ctx.save();
    ctx.font = font;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const tw = Math.ceil(ctx.measureText(text).width);
    const totalW = blockW + 5 + tw;
    let bx = x;
    const baseY = midY + maxH / 2;
    for (let i = 0; i < bars; i++) {
      const baseH = 3.2 + (maxH - 3.2) * ((i + 1) / bars);
      const on = !lost && level > i;
      const wave = 0.5 + 0.5 * Math.sin(t * speed * Math.PI * 2 - i * 0.7);
      let h;
      let alpha;
      if (lost) {
        h = baseH * (0.35 + 0.25 * wave);
        alpha = 0.18 + 0.35 * wave;
      } else if (on) {
        // 亮格随波峰起伏，格数跟延迟档位走
        h = baseH * (0.72 + 0.28 * wave);
        alpha = 0.55 + 0.45 * wave;
      } else {
        h = baseH * 0.42;
        alpha = 0.18;
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = on || lost ? color : "rgba(180,196,210,0.55)";
      rrect(ctx, bx, baseY - h, barW, h, 0.7);
      ctx.fill();
      bx += barW + gap;
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.fillText(text, x + blockW + 5, midY + 1);
    ctx.restore();
    return totalW;
  }
  function drawProfileBtn(ctx, x, y, size) {
    ctx.save();
    rrect(ctx, x, y, size, size, 9);
    ctx.fillStyle = "rgba(12, 22, 32, 0.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(140, 210, 255, 0.75)";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    drawPersonIcon(ctx, x + size / 2, y + size / 2 + 0.5, size * 0.28);
    ctx.restore();
  }
  function drawAssistBtn(ctx, x, y, size) {
    ctx.save();
    rrect(ctx, x, y, size, size, 9);
    ctx.fillStyle = "rgba(12, 22, 32, 0.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 184, 107, 0.85)";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    const cx = x + size / 2;
    const cy = y + size / 2 + 0.5;
    // 握手/助战：两圆 + 连接弧
    ctx.strokeStyle = "#ffb86b";
    ctx.fillStyle = "#ffb86b";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(cx - 6, cy - 1, 4.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + 6, cy - 1, 4.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 2.5, cy + 1);
    ctx.quadraticCurveTo(cx, cy + 7, cx + 2.5, cy + 1);
    ctx.stroke();
    ctx.restore();
  }
  function parchmentPath(ctx, x, y, w, h) {
    const j = 7;
    ctx.moveTo(x + j, y);
    ctx.lineTo(x + w * 0.28, y + 1.2);
    ctx.lineTo(x + w * 0.55, y - 0.8);
    ctx.lineTo(x + w - j, y + 0.6);
    ctx.lineTo(x + w + 0.8, y + h * 0.32);
    ctx.lineTo(x + w - 0.6, y + h * 0.62);
    ctx.lineTo(x + w + 0.4, y + h - j);
    ctx.lineTo(x + w * 0.68, y + h + 0.8);
    ctx.lineTo(x + w * 0.34, y + h - 0.6);
    ctx.lineTo(x + j, y + h + 0.4);
    ctx.lineTo(x - 0.8, y + h * 0.58);
    ctx.lineTo(x + 0.6, y + h * 0.28);
    ctx.closePath();
  }
  function drawBtn(ctx, x, y, w, h, label, primary, z, node) {
    ctx.save();
    rrect(ctx, x, y, w, h, 10);
    // 对照 web：primary 绿底，次要灰底
    ctx.fillStyle = primary ? "#2f6f4a" : "rgba(42, 49, 58, 0.95)";
    ctx.fill();
    ctx.strokeStyle = primary ? "#4ad67a" : "rgba(255,255,255,0.22)";
    ctx.stroke();
    ctx.fillStyle = primary ? "#eafff2" : "#f2f5f8";
    ctx.font = "15px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    ctx.restore();
    if (node) addHit(node, x, y, w, h, z);
  }
  function drawAccentBoard(ctx, x, y, w, h, accent) {
    ctx.save();
    ctx.fillStyle = "rgba(14, 26, 38, 0.9)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(140, 200, 220, 0.28)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = accent || "#7ad7ff";
    ctx.fillRect(x, y, 4, h);
    ctx.restore();
  }
  function drawHubIcon(ctx, kind, cx, cy, s, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    if (kind === "history") {
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -11); ctx.moveTo(0, 0); ctx.lineTo(8, 5); ctx.stroke();
    } else if (kind === "stats") {
      const bars = [10, 22, 15, 28];
      bars.forEach((h, i) => ctx.fillRect(-20 + i * 11, 16 - h, 7, h));
      ctx.fillRect(-23, 16, 46, 2);
    } else {
      // 战机侧影 + 准星
      ctx.beginPath();
      ctx.moveTo(0, -20); ctx.lineTo(5, -4); ctx.lineTo(20, 8); ctx.lineTo(4, 6);
      ctx.lineTo(6, 16); ctx.lineTo(0, 13); ctx.lineTo(-6, 16); ctx.lineTo(-4, 6);
      ctx.lineTo(-20, 8); ctx.lineTo(-5, -4); ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  function lobbyViewOf() {
    try { return String(GameGlobal.lobbyView || "home"); } catch (e) { return "home"; }
  }
  function drawLabel(ctx, text, x, y, color, size, align) {
    ctx.fillStyle = color || "#d5e2ea";
    ctx.font = `${size || 14}px sans-serif`;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }
  function durLabelOf(id, list) {
    const rows = list || DUR;
    const v = String(el(id).value || "300");
    const row = rows.find((d) => d.v === v);
    return row ? row.l : "5分钟";
  }
  function openSelect(id, list, box) {
    const rows = list || [];
    if (!rows.length || !box) return;
    const rowH = 32;
    const menuH = rows.length * rowH;
    let my = box.y + box.h + 4;
    if (my + menuH > overlayH - 8) my = Math.max(8, box.y - 4 - menuH);
    selectMenu = { id, list: rows, x: box.x, y: my, w: box.w, rowH };
  }
  function closeSelect() {
    selectMenu = null;
  }
  function drawCard(ctx, x, y, w, h) {
    ctx.save();
    rrect(ctx, x, y, w, h, 12);
    ctx.fillStyle = "rgba(8, 14, 20, 0.72)";
    ctx.fill();
    ctx.strokeStyle = "rgba(120, 170, 210, 0.16)";
    ctx.stroke();
    ctx.restore();
  }
  // 对照 web 移动端：label 在上，select 框在下（深底 + 白字 + 右侧箭头）
  function drawSelect(ctx, x, y, w, label, valueText, node, z) {
    const labH = 12;
    const boxH = 28;
    drawLabel(ctx, label, x, y + 5, "#8a9aa8", 10);
    const bx = x;
    const by = y + labH + 1;
    ctx.save();
    rrect(ctx, bx, by, w, boxH, 7);
    ctx.fillStyle = "#0c1218";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "13px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(valueText, bx + 8, by + boxH / 2 + 1);
    ctx.beginPath();
    ctx.moveTo(bx + w - 16, by + boxH / 2 - 2);
    ctx.lineTo(bx + w - 10, by + boxH / 2 - 2);
    ctx.lineTo(bx + w - 13, by + boxH / 2 + 3);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fill();
    ctx.restore();
    if (node) {
      addHit(node, bx, by, w, boxH, z || 6);
      node.__selectBox = { x: bx, y: by, w, h: boxH };
    }
    return labH + 1 + boxH;
  }
  function drawSelectMenu(ctx) {
    if (!selectMenu) return;
    const m = selectMenu;
    // 全屏透明遮罩：点外面关闭
    addHit(el("__selectMask"), 0, 0, overlayW, overlayH, 40);
    ctx.save();
    rrect(ctx, m.x, m.y, m.w, m.list.length * m.rowH, 8);
    ctx.fillStyle = "#121820";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.stroke();
    const cur = String(el(m.id).value || "");
    for (let i = 0; i < m.list.length; i++) {
      const row = m.list[i];
      const ry = m.y + i * m.rowH;
      if (String(row.v) === cur) {
        ctx.fillStyle = "rgba(120, 217, 255, 0.18)";
        ctx.fillRect(m.x + 1, ry + 1, m.w - 2, m.rowH - 1);
      }
      ctx.fillStyle = "#fff";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(row.l, m.x + 12, ry + m.rowH / 2);
    }
    ctx.restore();
    addHit(el("__selectMenu"), m.x, m.y, m.w, m.list.length * m.rowH, 50);
  }

  function openKeyboard(field, max) {
    kbField = field;
    const node = el(field);
    wx.showKeyboard({
      defaultValue: String(node.value || ""),
      maxLength: max,
      multiple: false,
      confirmHold: false,
      confirmType: "done",
    });
  }
  wx.onKeyboardConfirm((res) => {
    if (!kbField) return;
    const node = el(kbField);
    node.value = String(res.value || "");
    if (kbField === "roomCodeInput") node.value = node.value.replace(/\D/g, "").slice(0, 4);
    if (kbField === "assistCodeInput") node.value = node.value.replace(/\D/g, "").slice(0, 4);
    if (kbField === "nameInput") node.value = Array.from(node.value).slice(0, 10).join("");
  });
  wx.onKeyboardComplete(() => {
    kbField = null;
  });

  function drawKnob(ctx, parent, knob, size) {
    const pctL = parseFloat(knob.style.left);
    const pctT = parseFloat(knob.style.top);
    const px = parent.offsetLeft + parent.offsetWidth * ((Number.isFinite(pctL) ? pctL : 50) / 100);
    const py = parent.offsetTop + parent.offsetHeight * ((Number.isFinite(pctT) ? pctT : 50) / 100);
    ctx.beginPath();
    ctx.arc(px, py, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.fill();
  }
  function drawCircleCtrl(ctx, node, label, on) {
    const x = node.offsetLeft;
    const y = node.offsetTop;
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2 - 1, 0, Math.PI * 2);
    ctx.fillStyle = on ? "rgba(255, 220, 120, 0.18)" : "rgba(255,255,255,0.08)";
    ctx.fill();
    ctx.strokeStyle = on ? "rgba(255, 226, 138, 0.9)" : "rgba(238,238,238,0.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (label) {
      ctx.fillStyle = "#fff";
      ctx.font = Math.min(w, h) < 50 ? "11px sans-serif" : "15px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + w / 2, y + h / 2);
    }
    ctx.restore();
  }

  // 与网页端（阿里云 index.html）KD 图标同款 SVG path
  const ICON_SWORD = "M15.2 2.4l6.4 6.4-1.5 1.5-1.3-1.3-9.3 9.3H6.2L2.4 21.6 0 19.2l3.3-3.8V12l9.3-9.3-1.3-1.3 1.5-1.5 2.4 2.1zm-7.4 14.3h1.6l8.6-8.6-1.6-1.6-8.6 8.6v1.6z";
  const ICON_SKULL = "M12 1.8A8.2 8.2 0 003.8 10c0 3.1 1.7 5.8 4.2 7.2V21h8v-3.8c2.5-1.4 4.2-4.1 4.2-7.2A8.2 8.2 0 0012 1.8zM8.6 9.2a1.6 1.6 0 110 3.2 1.6 1.6 0 010-3.2zm6.8 0a1.6 1.6 0 110 3.2 1.6 1.6 0 010-3.2zM9.2 18h5.6v1.4H9.2z";
  let iconPathOk = null;

  // 弹药条前的小武器图标，宽约 16px，(x, cy) 为左侧中线
  function drawAmmoIcon(ctx, kind, x, cy, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    if (kind === "gun") {
      // 三发子弹
      for (let i = 0; i < 3; i++) {
        const bx = x + i * 5.5;
        ctx.beginPath();
        ctx.moveTo(bx, cy + 6);
        ctx.lineTo(bx, cy - 2.5);
        ctx.quadraticCurveTo(bx + 1.75, cy - 7, bx + 3.5, cy - 2.5);
        ctx.lineTo(bx + 3.5, cy + 6);
        ctx.closePath();
        ctx.fill();
      }
    } else if (kind === "drone") {
      // 双小三角：表示无人机架数
      const tri = (ox, s) => {
        ctx.beginPath();
        ctx.moveTo(x + ox, cy - 5.5 * s);
        ctx.lineTo(x + ox + 4.5 * s, cy + 4.5 * s);
        ctx.lineTo(x + ox, cy + 1.5 * s);
        ctx.lineTo(x + ox - 4.5 * s, cy + 4.5 * s);
        ctx.closePath();
        ctx.fill();
      };
      tri(5, 0.85);
      tri(12, 0.85);
    } else if (kind === "mirv") {
      ctx.beginPath();
      ctx.moveTo(x + 8, cy);
      ctx.lineTo(x + 4, cy - 2);
      ctx.lineTo(x + 1, cy - 2);
      ctx.lineTo(x + 1, cy + 2);
      ctx.lineTo(x + 4, cy + 2);
      ctx.closePath();
      ctx.fill();
      for (let i = 0; i < 5; i++) {
        const a = -0.85 + i * 0.42;
        ctx.beginPath();
        ctx.moveTo(x + 7, cy);
        ctx.lineTo(x + 7 + Math.cos(a) * 9, cy + Math.sin(a) * 9);
        ctx.lineTo(x + 7 + Math.cos(a + 0.2) * 3.5, cy + Math.sin(a + 0.2) * 3.5);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      // 横向导弹：弹头 + 弹体 + 尾翼
      ctx.beginPath();
      ctx.moveTo(x + 16, cy);
      ctx.lineTo(x + 12, cy - 2.2);
      ctx.lineTo(x + 3, cy - 2.2);
      ctx.lineTo(x + 3, cy + 2.2);
      ctx.lineTo(x + 12, cy + 2.2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 5, cy - 2.2);
      ctx.lineTo(x, cy - 6);
      ctx.lineTo(x + 1.5, cy - 2.2);
      ctx.closePath();
      ctx.moveTo(x + 5, cy + 2.2);
      ctx.lineTo(x, cy + 6);
      ctx.lineTo(x + 1.5, cy + 2.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawKdIcon(ctx, d, x, y, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 24, size / 24);
    ctx.fillStyle = color;
    if (iconPathOk !== false) {
      try {
        const P = typeof Path2D !== "undefined" ? Path2D : null;
        if (P) {
          ctx.fill(new P(d));
          iconPathOk = true;
          ctx.restore();
          return;
        }
      } catch (e) {
        iconPathOk = false;
      }
    }
    // Path2D 不可用时的同风格简化回退
    if (d === ICON_SWORD) {
      ctx.beginPath();
      ctx.moveTo(4, 20);
      ctx.lineTo(8, 16);
      ctx.lineTo(18, 6);
      ctx.lineTo(20, 8);
      ctx.lineTo(10, 18);
      ctx.lineTo(6, 20);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(2.5, 18.5, 4, 3);
    } else {
      ctx.beginPath();
      ctx.arc(12, 10, 7.5, Math.PI * 0.15, Math.PI * 0.85, true);
      ctx.lineTo(16.5, 20);
      ctx.lineTo(7.5, 20);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(3,10,15,0.75)";
      ctx.beginPath();
      ctx.arc(9.2, 10.2, 1.6, 0, Math.PI * 2);
      ctx.arc(14.8, 10.2, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(9.2, 17.2, 5.6, 1.5);
    }
    ctx.restore();
  }

  let pageStars = null;
  function ensurePageStars(W, H) {
    if (pageStars && pageStars.w === W && pageStars.h === H) return pageStars;
    const pts = [];
    let s = 1337;
    const rnd = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    for (let i = 0; i < 42; i++) {
      pts.push({
        x: rnd(),
        y: rnd() * 0.82,
        r: 0.55 + rnd() * 1.35,
        a: 0.18 + rnd() * 0.42,
        tw: rnd() * Math.PI * 2,
      });
    }
    pageStars = { w: W, h: H, pts };
    return pageStars;
  }
  function drawPageBackdrop(ctx, W, H) {
    const t = Date.now() * 0.00012;
    const base = ctx.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0, "#061018");
    base.addColorStop(0.42, "#0b1a28");
    base.addColorStop(0.72, "#10283a");
    base.addColorStop(1, "#0a1c26");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    let rg = ctx.createRadialGradient(
      W * (0.78 + Math.sin(t) * 0.03), H * 0.16, 0,
      W * 0.78, H * 0.2, Math.max(W, H) * 0.58
    );
    rg.addColorStop(0, "rgba(90, 190, 235, 0.18)");
    rg.addColorStop(0.4, "rgba(40, 120, 170, 0.07)");
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);

    rg = ctx.createRadialGradient(
      W * (0.16 + Math.cos(t * 0.85) * 0.025), H * 0.9, 0,
      W * 0.18, H * 0.92, Math.max(W, H) * 0.48
    );
    rg.addColorStop(0, "rgba(255, 176, 88, 0.09)");
    rg.addColorStop(0.45, "rgba(120, 70, 36, 0.035)");
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);

    const hz = H * 0.58;
    const haze = ctx.createLinearGradient(0, hz - 36, 0, hz + 54);
    haze.addColorStop(0, "rgba(120, 200, 230, 0)");
    haze.addColorStop(0.5, "rgba(120, 200, 230, 0.055)");
    haze.addColorStop(1, "rgba(120, 200, 230, 0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, hz - 36, W, 90);

    const stars = ensurePageStars(W, H);
    for (let i = 0; i < stars.pts.length; i++) {
      const p = stars.pts[i];
      const tw = 0.55 + 0.45 * Math.sin(t * 7 + p.tw);
      ctx.fillStyle = `rgba(210,235,255,${p.a * tw})`;
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    const vg = ctx.createRadialGradient(
      W * 0.5, H * 0.42, Math.min(W, H) * 0.22,
      W * 0.5, H * 0.5, Math.max(W, H) * 0.74
    );
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.42)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  // 武器改装（机库）：全屏接管绘制与触摸，逻辑在 garage.js（feature 分包）
  let garage = null;
  let garageCtx = null;
  let garageExit = null;
  let pendingGarageAccess = null; // 分包未就绪时暂存服务器推送
  function applyGarageAccessNow(access, meta) {
    try {
      // 被邀请人若误收到带 inviteGrant 的包：只同步权限表，不弹「领取成功」（真正领奖方是转发者）
      // 这里仍写 access：正常推送只发给转发者；防误触时由客户端 invite 入口保证不写脏数据
      if (!garage || typeof garage.setAccessFromServer !== "function") {
        pendingGarageAccess = { access, meta: meta || null };
        try {
          if (typeof GameGlobal.ensureFeaturePkg === "function") GameGlobal.ensureFeaturePkg();
        } catch (e) {}
        return;
      }
      garage.setAccessFromServer(access);
      if (meta && meta.inviteGrant && typeof garage.showInviteGranted === "function") {
        const eq = meta.equip || "";
        const until = access && access.rental ? Number(access.rental[eq]) || 0 : 0;
        const hours = until > Date.now() ? Math.max(1, Math.ceil((until - Date.now()) / 3600000)) : (meta.hours || 2);
        garage.showInviteGranted(eq, hours, meta.added || 2);
        try { GameGlobal.garageOpen = true; } catch (e) {}
      }
    } catch (e) {}
  }
  GameGlobal.applyGarageAccess = applyGarageAccessNow;
  function garageActive() {
    return !!(garage && GameGlobal.garageOpen && !html.classList.contains("ingame"));
  }
  function openGarage(onExit, keepEdits) {
    GameGlobal.levelsOpen = false;
    garageExit = typeof onExit === "function" ? onExit : null;
    const finish = () => {
      if (!GameGlobal.PapaGarage) {
        try { wx.showToast({ title: "机库加载失败", icon: "none" }); } catch (e) {}
        return false;
      }
      if (!keepEdits) syncGarageLoadout();
      GameGlobal.garageOpen = true;
      try {
        if (typeof GameGlobal.ensureCraftPkg === "function") GameGlobal.ensureCraftPkg();
      } catch (e) {}
      return true;
    };
    if (GameGlobal.PapaGarage) return finish();
    const ensure = GameGlobal.ensureFeaturePkg;
    if (typeof ensure !== "function") return finish();
    try { wx.showToast({ title: "加载机库…", icon: "loading", duration: 8000 }); } catch (e) {}
    ensure().then((ok) => {
      try { wx.hideToast(); } catch (e) {}
      if (!ok) {
        try { wx.showToast({ title: "机库加载失败", icon: "none" }); } catch (e) {}
        return;
      }
      finish();
    }).catch(() => {
      try { wx.hideToast(); wx.showToast({ title: "机库加载失败", icon: "none" }); } catch (e) {}
    });
    return true;
  }
  function closeGarage() {
    GameGlobal.garageOpen = false;
    const cb = garageExit;
    garageExit = null;
    if (cb) cb();
  }

  // 关卡模式：线性折线航图（levels.js）
  let levels = null;
  let levelsCtx = null;
  let levelsExit = null;
  let levelsPendingId = null;
  const levelsTouches = new Set();
  function levelsActive() {
    // 统一助战提示窗打开时，触摸交给 overlay 命中（否则点不到「确定」会卡死）
    if (shown(el("assistStarModal"))) return false;
    return !!(levels && GameGlobal.levelsOpen && !html.classList.contains("ingame") && !GameGlobal.garageOpen);
  }
  function openLevels(onExit) {
    // 未授权不进航图（进度需 openid 持久化）
    try {
      const authed = !!(GameGlobal.wxProfile && GameGlobal.wxProfile.authed);
      if (!authed) {
        try { wx.showToast({ title: "需要微信授权", icon: "none", duration: 1600 }); } catch (e) {}
        return false;
      }
    } catch (e) {}
    const finish = () => {
      if (!GameGlobal.PapaLevels) {
        try { wx.showToast({ title: "关卡加载失败", icon: "none" }); } catch (e) {}
        return false;
      }
      GameGlobal.garageOpen = false;
      levelsExit = typeof onExit === "function" ? onExit : null;
      GameGlobal.levelsOpen = true;
      try {
        if (levels) {
          if (typeof levels.scrollToStart === "function") levels.scrollToStart();
          else if (typeof levels.focusCurrent === "function") levels.focusCurrent();
        }
      } catch (e) {}
      try {
        if (typeof GameGlobal.syncLevelsProgressWithServer === "function") {
          GameGlobal.syncLevelsProgressWithServer();
        }
      } catch (e) {}
      return true;
    };
    if (GameGlobal.PapaLevels) return finish();
    const ensure = GameGlobal.ensureLevelsPkg || GameGlobal.ensureFeaturePkg;
    if (typeof ensure !== "function") return finish();
    try { wx.showToast({ title: "加载关卡…", icon: "loading", duration: 8000 }); } catch (e) {}
    ensure().then((ok) => {
      try { wx.hideToast(); } catch (e) {}
      if (!ok) {
        try { wx.showToast({ title: "关卡加载失败", icon: "none" }); } catch (e) {}
        return;
      }
      finish();
    }).catch(() => {
      try { wx.hideToast(); wx.showToast({ title: "关卡加载失败", icon: "none" }); } catch (e) {}
    });
    return true;
  }
  function closeLevels() {
    GameGlobal.levelsOpen = false;
    try {
      if (GameGlobal.assistHostMode && typeof GameGlobal.leaveAssistRoom === "function") {
        GameGlobal.leaveAssistRoom();
      }
      GameGlobal.assistHostMode = false;
      GameGlobal.assistHostNode = null;
    } catch (e) {}
    const cb = levelsExit;
    levelsExit = null;
    if (cb) cb();
  }
  function ensureLevels(ctx) {
    if (levels && levelsCtx === ctx) return levels;
    levelsCtx = ctx;
    levels = GameGlobal.PapaLevels.create({
      ctx,
      size: () => ({ w: overlayW, h: overlayH }),
      safe: () => {
        const s = GameGlobal.safeUI || computeSafeUI();
        const cap = s.capsule ? Math.max(0, overlayW - s.capsule.left + 6 - (s.edgeRight || 0)) : 0;
        return { l: s.edgeLeft || s.left || 0, r: s.edgeRight || 0, t: s.top || 0, b: s.bottom || 0, cap };
      },
      storage: {
        get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
      },
      onExit: closeLevels,
      onEnterLevel: (node) => {
        levelsPendingId = node && node.id;
        GameGlobal.levelsOpen = false;
        // 助战开战：双方 3 秒 loading 后进同一关（含飞机/地雷）
        try {
          if (GameGlobal.assistHostMode && typeof GameGlobal.beginAssistLevelEnter === "function") {
            if (!GameGlobal.beginAssistLevelEnter(node)) {
              GameGlobal.levelsOpen = true;
              levelsPendingId = null;
            }
            return;
          }
        } catch (e) {}
        if (typeof GameGlobal.startLevelRun === "function") {
          if (!GameGlobal.startLevelRun(node)) {
            GameGlobal.levelsOpen = true;
            levelsPendingId = null;
          }
        } else {
          try { if (levels) levels.markComplete(node.id); } catch (e) {}
          GameGlobal.levelsOpen = true;
        }
      },
      onRest: (node) => {
        levelsPendingId = node && node.id;
        GameGlobal.levelsOpen = false;
        openGarage(() => {
          try { if (levels && levelsPendingId) levels.markComplete(levelsPendingId); } catch (e) {}
          levelsPendingId = null;
          GameGlobal.levelsOpen = true;
          try {
            if (levels) {
              if (levels.scrollToStart) levels.scrollToStart();
              else if (levels.focusCurrent) levels.focusCurrent();
            }
          } catch (e) {}
        }, true);
      },
    });
    try {
      GameGlobal.getLevelsDoneIds = () => (levels && typeof levels.getDoneIds === "function" ? levels.getDoneIds() : null);
      GameGlobal.applyLevelsProgress = (done) => {
        if (levels && typeof levels.applyServerProgress === "function") {
          return levels.applyServerProgress(done);
        }
        return null;
      };
      if (typeof GameGlobal.flushPendingLevelsPullApply === "function") {
        GameGlobal.flushPendingLevelsPullApply();
      }
    } catch (e) {}
    return levels;
  }
  GameGlobal.openLevels = openLevels;
  GameGlobal.closeLevels = closeLevels;
  GameGlobal.getLevelsDoneIds = () => (levels && typeof levels.getDoneIds === "function" ? levels.getDoneIds() : null);
  GameGlobal.applyLevelsProgress = (done) => {
    if (levels && typeof levels.applyServerProgress === "function") {
      return levels.applyServerProgress(done);
    }
    return null;
  };

  // —— 关卡助战：房号码 + 转发；好友停首页准备弹窗 ——
  let assistGuestReady = false;
  let assistGuestMeta = { code: "", levelId: "", title: "" };
  function assistReadyModalOn() {
    // 开战/对局中一律不画，避免 display 被回包改回 grid 后盖在战场上
    try {
      if (GameGlobal.assistReadyDismissed || GameGlobal.assistCoopPlaying) return false;
      if (typeof GameGlobal.phasePlaying === "function" && GameGlobal.phasePlaying()) return false;
    } catch (e) {}
    const node = el("assistReadyModal");
    if (!shown(node)) return false;
    // 对局中若 display 仍被改回 grid，当场撕掉
    try {
      if (GameGlobal.assistReadyDismissed || GameGlobal.assistCoopPlaying
        || (typeof GameGlobal.phasePlaying === "function" && GameGlobal.phasePlaying())) {
        node.style.display = "none";
        return false;
      }
    } catch (e) {}
    return true;
  }
  function dismissAssistReadyModalKeepGuest() {
    try {
      el("assistReadyModal").style.display = "none";
      GameGlobal.assistReadyDismissed = true;
    } catch (e) {}
  }
  function assistJoinModalOn() {
    return shown(el("assistJoinModal"));
  }
  function openAssistJoinModal() {
    try { el("assistCodeInput").value = ""; } catch (e) {}
    el("assistJoinModal").style.display = "grid";
  }
  function closeAssistJoinModal() {
    el("assistJoinModal").style.display = "none";
  }
  function openAssistStarShortageModal() {
    try { el("assistJoinModal").style.display = "none"; } catch (e) {}
    el("assistStarModal").style.display = "grid";
  }
  function closeAssistStarShortageModal() {
    el("assistStarModal").style.display = "none";
  }
  /** 助战统一拦截：星碎币不足则弹窗，返回 false */
  function guardAssistAction() {
    openAssistStarShortageModal();
    return false;
  }
  function drawAssistStarShortageModal(ctx, W, H) {
    addModalMask(el("assistStarModal"));
    ctx.fillStyle = "rgba(4, 10, 16, 0.28)";
    ctx.fillRect(0, 0, W, H);
    const pw = 300;
    const ph = 188;
    const x = (W - pw) / 2;
    const y = (H - ph) / 2;
    fillPanel(ctx, x, y, pw, ph);
    drawLabel(ctx, "无法助战", x + pw / 2, y + 32, "#ff8a8a", 18, "center");
    drawLabel(ctx, "好友一起组队闯关", x + pw / 2, y + 64, "#c5d4e2", 13, "center");
    drawLabel(ctx, "星碎币不够，无法助战", x + pw / 2, y + 92, "#9aa6b2", 12, "center");
    drawBtn(ctx, x + 70, y + 128, 160, 36, "确定", true, MODAL_BTN_Z, el("btnAssistStarOk"));
  }
  function openAssistReadyModal(code, levelId, title) {
    // 星碎不足：统一拦截，不进准备窗
    try {
      if (typeof guardAssistAction === "function") {
        guardAssistAction();
        return;
      }
    } catch (e) { return; }
    // 已开战 / loading：禁止再弹准备窗
    try {
      if (GameGlobal.assistReadyDismissed || GameGlobal.assistCoopPlaying) return;
      if (typeof GameGlobal.phasePlaying === "function" && GameGlobal.phasePlaying()) return;
    } catch (e) {}
    assistGuestReady = false;
    assistGuestMeta = {
      code: String(code || "").replace(/\D/g, "").slice(0, 4),
      levelId: levelId || "",
      title: title || "关卡助战",
    };
    try {
      GameGlobal.assistGuestMode = true;
      GameGlobal.assistGuestReady = false;
      GameGlobal.assistGuestCode = assistGuestMeta.code;
      GameGlobal.__assistGuestMeta = assistGuestMeta;
      GameGlobal.levelsOpen = false;
      GameGlobal.garageOpen = false;
      GameGlobal.lobbyView = "home";
      GameGlobal.assistReadyDismissed = false;
    } catch (e) {}
    el("assistReadyModal").style.display = "grid";
    el("btnAssistReady").textContent = "准备";
    // 后台进房（房卡）
    try {
      if (assistGuestMeta.code.length === 4 && typeof GameGlobal.joinAssistRoom === "function") {
        GameGlobal.joinAssistRoom(assistGuestMeta.code);
      }
    } catch (e) {}
  }
  function closeAssistReadyModal(leaveRoom) {
    el("assistReadyModal").style.display = "none";
    assistGuestReady = false;
    try {
      GameGlobal.assistGuestMode = false;
      GameGlobal.assistGuestReady = false;
    } catch (e) {}
    if (leaveRoom) {
      try { if (typeof GameGlobal.leaveAssistRoom === "function") GameGlobal.leaveAssistRoom(); } catch (e) {}
    }
  }
  function toggleAssistReady() {
    assistGuestReady = !assistGuestReady;
    el("btnAssistReady").textContent = assistGuestReady ? "取消准备" : "准备";
    try {
      GameGlobal.assistGuestReady = assistGuestReady;
      if (typeof GameGlobal.setAssistReady === "function") GameGlobal.setAssistReady(assistGuestReady);
    } catch (e) {}
  }
  GameGlobal.openAssistJoinModal = openAssistJoinModal;
  GameGlobal.closeAssistJoinModal = closeAssistJoinModal;
  GameGlobal.openAssistReadyModal = openAssistReadyModal;
  GameGlobal.closeAssistReadyModal = closeAssistReadyModal;
  GameGlobal.dismissAssistReadyModalKeepGuest = dismissAssistReadyModalKeepGuest;
  GameGlobal.toggleAssistReady = toggleAssistReady;
  GameGlobal.openAssistStarShortageModal = openAssistStarShortageModal;
  GameGlobal.closeAssistStarShortageModal = closeAssistStarShortageModal;
  GameGlobal.guardAssistAction = guardAssistAction;

  GameGlobal.completeLevelRun = (ok) => {
    try {
      const m = el("levelFailModal");
      if (m) m.style.display = "none";
    } catch (e) {}
    try {
      const w = el("levelWinModal");
      if (w) w.style.display = "none";
    } catch (e) {}
    if (ok && levels && levelsPendingId) {
      let done = null;
      try { done = levels.markComplete(levelsPendingId); } catch (e) {}
      // markComplete 已推送；再显式补一次，防推送失败漏报
      try {
        if (typeof GameGlobal.pushLevelsProgressToServer === "function") {
          GameGlobal.pushLevelsProgressToServer(
            Array.isArray(done) ? done
              : (typeof levels.getDoneIds === "function" ? levels.getDoneIds() : undefined)
          );
        }
      } catch (e) {}
    }
    levelsPendingId = null;
    GameGlobal.levelsOpen = true;
    try {
      if (levels) {
        if (levels.scrollToStart) levels.scrollToStart();
        else if (levels.focusCurrent) levels.focusCurrent();
      }
    } catch (e) {}
  };
  function ensureGarage(ctx) {
    if (garage && garageCtx === ctx) return garage;
    garageCtx = ctx;
    garage = GameGlobal.PapaGarage.create({
      ctx,
      size: () => ({ w: overlayW, h: overlayH }),
      safe: () => {
        const s = GameGlobal.safeUI || computeSafeUI();
        const cap = s.capsule ? Math.max(0, overlayW - s.capsule.left + 6 - (s.edgeRight || 0)) : 0;
        return { l: s.edgeLeft || s.left || 0, r: s.edgeRight || 0, t: s.top || 0, b: s.bottom || 0, cap };
      },
      storage: {
        get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
      },
      onExit: closeGarage,
      onTestFly: (lo) => {
        if (typeof GameGlobal.startTrainWithLoadout !== "function") return;
        GameGlobal.garageOpen = false;
        if (!GameGlobal.startTrainWithLoadout(lo)) GameGlobal.garageOpen = true;
      },
      onSave: (lo) => {
        if (typeof GameGlobal.saveMyLoadout === "function") GameGlobal.saveMyLoadout(lo);
      },
      getStarShards: () => {
        try {
          const s = GameGlobal.playerStats;
          return Math.max(0, Number(s && s.starShards) || 0);
        } catch (e) { return 0; }
      },
      spendStarShards: (n) => {
        const cost = Math.max(0, Number(n) || 0);
        if (cost <= 0) return true;
        try {
          if (!GameGlobal.playerStats || typeof GameGlobal.playerStats !== "object") {
            GameGlobal.playerStats = { starShards: 0 };
          }
          const bal = Math.max(0, Number(GameGlobal.playerStats.starShards) || 0);
          if (bal < cost) return false;
          GameGlobal.playerStats.starShards = Math.round((bal - cost) * 100) / 100;
          try {
            localStorage.setItem("papa.playerStats.v1", JSON.stringify(GameGlobal.playerStats));
          } catch (e) {}
          return true;
        } catch (e) { return false; }
      },
      getInviterId: () => {
        try { return localStorage.getItem("papa.wx.openid") || localStorage.getItem("papa.pilot.token") || ""; } catch (e) { return ""; }
      },
      onAccessChange: (access) => {
        try {
          if (typeof GameGlobal.pushGarageAccessToServer === "function") {
            GameGlobal.pushGarageAccessToServer(access);
          }
        } catch (e) {}
      },
      buyEquip: (key) => {
        try {
          if (typeof GameGlobal.buyGarageEquipOnServer === "function") {
            return !!GameGlobal.buyGarageEquipOnServer(key);
          }
        } catch (e) {}
        return false;
      },
      onHelpFreeEquip: (info) => {
        try {
          if (typeof GameGlobal.helpGarageInviteOnServer === "function") {
            GameGlobal.helpGarageInviteOnServer(info);
          }
        } catch (e) {}
      },
      // 星碎不足：邀请好友免费使用（回流认有效；pending 由机库本地写入）
      onInviteFreeEquip: (item) => {
        const key = item && item.key ? String(item.key) : "";
        const name = item && item.name ? String(item.name) : "装备";
        const inviter = (item && item.inviter) || (() => {
          try { return localStorage.getItem("papa.wx.openid") || localStorage.getItem("papa.pilot.token") || ""; } catch (e) { return ""; }
        })();
        if (!inviter) {
          try { wx.showToast({ title: "登录后才能邀请", icon: "none" }); } catch (e) {}
          return;
        }
        // inviter 必须带上，否则点开者无法把奖励记到转发者名下
        const query = [
          "act=freeEquip",
          "equip=" + encodeURIComponent(key),
          "inviter=" + encodeURIComponent(String(inviter).slice(0, 64)),
        ].join("&");
        const payload = {
          title: `帮我解锁「${name}」，一起空战`,
          query,
        };
        try {
          if (typeof GameGlobal.withShareImage === "function") {
            Object.assign(payload, GameGlobal.withShareImage(payload));
          } else {
            payload.imageUrl = "https://game.hunchun828.top/share/share-card.png";
          }
        } catch (e) {}
        try {
          if (typeof wx !== "undefined" && typeof wx.shareAppMessage === "function") {
            wx.shareAppMessage(payload);
            return;
          }
        } catch (e) {}
        try { wx.showToast({ title: "请转发后等好友进入", icon: "none" }); } catch (err) {}
      },
    });
    syncGarageLoadout();
    GameGlobal.applyGarageAccess = applyGarageAccessNow;
    GameGlobal.applyFreeEquipFromQuery = (info) => {
      try {
        if (!garage || typeof garage.applyFreeEquipEnter !== "function") return null;
        const r = garage.applyFreeEquipEnter(info || {});
        // 点开的好友：只助力转发者；转发者本人才会本地/服务器加时
        if (r && r.ok && r.role === "helper") {
          try { wx.showToast({ title: "已为好友助力", icon: "none" }); } catch (e) {}
        }
        return r;
      } catch (e) { return null; }
    };
    if (pendingGarageAccess) {
      const p = pendingGarageAccess;
      pendingGarageAccess = null;
      try { applyGarageAccessNow(p.access, p.meta); } catch (e) {}
    }
    // 邀请回流不再经机库本地发奖；遗留 pending 一律丢弃，防止点开者误领
    GameGlobal.__freeEquipPending = null;
    // 先拉服务器再合并；本地刚解锁的会被 merge 保住
    try {
      if (typeof GameGlobal.syncGarageAccessWithServer === "function") {
        GameGlobal.syncGarageAccessWithServer();
      }
    } catch (e) {}
    return garage;
  }
  // 机库里显示的方案以已保存（服务器同步过）的为准
  function syncGarageLoadout() {
    if (!garage || typeof garage.setLoadout !== "function" || typeof GameGlobal.getMyLoadout !== "function") return;
    try { garage.setLoadout(GameGlobal.getMyLoadout()); } catch (e) {}
  }
  GameGlobal.openGarage = openGarage;
  GameGlobal.closeGarage = closeGarage;
  GameGlobal.getGarageLoadout = () => {
    if (typeof GameGlobal.getMyLoadout === "function") return GameGlobal.getMyLoadout();
    try {
      const v = JSON.parse(localStorage.getItem("papa.garage.loadout.v2") || "null");
      return v && Array.isArray(v.slots) ? v : null;
    } catch (e) {
      return null;
    }
  };

  function overlay(ctx, W, H) {
    overlayW = W;
    overlayH = H;
    hits = [];
    const playing = html.classList.contains("ingame");
    if (GameGlobal.garageOpen && !playing && GameGlobal.PapaGarage) {
      try {
        ensureGarage(ctx).frame(performance.now());
        return;
      } catch (err) {
        console.error("[garage]", err && err.message);
        GameGlobal.garageOpen = false;
        garage = null;
      }
    }
    if (GameGlobal.levelsOpen && !playing && GameGlobal.PapaLevels
      && !shown(el("levelFailModal")) && !shown(el("levelWinModal"))) {
      try {
        ensureLevels(ctx).frame(performance.now());
      } catch (err) {
        console.error("[levels]", err && err.message);
        GameGlobal.levelsOpen = false;
        levels = null;
      }
      // 关卡页上也要能弹出「星碎币不够」统一窗
      if (shown(el("assistStarModal"))) drawAssistStarShortageModal(ctx, W, H);
      return;
    }

    if (!playing) drawPageBackdrop(ctx, W, H);

    // 关卡失败/过关演出期间不画操作键
    if (playing && !GameGlobal.levelFailCine && !GameGlobal.levelFailHold
      && !GameGlobal.levelWinCine && !GameGlobal.levelWinHold) {
      const safe = computeSafeUI();
      // 左半屏方向 / 右半屏开火，按下处为中心（互不抢触）
      const fly = 99;
      const edgeL = Number.isFinite(safe.edgeLeft) ? safe.edgeLeft : safe.left;
      const edgeR = Number.isFinite(safe.edgeRight) ? safe.edgeRight : 6;
      const stickZoneTop = Math.max(36, safe.top);
      const midX = Math.round(W * 0.5);
      const guideLock = !!(GameGlobal.trainGuide && GameGlobal.trainGuide.active);
      // 引导中仍要 addHit 写 offset（A/B 等靠它画位置），用更高 z 整屏吞触禁止操作
      addHit(el("flyBtn"), 0, stickZoneTop, midX, H - stickZoneTop, 1);
      addHit(el("fireBtn"), midX, stickZoneTop, W - midX, H - stickZoneTop, 2);
      if (guideLock) addHit(el("__trainGuideBlock"), 0, 0, W, H, 17);
      const flyNode = el("flyBtn");
      const flyCx = Number.isFinite(flyNode.floatX) ? flyNode.floatX : (edgeL + 2 + fly / 2);
      const flyCy = Number.isFinite(flyNode.floatY) ? flyNode.floatY : (H - safe.bottom - 4 - fly / 2);
      const gun = html.classList.contains("gun-mode");
      const missile = html.classList.contains("missile-mode");
      const mineMode = !!GameGlobal.levelMineMode;
      const satMode = !!GameGlobal.levelSatMode;
      const satCutUI = satMode && !!(GameGlobal.satCutReady || GameGlobal.satGrabReady || GameGlobal.satArmActive);
      // 第3关拆除 / 第5关靠近时剪断或抓取；第5关远处仍开火+切武器
      const interactMode = mineMode || satCutUI;
      const wepSize = 56;
      const wepGap = 14;
      const capBottom = safe.capsule ? safe.capsule.bottom : safe.top;
      const wepY = Math.round(capBottom + 30);
      const wepBx = W - edgeR - 4 - wepSize;
      const wepAx = wepBx - wepSize - wepGap;
      if (!interactMode) {
        addHit(el("weapA"), wepAx, wepY, wepSize, wepSize, 3);
        addHit(el("weapB"), wepBx, wepY, wepSize, wepSize, 3);
      }
      const fireSize = fly; // 与左侧移动摇杆同大
      // 与左摇杆对称，再把右/下边距翻倍；并钳制 edge，避免苹果机安全区异常把开火键挤歪
      const ctrlEdgeR = Math.min(Math.max(Number(edgeR) || 6, 6), 34);
      const ctrlBottom = Math.min(Math.max(Number(safe.bottom) || 4, 4), 14);
      const firePadX = Math.max(16, (ctrlEdgeR + 2) * 2);
      const firePadY = Math.max(16, (ctrlBottom + 4) * 2);
      let defFireX = W - firePadX - fireSize;
      let defFireY = H - firePadY - fireSize;
      defFireX = Math.max(midX + 8, Math.min(defFireX, W - fireSize - 8));
      defFireY = Math.max(stickZoneTop + 8, Math.min(defFireY, H - fireSize - 8));
      const fireNode = el("fireBtn");
      const fireCx = Number.isFinite(fireNode.floatX) ? fireNode.floatX : (defFireX + fireSize / 2);
      const fireCy = Number.isFinite(fireNode.floatY) ? fireNode.floatY : (defFireY + fireSize / 2);
      // 视觉尺寸单独记下，供摇杆中心/旋钮换算（命中区是半屏）
      fireNode.visLeft = fireCx - fireSize / 2;
      fireNode.visTop = fireCy - fireSize / 2;
      fireNode.visSize = fireSize;

      // 右侧提速推杆（飞行游戏油门杆样式）：A/B 武器键正下方、开火摇杆上方，右边对齐 B 键
      let trainSlidBox = null;
      {
        const slidW = 36;
        const slidX = wepBx + wepSize - slidW - 2;
        const slidY = wepY + wepSize + 16;
        const slidH = Math.max(72, Math.min(104, defFireY - 8 - slidY));
        trainSlidBox = { x: slidX, y: slidY, w: slidW, h: slidH };
        const slider = el("slider");
        addHit(slider, slidX, slidY, slidW, slidH, 6);
        const lever = (typeof GameGlobal !== "undefined" && Number.isFinite(GameGlobal.speedLever))
          ? Math.max(0, Math.min(1, GameGlobal.speedLever))
          : 0.7;
        const cx = slidX + slidW * 0.5;
        const housingX = slidX + 8;
        const housingW = slidW - 16;
        const travelTop = slidY + 14;
        const travelBot = slidY + slidH - 14;
        const travelH = Math.max(40, travelBot - travelTop);
        const knobY = travelTop + (1 - lever) * travelH;
        const fillH = travelBot - knobY;
        ctx.save();
        // 外壳凹槽
        rrect(ctx, housingX, slidY + 6, housingW, slidH - 12, 8);
        ctx.fillStyle = "rgba(6, 12, 18, 0.78)";
        ctx.fill();
        ctx.strokeStyle = "rgba(140, 180, 210, 0.35)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        // 内槽
        rrect(ctx, cx - 5, travelTop - 4, 10, travelH + 8, 4);
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.fill();
        // 推力亮带（从推杆位置到怠速底）；lever 量化后复用渐变，少建临时对象
        if (fillH > 1) {
          const hot = lever > 0.72;
          const qy = Math.round(knobY);
          const qb = Math.round(travelBot);
          const glowKey = `${cx | 0},${qy},${qb},${hot ? 1 : 0}`;
          if (!slider._glow || slider._glowKey !== glowKey) {
            const glow = ctx.createLinearGradient(cx, knobY, cx, travelBot);
            glow.addColorStop(0, hot ? "rgba(255,180,90,0.55)" : "rgba(90,200,255,0.5)");
            glow.addColorStop(1, "rgba(40,120,180,0.12)");
            slider._glow = glow;
            slider._glowKey = glowKey;
          }
          ctx.fillStyle = slider._glow;
          rrect(ctx, cx - 3.5, knobY, 7, fillH, 3);
          ctx.fill();
        }
        // 刻度
        ctx.strokeStyle = "rgba(180,196,210,0.28)";
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
          const ty = travelTop + (travelH * i) / 4;
          const tickW = i === 0 || i === 4 ? 9 : 6;
          ctx.beginPath();
          ctx.moveTo(cx - tickW, ty);
          ctx.lineTo(cx - 6, ty);
          ctx.stroke();
        }
        // 推杆立柱
        ctx.fillStyle = "rgba(160, 185, 205, 0.55)";
        ctx.fillRect(cx - 1.6, knobY, 3.2, travelBot - knobY + 2);
        // T 型推把（粗手柄，飞行油门感）
        const gripW = 28;
        const gripH = 16;
        const gx = cx - gripW / 2;
        const gy = knobY - gripH / 2;
        rrect(ctx, gx, gy, gripW, gripH, 4);
        const gripGrad = ctx.createLinearGradient(gx, gy, gx, gy + gripH);
        if (lever > 0.72) {
          gripGrad.addColorStop(0, "#ffd29a");
          gripGrad.addColorStop(1, "#e08a3a");
        } else {
          gripGrad.addColorStop(0, "#c8ecff");
          gripGrad.addColorStop(1, "#4aa3d8");
        }
        ctx.fillStyle = gripGrad;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.lineWidth = 1;
        ctx.stroke();
        // 握槽纹
        ctx.strokeStyle = "rgba(0,0,0,0.28)";
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          const lx = gx + 7 + i * 7;
          ctx.beginPath();
          ctx.moveTo(lx, gy + 4);
          ctx.lineTo(lx, gy + gripH - 4);
          ctx.stroke();
        }
        ctx.restore();
      }
      const gear = el("gearBtn");
      let gearX = safe.left + 120;
      let gearY = safe.top;
      if (shown(gear) || true) {
        gearX = parseFloat(gear.style.left) || (safe.left + 120);
        gearY = parseFloat(gear.style.top) || safe.top;
        addHit(gear, gearX, gearY, 34, 34, 4);
        drawSettingsBtn(ctx, gearX, gearY, 34);
        // 延迟：设置图标正下方，信号动画与 ms 并列；字号对齐击杀（同 13px×0.5）
        {
          const NET_SCALE = 0.5;
          const fontPx = 13;
          ctx.save();
          ctx.font = `${fontPx}px sans-serif`;
          const hud = (typeof GameGlobal !== "undefined" && GameGlobal.netHud) || null;
          const lost = !!(hud && hud.lost);
          const lab = lost ? "断" : ((hud && hud.label) || "--");
          const unit = lost || lab === "--" || lab === "断" ? "" : "ms";
          const estW = (4 * 2.8 + 3 * 1.8) + 5 + Math.ceil(ctx.measureText(lab + unit).width);
          const cx = gearX + 17;
          const cy = gearY + 34 + 3 + (14 * NET_SCALE) / 2;
          ctx.translate(cx, cy);
          ctx.scale(NET_SCALE, NET_SCALE);
          drawNetSignalHud(ctx, -estW / 2, 0, fontPx);
          ctx.restore();
        }
      }
      let rowX = gearX + 34 + 8;
      // 顶栏信息不得侵入胶囊（右上）
      const hudMaxRight = Math.max(rowX + 40, (safe.capsule ? safe.capsule.left - 10 : safe.contentRight));
      const timer = el("matchTimer");
      if (timer.classList.contains("show") || shown(timer) || (timer.style.left && timer.textContent)) {
        const tx = parseFloat(timer.style.left);
        const ty = parseFloat(timer.style.top);
        const endcd = timer.classList.contains("endcd");
        const tw = endcd ? 52 : 78;
        const th = endcd ? 38 : 34;
        if (Number.isFinite(tx) && timer.textContent && playing && tx + tw <= hudMaxRight) {
          rowX = tx + tw + 8;
          // 最后 10 秒：红色数字放大缩小闪烁；底板固定不挡其它 UI
          const pulse = endcd
            ? (0.88 + 0.22 * (0.5 + 0.5 * Math.sin(performance.now() / 120)))
            : 1;
          const cx = tx + tw / 2;
          const cy = ty + th / 2 + 1;
          ctx.save();
          rrect(ctx, tx, ty, tw, th, 9);
          ctx.fillStyle = endcd ? "rgba(40, 8, 10, 0.82)" : "rgba(8,12,16,0.78)";
          ctx.fill();
          ctx.strokeStyle = endcd
            ? "rgba(255, 90, 90, 0.85)"
            : (timer.classList.contains("warn") ? "rgba(255,138,138,0.5)" : "rgba(255,224,138,0.4)");
          ctx.lineWidth = endcd ? 1.6 : 1;
          ctx.stroke();
          ctx.translate(cx, cy);
          ctx.scale(pulse, pulse);
          ctx.fillStyle = endcd
            ? "#ff4d4d"
            : (timer.classList.contains("warn") ? "#ff8a8a" : "#ffe08a");
          ctx.font = endcd ? "bold 22px sans-serif" : "16px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.globalAlpha = endcd ? (0.75 + 0.25 * (0.5 + 0.5 * Math.sin(performance.now() / 120))) : 1;
          ctx.fillText(timer.textContent, 0, 0);
          ctx.restore();
        }
      }
      ctx.save();
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      // 整排按 0.5 缩放，起点贴齿轮右侧；缩放后仍按逻辑坐标裁切到胶囊左侧
      const HUD_ROW_SCALE = 0.5;
      ctx.translate(rowX, gearY + (34 - 34 * HUD_ROW_SCALE) / 2);
      ctx.scale(HUD_ROW_SCALE, HUD_ROW_SCALE);
      ctx.translate(-rowX, -gearY);
      // 未缩放坐标系下的右边界，换算到当前 0.5 缩放空间：逻辑宽度可更宽，但落点仍受 hudMaxRight 限制
      const scaledMax = rowX + (hudMaxRight - rowX) / HUD_ROW_SCALE;

      // 击杀死亡仍在顶栏；延迟在设置图标正下方
      const rowH = 34;
      const midY = gearY + rowH / 2;
      const HUD_NUM_FONT = 13;

      const killsTxt = el("kdKills").textContent || "0";
      const deathsTxt = el("kdDeaths").textContent || "0";
      ctx.font = `${HUD_NUM_FONT}px sans-serif`;
      const kW = Math.ceil(ctx.measureText(killsTxt).width);
      const dW = Math.ceil(ctx.measureText(deathsTxt).width);
      const kdW = 10 + 14 + 5 + kW + 14 + 14 + 5 + dW + 10;
      if (rowX + kdW <= scaledMax) {
        rrect(ctx, rowX, gearY, kdW, rowH, 9);
        ctx.fillStyle = "rgba(8,12,16,0.78)";
        ctx.fill();
        ctx.strokeStyle = "rgba(180,196,210,0.45)";
        ctx.stroke();
        let kx = rowX + 10;
        drawKdIcon(ctx, ICON_SWORD, kx, midY - 7, 14, "#d7e8f4");
        kx += 14 + 5;
        ctx.fillStyle = "#d7e8f4";
        ctx.fillText(killsTxt, kx, midY + 1);
        kx += kW + 14;
        drawKdIcon(ctx, ICON_SKULL, kx, midY - 7, 14, "#d8c4c4");
        kx += 14 + 5;
        ctx.fillStyle = "#d8c4c4";
        ctx.fillText(deathsTxt, kx, midY + 1);
        rowX += kdW + 8;
      }

      // 弹药条：同一排能放下才画，否则留给小地图下方（避免顶到胶囊）
      const ammoBars = [];
      ammoBars.push({ kind: "gun", wrap: el("ammoWrap"), bar: el("ammoBar"), text: el("ammoText"), fill: "#ffd36a", color: "#e8d8b8", border: "rgba(255,210,120,0.18)" });
      ammoBars.push({ kind: "missile", wrap: el("missileAmmoWrap"), bar: el("missileAmmoBar"), text: el("missileAmmoText"), fill: "#7ec8ff", color: "#c8e4ff", border: "rgba(120,200,255,0.2)" });
      const pillW = 132;
      const pillH = rowH;
      const pillGap = 8;
      let ax = rowX;
      const ay = gearY;
      ctx.font = "12px sans-serif";
      ctx.textBaseline = "middle";
      for (const b of ammoBars) {
        if (ax + pillW > scaledMax) break;
        const empty = b.wrap.classList.contains("empty");
        const pct = Math.max(0, Math.min(100, parseFloat(b.bar.style.width)));
        const k = Number.isFinite(pct) ? pct / 100 : 1;
        const denyLeft = (Number(b.wrap.denyUntil) || 0) - performance.now();
        const denying = denyLeft > 0 || b.wrap.classList.contains("deny");
        const refillLeft = (Number(b.wrap.refillUntil) || 0) - performance.now();
        const refilling = refillLeft > 0 || b.wrap.classList.contains("refill");
        let bump = 0;
        if (refillLeft > 0) {
          const u = 1 - refillLeft / 720;
          bump = u < 0.22 ? u / 0.22 : Math.max(0, 1 - (u - 0.22) / 0.78);
        } else if (denyLeft > 0) {
          const u = 1 - denyLeft / 420;
          bump = u < 0.28 ? u / 0.28 : Math.max(0, 1 - (u - 0.28) / 0.72);
        } else if (denying) {
          bump = 0.55;
        } else if (refilling) {
          bump = 0.45;
        }
        const scale = 1 + (refilling ? 0.22 : 0.28) * bump;
        const cx = ax + pillW / 2;
        const cy = ay + pillH / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);
        rrect(ctx, ax, ay, pillW, pillH, 9);
        ctx.fillStyle = denying ? "rgba(40,8,8,0.88)" : (refilling ? "rgba(10,28,18,0.9)" : "rgba(8,12,16,0.78)");
        ctx.fill();
        ctx.strokeStyle = denying
          ? "rgba(255,64,64,0.98)"
          : (refilling ? `rgba(120,255,180,${0.55 + 0.45 * bump})` : (empty ? "rgba(255,120,120,0.28)" : b.border));
        ctx.lineWidth = denying || refilling ? 2.4 : 1;
        ctx.stroke();
        const txt = b.text.textContent || "0";
        const tw = Math.ceil(ctx.measureText(txt).width);
        const iconCol = denying ? "#ff8a8a" : (refilling ? "#9dffc8" : (empty ? "#ff8a8a" : b.color));
        const sub = GameGlobal.trainLoadout && GameGlobal.trainLoadout.sub;
        const iconKind = (b.kind === "missile" && sub === "drone")
          ? "drone"
          : (b.kind === "missile" && sub === "mirv")
            ? "mirv"
            : b.kind;
        drawAmmoIcon(ctx, iconKind, ax + 9, ay + pillH / 2, iconCol);
        const trackX = ax + 9 + 16 + 6;
        const trackW = pillW - (trackX - ax) - 8 - 8 - tw;
        const trackY = ay + pillH / 2 - 2.5;
        rrect(ctx, trackX, trackY, trackW, 5, 2.5);
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fill();
        // 回满时进度条从左扫满
        let fillK = k;
        if (refillLeft > 0) {
          const u = 1 - refillLeft / 720;
          fillK = Math.max(k, Math.min(1, u / 0.35));
        }
        if (fillK > 0) {
          rrect(ctx, trackX, trackY, Math.max(2.5, trackW * fillK), 5, 2.5);
          ctx.fillStyle = denying ? "#ff6868" : (refilling ? "#7dffb0" : (empty ? "#ff6868" : b.fill));
          ctx.fill();
          if (refilling && bump > 0.05) {
            ctx.globalAlpha = 0.35 * bump;
            rrect(ctx, trackX, trackY, Math.max(2.5, trackW * fillK), 5, 2.5);
            ctx.fillStyle = "#ffffff";
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }
        ctx.fillStyle = denying ? "#ff8a8a" : (refilling ? "#b8ffe0" : (empty ? "#ff8a8a" : b.color));
        ctx.textAlign = "right";
        ctx.fillText(txt, ax + pillW - 8, ay + pillH / 2 + 0.5);
        ctx.textAlign = "left";
        ctx.restore();
        ax += pillW + pillGap;
      }
      ctx.restore();

      {
        const on = flyNode.classList.contains("on");
        ctx.save();
        ctx.beginPath();
        ctx.arc(flyCx, flyCy, fly / 2 - 1, 0, Math.PI * 2);
        ctx.fillStyle = on ? "rgba(255, 220, 120, 0.18)" : "rgba(255,255,255,0.08)";
        ctx.fill();
        ctx.strokeStyle = on ? "rgba(255, 226, 138, 0.9)" : "rgba(238,238,238,0.55)";
        ctx.lineWidth = 2;
        ctx.stroke();
        const knob = el("flyKnob");
        const pl = parseFloat(knob.style.left);
        const pt = parseFloat(knob.style.top);
        const kdx = Number.isFinite(pl) ? (pl - 50) / 38 : 0;
        const kdy = Number.isFinite(pt) ? (pt - 50) / 38 : 0;
        const maxR = fly * 0.38;
        ctx.beginPath();
        ctx.arc(flyCx + kdx * maxR, flyCy + kdy * maxR, Math.max(10, fly * 0.16), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.88)";
        ctx.fill();
        ctx.restore();
      }
      {
        const on = fireNode.classList.contains("on");
        const defuseReady = !!GameGlobal.mineDefuseReady;
        const satReady = !!(GameGlobal.satCutReady || GameGlobal.satGrabReady);
        const satLabel = (GameGlobal.satActLabel || (GameGlobal.satGrabReady ? "抓取" : "剪断"));
        ctx.save();
        if (mineMode || satCutUI) {
          // 第3关拆除 / 第5关靠近剪断或抓取：固定按钮（非摇杆）
          const ready = mineMode ? defuseReady : satReady;
          const grabTone = !mineMode && !!(GameGlobal.satGrabReady || GameGlobal.satActLabel === "抓取");
          const fillOn = mineMode
            ? "rgba(255, 170, 80, 0.28)"
            : grabTone
            ? "rgba(120, 230, 160, 0.28)"
            : "rgba(90, 200, 255, 0.28)";
          const fillReady = mineMode
            ? "rgba(255, 160, 70, 0.22)"
            : grabTone
            ? "rgba(100, 220, 150, 0.22)"
            : "rgba(80, 190, 255, 0.22)";
          const strokeHot = mineMode
            ? "rgba(255, 190, 110, 0.95)"
            : grabTone
            ? "rgba(150, 255, 190, 0.95)"
            : "rgba(140, 220, 255, 0.95)";
          const ring = mineMode
            ? "rgba(255,180,90,0.35)"
            : grabTone
            ? "rgba(130,240,180,0.35)"
            : "rgba(120,210,255,0.35)";
          const labelColor = ready || on
            ? (mineMode ? "#ffe6c0" : grabTone ? "#d8ffe8" : "#d8f4ff")
            : "rgba(220,220,220,0.55)";
          ctx.beginPath();
          ctx.arc(fireCx, fireCy, fireSize / 2 - 1, 0, Math.PI * 2);
          ctx.fillStyle = on ? fillOn : ready ? fillReady : "rgba(255,255,255,0.08)";
          ctx.fill();
          ctx.strokeStyle = on || ready ? strokeHot : "rgba(238,238,238,0.4)";
          ctx.lineWidth = 2.2;
          ctx.stroke();
          if (ready) {
            ctx.beginPath();
            ctx.arc(fireCx, fireCy, fireSize / 2 + 4, 0, Math.PI * 2);
            ctx.strokeStyle = ring;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          ctx.fillStyle = labelColor;
          ctx.font = "bold 15px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(mineMode ? "拆除" : satLabel, fireCx, fireCy);
        } else {
          ctx.beginPath();
          ctx.arc(fireCx, fireCy, fireSize / 2 - 1, 0, Math.PI * 2);
          ctx.fillStyle = on ? "rgba(255, 220, 120, 0.18)" : "rgba(255,255,255,0.08)";
          ctx.fill();
          ctx.strokeStyle = on ? "rgba(255, 226, 138, 0.9)" : "rgba(238,238,238,0.55)";
          ctx.lineWidth = 2;
          ctx.stroke();
          if (!gun) {
            ctx.fillStyle = "#fff";
            ctx.font = "15px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("开火", fireCx, fireCy);
          } else {
            const knob = el("fireKnob");
            const pl = parseFloat(knob.style.left);
            const pt = parseFloat(knob.style.top);
            const kdx = Number.isFinite(pl) ? (pl - 50) / 34 : 0;
            const kdy = Number.isFinite(pt) ? (pt - 50) / 34 : 0;
            const maxR = fireSize * 0.34;
            ctx.beginPath();
            ctx.arc(fireCx + kdx * maxR, fireCy + kdy * maxR, Math.max(10, fireSize * 0.15), 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255,255,255,0.88)";
            ctx.fill();
          }
        }
        ctx.restore();
      }
      function wep(node, kind) {
        const ww = node.offsetWidth || 28;
        const hh = node.offsetHeight || 28;
        const on = node.classList.contains("on");
        const cx = node.offsetLeft + ww / 2;
        const cy = node.offsetTop + hh / 2;
        ctx.save();
        rrect(ctx, node.offsetLeft, node.offsetTop, ww, hh, 8);
        ctx.fillStyle = on ? "#27d83a" : "rgba(0,0,0,0.4)";
        ctx.fill();
        ctx.strokeStyle = on ? "#27d83a" : "#eee";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        const color = on ? "#06200a" : "#fff";
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineCap = "round";
        if (kind === "cannon") {
          // 粗炮管 + 炮弹
          ctx.fillRect(cx - 9, cy - 3, 11, 6);
          ctx.fillRect(cx + 2, cy - 4.5, 2.5, 9);
          ctx.beginPath();
          ctx.arc(cx + 8, cy, 2.8, 0, Math.PI * 2);
          ctx.fill();
        } else if (kind === "gatling") {
          // 双管
          ctx.fillRect(cx - 9, cy - 4.5, 15, 3);
          ctx.fillRect(cx - 9, cy + 1.5, 15, 3);
          ctx.fillRect(cx - 4, cy - 6, 2, 12);
          ctx.fillRect(cx + 7, cy - 4, 2.2, 2);
          ctx.fillRect(cx + 7, cy + 2, 2.2, 2);
        } else if (kind === "laser") {
          ctx.beginPath();
          ctx.arc(cx - 6, cy, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(cx - 4, cy - 1.2, 13, 2.4);
        } else if (kind === "emp") {
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(cx - 6, cy, 3.2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx - 2.5, cy);
          ctx.lineTo(cx + 0.5, cy - 4);
          ctx.lineTo(cx + 3, cy + 3);
          ctx.lineTo(cx + 6, cy - 3);
          ctx.lineTo(cx + 9, cy + 1);
          ctx.stroke();
        } else if (kind === "gun") {
          // 竖向三发子弹
          for (let i = 0; i < 3; i++) {
            const bx = cx - 7 + i * 5.5;
            ctx.beginPath();
            ctx.moveTo(bx, cy + 6);
            ctx.lineTo(bx, cy - 1);
            ctx.quadraticCurveTo(bx + 1.6, cy - 6.5, bx + 3.2, cy - 1);
            ctx.lineTo(bx + 3.2, cy + 6);
            ctx.closePath();
            ctx.fill();
          }
        } else if (kind === "drone") {
          // 双三角伴飞机
          const tri = (ox, oy, s) => {
            ctx.beginPath();
            ctx.moveTo(cx + ox, cy + oy - 6 * s);
            ctx.lineTo(cx + ox + 5 * s, cy + oy + 5 * s);
            ctx.lineTo(cx + ox, cy + oy + 2 * s);
            ctx.lineTo(cx + ox - 5 * s, cy + oy + 5 * s);
            ctx.closePath();
            ctx.fill();
          };
          tri(-5, 0, 0.85);
          tri(5, 1, 0.85);
        } else if (kind === "mirv") {
          // 多弹头：短弹体 + 扇形五尖
          ctx.beginPath();
          ctx.moveTo(cx + 2, cy);
          ctx.lineTo(cx - 2, cy - 2.2);
          ctx.lineTo(cx - 7, cy - 2.2);
          ctx.lineTo(cx - 7, cy + 2.2);
          ctx.lineTo(cx - 2, cy + 2.2);
          ctx.closePath();
          ctx.fill();
          for (let i = 0; i < 5; i++) {
            const a = -0.9 + i * 0.45;
            ctx.beginPath();
            ctx.moveTo(cx + 1, cy);
            ctx.lineTo(cx + 1 + Math.cos(a) * 9, cy + Math.sin(a) * 9);
            ctx.lineTo(cx + 1 + Math.cos(a + 0.18) * 4, cy + Math.sin(a + 0.18) * 4);
            ctx.closePath();
            ctx.fill();
          }
        } else {
          // 横向导弹：弹头 + 弹体 + 尾翼
          ctx.beginPath();
          ctx.moveTo(cx + 8, cy);
          ctx.lineTo(cx + 4, cy - 2.4);
          ctx.lineTo(cx - 5, cy - 2.4);
          ctx.lineTo(cx - 5, cy + 2.4);
          ctx.lineTo(cx + 4, cy + 2.4);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(cx - 3, cy - 2.4);
          ctx.lineTo(cx - 8, cy - 6);
          ctx.lineTo(cx - 6.5, cy - 2.4);
          ctx.closePath();
          ctx.moveTo(cx - 3, cy + 2.4);
          ctx.lineTo(cx - 8, cy + 6);
          ctx.lineTo(cx - 6.5, cy + 2.4);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      if (!interactMode) {
        const lo = GameGlobal.trainLoadout;
        wep(el("weapA"), (lo && lo.main) || "gun");
        wep(el("weapB"), (lo && lo.sub) || "missile");
      }
      if (mineMode) {
        const cleared = Math.max(0, Number(GameGlobal.mineCleared) || 0);
        const total = Math.max(1, Number(GameGlobal.mineTotal) || 5);
        ctx.save();
        ctx.font = "13px sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(255,220,180,0.9)";
        ctx.fillText(`地雷 ${cleared}/${total}`, W - edgeR - 10, wepY + wepSize * 0.5);
        ctx.restore();
      } else if (satMode) {
        // 第5关：电板 / 回收进度 — 屏幕底部居中
        const cleared = Math.max(0, Number(GameGlobal.satCutCount) || 0);
        const total = Math.max(1, Number(GameGlobal.satCutTotal) || 4);
        const grabbed = Math.max(0, Number(GameGlobal.satGrabCount) || 0);
        const grabTotal = Math.max(1, Number(GameGlobal.satGrabTotal) || 2);
        const cx = Math.round(W * 0.5);
        const baseY = H - Math.max(Number(safe.bottom) || 4, 4) - 28;
        ctx.save();
        ctx.font = "13px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(180,230,255,0.9)";
        ctx.fillText(`电板 ${cleared}/${total}`, cx, baseY - 10);
        ctx.fillStyle = "rgba(160,255,200,0.9)";
        ctx.fillText(`回收 ${grabbed}/${grabTotal}`, cx, baseY + 8);
        ctx.restore();
      }
      // 训练场逐步引导：扣洞纯介绍（推杆 / 切武器 / 开火 / 方向）
      try {
        drawTrainGuideCoach(ctx, W, H, {
          wepA: !interactMode ? { x: wepAx, y: wepY, w: wepSize, h: wepSize } : null,
          wepB: !interactMode ? { x: wepBx, y: wepY, w: wepSize, h: wepSize } : null,
          slider: trainSlidBox,
          stick: { x: flyCx - fly / 2, y: flyCy - fly / 2, w: fly, h: fly, cx: flyCx, cy: flyCy, r: fly / 2 },
          fire: { x: fireCx - fireSize / 2, y: fireCy - fireSize / 2, w: fireSize, h: fireSize, cx: fireCx, cy: fireCy, r: fireSize / 2 },
          safe,
        });
      } catch (e) {}
    }

    function dim() {
      // 氛围底已在 overlay 开头画过；这里只加一层轻遮罩，让面板更易读
      ctx.fillStyle = "rgba(4, 10, 16, 0.28)";
      ctx.fillRect(0, 0, W, H);
    }

    function drawTrainGuideCoach(g, WW, HH, layout) {
      const guide = GameGlobal.trainGuide;
      if (!guide || !guide.active) return;
      const step = Number(guide.step) | 0;
      const steps = [
        {
          title: "① 加速推杆",
          body: "右侧竖杆是油门。上推加速、下拉减速，松手停在当前档位。",
          next: "下一步",
          focus: "lever",
          pad: 10,
          radius: 12,
          col: "#7ec8ff",
        },
        {
          title: "② 切换武器",
          body: "右上角 A / B 是两套武器。点 A 用主武器，点 B 用副武器（导弹、激光等）。",
          next: "下一步",
          focus: "weapon",
          pad: 8,
          radius: 14,
          col: "#7dff9a",
        },
        {
          title: "③ 发射弹药",
          body: "右下角是开火键：按住连续射击，松开停止；按住拖动可调整开火方向。",
          next: "下一步",
          focus: "fire",
          pad: 12,
          radius: 50,
          col: "#7dff9a",
        },
        {
          title: "④ 飞行方向手柄",
          body: "左下角是方向摇杆。按住拖动可转向；油门管速度，摇杆只管朝向。",
          next: "完成",
          focus: "stick",
          pad: 12,
          radius: 50,
          col: "#7dff9a",
        },
      ];
      const info = steps[step] || steps[0];
      const t = performance.now();
      const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t / 200));
      const pad = info.pad || 8;

      // 微信小游戏 Canvas 对 evenodd 支持不稳：用四周矩形挖洞（圆洞先取包围盒）
      function weaponUnionBox() {
        if (layout.wepA && layout.wepB) {
          const x = Math.min(layout.wepA.x, layout.wepB.x);
          const y = Math.min(layout.wepA.y, layout.wepB.y);
          const r = Math.max(layout.wepA.x + layout.wepA.w, layout.wepB.x + layout.wepB.w);
          const b = Math.max(layout.wepA.y + layout.wepA.h, layout.wepB.y + layout.wepB.h);
          return { x, y, w: r - x, h: b - y };
        }
        return layout.wepA || layout.wepB || null;
      }
      function focusBox() {
        if (info.focus === "lever") return layout.slider;
        if (info.focus === "weapon") return weaponUnionBox();
        if (info.focus === "fire") return layout.fire;
        if (info.focus === "stick") return layout.stick;
        return null;
      }
      function strokeCircle(box, col) {
        if (!box) return;
        const cx0 = Number.isFinite(box.cx) ? box.cx : (box.x + box.w * 0.5);
        const cy0 = Number.isFinite(box.cy) ? box.cy : (box.y + box.h * 0.5);
        const rad = (Number.isFinite(box.r) ? box.r : Math.max(box.w, box.h) * 0.5) + pad;
        g.save();
        g.globalAlpha = 0.35 + pulse * 0.5;
        g.strokeStyle = col;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(cx0, cy0, rad, 0, Math.PI * 2);
        g.stroke();
        g.restore();
      }
      function strokeRound(box, col, rad) {
        if (!box) return;
        g.save();
        g.globalAlpha = 0.35 + pulse * 0.5;
        g.strokeStyle = col;
        g.lineWidth = 3;
        rrect(g, box.x - pad - 2, box.y - pad - 2, box.w + pad * 2 + 4, box.h + pad * 2 + 4, (rad || 12) + 2);
        g.stroke();
        g.restore();
      }

      const hole = focusBox();
      let hx = 0, hy = 0, hw = 0, hh = 0;
      if (hole) {
        if (info.focus === "fire" || info.focus === "stick") {
          const cx0 = Number.isFinite(hole.cx) ? hole.cx : (hole.x + hole.w * 0.5);
          const cy0 = Number.isFinite(hole.cy) ? hole.cy : (hole.y + hole.h * 0.5);
          const rad = (Number.isFinite(hole.r) ? hole.r : Math.max(hole.w, hole.h) * 0.5) + pad;
          hx = cx0 - rad;
          hy = cy0 - rad;
          hw = rad * 2;
          hh = rad * 2;
        } else {
          hx = hole.x - pad;
          hy = hole.y - pad;
          hw = hole.w + pad * 2;
          hh = hole.h + pad * 2;
        }
      }
      // 四周四块暗色，中间留空即扣洞
      g.save();
      g.fillStyle = "rgba(2, 6, 12, 0.9)";
      if (!hole || hw <= 0 || hh <= 0) {
        g.fillRect(0, 0, WW, HH);
      } else {
        const left = Math.max(0, hx);
        const right = Math.min(WW, hx + hw);
        const top = Math.max(0, hy);
        const bot = Math.min(HH, hy + hh);
        if (top > 0) g.fillRect(0, 0, WW, top);
        if (bot < HH) g.fillRect(0, bot, WW, HH - bot);
        if (left > 0) g.fillRect(0, top, left, Math.max(0, bot - top));
        if (right < WW) g.fillRect(right, top, WW - right, Math.max(0, bot - top));
      }
      g.restore();

      const col = info.col || "#7dff9a";
      if (info.focus === "lever") strokeRound(layout.slider, col, info.radius);
      else if (info.focus === "weapon") strokeRound(weaponUnionBox(), col, info.radius);
      else if (info.focus === "fire") strokeCircle(layout.fire, col);
      else if (info.focus === "stick") strokeCircle(layout.stick, col);

      const safe = layout.safe || {};
      const cardW = Math.min(420, Math.max(280, WW - 200));
      const cardH = 108;
      const cx = (WW - cardW) / 2;
      const cy = Math.max((safe.top || 8) + 10, 14);
      g.save();
      rrect(g, cx, cy, cardW, cardH, 12);
      g.fillStyle = "rgba(6, 14, 22, 0.9)";
      g.fill();
      g.strokeStyle = "rgba(140, 190, 230, 0.35)";
      g.lineWidth = 1.2;
      g.stroke();
      g.fillStyle = "#ffe08a";
      g.font = "bold 14px sans-serif";
      g.textAlign = "left";
      g.textBaseline = "top";
      g.fillText(info.title, cx + 14, cy + 12);
      g.fillStyle = "rgba(200,214,226,0.55)";
      g.font = "11px sans-serif";
      g.fillText((step + 1) + " / " + steps.length, cx + cardW - 48, cy + 14);
      g.fillStyle = "#d5e2ea";
      g.font = "12px sans-serif";
      const maxW = cardW - 28;
      const words = String(info.body || "");
      let line = "";
      let ly = cy + 34;
      for (let i = 0; i < words.length; i++) {
        const test = line + words[i];
        if (g.measureText(test).width > maxW && line) {
          g.fillText(line, cx + 14, ly);
          line = words[i];
          ly += 16;
          if (ly > cy + 62) break;
        } else line = test;
      }
      if (line && ly <= cy + 62) g.fillText(line, cx + 14, ly);

      const btnH = 30;
      const btnY = cy + cardH - btnH - 10;
      const skipW = 72;
      const nextW = 110;
      const gap = 10;
      const nextX = cx + cardW - 14 - nextW;
      const skipX = nextX - gap - skipW;
      addHit(el("trainGuideSkip"), skipX, btnY, skipW, btnH, 18);
      addHit(el("trainGuideNext"), nextX, btnY, nextW, btnH, 18);
      rrect(g, skipX, btnY, skipW, btnH, 8);
      g.fillStyle = "rgba(255,255,255,0.08)";
      g.fill();
      g.strokeStyle = "rgba(180,200,220,0.35)";
      g.stroke();
      rrect(g, nextX, btnY, nextW, btnH, 8);
      g.fillStyle = "rgba(60, 160, 110, 0.92)";
      g.fill();
      g.fillStyle = "#c8d4e0";
      g.font = "12px sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("跳过", skipX + skipW / 2, btnY + btnH / 2 + 1);
      g.fillStyle = "#06200a";
      g.font = "bold 12px sans-serif";
      g.fillText(info.next, nextX + nextW / 2, btnY + btnH / 2 + 1);
      g.restore();
    }

    function drawLobbyUserBar() {
      if (playing || !shown(el("nameGear"))) return;
      // 组队/单人子页左上角是返回键，不画设置/头像，避免挡住返回
      const view = lobbyViewOf();
      if (view === "party" || view === "solo") return;
      // 画在大厅蒙层之后，避免被 dim 盖住
      const safeLobby = GameGlobal.safeUI || computeSafeUI();
      const gearSize = 34;
      const nx = safeLobby.left + 8;
      const ny = safeLobby.top + 4;
      addHit(el("nameGear"), nx, ny, gearSize, gearSize, 12);
      drawSettingsBtn(ctx, nx, ny, gearSize);
      // 个人中心（历史战绩）
      let barX = nx + gearSize + 10;
      if (shown(el("profileBtn"))) {
        addHit(el("profileBtn"), barX, ny, gearSize, gearSize, 12);
        drawProfileBtn(ctx, barX, ny, gearSize);
        barX += gearSize + 10;
      }
      // 去助战：紧挨个人中心后的图标按钮
      if (view === "home" && shown(el("btnLobbyAssist"))) {
        addHit(el("btnLobbyAssist"), barX, ny, gearSize, gearSize, 12);
        drawAssistBtn(ctx, barX, ny, gearSize);
        barX += gearSize + 10;
      }
      const profile = (typeof GameGlobal !== "undefined" && GameGlobal.wxProfile) || null;
      if (!(profile && profile.authed)) {
        el("homeAvatarBtn").style.display = "none";
        return;
      }
      const gap = 14; // 助战/个人中心与头像间距
      const ar = 15;
      const ax = barX + gap + ar;
      const ay = ny + gearSize / 2;
      // 仅主页头像可点（连点解锁双发）
      if (view === "home") {
        el("homeAvatarBtn").style.display = "grid";
        addHit(el("homeAvatarBtn"), ax - ar - 4, ay - ar - 4, ar * 2 + 8, ar * 2 + 8, 13);
      } else {
        el("homeAvatarBtn").style.display = "none";
      }
      ctx.save();
      ctx.beginPath();
      ctx.arc(ax, ay, ar, 0, Math.PI * 2);
      ctx.closePath();
      if (profile.avatarImg && profile.avatarImg.width) {
        ctx.save();
        ctx.clip();
        ctx.drawImage(profile.avatarImg, ax - ar, ay - ar, ar * 2, ar * 2);
        ctx.restore();
      } else {
        ctx.fillStyle = "#2a4a66";
        ctx.fill();
        ctx.fillStyle = "#9fd6ff";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(profile.name || "?").charAt(0), ax, ay + 0.5);
      }
      ctx.beginPath();
      ctx.arc(ax, ay, ar, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(159,214,255,0.7)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      const nickChars = Array.from(String(profile.name || ""));
      const nick = nickChars.length <= 5 ? nickChars.join("") : nickChars.slice(0, 5).join("") + "...";
      if (nick) {
        ctx.font = "13px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(236,246,255,0.96)";
        ctx.fillText(nick, ax + ar + 10, ay);
        // 主页昵称连点 5 次开测试入口
        if (view === "home") {
          const nw = Math.max(24, ctx.measureText(nick).width);
          addHit(el("homeNameBtn"), ax + ar + 6, ay - 16, nw + 8, 32, 13);
        }
      }
      ctx.restore();
    }

    const matchLoadingOn = !playing && el("matchLoading").classList.contains("show");

    // 结算打开时不画大厅，避免主页透在结算后面
    if (shown(el("lobby")) && !matchLoadingOn && !shown(el("summary"))) {
      dim();
      const safeLobby = GameGlobal.safeUI || computeSafeUI();
      const view = lobbyViewOf();
      const err = (el("lobbyErr").textContent || "").trim();
      const edgeL = Math.max(18, Number(safeLobby.edgeLeft != null ? safeLobby.edgeLeft : safeLobby.left) || 18);
      const edgeR = Math.max(18, Number(safeLobby.edgeRight != null ? safeLobby.edgeRight : safeLobby.right) || 18);
      const edgeT = Math.max(12, Number(safeLobby.top) || 12);

      // 首页：左品牌 / 右双入口（对齐 lobby-demo）
      if (view === "home") {
        const brandX = edgeL + 10;
        const brandY = Math.max(edgeT + 24, H * 0.22);
        ctx.save();
        ctx.fillStyle = "#f4fbff";
        ctx.font = "bold 34px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText("SKY ACE", brandX, brandY);
        ctx.fillStyle = "#7ad7ff";
        ctx.font = "12px sans-serif";
        ctx.fillText("天空战机", brandX, brandY + 42);
        ctx.fillStyle = "#9eb0c0";
        ctx.font = "13px sans-serif";
        ctx.fillText("选一种开战方式", brandX, brandY + 68);
        ctx.restore();

        const gap = 10;
        const availW = W - edgeL - edgeR - 24;
        // 四个入口：训练/单人/组队/关卡（去助战在左上个人中心旁）
        const modN = 4;
        const modW = Math.min(118, Math.max(90, (availW * 0.7 - gap * (modN - 1)) / modN));
        const modH = Math.min(132, H * 0.34);
        const modY = (H - modH) / 2;
        const modX0 = W - edgeR - 12 - modW * modN - gap * (modN - 1);
        const mods = [
          { title: "训练场", desc: "打靶练枪 · 不限时", accent: "#78ff5a", node: el("btnLobbyTrain") },
          { title: "单人匹配", desc: "匹配真人对战", accent: "#7ad7ff", node: el("btnLobbySolo") },
          { title: "多人组队", desc: "开房或输入房号", accent: "#ffe08a", node: el("btnLobbyParty") },
          { title: "关卡模式", desc: "线性闯关 · 折线航图", accent: "#ff9ad8", node: el("btnLobbyLevels") },
        ];
        mods.forEach((m, i) => {
          const x = modX0 + i * (modW + gap);
          drawAccentBoard(ctx, x, modY, modW, modH, m.accent);
          drawLabel(ctx, m.title, x + 12, modY + modH - 40, "#e8f2f8", 13);
          drawLabel(ctx, m.desc, x + 12, modY + modH - 20, "#9eb0c0", 9);
          addHit(m.node, x, modY, modW, modH, 6);
        });
      }

      // 单人匹配：时长 + 每队人数
      if (view === "solo") {
        const bw = Math.min(480, W - edgeL - edgeR - 40);
        const bh = 168;
        const bx = (W - bw) / 2;
        const by = (H - bh) / 2;
        drawAccentBoard(ctx, bx, by, bw, bh, "#7ad7ff");
        drawLabel(ctx, "单人匹配", bx + 18, by + 24, "#fff", 17);
        drawLabel(ctx, "本地对局", bx + bw - 18, by + 24, "#9eb0c0", 12, "right");
        const selGap = 8;
        const selW = Math.min(260, bw - 36);
        const half = (selW - selGap) / 2;
        drawSelect(ctx, bx + 18, by + 56, half, "对局时长", durLabelOf("matchDur", MATCH_DUR), el("matchDur"), 6);
        drawSelect(ctx, bx + 18 + half + selGap, by + 56, half, "每队人数", durLabelOf("perTeam", PER_TEAM_OPTS), el("perTeam"), 6);
        drawBtn(ctx, bx + bw - 18 - 140, by + bh - 52, 140, 36, "开始匹配", true, 6, el("btnMatch"));
        drawBtn(ctx, edgeL, edgeT, 40, 36, "‹", false, 12, el("btnLobbyBack"));
        if (err) drawLabel(ctx, err, bx + 18, by + bh + 18, "#ff8a8a", 12);
      }

      // 多人组队：创建 / 加入
      if (view === "party") {
        const gap = 14;
        const bw = Math.min(300, (W - edgeL - edgeR - 40 - gap) / 2);
        const bh = Math.min(210, H * 0.58);
        const total = bw * 2 + gap;
        const bx0 = (W - total) / 2;
        const by = (H - bh) / 2;

        drawAccentBoard(ctx, bx0, by, bw, bh, "#ffe08a");
        // 整卡可点创建（下拉框更高 z，仍可单独点开）
        addHit(el("btnCreate"), bx0, by, bw, bh, 5);
        drawLabel(ctx, "创建房间", bx0 + 16, by + 22, "#fff", 16);
        drawLabel(ctx, "房主开局", bx0 + bw - 16, by + 22, "#9eb0c0", 11, "right");
        const half = (bw - 32 - 8) / 2;
        drawSelect(ctx, bx0 + 16, by + 48, half, "时长", durLabelOf("createDur", DUR), el("createDur"), 7);
        drawSelect(
          ctx,
          bx0 + 16 + half + 8,
          by + 48,
          half,
          "每个阵营人数",
          durLabelOf("perTeam", PER_TEAM_OPTS),
          el("perTeam"),
          7
        );
        drawBtn(ctx, bx0 + 16, by + bh - 48, bw - 32, 34, "创建房间", true, 7, el("btnCreate"));
        if (err) drawLabel(ctx, err, bx0 + bw / 2, by + bh - 62, "#ff9d9d", 11, "center");

        const bx1 = bx0 + bw + gap;
        drawAccentBoard(ctx, bx1, by, bw, bh, "#7ad7ff");
        drawLabel(ctx, "加入房间", bx1 + 16, by + 22, "#fff", 16);
        drawLabel(ctx, "输入房号", bx1 + bw - 16, by + 22, "#9eb0c0", 11, "right");
        const iy = by + 58;
        const iw = bw - 32;
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(bx1 + 16, iy, iw, 36);
        ctx.strokeStyle = "rgba(140,200,220,0.35)";
        ctx.strokeRect(bx1 + 16, iy, iw, 36);
        ctx.fillStyle = el("roomCodeInput").value ? "#fff" : "#6a7784";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(el("roomCodeInput").value || "4 位房号", bx1 + 26, iy + 18);
        ctx.restore();
        addHit(el("roomCodeInput"), bx1 + 16, iy, iw, 36, 6);
        drawBtn(ctx, bx1 + 16, by + bh - 48, bw - 32, 34, "加入房间", false, 6, el("btnJoin"));

        drawBtn(ctx, edgeL, edgeT, 40, 36, "‹", false, 12, el("btnLobbyBack"));
      }

      el("btnPublic").offsetLeft = el("btnMatch").offsetLeft;
      el("btnPublic").offsetTop = el("btnMatch").offsetTop;
      el("btnPublic").offsetWidth = el("btnMatch").offsetWidth;
      el("btnPublic").offsetHeight = el("btnMatch").offsetHeight;

      drawSelectMenu(ctx);
    } else if (selectMenu && !matchLoadingOn) {
      closeSelect();
    }

    // 假匹配 loading：盖在大厅上；ingame 时不绘制
    if (matchLoadingOn) {
      addModalMask(el("matchLoading"));
      dim();
      const pw = Math.min(300, W - 48);
      const ph = 168;
      const x = (W - pw) / 2;
      const y = (H - ph) / 2;
      fillPanel(ctx, x, y, pw, ph);
      const cx = x + pw / 2;
      const cy = y + 36;
      const ang = ((Date.now() / 850) % 1) * Math.PI * 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.strokeStyle = "rgba(120,217,255,0.18)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#78d9ff";
      ctx.beginPath();
      ctx.arc(0, 0, 16, -Math.PI / 2, Math.PI * 0.4);
      ctx.stroke();
      ctx.restore();
      {
        const kind = GameGlobal.matchLoadingKind || "";
        const title = kind === "craft" ? "加载中" : (kind === "assist" ? "助战准备" : "匹配中");
        const tipFallback = kind === "craft" ? "正在加载机体…" : "正在寻找可用对局…";
        drawLabel(ctx, title, cx, y + 72, "#9fd6ff", 16, "center");
        drawLabel(ctx, el("matchLoadingTip").textContent || tipFallback, cx, y + 96, "#8a9aa8", 13, "center");
        if (kind !== "assist" && el("matchLoadingCancel").style.display !== "none") {
          drawBtn(ctx, x + 40, y + ph - 44, pw - 80, 30, "取消", false, MODAL_BTN_Z, el("matchLoadingCancel"));
        }
      }
    }

    // 助战嘉宾：停在首页准备弹窗，不画常规等待房
    if (shown(el("waiting")) && !shown(el("summary")) && !GameGlobal.assistGuestMode && !GameGlobal.assistHostMode) {
      dim();
      const st = (typeof GameGlobal !== "undefined" && GameGlobal.waitRoomState) || {};
      // 阵营数：优先 waitRoomState，其次 teamPick 按钮数，再读 meta 里的「阵营 N」
      let teamsN = Math.round(Number(st.teams) || 0);
      if (!(teamsN >= 2 && teamsN <= 8)) {
        teamsN = (el("teamPick").children || []).length | 0;
      }
      if (!(teamsN >= 2 && teamsN <= 8)) {
        const metaTxt = String(st.meta || el("waitMeta").textContent || "");
        const mm = /阵营\s*(\d+)/.exec(metaTxt);
        teamsN = mm ? (Number(mm[1]) || 0) : 0;
      }
      if (!(teamsN >= 2 && teamsN <= 8)) teamsN = 2;
      let members = Array.isArray(st.members) ? st.members.slice() : [];
      const TEAM_CAP = Math.max(1, Math.min(4, Math.round(Number(st.teamCap) || Number(st.perTeam) || 4)));
      const TEAM_FALLBACK = ["#78d9ff", "#ffb86b", "#9dff8a", "#ff8ab8", "#d7a5ff", "#ffe36e", "#7dffda", "#ff9d9d"];
      const isHost = !!(st.youHost || el("btnStart").style.display !== "none");
      const showRally = isHost && !st.public;
      const btnH = 40;
      const gap = 8;
      const pad = 16;
      const colGap = 8;
      const rowGap = 10;
      // 阵营方格：≤4 一排，>4 两排
      const tipH = st.tip ? 22 : 8;
      const topH = 36;
      const maxPw = Math.max(320, W - 24);
      const gridRows = teamsN > 4 ? 2 : 1;
      const row1N = gridRows === 1 ? teamsN : Math.ceil(teamsN / 2);
      const row2N = teamsN - row1N;
      const cols = Math.max(row1N, row2N, 1);
      // 一排 TEAM_CAP 个座位：26 头像 × 4 + 间距 + 边距
      let colW = TEAM_CAP * 26 + (TEAM_CAP - 1) * 8 + 24;
      let gridSpan = cols * colW + Math.max(0, cols - 1) * colGap;
      let pw = Math.min(maxPw, Math.max(300, gridSpan + pad * 2));
      if (gridSpan + pad * 2 > pw) {
        colW = Math.max(64, Math.floor((pw - pad * 2 - Math.max(0, cols - 1) * colGap) / Math.max(1, cols)));
        gridSpan = cols * colW + Math.max(0, cols - 1) * colGap;
        pw = Math.min(maxPw, Math.max(pw, gridSpan + pad * 2));
      }
      const seatSize = Math.max(18, Math.min(26, Math.floor((colW - 16 - (TEAM_CAP - 1) * 8) / TEAM_CAP)));
      const cellH = Math.max(72, seatSize + 34);
      const gridH = gridRows * cellH + (gridRows - 1) * rowGap;
      const ph = 14 + topH + tipH + gridH + 12 + btnH + 14;
      const x = (W - pw) / 2;
      const y = Math.max(12, (H - ph) / 2);

      // 对齐 lobby-demo：紧凑 accent 板 + 顶栏 + 宫格座位 + 底栏按钮
      drawAccentBoard(ctx, x, y, pw, ph, "#ffe08a");
      {
        const safe = GameGlobal.safeUI || computeSafeUI();
        drawBtn(ctx, Math.max(10, safe.left || 10), Math.max(10, safe.top || 10), 40, 36, "‹", false, 8, el("btnWaitLeave"));
      }

      drawLabel(ctx, "房间", x + pad, y + 22, "#fff", 16);
      const code = st.code || el("waitCode").textContent || "----";
      drawLabel(ctx, code, x + pw - pad, y + 22, "#ffe08a", 22, "right");
      const meta = st.meta || el("waitMeta").textContent || "";
      if (meta) {
        // 顶栏：标题 | 时长阵营 | 房号（与 demo room-top 同级信息）
        ctx.save();
        ctx.font = "12px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const titleW = ctx.measureText("房间").width;
        ctx.fillStyle = "#9eb0c0";
        ctx.fillText(meta, x + pad + titleW + 14, y + 22);
        ctx.restore();
      }
      if (st.tip) drawLabel(ctx, st.tip, x + pad, y + 44, "#ff9d9d", 12);

      const gridTop = y + topH + tipH;
      const picks = el("teamPick").children || [];
      let myTeam = Number.isFinite(Number(st.myTeam)) ? (Number(st.myTeam) | 0) : -1;
      // 绘制层保底：房主可见却不在成员列表时，补进当前/0 号阵营
      if (isHost && !members.some((u) => u && (u.you || u.host))) {
        if (myTeam < 0 || myTeam >= teamsN) myTeam = 0;
        members = members.concat([{
          team: myTeam,
          you: true,
          host: true,
          bot: false,
          avatarImg: (typeof GameGlobal !== "undefined" && GameGlobal.wxProfile && GameGlobal.wxProfile.avatarImg) || null,
        }]);
      }

      const drawTeamCell = (ti, cx, cy) => {
        const color = (picks[ti] && picks[ti].style.background) || TEAM_FALLBACK[ti % TEAM_FALLBACK.length];
        const mine = myTeam === ti;

        ctx.save();
        ctx.strokeStyle = mine ? "#fff" : color;
        ctx.globalAlpha = mine ? 0.95 : 0.55;
        ctx.lineWidth = mine ? 2 : 1.2;
        ctx.strokeRect(cx + 0.5, cy + 0.5, colW - 1, cellH - 1);
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = color;
        ctx.fillRect(cx, cy, colW, cellH);
        ctx.restore();
        if (mine) {
          ctx.save();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1;
          ctx.strokeRect(cx + 2.5, cy + 2.5, colW - 5, cellH - 5);
          ctx.restore();
        }

        drawLabel(ctx, `阵营 ${ti + 1}`, cx + 8, cy + 12, color, 10);
        // 整列可点换阵营；空位单独更高命中，点 + 号更明确
        if (picks[ti]) {
          picks[ti].dataset.team = String(ti);
          addHit(picks[ti], cx, cy, colW, cellH, 7);
        }

        const teamMembers = members.filter((u) => {
          let t = Math.round(Number(u.team));
          if (!Number.isFinite(t) || t < 0) t = 0;
          return t === ti;
        });
        const seatGap = 8;
        const seatsW = TEAM_CAP * seatSize + (TEAM_CAP - 1) * seatGap;
        let sx = cx + (colW - seatsW) / 2;
        const sy = cy + 22 + (cellH - 22 - seatSize) / 2;

        for (let si = 0; si < TEAM_CAP; si++) {
          const u = teamMembers[si];
          const ax = sx + seatSize / 2;
          const ay = sy + seatSize / 2;
          const r = seatSize / 2;

          ctx.save();
          ctx.beginPath();
          ctx.arc(ax, ay, r, 0, Math.PI * 2);
          if (!u) {
            ctx.fillStyle = "rgba(255,255,255,0.03)";
            ctx.fill();
            if (typeof ctx.setLineDash === "function") ctx.setLineDash([3, 3]);
            ctx.strokeStyle = "rgba(255,255,255,0.18)";
            ctx.lineWidth = 1.2;
            ctx.stroke();
            if (typeof ctx.setLineDash === "function") ctx.setLineDash([]);
            ctx.fillStyle = "rgba(255,255,255,0.28)";
            ctx.font = `${Math.max(11, Math.round(seatSize * 0.55))}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("+", ax, ay + 1);
            const seatHit = el(`waitSeat_${ti}_${si}`);
            seatHit.dataset.team = String(ti);
            seatHit.dataset.empty = "1";
            addHit(seatHit, ax - r - 4, ay - r - 4, seatSize + 8, seatSize + 8, 9);
          } else {
            // 人机也按真人头像样式画，不标 AI、不用虚线框
            ctx.fillStyle = "rgba(8,14,22,0.75)";
            ctx.fill();
            let drewAvatar = false;
            if (u.avatarImg && (u.avatarImg.width || u.avatarImg.height)) {
              try {
                ctx.save();
                ctx.beginPath();
                ctx.arc(ax, ay, r - 1.5, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(u.avatarImg, ax - r + 1.5, ay - r + 1.5, seatSize - 3, seatSize - 3);
                ctx.restore();
                drewAvatar = true;
              } catch (e) {
                try { ctx.restore(); } catch (err) {}
              }
            }
            if (!drewAvatar) {
              const label = u.you || u.host ? "我" : (String(u.name || "玩").slice(0, 1) || "玩");
              ctx.fillStyle = "#dff3ff";
              ctx.font = `bold ${Math.round(seatSize * 0.42)}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(label, ax, ay + 1);
            }
            ctx.beginPath();
            ctx.arc(ax, ay, r, 0, Math.PI * 2);
            ctx.strokeStyle = u.you ? "#fff" : (u.host ? "#ffe08a" : color);
            ctx.lineWidth = u.you || u.host ? 2 : 1.3;
            ctx.stroke();
            if (u.host && !u.you) {
              ctx.beginPath();
              ctx.arc(ax, ay, r + 2, 0, Math.PI * 2);
              ctx.strokeStyle = "rgba(255,224,138,0.55)";
              ctx.lineWidth = 1.6;
              ctx.stroke();
            }
            if (u.you) {
              ctx.beginPath();
              ctx.arc(ax, ay, r + 2, 0, Math.PI * 2);
              ctx.strokeStyle = "rgba(255,255,255,0.7)";
              ctx.lineWidth = 1.6;
              ctx.stroke();
            }
            // 房主可剔除他人（含机器人）：头像右上角 ×
            if (isHost && !u.you && !u.host) {
              const kr = Math.max(6, Math.min(8, seatSize * 0.32));
              const kx = ax + r * 0.72;
              const ky = ay - r * 0.72;
              ctx.beginPath();
              ctx.arc(kx, ky, kr, 0, Math.PI * 2);
              ctx.fillStyle = "rgba(20, 10, 14, 0.88)";
              ctx.fill();
              ctx.strokeStyle = "rgba(255,120,120,0.9)";
              ctx.lineWidth = 1.1;
              ctx.stroke();
              ctx.strokeStyle = "#ffe8e8";
              ctx.lineWidth = 1.4;
              ctx.lineCap = "round";
              const arm = kr * 0.45;
              ctx.beginPath();
              ctx.moveTo(kx - arm, ky - arm);
              ctx.lineTo(kx + arm, ky + arm);
              ctx.moveTo(kx + arm, ky - arm);
              ctx.lineTo(kx - arm, ky + arm);
              ctx.stroke();
              const kickHit = el(`waitKick_${ti}_${si}`);
              kickHit.__kickTarget = u;
              kickHit.dataset.kick = "1";
              addHit(kickHit, kx - kr - 4, ky - kr - 4, kr * 2 + 8, kr * 2 + 8, 12);
            }
          }
          ctx.restore();
          sx += seatSize + seatGap;
        }
      };

      const placeRow = (startTi, count, rowIndex) => {
        if (!(count > 0)) return;
        const rowW = count * colW + (count - 1) * colGap;
        const left = x + (pw - rowW) / 2;
        const cy = gridTop + rowIndex * (cellH + rowGap);
        for (let i = 0; i < count; i++) {
          drawTeamCell(startTi + i, left + i * (colW + colGap), cy);
        }
      };
      placeRow(0, row1N, 0);
      if (gridRows === 2) placeRow(row1N, row2N, 1);

      const by = y + ph - 14 - btnH;
      const ax0 = x + pad;
      const actionW = pw - pad * 2;
      if (isHost) {
        const n = showRally ? 3 : 2;
        const bw = (actionW - gap * (n - 1)) / n;
        let bx = ax0;
        drawBtn(ctx, bx, by, bw, btnH, "邀请好友", false, 7, el("btnInvite"));
        bx += bw + gap;
        if (showRally) {
          const rallyLabel = el("btnRally").disabled ? "召集中…" : "召集";
          drawBtn(ctx, bx, by, bw, btnH, rallyLabel, false, 7, el("btnRally"));
          bx += bw + gap;
        }
        drawBtn(ctx, bx, by, bw, btnH, "开始游戏", true, 7, el("btnStart"));
      } else {
        drawBtn(ctx, ax0, by, actionW, btnH, "离开房间", false, 7, el("btnWaitLeave"));
      }
    }

    // 设置/头像画在大厅蒙层之上；弹窗/等待室打开时不画
    if (!matchLoadingOn
      && !shown(el("waiting"))
      && !shown(el("summary"))
      && !shown(el("menuModal"))
      && !shown(el("nameModal"))
      && !shown(el("settingsModal"))
      && !shown(el("historyModal"))
      && !shown(el("profileHub"))
      && !shown(el("statsModal"))
      && !shown(el("authModal"))
      && !shown(el("leaveConfirmModal"))
      && !shown(el("fullModal"))
      && !shown(el("matchLostModal"))
      && !shown(el("levelFailModal"))
      && !shown(el("levelWinModal"))
      && !shown(el("offline"))) {
      drawLobbyUserBar();
    }

    if (shown(el("summary"))) {
      addModalMask(el("summary"));
      // 不透主页：加厚遮罩
      ctx.fillStyle = "rgba(4, 10, 16, 0.72)";
      ctx.fillRect(0, 0, W, H);
      const safe = computeSafeUI();
      const edgeL = Number.isFinite(safe.edgeLeft) ? safe.edgeLeft : (safe.left || 8);
      const edgeR = Number.isFinite(safe.edgeRight) ? safe.edgeRight : 8;
      const state = (typeof GameGlobal !== "undefined" && GameGlobal.summaryState) || { board: [], page: 1, title: "本局结算" };
      const board = Array.isArray(state.board) ? state.board : [];
      const page = state.page === 2 ? 2 : 1;
      let youTeam = null;
      let youPlayer = null;
      for (const g of board) {
        for (const p of (g.players || [])) {
          if (p.you) { youTeam = g; youPlayer = p; break; }
        }
        if (youPlayer) break;
      }
      const won = !!(youTeam && (youTeam.rank || 99) === 1);
      const title = state.title || "本局结算";

      // 顶栏：品牌 + 胜负
      const headY = Math.max(safe.top || 8, 12) + 8;
      ctx.save();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("SkyAceBlitz", edgeL + 12, headY + 10);
      ctx.fillStyle = "#78d9ff";
      ctx.font = "12px sans-serif";
      ctx.fillText(page === 1 ? "阵营击杀排名" : "全员击杀 / 死亡", edgeL + 12, headY + 32);
      ctx.textAlign = "right";
      ctx.fillStyle = won ? "#55e487" : "#ff8a8a";
      ctx.font = "bold 28px sans-serif";
      ctx.fillText(won ? "胜利" : (youPlayer ? "惜败" : "结算"), W - edgeR - 12, headY + 12);
      ctx.fillStyle = "#8a9aa8";
      ctx.font = "12px sans-serif";
      ctx.fillText(`${title} · ${board.length} 阵营`, W - edgeR - 12, headY + 36);
      ctx.restore();

      // 本局星碎币：与服务器入账同一算法（仅胜利阵营按 K/D；失败为 0）
      if (youPlayer) {
        const k = Math.max(0, Number(youPlayer.kills) || 0);
        const d = Math.max(0, Number(youPlayer.deaths) || 0);
        const gain = won ? Math.round((d > 0 ? k / d : k) * 100) / 100 : 0;
        const label = won ? "本局星碎币" : "败方无星碎币";
        const val = `+${gain.toFixed(2)}`;
        ctx.save();
        ctx.textBaseline = "middle";
        ctx.font = "12px sans-serif";
        const lw = ctx.measureText(label).width;
        ctx.font = "bold 20px sans-serif";
        const vw = ctx.measureText(val).width;
        const bw = 40 + lw + 8 + vw + 14;
        const bh = 34;
        const bx = (W - bw) / 2;
        const by = headY + 4;
        rrect(ctx, bx, by, bw, bh, 8);
        const g = ctx.createLinearGradient(bx, by, bx + bw, by);
        g.addColorStop(0, "rgba(180,120,255,0.28)");
        g.addColorStop(1, "rgba(90,200,255,0.14)");
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = "rgba(200,160,255,0.55)";
        ctx.lineWidth = 1;
        ctx.stroke();
        const sx = bx + 20;
        const sy = by + bh / 2;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 4 : 9.5;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          if (i) ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
          else ctx.moveTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fillStyle = "#d9b8ff";
        ctx.fill();
        ctx.textAlign = "left";
        ctx.fillStyle = "#c9b6e8";
        ctx.font = "12px sans-serif";
        ctx.fillText(label, bx + 36, sy);
        ctx.fillStyle = gain > 0 ? "#f1e2ff" : "#8a9aa8";
        ctx.font = "bold 20px sans-serif";
        ctx.fillText(val, bx + 36 + lw + 8, sy + 1);
        ctx.restore();
      }

      const n = page === 1
        ? Math.max(1, Math.min(8, board.length))
        : Math.max(1, Math.min(8, board.reduce((s, g) => s + ((g.players && g.players.length) || 0), 0) || 1));
      const gap = n >= 7 ? 6 : n >= 5 ? 8 : 10;
      const cell = Math.min(H * 0.25, (W - edgeL - edgeR - 24 - (n - 1) * gap) / n, 150);
      const rowW = n * cell + (n - 1) * gap;
      const startX = (W - rowW) / 2;
      const startY = (H - cell) / 2;

      function drawSumAvatar(cx, cy, r, img, color, letter) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(8,14,22,0.85)";
        ctx.fill();
        let drew = false;
        if (img) {
          try {
            const iw = img.width || 0;
            const ih = img.height || 0;
            // 微信离屏 canvas / 未标尺寸时也尝试画；失败再字母兜底
            if (iw > 0 || ih > 0 || img.getContext || img.src) {
              ctx.save();
              ctx.beginPath();
              ctx.arc(cx, cy, r - 1.2, 0, Math.PI * 2);
              ctx.clip();
              ctx.drawImage(img, cx - r + 1.2, cy - r + 1.2, (r - 1.2) * 2, (r - 1.2) * 2);
              ctx.restore();
              drew = true;
            }
          } catch (e) {
            try { ctx.restore(); } catch (err) {}
            drew = false;
          }
        }
        if (!drew) {
          // 无头像：画微信式白底灰剪影空头像
          ctx.beginPath();
          ctx.arc(cx, cy, r - 1.2, 0, Math.PI * 2);
          ctx.fillStyle = "#f3f3f3";
          ctx.fill();
          ctx.fillStyle = "#c0c0c0";
          ctx.beginPath();
          ctx.arc(cx, cy - r * 0.12, r * 0.32, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(cx - r * 0.62, cy + r * 0.92);
          ctx.quadraticCurveTo(cx - r * 0.62, cy + r * 0.18, cx, cy + r * 0.18);
          ctx.quadraticCurveTo(cx + r * 0.62, cy + r * 0.18, cx + r * 0.62, cy + r * 0.92);
          ctx.closePath();
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = color || "#78d9ff";
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.restore();
      }

      function drawSumCell(x, y, size, color, rank, name, line2, bigNum, subNum, first, you, avatarImg, teamLabel) {
        ctx.save();
        rrect(ctx, x, y, size, size, 10);
        if (you && avatarImg === undefined) {
          // 阵营排行：己方阵营浅蓝底
          ctx.fillStyle = "rgba(120, 200, 255, 0.28)";
          ctx.fill();
          ctx.strokeStyle = first ? "#ffe08a" : "#9fd6ff";
          ctx.lineWidth = first ? 2 : 1.8;
        } else if (first) {
          ctx.fillStyle = "rgba(255, 224, 138, 0.14)";
          ctx.fill();
          ctx.strokeStyle = "#ffe08a";
          ctx.lineWidth = 2;
        } else {
          ctx.fillStyle = "rgba(6, 10, 16, 0.72)";
          ctx.fill();
          ctx.strokeStyle = color || "#78d9ff";
          ctx.lineWidth = 1.5;
        }
        ctx.stroke();
        if (you && avatarImg !== undefined) {
          ctx.strokeStyle = "rgba(120, 217, 255, 0.55)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        if (first) {
          rrect(ctx, x + 8, y + 8, 28, 14, 3);
          ctx.fillStyle = "#ffe08a";
          ctx.fill();
          ctx.fillStyle = "#1a1408";
          ctx.font = "bold 9px sans-serif";
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.fillText("冠军", x + 12, y + 10);
        }
        ctx.fillStyle = first ? "#ffe08a" : (color || "#78d9ff");
        ctx.font = `bold ${Math.max(16, size * 0.2)}px sans-serif`;
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        ctx.fillText(String(rank), x + size - 8, y + 6);

        // 玩家页：只画头像；阵营页用文字标题
        if (avatarImg !== undefined) {
          const ar = Math.max(14, size * 0.22);
          const letter = (teamLabel && String(teamLabel).length <= 2 && !/^阵营/.test(String(teamLabel)))
            ? String(teamLabel)
            : (Array.from(String(name || "?"))[0] || "?");
          drawSumAvatar(x + 10 + ar, y + size * 0.42, ar, avatarImg, color, letter);
        } else {
          ctx.textAlign = "left";
          ctx.fillStyle = first ? "#ffe08a" : (color || "#78d9ff");
          ctx.font = `bold ${Math.max(11, size * 0.11)}px sans-serif`;
          {
            const nc = Array.from(String(name || ""));
            const short = nc.length <= 5 ? nc.join("") : nc.slice(0, 5).join("") + "...";
            ctx.fillText(short, x + 10, y + size * 0.42);
          }
          if (line2) {
            ctx.fillStyle = "#8a9aa8";
            ctx.font = `${Math.max(9, size * 0.075)}px sans-serif`;
            ctx.fillText(String(line2).slice(0, 12), x + 10, y + size * 0.55);
          }
        }
        const bigStr = String(bigNum);
        ctx.fillStyle = "#e8f1f7";
        ctx.font = `bold ${Math.max(18, size * 0.26)}px sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(bigStr, x + 10, y + size * 0.86);
        if (subNum != null) {
          const bw = ctx.measureText(bigStr).width;
          ctx.fillStyle = "#d8c4c4";
          ctx.font = `${Math.max(10, size * 0.1)}px sans-serif`;
          ctx.fillText(String(subNum), x + 10 + bw + 8, y + size * 0.86);
        }
        ctx.restore();
      }

      if (page === 1) {
        const sorted = [...board].sort((a, b) => (a.rank || 99) - (b.rank || 99)).slice(0, 8);
        // 方块上方提示当前阵营
        if (youTeam) {
          const tip = `当前阵营：${(youTeam.team || 0) + 1}阵营`;
          ctx.save();
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 14px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(tip, W / 2, startY - 12);
          ctx.restore();
        }
        for (let i = 0; i < sorted.length; i++) {
          const g = sorted[i];
          const color = g.color || "#78d9ff";
          const first = (g.rank || 99) === 1;
          drawSumCell(
            startX + i * (cell + gap), startY, cell, color,
            g.rank || (i + 1),
            `阵营 ${(g.team || 0) + 1}`,
            "击杀总数",
            g.kills || 0,
            null,
            first,
            !!(youTeam && youTeam.team === g.team)
          );
        }
      } else {
        const list = [];
        for (const g of board) {
          const color = g.color || "#78d9ff";
          for (const p of (g.players || [])) {
            list.push({
              name: p.name || "玩家",
              kills: p.kills || 0,
              deaths: p.deaths || 0,
              you: !!p.you,
              team: Number.isFinite(Number(p.team)) ? p.team : (g.team || 0),
              color,
              avatarImg: p.avatarImg || null,
              avatarLetter: p.avatarLetter || (Array.from(String(p.name || "?"))[0] || "?"),
            });
          }
        }
        list.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
        // 最多 16 人：≤8 一排，>8 两排
        let capped = list.slice(0, 16);
        const me = list.find((p) => p.you);
        if (me && !capped.some((p) => p.you)) {
          capped = capped.filter((p) => !p.you).slice(0, 15);
          capped.push(me);
        }
        const total = Math.max(1, capped.length);
        const rows = total > 8 ? 2 : 1;
        const row1N = rows === 1 ? total : Math.ceil(total / 2);
        const row2N = total - row1N;
        const cols = Math.max(row1N, row2N, 1);
        const pGap = cols >= 7 ? 6 : cols >= 5 ? 8 : 10;
        const rowGap = 12;
        const btnReserve = 52;
        const topReserve = headY + 48;
        const availH = Math.max(80, H - topReserve - Math.max(safe.bottom || 8, 8) - btnReserve);
        const pCell = Math.min(
          rows === 1 ? H * 0.25 : (availH - rowGap) / 2,
          (W - edgeL - edgeR - 24 - (cols - 1) * pGap) / cols,
          rows === 1 ? 150 : 118
        );
        const blockH = rows * pCell + (rows - 1) * rowGap;
        const pY0 = topReserve + Math.max(0, (availH - blockH) / 2);
        const drawRow = (items, y, rankOffset) => {
          const n = items.length;
          if (!n) return;
          const rowW = n * pCell + (n - 1) * pGap;
          const x0 = (W - rowW) / 2;
          for (let i = 0; i < n; i++) {
            const p = items[i];
            const rank = rankOffset + i + 1;
            drawSumCell(
              x0 + i * (pCell + pGap), y, pCell, p.color,
              rank,
              p.name || "",
              null,
              p.kills,
              `死 ${p.deaths}`,
              rank === 1,
              p.you,
              p.avatarImg,
              p.avatarLetter || null
            );
          }
        };
        drawRow(capped.slice(0, row1N), pY0, 0);
        if (rows === 2) drawRow(capped.slice(row1N), pY0 + pCell + rowGap, row1N);
      }

      // 右下角并排小按钮
      const btnH = 32;
      const btnW1 = 108;
      const btnW2 = 88;
      const btnGap = 8;
      const bx2 = W - edgeR - 10 - btnW2;
      const bx1 = bx2 - btnGap - btnW1;
      const by = H - Math.max(safe.bottom || 8, 8) - 10 - btnH;
      const nextLabel = page === 1 ? "查看玩家战绩" : "返回阵营排名";
      drawBtn(ctx, bx1, by, btnW1, btnH, nextLabel, true, MODAL_BTN_Z, el("btnSummaryNext"));
      drawBtn(ctx, bx2, by, btnW2, btnH, "返回主页", false, MODAL_BTN_Z, el("btnSummaryOk"));
    }

    if (shown(el("menuModal"))) {
      addModalMask(el("menuModal"));
      dim();
      const pw = 280;
      const ph = 160;
      const x = (W - pw) / 2;
      const y = (H - ph) / 2;
      fillPanel(ctx, x, y, pw, ph);
      drawLabel(ctx, "菜单", x + 22, y + 28, "#fff", 20);
      drawBtn(ctx, x + 22, y + 52, pw - 44, 40, "退出房间", false, MODAL_BTN_Z, el("btnLeave"));
      drawBtn(ctx, x + 22, y + 102, pw - 44, 36, "取消", false, MODAL_BTN_Z, el("btnCancel"));
    }

    if (shown(el("settingsModal"))) {
      addModalMask(el("settingsModal"));
      dim();
      const pw = 300;
      const ph = 168;
      const x = (W - pw) / 2;
      const y = (H - ph) / 2;
      fillPanel(ctx, x, y, pw, ph);
      drawLabel(ctx, "设置", x + 22, y + 28, "#fff", 20);
      const muted = !!(typeof GameGlobal !== "undefined" && GameGlobal.sfxMuted);
      const muteLabel = muted ? "音效：关（点击开启）" : "音效：开（点击静音）";
      el("btnMuteToggle").textContent = muteLabel;
      drawBtn(ctx, x + 22, y + 54, pw - 44, 40, muteLabel, !muted, MODAL_BTN_Z, el("btnMuteToggle"));
      drawSpeakerIcon(ctx, x + 44, y + 74, 10, muted);
      drawBtn(ctx, x + 22, y + 110, pw - 44, 32, "关闭", false, MODAL_BTN_Z, el("btnSettingsClose"));
    }

    if (shown(el("historyModal"))) {
      addModalMask(el("historyModal"));
      dim();
      const pw = Math.min(500, W - 16);
      const ph = Math.min(H - 40, 340);
      const x = (W - pw) / 2;
      const y = (H - ph) / 2;
      fillPanel(ctx, x, y, pw, ph);
      drawLabel(ctx, "个人中心 · 历史战绩", x + 22, y + 26, "#fff", 18);
      {
        // 标题旁小字提示：最多展示 10 条
        ctx.save();
        ctx.font = "11px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const titleW = (() => {
          ctx.font = "18px sans-serif";
          return ctx.measureText("个人中心 · 历史战绩").width;
        })();
        ctx.font = "11px sans-serif";
        ctx.fillStyle = "#8a9aa8";
        ctx.fillText("最多显示最近10条", x + 22 + titleW + 10, y + 26);
        ctx.restore();
      }
      const rows = (typeof GameGlobal !== "undefined" && Array.isArray(GameGlobal.historyRows))
        ? GameGlobal.historyRows.slice(0, 10)
        : [];
      const tip = (typeof GameGlobal !== "undefined" && GameGlobal.historyTip) || "";
      // 按面板宽度比例排列表头，避免窄屏溢出
      const colWhen = x + Math.round(pw * 0.04);
      const colKind = x + Math.round(pw * 0.34);
      const colKill = x + Math.round(pw * 0.46);
      const colDeath = x + Math.round(pw * 0.62);
      const colRank = x + Math.round(pw * 0.82);
      let ly = y + 52;
      ctx.save();
      ctx.font = `${pw < 360 ? 11 : 12}px sans-serif`;
      ctx.textBaseline = "middle";
      if (!rows.length) {
        ctx.textAlign = "left";
        ctx.fillStyle = "#8a9aa8";
        ctx.fillText(tip || "暂无完整对局记录（中途退出不计入）", x + 22, ly);
      } else {
        ctx.textAlign = "left";
        ctx.fillStyle = "#8a9aa8";
        ctx.fillText("时间", colWhen, ly);
        ctx.fillText("模式", colKind, ly);
        ctx.fillText("击杀", colKill, ly);
        ctx.fillText("阵亡", colDeath, ly);
        ctx.fillText("名次", colRank, ly);
        ly += 22;
        const maxY = y + ph - 56;
        for (let i = 0; i < rows.length; i++) {
          if (ly > maxY) break;
          const r = rows[i];
          let when = "--";
          if (r.endedAt) {
            const d = new Date(r.endedAt);
            if (!Number.isNaN(d.getTime())) {
              const pad = (n) => String(n).padStart(2, "0");
              when = pw < 360
                ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
                : `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
            }
          }
          const kind = r.kind === "room" ? "开房" : "匹配";
          const kills = Number(r.kills) || 0;
          const deaths = Number(r.deaths) || 0;
          const rank = r.teamRank != null ? `第${r.teamRank}` : "-";
          ctx.fillStyle = "#d5e2ea";
          ctx.fillText(when, colWhen, ly);
          ctx.fillText(kind, colKind, ly);
          ctx.fillStyle = "#7dffb0";
          ctx.fillText(String(kills), colKill, ly);
          ctx.fillStyle = "#ff9a9a";
          ctx.fillText(String(deaths), colDeath, ly);
          ctx.fillStyle = "#d5e2ea";
          ctx.fillText(rank, colRank, ly);
          ly += 20;
        }
      }
      ctx.restore();
      drawBtn(ctx, x + 22, y + ph - 44, pw - 44, 32, "返回", false, MODAL_BTN_Z, el("btnHistoryClose"));
    }

    // 个人中心：方格模块入口
    if (shown(el("profileHub"))) {
      addModalMask(el("profileHub"));
      dim();
      const pw = Math.min(520, W - 16);
      const ph = Math.min(H - 40, 260);
      const x = (W - pw) / 2;
      const y = (H - ph) / 2;
      fillPanel(ctx, x, y, pw, ph);
      drawLabel(ctx, "个人中心", x + 22, y + 26, "#fff", 18);
      const mods = [
        { title: "历史对战", desc: "最近对局记录", accent: "#7ad7ff", icon: "history", node: el("btnHubHistory") },
        { title: "战果统计", desc: "击杀 · 胜场 · K/D", accent: "#ffe08a", icon: "stats", node: el("btnHubStats") },
        { title: "武器改装", desc: "主炮 · 副武器 · 引擎", accent: "#78ff5a", icon: "garage", node: el("btnHubGarage") },
      ];
      const gap = 14;
      const areaTop = y + 50;
      const areaH = ph - 50 - 56;
      const side = Math.max(80, Math.min(130, areaH, (pw - 44 - gap * 2) / 3));
      const rowW = side * 3 + gap * 2;
      const sx = x + (pw - rowW) / 2;
      const sy = areaTop + (areaH - side) / 2;
      mods.forEach((m, i) => {
        const bx = sx + i * (side + gap);
        drawAccentBoard(ctx, bx, sy, side, side, m.accent);
        drawHubIcon(ctx, m.icon, bx + side / 2 + 2, sy + side * 0.36, side / 110, m.accent);
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#e8f2f8";
        ctx.font = `bold ${Math.round(Math.max(13, side * 0.13))}px sans-serif`;
        ctx.fillText(m.title, bx + side / 2 + 2, sy + side * 0.7);
        ctx.fillStyle = "#9eb0c0";
        ctx.font = `${Math.round(Math.max(10, side * 0.09))}px sans-serif`;
        ctx.fillText(m.desc, bx + side / 2 + 2, sy + side * 0.86);
        ctx.restore();
        addHit(m.node, bx, sy, side, side, MODAL_BTN_Z);
      });
      drawBtn(ctx, x + 22, y + ph - 44, pw - 44, 32, "关闭", false, MODAL_BTN_Z, el("btnHubClose"));
    }

    // 战果统计：由历史对局汇总
    if (shown(el("statsModal"))) {
      addModalMask(el("statsModal"));
      dim();
      const pw = Math.min(500, W - 16);
      const ph = Math.min(H - 20, 350);
      const x = (W - pw) / 2;
      const y = (H - ph) / 2;
      fillPanel(ctx, x, y, pw, ph);
      const rows = (typeof GameGlobal !== "undefined" && Array.isArray(GameGlobal.historyRows)) ? GameGlobal.historyRows : [];
      const career = (typeof GameGlobal !== "undefined" && GameGlobal.playerStats) || null;
      const lastRow = rows[0];
      const shards = {
        total: career ? Number(career.starShards) || 0 : 0,
        last: lastRow ? (lastRow.deaths ? lastRow.kills / lastRow.deaths : Number(lastRow.kills) || 0) : 0,
      };
      {
        const bx = x + 22;
        const by = y + 46;
        const bw = pw - 44;
        const bh = 44;
        ctx.save();
        const g = ctx.createLinearGradient(bx, by, bx + bw, by);
        g.addColorStop(0, "rgba(180,120,255,0.22)");
        g.addColorStop(1, "rgba(90,200,255,0.10)");
        ctx.fillStyle = g;
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = "rgba(200,160,255,0.45)";
        ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
        // 星形徽记
        const sx = bx + 24;
        const sy = by + bh / 2;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 5 : 12;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const px = sx + Math.cos(a) * r;
          const py = sy + Math.sin(a) * r;
          if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = "#d9b8ff";
        ctx.fill();
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillStyle = "#c9b6e8";
        ctx.font = "12px sans-serif";
        ctx.fillText("星碎币", bx + 44, sy);
        ctx.fillStyle = "#f1e2ff";
        ctx.font = "bold 22px sans-serif";
        ctx.fillText((Number(shards.total) || 0).toFixed(2), bx + 92, sy + 1);
        ctx.textAlign = "right";
        ctx.font = "11px sans-serif";
        ctx.fillStyle = "#8a9aa8";
        const last = Number(shards.last) || 0;
        ctx.fillText(last > 0 ? `上局 +${last.toFixed(2)}` : "每局战后累加", bx + bw - 12, sy);
        ctx.restore();
      }
      drawLabel(ctx, "战果统计", x + 22, y + 26, "#fff", 18);
      ctx.save();
      ctx.font = "11px sans-serif";
      ctx.fillStyle = "#8a9aa8";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(career ? "生涯累计" : rows.length ? `基于最近 ${rows.length} 局` : "", x + pw - 22, y + 26);
      ctx.restore();
      // 优先用数据库生涯汇总；未拉到时退回最近对局
      let games = 0, kills = 0, deaths = 0, best = 0, firsts = 0, rooms = 0;
      if (career) {
        rooms = Number(career.roomCount) || 0;
        games = (Number(career.matchCount) || 0) + rooms;
        kills = Number(career.kills) || 0;
        deaths = Number(career.deaths) || 0;
        best = Number(career.bestKills) || 0;
        firsts = Number(career.firstCount) || 0;
      } else {
        games = rows.length;
        for (const r of rows) {
          const k = Number(r.kills) || 0;
          kills += k;
          deaths += Number(r.deaths) || 0;
          if (k > best) best = k;
          if (Number(r.teamRank) === 1) firsts += 1;
          if (r.kind === "room") rooms += 1;
        }
      }
      if (!games) {
        const tip = (typeof GameGlobal !== "undefined" && GameGlobal.historyTip) || "暂无完整对局记录（中途退出不计入）";
        drawLabel(ctx, tip, x + 22, y + 120, "#8a9aa8", 12);
      } else {
        const cells = [
          ["对局", String(games), "#e8f2f8"],
          ["总击杀", String(kills), "#7dffb0"],
          ["总阵亡", String(deaths), "#ff9a9a"],
          ["单局最佳", `${best} 杀`, "#7ad7ff"],
          ["阵营第一", `${firsts} 次`, "#78ff5a"],
          ["匹配 / 开房", `${games - rooms} / ${rooms}`, "#d5e2ea"],
          ["场均击杀", (kills / games).toFixed(1), "#7dffb0"],
        ];
        const cols = 4;
        const gap = 10;
        const cw = (pw - 44 - gap * (cols - 1)) / cols;
        const ch = Math.min(64, (ph - 100 - 56 - gap) / 2);
        cells.forEach(([k, v, c], i) => {
          const row = Math.floor(i / cols);
          const inRow = Math.min(cols, cells.length - row * cols);
          const rowX = x + 22 + ((cols - inRow) * (cw + gap)) / 2;
          const cx = rowX + (i % cols) * (cw + gap);
          const cy = y + 100 + row * (ch + gap);
          ctx.save();
          ctx.fillStyle = "rgba(255,255,255,0.04)";
          ctx.fillRect(cx, cy, cw, ch);
          ctx.strokeStyle = "rgba(140,200,220,0.18)";
          ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#8a9aa8";
          ctx.font = "11px sans-serif";
          ctx.fillText(k, cx + cw / 2, cy + ch * 0.3);
          ctx.fillStyle = c;
          ctx.font = "bold 18px sans-serif";
          ctx.fillText(v, cx + cw / 2, cy + ch * 0.66);
          ctx.restore();
        });
      }
      drawBtn(ctx, x + 22, y + ph - 44, pw - 44, 32, "返回", false, MODAL_BTN_Z, el("btnStatsClose"));
    }

    if (shown(el("nameModal"))) {
      addModalMask(el("nameModal"));
      dim();
      const pw = 300;
      const ph = 180;
      const x = (W - pw) / 2;
      const y = (H - ph) / 2;
      fillPanel(ctx, x, y, pw, ph);
      drawLabel(ctx, "修改名称", x + 22, y + 28, "#fff", 20);
      ctx.save();
      rrect(ctx, x + 22, y + 52, pw - 44, 36, 10);
      ctx.fillStyle = "#0e141c";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.stroke();
      ctx.fillStyle = el("nameInput").value ? "#fff" : "#6a7784";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(el("nameInput").value || "最多10个字", x + 34, y + 70);
      ctx.restore();
      addHit(el("nameInput"), x + 22, y + 52, pw - 44, 36, MODAL_BTN_Z);
      drawBtn(ctx, x + 22, y + 102, pw - 44, 32, "保存", true, MODAL_BTN_Z, el("btnNameSave"));
      drawBtn(ctx, x + 22, y + 140, pw - 44, 28, "取消", false, MODAL_BTN_Z, el("btnNameCancel"));
    }

    if (shown(el("authModal"))) {
      addModalMask(el("authModal"));
      dim();
      const pw = 320;
      const ph = 178;
      const x = (W - pw) / 2;
      const y = (H - ph) / 2;
      fillPanel(ctx, x, y, pw, ph);
      drawLabel(ctx, "微信授权", x + pw / 2, y + 30, "#fff", 18, "center");
      drawLabel(ctx, "未授权将不记录分数和排名", x + pw / 2, y + 62, "#c5d4e2", 13, "center");
      drawLabel(ctx, "是否授权微信昵称与头像？", x + pw / 2, y + 86, "#9aa6b2", 12, "center");
      const bw = (pw - 44 - 10) / 2;
      drawBtn(ctx, x + 22, y + 118, bw, 36, "否", false, MODAL_BTN_Z, el("btnAuthNo"));
      drawBtn(ctx, x + 22 + bw + 10, y + 118, bw, 36, "授权", true, MODAL_BTN_Z, el("btnAuthYes"));
    }

    if (shown(el("leaveConfirmModal"))) {
      addModalMask(el("leaveConfirmModal"));
      dim();
      const pw = 320;
      const ph = 168;
      const x = (W - pw) / 2;
      const y = (H - ph) / 2;
      fillPanel(ctx, x, y, pw, ph);
      drawLabel(ctx, "退出房间", x + pw / 2, y + 34, "#fff", 18, "center");
      drawLabel(ctx, "退出后房间将解散，是否退出？", x + pw / 2, y + 72, "#c5d4e2", 13, "center");
      const bw = (pw - 44 - 10) / 2;
      drawBtn(ctx, x + 22, y + 110, bw, 36, "取消", false, MODAL_BTN_Z, el("btnLeaveConfirmNo"));
      drawBtn(ctx, x + 22 + bw + 10, y + 110, bw, 36, "退出", true, MODAL_BTN_Z, el("btnLeaveConfirmYes"));
    }

    // 助战星碎不足：统一提示窗（优先于输入邀请码）
    if (shown(el("assistStarModal"))) {
      drawAssistStarShortageModal(ctx, W, H);
    } else if (assistJoinModalOn()) {
      addModalMask(el("assistJoinModal"));
      dim();
      const pw = 320;
      const ph = 188;
      const x = (W - pw) / 2;
      const y = (H - ph) / 2;
      fillPanel(ctx, x, y, pw, ph);
      drawLabel(ctx, "去助战", x + pw / 2, y + 30, "#fff", 18, "center");
      drawLabel(ctx, "输入好友的助战邀请码（房号）", x + pw / 2, y + 58, "#c5d4e2", 12, "center");
      const ix = x + 28, iy = y + 82, iw = pw - 56, ih = 36;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(ix, iy, iw, ih);
      ctx.strokeStyle = "rgba(140,200,220,0.4)";
      ctx.strokeRect(ix, iy, iw, ih);
      ctx.fillStyle = el("assistCodeInput").value ? "#fff" : "#6a7784";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(el("assistCodeInput").value || "4 位邀请码", ix + iw / 2, iy + ih / 2);
      ctx.restore();
      addHit(el("assistCodeInput"), ix, iy, iw, ih, MODAL_BTN_Z);
      const bw = (pw - 44 - 10) / 2;
      drawBtn(ctx, x + 22, y + 136, bw, 36, "取消", false, MODAL_BTN_Z, el("btnAssistJoinCancel"));
      drawBtn(ctx, x + 22 + bw + 10, y + 136, bw, 36, "进入", true, MODAL_BTN_Z, el("btnAssistJoinOk"));
    }

    // 失败弹窗：display 或 levelFailHold 任一成立都画（防止被 setPhase/重连清掉 display）
    const failModalNode = el("levelFailModal");
    const failModalForce = !!GameGlobal.levelFailHold;
    if (failModalForce && failModalNode && !shown(failModalNode)) {
      try { failModalNode.style.display = "grid"; } catch (e) {}
    }
    if (shown(failModalNode) || failModalForce) {
      addModalMask(failModalNode);
      ctx.fillStyle = "rgba(4, 6, 10, 0.72)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(60, 68, 78, 0.18)";
      ctx.fillRect(0, 0, W, H);
      const assistGuestFail = !!GameGlobal.assistFailOnlyOk;
      const assistHostFail = !assistGuestFail && !!GameGlobal.assistCoopPlaying;
      const pw = 320;
      const ph = (assistGuestFail || assistHostFail) ? 168 : 228;
      const x = (W - pw) / 2;
      const y = (H - ph) / 2;
      fillPanel(ctx, x, y, pw, ph);
      if (assistGuestFail) {
        drawLabel(ctx, "助战失败", x + pw / 2, y + 40, "#ff8a8a", 20, "center");
        drawLabel(ctx, "机体已被击毁", x + pw / 2, y + 76, "#c5d4e2", 13, "center");
        drawBtn(ctx, x + 70, y + 112, 180, 36, "确定", true, MODAL_BTN_Z, el("btnLevelFailMap"));
      } else if (GameGlobal.assistCoopPlaying) {
        drawLabel(ctx, "任务失败", x + pw / 2, y + 40, "#ff8a8a", 20, "center");
        drawLabel(ctx, "机体已被击毁", x + pw / 2, y + 76, "#c5d4e2", 13, "center");
        drawBtn(ctx, x + 70, y + 112, 180, 36, "返回航图", true, MODAL_BTN_Z, el("btnLevelFailMap"));
      } else {
        drawLabel(ctx, "任务失败", x + pw / 2, y + 34, "#ff8a8a", 20, "center");
        drawLabel(ctx, "机体已被击毁", x + pw / 2, y + 70, "#c5d4e2", 13, "center");
        const bw = (pw - 44 - 10) / 2;
        drawBtn(ctx, x + 22, y + 104, pw - 44, 36, "复活", true, MODAL_BTN_Z, el("btnLevelRevive"));
        drawBtn(ctx, x + 22, y + 150, bw, 36, "再来一次", false, MODAL_BTN_Z, el("btnLevelRetry"));
        drawBtn(ctx, x + 22 + bw + 10, y + 150, bw, 36, "返回航图", false, MODAL_BTN_Z, el("btnLevelFailMap"));
      }
    } else if (shown(el("levelWinModal"))) {
      addModalMask(el("levelWinModal"));
      // 过关：画面不变暗，只加一层淡蒙层
      ctx.fillStyle = "rgba(40, 28, 16, 0.18)";
      ctx.fillRect(0, 0, W, H);
      const pw = 300;
      const ph = 200;
      const x = (W - pw) / 2;
      const y = (H - ph) / 2;
      // 旧纸张成功卡
      ctx.save();
      ctx.fillStyle = "rgba(40, 24, 10, 0.28)";
      ctx.beginPath();
      parchmentPath(ctx, x + 4, y + 5, pw, ph);
      ctx.fill();
      const pg = ctx.createLinearGradient(x, y, x + pw, y + ph);
      pg.addColorStop(0, "#efe0c0");
      pg.addColorStop(0.4, "#e2c89a");
      pg.addColorStop(1, "#c9a572");
      ctx.fillStyle = pg;
      ctx.beginPath();
      parchmentPath(ctx, x, y, pw, ph);
      ctx.fill();
      ctx.strokeStyle = "rgba(110, 72, 36, 0.55)";
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.beginPath();
      parchmentPath(ctx, x, y, pw, ph);
      ctx.clip();
      for (let i = 0; i < 56; i++) {
        ctx.fillStyle = i % 3 === 0 ? "rgba(90,55,25,0.08)" : "rgba(255,240,210,0.1)";
        ctx.fillRect(x + 8 + (i * 53) % (pw - 16), y + 8 + (i * 29) % (ph - 16), 1.2, 1.2);
      }
      ctx.fillStyle = "rgba(140, 90, 40, 0.08)";
      ctx.beginPath();
      ctx.arc(x + pw * 0.2, y + ph * 0.72, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#5a3820";
      ctx.font = "bold 22px Georgia, serif";
      ctx.fillText("任务成功", x + pw / 2, y + 52);
      ctx.fillStyle = "#7a5636";
      ctx.font = "13px Georgia, serif";
      ctx.fillText("本关已通关", x + pw / 2, y + 88);
      ctx.restore();
      // 墨褐纸色按钮
      const bx = x + 50, by = y + 128, bw = pw - 100, bh = 38;
      addHit(el("btnLevelWinMap"), bx, by, bw, bh, MODAL_BTN_Z);
      ctx.save();
      rrect(ctx, bx, by, bw, bh, 8);
      ctx.fillStyle = "rgba(92, 58, 28, 0.88)";
      ctx.fill();
      ctx.strokeStyle = "rgba(60, 36, 16, 0.7)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#f3e6c8";
      ctx.font = "14px Georgia, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("返回航图", bx + bw / 2, by + bh / 2 + 1);
      ctx.restore();
    } else if (assistReadyModalOn()) {
      addModalMask(el("assistReadyModal"));
      dim();
      const ready = !!assistGuestReady;
      const pw = 320;
      const ph = ready ? 200 : 248;
      const x = (W - pw) / 2;
      const y = (H - ph) / 2;
      fillPanel(ctx, x, y, pw, ph);
      drawLabel(ctx, "关卡助战", x + pw / 2, y + 28, "#fff", 18, "center");
      drawLabel(ctx, assistGuestMeta.title || "等待开战", x + pw / 2, y + 56, "#ffe08a", 13, "center");
      drawLabel(ctx, "邀请码 " + (assistGuestMeta.code || "----"), x + pw / 2, y + 80, "#9eb0c0", 12, "center");
      drawLabel(ctx, ready ? "已准备 · 等待房主开战" : "是否准备助战？", x + pw / 2, y + 106, "#c5d4e2", 13, "center");
      const bw = (pw - 44 - 10) / 2;
      let by = y + 136;
      if (!ready) {
        drawBtn(ctx, x + 22, by, pw - 44, 36, "武器改装", false, MODAL_BTN_Z, el("btnAssistGarage"));
        by += 44;
      }
      drawBtn(ctx, x + 22, by, bw, 36, "离开", false, MODAL_BTN_Z, el("btnAssistLeave"));
      drawBtn(ctx, x + 22 + bw + 10, by, bw, 36, ready ? "取消准备" : "准备", true, MODAL_BTN_Z, el("btnAssistReady"));
    } else if (shown(el("matchLostModal"))) {
      addModalMask(el("matchLostModal"));
      dim();
      const pw = 300;
      const ph = 168;
      const x = (W - pw) / 2;
      const y = (H - ph) / 2;
      fillPanel(ctx, x, y, pw, ph);
      drawLabel(ctx, "连接已断开", x + pw / 2, y + 34, "#ff8a8a", 18, "center");
      drawLabel(ctx, "网络已断开，恢复后自动继续", x + pw / 2, y + 66, "#9aa6b2", 13, "center");
      drawBtn(ctx, x + 70, y + 104, 160, 36, "返回主页", false, MODAL_BTN_Z, el("matchLostHome"));
    } else if (shown(el("fullModal"))) {
      addModalMask(el("fullModal"));
      dim();
      const pw = 280;
      const ph = 150;
      const x = (W - pw) / 2;
      const y = (H - ph) / 2;
      fillPanel(ctx, x, y, pw, ph);
      drawLabel(ctx, "当前人数已满", x + pw / 2, y + 36, "#ff8a8a", 18, "center");
      drawLabel(ctx, el("fullDetail").textContent || "", x + pw / 2, y + 64, "#9aa6b2", 13, "center");
      drawBtn(ctx, x + 70, y + 92, 140, 36, "重试", false, MODAL_BTN_Z, el("fullRetry"));
    } else if (shown(el("offline"))) {
      addModalMask(el("offline"));
      dim();
      const pw = 300;
      const ph = 168;
      const x = (W - pw) / 2;
      const y = (H - ph) / 2;
      fillPanel(ctx, x, y, pw, ph);
      drawLabel(ctx, "连接已断开", x + pw / 2, y + 36, "#ff8a8a", 18, "center");
      const tip = (el("offline").textContent || "").trim() || "正在尝试重新连接…";
      drawLabel(ctx, tip.slice(0, 28), x + pw / 2, y + 70, "#9aa6b2", 13, "center");
      // 点遮罩/面板任意处强制重连（DOM click 走 offline 节点）
      drawBtn(ctx, x + 70, y + 108, 160, 36, "重新连接", true, MODAL_BTN_Z, el("offline"));
    }
  }

  GameGlobal.wxOverlay = overlay;
  GameGlobal.WS_URL = "wss://game.hunchun828.top/";

  function mapTouchXY(t) {
    let x = Number(t.clientX);
    let y = Number(t.clientY);
    // 横屏游戏：系统若仍报竖屏触点，转到与 overlayW/H 一致的坐标系（苹果机常见）
    if (overlayW > overlayH && Number.isFinite(x) && Number.isFinite(y)) {
      let info = null;
      try { info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync(); } catch (e) {}
      const ww = Number((info && info.windowWidth) || visualViewport.width || 0);
      const wh = Number((info && info.windowHeight) || visualViewport.height || 0);
      if (ww > 0 && wh > ww) {
        // 竖屏上报 → 顺时针转到横屏逻辑坐标
        const nx = y;
        const ny = ww - x;
        x = nx * (overlayW / Math.max(1, wh));
        y = ny * (overlayH / Math.max(1, ww));
        return { x, y };
      }
      if (ww > 0 && wh > 0) {
        x = x * (overlayW / ww);
        y = y * (overlayH / wh);
      }
    }
    return { x, y };
  }
  function onTouchStart(e) {
    const list = e.changedTouches || e.touches || [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const pt = mapTouchXY(t);
      const x = pt.x;
      const y = pt.y;
      const id = t.identifier;
      // 助战星碎不足窗：优先 overlay 按钮，不吞进航图触摸
      if (shown(el("assistStarModal"))) {
        const node = hitAt(x, y);
        if (node === el("btnAssistStarOk") || node === el("assistStarModal")) {
          try { closeAssistStarShortageModal(); } catch (err) {}
        }
        continue;
      }
      if (garageActive()) {
        garageTouches.add(id);
        garage.touchStart([{ id, x, y }]);
        continue;
      }
      if (levelsActive()) {
        levelsTouches.add(id);
        levels.touchStart([{ id, x, y }]);
        continue;
      }
      let node = hitAt(x, y);
      // 下拉菜单打开时：点选项赋值，点遮罩关闭；点到功能按钮则关菜单并继续触发点击
      if (selectMenu) {
        if (node === el("__selectMenu")) {
          const idx = Math.floor((y - selectMenu.y) / selectMenu.rowH);
          const row = selectMenu.list[idx];
          if (row) el(selectMenu.id).value = String(row.v);
          closeSelect();
          continue;
        }
        if (node === el("__selectMask")
          || node === el("matchDur")
          || node === el("createDur")
          || node === el("teamCount")
          || node === el("perTeam")) {
          // 点到另一个 select：先关再开；点遮罩：只关
          const reopen = (node === el("matchDur") || node === el("createDur") || node === el("teamCount") || node === el("perTeam")) ? node : null;
          closeSelect();
          if (reopen === el("matchDur")) openSelect("matchDur", MATCH_DUR, reopen.__selectBox);
          else if (reopen === el("createDur")) openSelect("createDur", DUR, reopen.__selectBox);
          else if (reopen === el("teamCount")) openSelect("teamCount", TEAM_OPTS, reopen.__selectBox);
          else if (reopen === el("perTeam")) openSelect("perTeam", PER_TEAM_OPTS, reopen.__selectBox);
          continue;
        }
        closeSelect();
        const passThrough = node === el("btnCreate")
          || node === el("btnJoin")
          || node === el("btnMatch")
          || node === el("btnLobbySolo")
          || node === el("btnLobbyParty")
          || node === el("btnLobbyLevels")
          || node === el("btnLobbyAssist")
          || node === el("btnLobbyBack")
          || node === el("btnStart")
          || node === el("btnRally")
          || node === el("btnWaitLeave")
          || node === el("btnInvite")
          || node === el("btnAssistReady")
          || node === el("btnAssistGarage")
          || node === el("btnAssistLeave")
          || node === el("btnAssistJoinOk")
          || node === el("btnAssistJoinCancel");
        if (!passThrough) continue;
      }
      if (node === el("trainGuideNext")) {
        try {
          if (typeof GameGlobal.advanceTrainGuide === "function") GameGlobal.advanceTrainGuide();
        } catch (err) {}
        node.__skipClick = true;
        continue;
      }
      if (node === el("trainGuideSkip")) {
        try {
          if (typeof GameGlobal.skipTrainGuide === "function") GameGlobal.skipTrainGuide();
        } catch (err) {}
        node.__skipClick = true;
        continue;
      }
      // 引导中：吞掉一切操作触控（含半屏摇杆/开火），只留引导按钮
      if (GameGlobal.trainGuide && GameGlobal.trainGuide.active) {
        if (node === el("__trainGuideBlock")
          || node === el("flyBtn") || node === el("fireBtn")
          || node === el("weapA") || node === el("weapB")
          || node === el("slider") || node === el("gearBtn")) {
          continue;
        }
      }
      if (node === el("matchDur")) {
        openSelect("matchDur", MATCH_DUR, node.__selectBox);
        continue;
      }
      if (node === el("createDur")) {
        openSelect("createDur", DUR, node.__selectBox);
        continue;
      }
      if (node === el("teamCount")) {
        openSelect("teamCount", TEAM_OPTS, node.__selectBox);
        continue;
      }
      if (node === el("perTeam")) {
        openSelect("perTeam", PER_TEAM_OPTS, node.__selectBox);
        continue;
      }
      if (node === el("roomCodeInput")) {
        openKeyboard("roomCodeInput", 4);
        continue;
      }
      if (node === el("assistCodeInput")) {
        openKeyboard("assistCodeInput", 4);
        continue;
      }
      if (node === el("nameInput")) {
        openKeyboard("nameInput", 10);
        continue;
      }
      if (!node) node = canvas;
      captures.set(id, node);
      dispatch(node, "pointerdown", x, y, id);
      winEmit("pointerdown", makeEvent("pointerdown", x, y, id, node));
      // 开房/进房：touchstart 立刻触发，避免被后续 touchcancel 吃掉 click
      if (node === el("btnCreate")) {
        try {
          if (typeof GameGlobal.requestCreateRoom === "function") GameGlobal.requestCreateRoom();
          else dispatch(node, "click", x, y, id);
        } catch (err) { dispatch(node, "click", x, y, id); }
        node.__skipClick = true;
      } else if (node === el("btnJoin")) {
        try {
          if (typeof GameGlobal.requestJoinRoom === "function") GameGlobal.requestJoinRoom();
          else dispatch(node, "click", x, y, id);
        } catch (err) { dispatch(node, "click", x, y, id); }
        node.__skipClick = true;
      } else if (node && node.dataset && node.dataset.kick === "1") {
        try {
          if (typeof GameGlobal.kickWaitMember === "function") {
            GameGlobal.kickWaitMember(node.__kickTarget || null);
          }
        } catch (err) {}
        node.__skipClick = true;
      } else if (node && (node.dataset && node.dataset.team != null)
        && (node.dataset.empty === "1" || (node.parent && node.parent.id === "teamPick"))) {
        // 点空位 / 阵营格：立刻换队，避免 touchcancel 吞掉 click
        try {
          const team = Number(node.dataset.team);
          if (Number.isFinite(team) && typeof GameGlobal.requestWaitTeam === "function") {
            GameGlobal.requestWaitTeam(team);
          } else {
            dispatch(node, "click", x, y, id);
          }
        } catch (err) { dispatch(node, "click", x, y, id); }
        node.__skipClick = true;
      }
    }
  }
  function onTouchMove(e) {
    const list = e.changedTouches || e.touches || [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const pt = mapTouchXY(t);
      if (garageTouches.has(t.identifier)) {
        if (garage) garage.touchMove([{ id: t.identifier, x: pt.x, y: pt.y }]);
        continue;
      }
      if (levelsTouches.has(t.identifier)) {
        if (levels) levels.touchMove([{ id: t.identifier, x: pt.x, y: pt.y }]);
        continue;
      }
      const node = captures.get(t.identifier) || canvas;
      dispatch(node, "pointermove", pt.x, pt.y, t.identifier);
      winEmit("pointermove", makeEvent("pointermove", pt.x, pt.y, t.identifier, node));
    }
  }
  function onTouchEnd(e) {
    const list = e.changedTouches || [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const pt = mapTouchXY(t);
      if (garageTouches.has(t.identifier)) {
        garageTouches.delete(t.identifier);
        if (garage) garage.touchEnd([{ id: t.identifier, x: pt.x, y: pt.y }]);
        continue;
      }
      if (levelsTouches.has(t.identifier)) {
        levelsTouches.delete(t.identifier);
        if (levels) levels.touchEnd([{ id: t.identifier, x: pt.x, y: pt.y }]);
        continue;
      }
      const node = captures.get(t.identifier);
      captures.delete(t.identifier);
      if (!node) continue;
      dispatch(node, "pointerup", pt.x, pt.y, t.identifier);
      if (node.__skipClick) node.__skipClick = false;
      else dispatch(node, "click", pt.x, pt.y, t.identifier);
      winEmit("pointerup", makeEvent("pointerup", pt.x, pt.y, t.identifier, node));
    }
  }
  wx.onTouchStart(onTouchStart);
  wx.onTouchMove(onTouchMove);
  wx.onTouchEnd(onTouchEnd);
  wx.onTouchCancel(onTouchEnd);

  wx.onWindowResize((res) => {
    let ww = Number(res.windowWidth || 0);
    let wh = Number(res.windowHeight || 0);
    if (ww > 0 && wh > ww) {
      const t = ww; ww = wh; wh = t;
    }
    if (ww > 0) visualViewport.width = ww;
    if (wh > 0) visualViewport.height = wh;
    try {
      if (windowObj.visualViewport) {
        if (ww > 0) windowObj.visualViewport.width = ww;
        if (wh > 0) windowObj.visualViewport.height = wh;
      }
    } catch (e) {}
    try { computeSafeUI(); } catch (e) {}
    winEmit("resize", {});
    try {
      if (typeof windowObj.dispatchEvent === "function") windowObj.dispatchEvent({ type: "resize" });
    } catch (e) {}
  });
  try {
    wx.showShareMenu && wx.showShareMenu({ withShareTicket: true, menus: ["shareAppMessage", "shareTimeline"] });
  } catch (e) {}

  function emitWxShow(res) {
    document.visibilityState = "visible";
    const payload = res || {};
    try {
      if (typeof GameGlobal !== "undefined") GameGlobal.__wxShowPending = payload;
    } catch (e) {}
    try {
      if (typeof GameGlobal !== "undefined" && typeof GameGlobal.onWxShow === "function") {
        GameGlobal.onWxShow(payload);
      }
    } catch (e) {}
  }
  try {
    const launch = wx.getLaunchOptionsSync && wx.getLaunchOptionsSync();
    if (launch) emitWxShow(launch);
  } catch (e) {}
  wx.onShow((res) => {
    emitWxShow(res || {});
  });
  wx.onHide(() => {
    document.visibilityState = "hidden";
    winEmit("blur", {});
  });
})();
