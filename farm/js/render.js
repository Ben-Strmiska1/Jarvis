// Canvas 2D renderer: camera, cached ground, y-sorted objects, crops, animals, ghost, night.
import { S, hash2 } from "./state.js";
import { TILE, CROPS, OBJECTS, ANIMALS, PRODUCTS } from "./data.js";
import { on } from "./bus.js";
import * as world from "./world.js";
import * as sprites from "./sprites.js";
import * as farming from "./farming.js";
import * as animals from "./animals.js";
import { darkness } from "./time.js";
import { B, ghostInfo } from "./build.js";

export const cam = { x: 0, y: 0, zoom: 1.4 };
export const overlay = { hover: null, rect: null };
let canvas;
let ctx;
let dpr = 1;
let cw = 0;
let ch = 0;
let groundCanvas = null;
let groundDirty = true;
let nightCanvas = null;

export function init(c) {
  canvas = c;
  ctx = canvas.getContext("2d");
  resize();
  window.addEventListener("resize", resize);
  on("world:changed", () => (groundDirty = true));
  const h = world.house();
  if (h) centerOn(h.x + 2, h.y + 4);
}

export function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cw = canvas.clientWidth || window.innerWidth;
  ch = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  clampCam();
}

export function centerOn(tx, ty) {
  cam.x = tx * TILE;
  cam.y = ty * TILE;
  clampCam();
}

function clampCam() {
  const mw = world.W * TILE;
  const mh = world.H * TILE;
  cam.zoom = Math.max(0.5, Math.min(2.5, cam.zoom));
  const hw = cw / 2 / cam.zoom;
  const hh = ch / 2 / cam.zoom;
  cam.x = hw * 2 >= mw ? mw / 2 : Math.max(hw - TILE, Math.min(mw - hw + TILE, cam.x));
  cam.y = hh * 2 >= mh ? mh / 2 : Math.max(hh - TILE, Math.min(mh - hh + TILE, cam.y));
}

