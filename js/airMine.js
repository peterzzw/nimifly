/**
 * Steam 版空中地雷（圆角金属盒 + 红灯）
 * 来源：牛逼飞行员steam版/game.html drawMines
 * 第3关：静态摆放，近距拆除。
 */
(function (root) {
  "use strict";

  const MINE_R = 20;
  const MINE_DRAW_S = 16;

  function roundBoxPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawMine(ctx, m, time, opts) {
    if (!ctx || !m) return;
    const lampOn = !!(opts && opts.lampOn != null
      ? opts.lampOn
      : (m.armed || ((time * 3.2) % 1) < 0.5));
    const S = MINE_DRAW_S;
    const T = 4.2;
    const R = 6.6;
    ctx.save();
    ctx.rotate((m.armed ? (m.heading || 0) : (m.spin || 0)) + Math.PI / 2);
    roundBoxPath(ctx, -S + 1.4, -S + T + 1.2, S * 2, S * 2, R);
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fill();
    roundBoxPath(ctx, -S, -S + T, S * 2, S * 2, R);
    const side = ctx.createLinearGradient(-S, -S, S, S + T);
    side.addColorStop(0, "#3a444e");
    side.addColorStop(1, "#07090c");
    ctx.fillStyle = side;
    ctx.fill();
    roundBoxPath(ctx, -S, -S, S * 2, S * 2, R);
    const deck = ctx.createLinearGradient(-S - 2, -S - 2, S + 4, S + 6);
    deck.addColorStop(0, "#c4d0dc");
    deck.addColorStop(0.18, "#6a7a8a");
    deck.addColorStop(0.48, "#2a3642");
    deck.addColorStop(1, "#10161c");
    ctx.fillStyle = deck;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,.4)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-S + 5, S - 3.5);
    ctx.lineTo(-S + 5, -S + 7);
    ctx.lineTo(S - 3.5, -S + 7);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,.4)";
    ctx.beginPath();
    ctx.moveTo(-S + 5, S - 3.5);
    ctx.lineTo(S - 3.5, S - 3.5);
    ctx.lineTo(S - 3.5, -S + 7);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = "rgba(210,230,240,.4)";
    ctx.lineWidth = 1.1;
    roundBoxPath(ctx, -S, -S, S * 2, S * 2, R);
    ctx.stroke();
    roundBoxPath(ctx, -S + 2.1, -S + 2.1, S * 2 - 4.2, S * 2 - 4.2, R - 1.9);
    ctx.strokeStyle = "rgba(8,12,16,.55)";
    ctx.lineWidth = 0.65;
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,.28)";
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(-6.2, -S + 3.5); ctx.lineTo(-6.2, S - 3.5);
    ctx.moveTo(6.2, -S + 3.5); ctx.lineTo(6.2, S - 3.5);
    ctx.moveTo(-S + 3.5, -6.2); ctx.lineTo(S - 3.5, -6.2);
    ctx.moveTo(-S + 3.5, 6.2); ctx.lineTo(S - 3.5, 6.2);
    ctx.stroke();
    for (const [x, y] of [[-10.8, -10.8], [10.8, -10.8], [10.8, 10.8], [-10.8, 10.8]]) {
      const cg = ctx.createRadialGradient(x - 0.7, y - 0.7, 0.3, x, y, 2.7);
      cg.addColorStop(0, "#9aa8b4");
      cg.addColorStop(0.45, "#4a5864");
      cg.addColorStop(1, "#12181e");
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fillStyle = cg; ctx.fill();
      ctx.beginPath(); ctx.arc(x - 0.55, y - 0.6, 0.6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,.28)"; ctx.fill();
    }
    const well = ctx.createRadialGradient(0, 0, 1.8, 0, 0, 8.2);
    well.addColorStop(0, "#07090c");
    well.addColorStop(0.7, "#151c24");
    well.addColorStop(1, "#2a343e");
    ctx.beginPath(); ctx.arc(0, 0, 7.7, 0, Math.PI * 2); ctx.fillStyle = well; ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.55)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 6.6, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(180,200,210,.2)";
    ctx.lineWidth = 0.65;
    ctx.stroke();
    if (lampOn) {
      ctx.beginPath(); ctx.arc(0, 0, 10.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,48,36,.16)";
      ctx.fill();
    }
    const glass = ctx.createRadialGradient(-1.4, -2, 0.3, 0, 0.5, 5.7);
    glass.addColorStop(0, lampOn ? "rgba(255,240,220,.95)" : "rgba(80,30,28,.35)");
    glass.addColorStop(0.28, lampOn ? "rgba(255,70,48,.95)" : "rgba(90,22,18,.7)");
    glass.addColorStop(0.7, lampOn ? "rgba(160,16,12,.92)" : "rgba(28,8,8,.9)");
    glass.addColorStop(1, "#120606");
    ctx.beginPath();
    if (ctx.ellipse) ctx.ellipse(0, 0.35, 4.7, 4.45, 0, 0, Math.PI * 2);
    else ctx.arc(0, 0.35, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.beginPath();
    if (ctx.ellipse) ctx.ellipse(-1.3, -1.6, 1.5, 1.0, -0.4, 0, Math.PI * 2);
    else ctx.arc(-1.3, -1.6, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = lampOn ? "rgba(255,255,255,.72)" : "rgba(255,255,255,.08)";
    ctx.fill();
    ctx.beginPath();
    if (ctx.ellipse) ctx.ellipse(1.2, 1.95, 1.85, 1.05, 0.3, 0, Math.PI * 2);
    else ctx.arc(1.2, 1.95, 1.4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.fill();
    ctx.restore();
  }

  /**
   * 机身 → 地雷的两段机械臂，末端抓子按在地雷上
   * @param reachT 0~1 伸出进度
   * @param gripT 0~1 爪子夹紧（1=完全按住）
   * @param holdT 0~1 拆除进度条
   */
  function drawDefuseArmToMine(ctx, fromX, fromY, toX, toY, reachT, gripT, holdT) {
    const reach = Math.max(0, Math.min(1, reachT == null ? 1 : reachT));
    if (reach <= 0.02) return;
    const grip = Math.max(0, Math.min(1, gripT == null ? 1 : gripT));
    const hold = Math.max(0, Math.min(1, holdT == null ? 0 : holdT));
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx);
    // 伸出未满时爪停在途中；满后爪心落在地雷中心
    const tipX = fromX + dx * reach;
    const tipY = fromY + dy * reach;
    const midX = fromX + (tipX - fromX) * 0.48 + Math.cos(ang + Math.PI / 2) * Math.min(26, dist * 0.12);
    const midY = fromY + (tipY - fromY) * 0.48 + Math.sin(ang + Math.PI / 2) * Math.min(26, dist * 0.12);

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // 根座
    ctx.beginPath();
    ctx.arc(fromX, fromY, 5.2, 0, Math.PI * 2);
    ctx.fillStyle = "#8a9aaa";
    ctx.fill();
    ctx.strokeStyle = "rgba(40,50,60,0.75)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 上臂
    ctx.strokeStyle = "#5a6878";
    ctx.lineWidth = 6.2;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(midX, midY);
    ctx.stroke();
    ctx.strokeStyle = "#b8c6d2";
    ctx.lineWidth = 2.4;
    ctx.stroke();
    // 肘关节
    ctx.beginPath();
    ctx.arc(midX, midY, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#9aa8b4";
    ctx.fill();
    ctx.strokeStyle = "rgba(30,40,50,0.6)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // 前臂
    ctx.strokeStyle = "#4a5868";
    ctx.lineWidth = 5.2;
    ctx.beginPath();
    ctx.moveTo(midX, midY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.strokeStyle = "#c4d0dc";
    ctx.lineWidth = 2;
    ctx.stroke();

    // —— 抓子（按在地雷上）——
    ctx.translate(tipX, tipY);
    ctx.rotate(ang + Math.PI / 2);
    // 腕座
    ctx.beginPath();
    ctx.arc(0, 0, 4.6, 0, Math.PI * 2);
    ctx.fillStyle = "#a8b6c2";
    ctx.fill();
    ctx.strokeStyle = "rgba(20,28,36,0.7)";
    ctx.lineWidth = 1.1;
    ctx.stroke();
    // 开合：grip=0 张开，grip=1 夹紧贴雷
    const open = 0.55 * (1 - grip);
    const jawLen = 13;
    const jawW = 3.2;
    function jaw(side) {
      const s = side < 0 ? -1 : 1;
      ctx.save();
      ctx.rotate(s * (0.38 + open));
      // 指节
      ctx.fillStyle = "#7a8898";
      ctx.beginPath();
      ctx.moveTo(-jawW, 2);
      ctx.lineTo(-jawW - 1.2, jawLen * 0.55);
      ctx.lineTo(-1.2, jawLen);
      ctx.lineTo(jawW * 0.6, jawLen * 0.92);
      ctx.lineTo(jawW, 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(220,230,240,0.55)";
      ctx.lineWidth = 1;
      ctx.stroke();
      // 指尖垫
      ctx.fillStyle = grip > 0.7 ? "#e8f0f8" : "#9aa8b4";
      ctx.beginPath();
      ctx.arc(-0.2, jawLen - 1, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    jaw(-1);
    jaw(1);
    // 中轴活塞
    ctx.fillStyle = "#6a7888";
    ctx.fillRect(-1.4, 1, 2.8, 7 + grip * 3);
    ctx.restore();

    // 拆除进度条（爪子按住后）
    if (reach >= 0.98 && hold >= 0) {
      const bw = 44;
      const bh = 6;
      const bx = toX - bw / 2;
      const by = toY - 28;
      ctx.save();
      ctx.fillStyle = "rgba(8,12,16,0.72)";
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.strokeStyle = "rgba(200,220,235,0.55)";
      ctx.lineWidth = 1;
      ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.fillStyle = "rgba(40,50,60,0.9)";
      ctx.fillRect(bx, by, bw, bh);
      const g = ctx.createLinearGradient(bx, by, bx + bw, by);
      g.addColorStop(0, "#ffb24a");
      g.addColorStop(1, "#7dffb0");
      ctx.fillStyle = g;
      ctx.fillRect(bx, by, bw * hold, bh);
      ctx.fillStyle = "rgba(255,240,210,0.9)";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("拆除中", toX, by - 3);
      ctx.restore();
    }
  }

  const api = {
    MINE_R,
    drawMine,
    drawDefuseArmToMine,
    // 兼容旧名
    drawDefuseArm: drawDefuseArmToMine,
    create(x, y) {
      return {
        id: 0,
        x, y,
        prevX: x, prevY: y,
        vx: 0, vy: 0,
        heading: 0,
        spin: Math.random() * Math.PI * 2,
        armed: false,
        dead: false,
        kind: "airMine",
      };
    },
  };

  root.PapaAirMine = api;
  if (typeof GameGlobal !== "undefined") GameGlobal.PapaAirMine = api;
})(typeof GameGlobal !== "undefined" ? GameGlobal : (typeof globalThis !== "undefined" ? globalThis : this));
