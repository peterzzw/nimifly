/**
 * 微信小游戏分包懒加载
 * - feature：机库 / 测试机器人（点机库或测试局再下）
 * - levels：关卡航图（点进关卡再下，不预取）
 * - craft：机体图集 res/（资源分包，可后台预取）
 * 非微信环境直接 require 本地路径，便于网页调试。
 */
(function (root) {
  const G = root.GameGlobal || (root.GameGlobal = {});
  const state = {
    feature: "idle", // idle | loading | ready | fail
    levels: "idle",
    craft: "idle",
  };
  const waiters = { feature: [], levels: [], craft: [] };

  function flush(name, ok) {
    const list = waiters[name] || [];
    waiters[name] = [];
    for (let i = 0; i < list.length; i++) {
      try { list[i](ok); } catch (e) {}
    }
  }

  function hasWxSub() {
    try {
      return typeof wx !== "undefined" && typeof wx.loadSubpackage === "function";
    } catch (e) {
      return false;
    }
  }

  function loadSubpackage(name) {
    return new Promise((resolve, reject) => {
      if (!hasWxSub()) {
        resolve(false);
        return;
      }
      try {
        wx.loadSubpackage({
          name,
          success: () => resolve(true),
          fail: (err) => reject(err || new Error("loadSubpackage fail: " + name)),
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function tryRequire(paths) {
    let lastErr = null;
    for (let i = 0; i < paths.length; i++) {
      try {
        require(paths[i]);
        return true;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) throw lastErr;
    return false;
  }

  function requireFeatureModules() {
    // 微信分包约定：相对小游戏根目录 require；再兜底相对本文件路径
    tryRequire(["pkg/feature/game.js", "../pkg/feature/game.js", "/pkg/feature/game.js"]);
    return !!G.PapaGarage;
  }

  function requireLevelsModules() {
    tryRequire(["pkg/levels/game.js", "../pkg/levels/game.js", "/pkg/levels/game.js"]);
    return !!G.PapaLevels;
  }

  function ensureNamedPkg(name, isReady, doRequire) {
    if (isReady()) {
      state[name] = "ready";
      return Promise.resolve(true);
    }
    if (state[name] === "ready") return Promise.resolve(true);
    if (state[name] === "loading") {
      return new Promise((resolve) => {
        waiters[name].push((ok) => resolve(!!ok));
      });
    }
    state[name] = "loading";
    return loadSubpackage(name)
      .catch(() => false)
      .then(() => {
        const ok = doRequire();
        if (!ok) throw new Error(name + " modules missing");
        state[name] = "ready";
        flush(name, true);
        return true;
      })
      .catch((err) => {
        state[name] = "fail";
        try { console.warn("[pkg] " + name + " load fail", err && err.message); } catch (e) {}
        flush(name, false);
        return false;
      });
  }

  function ensureFeaturePkg() {
    return ensureNamedPkg("feature", () => !!G.PapaGarage, requireFeatureModules);
  }

  function ensureLevelsPkg() {
    return ensureNamedPkg("levels", () => !!G.PapaLevels, requireLevelsModules);
  }

  function ensureCraftPkg() {
    if (state.craft === "ready") return Promise.resolve(true);
    if (state.craft === "loading") {
      return new Promise((resolve) => {
        waiters.craft.push((ok) => resolve(!!ok));
      });
    }
    state.craft = "loading";
    return loadSubpackage("craft")
      .then(() => {
        state.craft = "ready";
        G.__craftPkgReady = true;
        flush("craft", true);
        return true;
      })
      .catch((err) => {
        // 非微信 / 分包失败：资源若仍在主包路径也可读，标记 ready 避免卡死
        state.craft = "ready";
        G.__craftPkgReady = true;
        try { console.warn("[pkg] craft load fallback", err && err.errMsg); } catch (e) {}
        flush("craft", true);
        return true;
      });
  }

  /**
   * 首页出来后只后台预取机体图集（开局要用）。
   * 机库/关卡不预取，避免和冷启动抢带宽；点进再下。
   */
  function prefetchPkgs() {
    const run = () => {
      ensureCraftPkg().catch(() => {});
    };
    try {
      if (typeof setTimeout === "function") setTimeout(run, 800);
      else run();
    } catch (e) {
      run();
    }
  }

  G.ensureFeaturePkg = ensureFeaturePkg;
  G.ensureLevelsPkg = ensureLevelsPkg;
  G.ensureCraftPkg = ensureCraftPkg;
  G.prefetchPkgs = prefetchPkgs;
  G.__craftPkgReady = false;
  G.pkgLoaderState = state;

  prefetchPkgs();
})(typeof GameGlobal !== "undefined" ? GameGlobal : (typeof window !== "undefined" ? window : this));
