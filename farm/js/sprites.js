// Emoji + procedural sprite cache (offscreen canvases).
import { TILE, HOUSE_TIERS, OBJECTS } from "./data.js";

export const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const EMOJI_PX = 64;
const cache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function emoji(ch) {
  const k = "e:" + ch;
  let c = cache.get(k);
  if (c) return c;
  c = makeCanvas(EMOJI_PX, EMOJI_PX);
  const g = c.getContext("2d");
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `${Math.round(EMOJI_PX * 0.8)}px ${EMOJI_FONT}`;
  g.fillText(ch, EMOJI_PX / 2, EMOJI_PX / 2 + EMOJI_PX * 0.04);
  cache.set(k, c);
  return c;
}

export function drawEmoji(ctx, ch, cx, cy, size) {
  ctx.drawImage(emoji(ch), cx - size / 2, cy - size / 2, size, size);
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const S2 = 2; // sprite supersampling

// Procedural building sprite covering its footprint (w,h in tiles, already rotated).
export function building(type, tier, w, h, rot) {
  const k = `b:${type}:${tier}:${w}:${h}:${rot}`;
  let c = cache.get(k);
  if (c) return c;
  const pw = w * TILE * S2;
  const ph = h * TILE * S2;
  c = makeCanvas(pw, ph);
  const g = c.getContext("2d");
  g.scale(S2, S2);
  const W = w * TILE;
  const H = h * TILE;
  if (type === "silo") drawSilo(g, W, H);
  else if (type === "well") drawWell(g, W, H);
  else if (type === "stall") drawStall(g, W, H);
  else if (type === "scarecrow") drawScarecrow(g, W, H);
  else {
    let wall = "#c9a77c";
    let roof = "#8a5a3b";
    let label = "🏠";
    if (type === "house") {
      const t = HOUSE_TIERS[tier] || HOUSE_TIERS[0];
      wall = t.wall;
      roof = t.roof;
      label = t.label;
    } else if (OBJECTS[type]) {
      wall = OBJECTS[type].wall || wall;
      roof = OBJECTS[type].roof || roof;
      label = OBJECTS[type].label || label;
      if (tier && type === "coop") roof = "#c0392b";
      if (tier && type === "barn") roof = "#2f3d5c";
    }
    drawHouse(g, W, H, wall, roof, label, rot, type === "barn");
  }
  cache.set(k, c);
  return c;
}

function drawHouse(g, W, H, wall, roof, label, rot, barn) {
  const pad = 3;
  // shadow
  g.fillStyle = "rgba(0,0,0,0.22)";
  roundRect(g, pad + 3, pad + 5, W - pad * 2, H - pad * 2, 5);
  g.fill();
  // walls
  g.fillStyle = wall;
  roundRect(g, pad, pad, W - pad * 2, H - pad * 2, 5);
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = 1.5;
  g.stroke();
  // roof covers upper ~62%
  const rh = (H - pad * 2) * 0.62;
  g.fillStyle = roof;
  roundRect(g, pad - 1, pad - 1, W - pad * 2 + 2, rh, 5);
  g.fill();
  // roof shingles
  g.strokeStyle = "rgba(0,0,0,0.18)";
  g.lineWidth = 1;
  for (let y = pad + 6; y < pad + rh - 2; y += 6) {
    g.beginPath();
    g.moveTo(pad + 2, y);
    g.lineTo(W - pad - 2, y);
    g.stroke();
  }
  // ridge
  g.fillStyle = "rgba(255,255,255,0.18)";
  g.fillRect(pad, pad + rh / 2 - 1.5, W - pad * 2, 3);
  if (barn) {
    g.strokeStyle = "rgba(255,255,255,0.75)";
    g.lineWidth = 2;
    const bx = W / 2 - 12;
    const by = pad + rh + 2;
    const bh = H - pad - by - 1;
    g.strokeRect(bx, by, 24, bh);
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(bx + 24, by + bh);
    g.moveTo(bx + 24, by);
    g.lineTo(bx, by + bh);
    g.stroke();
  }
  // door on facing side
  g.fillStyle = "#5b3a22";
  const dw = 9;
  const dh = 12;
  if (rot === 0) g.fillRect(W / 2 - dw / 2, H - pad - dh, dw, dh);
  else if (rot === 2) g.fillRect(W / 2 - dw / 2, pad + rh, dw, Math.min(dh, H - pad * 2 - rh));
  else if (rot === 1) g.fillRect(pad, pad + rh + 1, 4, Math.max(6, H - pad * 2 - rh - 2));
  else g.fillRect(W - pad - 4, pad + rh + 1, 4, Math.max(6, H - pad * 2 - rh - 2));
  // windows
  g.fillStyle = "#bfe3ff";
  const wy = pad + rh + 4;
  if (H - pad - wy > 8) {
    g.fillRect(pad + 6, wy, 7, 6);
    g.fillRect(W - pad - 13, wy, 7, 6);
  }
  // label
  const s = Math.min(W, H) * 0.5;
  g.drawImage(emoji(label), W / 2 - s / 2, pad + rh / 2 - s / 2, s, s);
}

function drawSilo(g, W, H) {
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(W, H) / 2 - 3;
  g.fillStyle = "rgba(0,0,0,0.25)";
  g.beginPath();
  g.ellipse(cx + 3, cy + 5, r, r, 0, 0, Math.PI * 2);
  g.fill();
  const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  grad.addColorStop(0, "#f4f6f8");
  grad.addColorStop(1, "#8d99a6");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(60,70,80,0.6)";
  g.lineWidth = 1.5;
  for (const k of [1, 0.7, 0.4]) {
    g.beginPath();
    g.arc(cx, cy, r * k, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = "#c0392b";
  g.beginPath();
  g.arc(cx, cy, r * 0.15, 0, Math.PI * 2);
  g.fill();
}

function drawWell(g, W, H) {
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(W, H) / 2 - 2;
  g.fillStyle = "#8a8a8a";
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#5c5c5c";
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = "#2f7fd1";
  g.beginPath();
  g.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#6b4423";
  g.fillRect(cx - r, cy - 1.5, r * 2, 3);
}

function drawStall(g, W, H) {
  g.fillStyle = "rgba(0,0,0,0.2)";
  g.fillRect(4, 6, W - 6, H - 6);
  g.fillStyle = "#a0703f";
  g.fillRect(2, H * 0.45, W - 4, H * 0.5);
  const stripes = 8;
  const sw = (W - 4) / stripes;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? "#ffffff" : "#e74c3c";
    g.fillRect(2 + i * sw, 2, sw, H * 0.45);
  }
  const s = H * 0.45;
  g.drawImage(emoji("🍎"), W * 0.2 - s / 2, H * 0.5, s, s);
  g.drawImage(emoji("🥕"), W * 0.5 - s / 2, H * 0.5, s, s);
  g.drawImage(emoji("🥚"), W * 0.8 - s / 2, H * 0.5, s, s);
}

function drawScarecrow(g, W, H) {
  g.strokeStyle = "#6b4423";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(W / 2, H * 0.25);
  g.lineTo(W / 2, H - 3);
  g.moveTo(W * 0.15, H * 0.45);
  g.lineTo(W * 0.85, H * 0.45);
  g.stroke();
  g.fillStyle = "#3d6db5";
  g.fillRect(W * 0.35, H * 0.38, W * 0.3, H * 0.3);
  g.fillStyle = "#f1d18a";
  g.beginPath();
  g.arc(W / 2, H * 0.26, W * 0.15, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#c79a3b";
  g.beginPath();
  g.ellipse(W / 2, H * 0.17, W * 0.3, W * 0.09, 0, 0, Math.PI * 2);
  g.fill();
}