export function screenToWorld(sx, sy) {
  const r = canvas.getBoundingClientRect();
  return { x: (sx - r.left - cw / 2) / cam.zoom + cam.x, y: (sy - r.top - ch / 2) / cam.zoom + cam.y };
}
export function screenToTile(sx, sy) {
  const p = screenToWorld(sx, sy);
  return { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
}
export function tileToScreen(tx, ty) {
  const r = canvas.getBoundingClientRect();
  return { x: r.left + cw / 2 + ((tx + 0.5) * TILE - cam.x) * cam.zoom, y: r.top + ch / 2 + ((ty + 0.5) * TILE - cam.y) * cam.zoom };
}

export function pan(dxScreen, dyScreen) {
  cam.x -= dxScreen / cam.zoom;
  cam.y -= dyScreen / cam.zoom;
  clampCam();
}

export function zoomAt(sx, sy, factor) {
  const before = screenToWorld(sx, sy);
  cam.zoom = Math.max(0.5, Math.min(2.5, cam.zoom * factor));
  const after = screenToWorld(sx, sy);
  cam.x += before.x - after.x;
  cam.y += before.y - after.y;
  clampCam();
}

// ---------- ground cache ----------
const GRASS = ["#7cbf5a", "#74b653"];
function buildGround() {
  const W = world.W;
  const H = world.H;
  if (!groundCanvas) {
    groundCanvas = document.createElement("canvas");
    groundCanvas.width = W * TILE;
    groundCanvas.height = H * TILE;
  }
  const g = groundCanvas.getContext("2d");
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = world.ground(x, y);
      const px = x * TILE;
      const py = y * TILE;
      const r = hash2(x, y, S.seed);
      g.fillStyle = GRASS[r < 0.5 ? 0 : 1];
      g.fillRect(px, py, TILE, TILE);
      if (t === "g") {
        g.fillStyle = "rgba(40,100,30,0.35)";
        for (let i = 0; i < 3; i++) {
          const bx = px + Math.floor(hash2(x * 3 + i, y, 7) * 28) + 2;
          const by = py + Math.floor(hash2(x, y * 3 + i, 9) * 26) + 3;
          g.fillRect(bx, by, 2, 4);
        }
        if (r > 0.97) {
          g.fillStyle = r > 0.985 ? "#fff6a8" : "#f7b6d2";
          g.fillRect(px + 14, py + 12, 3, 3);
        }
      } else if (t === "s") {
        g.fillStyle = "#8b5a2b";
        g.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
        g.fillStyle = "rgba(60,35,15,0.45)";
        for (let i = 6; i < TILE; i += 8) g.fillRect(px + 3, py + i, TILE - 6, 2);
      } else if (t === "p") {
        g.fillStyle = "#d8c08a";
        g.fillRect(px, py, TILE, TILE);
        g.fillStyle = "rgba(120,95,50,0.35)";
        for (let i = 0; i < 4; i++) g.fillRect(px + Math.floor(hash2(x, y, i) * 28), py + Math.floor(hash2(y, x, i + 4) * 28), 3, 2);
      } else if (t === "w") {
        g.fillStyle = "#e3cf94";
        g.fillRect(px, py, TILE, TILE);
        const e = 4;
        const n = (dx, dy) => world.ground(x + dx, y + dy) === "w" || world.ground(x + dx, y + dy) === null;
        g.fillStyle = "#3d8fd6";
        g.fillRect(px + (n(-1, 0) ? 0 : e), py + (n(0, -1) ? 0 : e), TILE - (n(-1, 0) ? 0 : e) - (n(1, 0) ? 0 : e), TILE - (n(0, -1) ? 0 : e) - (n(0, 1) ? 0 : e));
        g.fillStyle = "rgba(255,255,255,0.25)";
        g.fillRect(px + 6 + Math.floor(r * 10), py + 10, 8, 2);
      }
    }
  // auto-connecting fences
  for (const o of S.objects) {
    if (o.type !== "fence") continue;
    const px = o.x * TILE + TILE / 2;
    const py = o.y * TILE + TILE / 2;
    const isF = (dx, dy) => {
      const n = world.objAt(o.x + dx, o.y + dy);
      return n && n.type === "fence";
    };
    g.fillStyle = "#8a5a2b";
    if (isF(1, 0)) {
      g.fillRect(px, py - 7, TILE, 3);
      g.fillRect(px, py + 1, TILE, 3);
    }
    if (isF(0, 1)) {
      g.fillRect(px - 5, py, 3, TILE);
      g.fillRect(px + 2, py, 3, TILE);
    }
    g.fillStyle = "#6b4423";
    g.fillRect(px - 3, py - 10, 6, 16);
    g.fillStyle = "rgba(0,0,0,0.2)";
    g.fillRect(px - 3, py + 6, 6, 3);
  }
  groundDirty = false;
}

// ---------- frame ----------
export function draw(now) {
  if (!ctx || !S) return;
  if (groundDirty || !groundCanvas) buildGround();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#4f8a3a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const z = cam.zoom * dpr;
  ctx.setTransform(z, 0, 0, z, dpr * (cw / 2 - cam.x * cam.zoom), dpr * (ch / 2 - cam.y * cam.zoom));

  // visible tile range
  const x0 = Math.max(0, Math.floor((cam.x - cw / 2 / cam.zoom) / TILE) - 1);
  const y0 = Math.max(0, Math.floor((cam.y - ch / 2 / cam.zoom) / TILE) - 1);
  const x1 = Math.min(world.W - 1, Math.ceil((cam.x + cw / 2 / cam.zoom) / TILE) + 1);
  const y1 = Math.min(world.H - 1, Math.ceil((cam.y + ch / 2 / cam.zoom) / TILE) + 1);

  ctx.imageSmoothingEnabled = false;
  const sx = x0 * TILE;
  const sy = y0 * TILE;
  const sw = (x1 - x0 + 1) * TILE;
  const sh = (y1 - y0 + 1) * TILE;
  ctx.drawImage(groundCanvas, sx, sy, sw, sh, sx, sy, sw, sh);
  ctx.imageSmoothingEnabled = true;

  // map border
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, world.W * TILE, world.H * TILE);

  drawCrops(x0, y0, x1, y1, now);
  drawObjects(x0, y0, x1, y1);
  drawAnimals(now);
  drawBubbles(now);
  drawOverlays();
  drawWeatherAndNight(now);
}

function drawCrops(x0, y0, x1, y1, now) {
  for (const [k, c] of Object.entries(S.crops)) {
    const i = k.indexOf(",");
    const x = +k.slice(0, i);
    const y = +k.slice(i + 1);
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const px = x * TILE;
    const py = y * TILE;
    if (c.wet) {
      ctx.fillStyle = "rgba(40,20,5,0.45)";
      ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
    }
    const st = farming.stage(c);
    const cx = px + TILE / 2;
    const cy = py + TILE / 2;
    if (st === 4) {
      const bob = Math.sin(now / 400 + x + y) * 1;
      sprites.drawEmoji(ctx, CROPS[c.c].emoji, cx, cy - 2 + bob, 26);
    } else if (st <= 1) sprites.drawEmoji(ctx, "🌱", cx, cy + 2, st === 0 ? 14 : 19);
    else sprites.drawEmoji(ctx, "🌿", cx, cy, st === 2 ? 21 : 25);
  }
}

function drawObjects(x0, y0, x1, y1) {
  const list = S.objects
    .filter((o) => o.type !== "fence")
    .map((o) => ({ o, f: world.footprint(o.type, o.rot, o.data) }))
    .filter(({ o, f }) => o.x + f.w >= x0 && o.x <= x1 && o.y + f.h >= y0 && o.y <= y1)
    .sort((a, b) => a.o.y + a.f.h - (b.o.y + b.f.h));
  for (const { o, f } of list) {
    if (B.active && B.moving && B.sel === o.id) ctx.globalAlpha = 0.35;
    drawObject(o.type, o.data.tier || 0, o.x, o.y, f, o.rot);
    ctx.globalAlpha = 1;
    if (o.data.autofeed) sprites.drawEmoji(ctx, "⚙️", (o.x + f.w) * TILE - 8, o.y * TILE + 8, 12);
    if (B.active && B.sel === o.id) {
      ctx.strokeStyle = "#ffd84d";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(o.x * TILE + 1, o.y * TILE + 1, f.w * TILE - 2, f.h * TILE - 2);
      ctx.setLineDash([]);
    }
  }
}

function drawObject(type, tier, x, y, f, rot) {
  const def = OBJECTS[type];
  const px = x * TILE;
  const py = y * TILE;
  if (type === "fence") {
    ctx.fillStyle = "#6b4423";
    ctx.fillRect(px + 13, py + 6, 6, 16);
    ctx.fillRect(px + 2, py + 9, 28, 3);
    return;
  }
  if (def && def.cat === "deco" && type !== "scarecrow") {
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(px + 16, py + 27, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    sprites.drawEmoji(ctx, def.label, px + 16, py + 14, type === "tree" ? 34 : 26);
    return;
  }
  ctx.drawImage(sprites.building(type, tier, f.w, f.h, rot), px, py, f.w * TILE, f.h * TILE);
}

function drawAnimals(now) {
  const pos = animals.wanderPositions();
  const list = S.animals.map((a) => ({ a, p: pos.get(a.id) })).filter((e) => e.p);
  list.sort((m, n) => m.p.y - n.p.y);
  for (const { a, p } of list) {
    const def = ANIMALS[a.type];
    const size = def.home === "coop" ? 18 : 24;
    const bob = Math.abs(Math.sin(now / 180 + a.id)) * 1.5;
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + size * 0.35, size * 0.32, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(p.x, p.y - bob);
    if (p.flip) ctx.scale(-1, 1);
    sprites.drawEmoji(ctx, def.emoji, 0, 0, size);
    ctx.restore();
  }
}

function bubble(cx, cy, emojiCh, now) {
  const bob = Math.sin(now / 300) * 2;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy + bob, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  sprites.drawEmoji(ctx, emojiCh, cx, cy + bob, 16);
}

function drawBubbles(now) {
  for (const o of S.objects) {
    if (!animals.isHome(o)) continue;
    const f = world.footprint(o.type, o.rot, o.data);
    const ready = animals.animalsIn(o.id).find((a) => a.ready);
    const cx = (o.x + f.w / 2) * TILE;
    const cy = o.y * TILE - 6;
    if (ready) bubble(cx - (animals.hungryCount(o.id) ? 13 : 0), cy, PRODUCTS[ANIMALS[ready.type].product].emoji, now);
    if (animals.hungryCount(o.id)) bubble(cx + (ready ? 13 : 0), cy, "🍽️", now);
  }
}

function drawOverlays() {
  const h = overlay.hover;
  if (h && world.inBounds(h.x, h.y) && !B.active) {
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(h.x * TILE + 1, h.y * TILE + 1, TILE - 2, TILE - 2);
  }
  const r = overlay.rect;
  if (r) {
    const ax = Math.min(r.x0, r.x1);
    const ay = Math.min(r.y0, r.y1);
    const w = Math.abs(r.x1 - r.x0) + 1;
    const hh = Math.abs(r.y1 - r.y0) + 1;
    ctx.fillStyle = "rgba(255,220,80,0.25)";
    ctx.fillRect(ax * TILE, ay * TILE, w * TILE, hh * TILE);
    ctx.strokeStyle = "#ffd84d";
    ctx.lineWidth = 2;
    ctx.strokeRect(ax * TILE, ay * TILE, w * TILE, hh * TILE);
  }
  const g = ghostInfo();
  if (g) {
    ctx.globalAlpha = 0.6;
    if (!g.ground) drawObject(g.type, g.tier || 0, g.x, g.y, g.f, g.rot);
    ctx.globalAlpha = 1;
    ctx.fillStyle = g.ok ? "rgba(60,220,90,0.35)" : "rgba(230,60,60,0.4)";
    ctx.fillRect(g.x * TILE, g.y * TILE, g.f.w * TILE, g.f.h * TILE);
    ctx.strokeStyle = g.ok ? "#3ddc5a" : "#e64040";
    ctx.lineWidth = 2;
    ctx.strokeRect(g.x * TILE, g.y * TILE, g.f.w * TILE, g.f.h * TILE);
  }
}

function drawWeatherAndNight(now) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const W = canvas.width;
  const H = canvas.height;
  if (S.time.weather === "rain") {
    ctx.fillStyle = "rgba(40,60,90,0.15)";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(200,220,255,0.45)";
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    const t = now / 1000;
    for (let i = 0; i < 90; i++) {
      const x = ((i * 137.5 + t * 60) % (W + 40)) - 20;
      const y = ((i * 89.3 + t * 700) % (H + 40)) - 20;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4 * dpr, y + 12 * dpr);
    }
    ctx.stroke();
  } else if (S.time.weather === "cloud") {
    ctx.fillStyle = "rgba(80,90,110,0.08)";
    ctx.fillRect(0, 0, W, H);
  }
  const d = darkness();
  if (d <= 0.01) return;
  if (!nightCanvas || nightCanvas.width !== W || nightCanvas.height !== H) {
    nightCanvas = document.createElement("canvas");
    nightCanvas.width = W;
    nightCanvas.height = H;
  }
  const n = nightCanvas.getContext("2d");
  n.globalCompositeOperation = "source-over";
  n.clearRect(0, 0, W, H);
  n.fillStyle = `rgba(10,15,45,${d})`;
  n.fillRect(0, 0, W, H);
  n.globalCompositeOperation = "destination-out";
  const lights = S.objects.filter((o) => (OBJECTS[o.type] && OBJECTS[o.type].light) || o.type === "house");
  for (const o of lights) {
    const f = world.footprint(o.type, o.rot, o.data);
    const p = worldToCanvas((o.x + f.w / 2) * TILE, (o.y + f.h / 2) * TILE);
    const rad = (o.type === "house" ? 2.2 : 3.2) * TILE * cam.zoom * dpr;
    const gr = n.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
    gr.addColorStop(0, "rgba(0,0,0,0.9)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    n.fillStyle = gr;
    n.beginPath();
    n.arc(p.x, p.y, rad, 0, Math.PI * 2);
    n.fill();
  }
  ctx.drawImage(nightCanvas, 0, 0);
  // warm glow
  ctx.globalCompositeOperation = "lighter";
  for (const o of lights) {
    if (o.type === "house") continue;
    const p = worldToCanvas((o.x + 0.5) * TILE, (o.y + 0.5) * TILE);
    const rad = 2 * TILE * cam.zoom * dpr;
    const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
    gr.addColorStop(0, `rgba(255,180,80,${0.35 * d})`);
    gr.addColorStop(1, "rgba(255,180,80,0)");
    ctx.fillStyle = gr;
    ctx.fillRect(p.x - rad, p.y - rad, rad * 2, rad * 2);
  }
  ctx.globalCompositeOperation = "source-over";
}

function worldToCanvas(wx, wy) {
  return { x: dpr * (cw / 2 + (wx - cam.x) * cam.zoom), y: dpr * (ch / 2 + (wy - cam.y) * cam.zoom) };
}
