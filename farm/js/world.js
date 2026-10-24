// Tile grid, ground, object occupancy, and placement rules.
import { S, nextId } from "./state.js";
import { OBJECTS, GROUND, HOUSE_TIERS, AUTOFEED_COST } from "./data.js";
import { emit } from "./bus.js";
import * as economy from "./economy.js";

export let W = 0;
export let H = 0;
export let occ = new Int32Array(0);
const byId = new Map();

export function init() {
  W = S.map.w;
  H = S.map.h;
  rebuildOccupancy();
  emit("world:changed");
}

export function rebuildOccupancy() {
  occ = new Int32Array(W * H);
  byId.clear();
  for (const o of S.objects) {
    byId.set(o.id, o);
    const { w, h } = footprint(o.type, o.rot, o.data);
    for (let y = o.y; y < o.y + h; y++)
      for (let x = o.x; x < o.x + w; x++) if (inBounds(x, y)) occ[y * W + x] = o.id;
  }
}

export function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < W && y < H;
}

export function ground(x, y) {
  return inBounds(x, y) ? S.map.ground[y * W + x] : null;
}

export function setGround(x, y, ch) {
  if (!inBounds(x, y)) return;
  S.map.ground[y * W + x] = ch;
  emit("world:changed");
}

export function getObj(id) {
  return byId.get(id) || null;
}

export function objAt(x, y) {
  if (!inBounds(x, y)) return null;
  const id = occ[y * W + x];
  return id ? byId.get(id) || null : null;
}

export function house() {
  return S.objects.find((o) => o.type === "house") || null;
}

export function houseTier() {
  const h = house();
  return h ? h.data.tier || 0 : 0;
}

export function footprint(type, rot = 0, data = {}) {
  let w;
  let h;
  if (type === "house") {
    const t = HOUSE_TIERS[(data && data.tier) || 0];
    w = t.w;
    h = t.h;
  } else {
    const def = OBJECTS[type];
    w = def ? def.w : 1;
    h = def ? def.h : 1;
  }
  return rot % 2 === 1 ? { w: h, h: w } : { w, h };
}

export function canPlace(type, x, y, rot = 0, ignoreId = 0, data = {}) {
  const { w, h } = footprint(type, rot, data);
  for (let ty = y; ty < y + h; ty++)
    for (let tx = x; tx < x + w; tx++) {
      if (!inBounds(tx, ty)) return { ok: false, reason: "Out of bounds" };
      const id = occ[ty * W + tx];
      if (id && id !== ignoreId) return { ok: false, reason: "Something is in the way" };
      if (S.map.ground[ty * W + tx] === "w") return { ok: false, reason: "Can't build on water" };
      if (S.crops[tx + "," + ty]) return { ok: false, reason: "Crops are growing there" };
    }
  return { ok: true };
}

export function place(type, x, y, rot = 0, data = {}) {
  const chk = canPlace(type, x, y, rot, 0, data);
  if (!chk.ok) return null;
  const o = { id: nextId(), type, x, y, rot, data: { ...data } };
  S.objects.push(o);
  rebuildOccupancy();
  emit("world:changed");
  return o;
}

export function move(id, x, y, rot) {
  const o = getObj(id);
  if (!o) return { ok: false, reason: "No such object" };
  const r = rot === undefined ? o.rot : rot;
  const chk = canPlace(o.type, x, y, r, o.id, o.data);
  if (!chk.ok) return chk;
  o.x = x;
  o.y = y;
  o.rot = r;
  rebuildOccupancy();
  emit("world:changed");
  return { ok: true };
}

export function rotate(id) {
  const o = getObj(id);
  if (!o) return { ok: false, reason: "No such object" };
  return move(id, o.x, o.y, (o.rot + 1) % 4);
}

// Returns { ok, refund } — caller credits the refund.
export function remove(id) {
  const o = getObj(id);
  if (!o) return { ok: false, reason: "No such object" };
  const def = OBJECTS[o.type];
  if (o.type === "house" || (def && def.removable === false)) return { ok: false, reason: "Your farmhouse can be moved, not removed" };
  if (S.animals.some((a) => a.home === id)) return { ok: false, reason: "Move the animals out first (it still has animals)" };
  if (o.type === "silo" && economy.siloUsed() > economy.siloCap() - 250) return { ok: false, reason: "Silo still holds crops/feed — sell or use some first" };
  S.objects = S.objects.filter((p) => p.id !== id);
  rebuildOccupancy();
  emit("world:changed");
  let spent = def ? def.cost : 0;
  if (def && def.upCost && o.data.tier) spent += def.upCost;
  if (o.data.autofeed) spent += AUTOFEED_COST;
  return { ok: true, refund: Math.floor(spent / 2) };
}

export function canPaint(item, x, y) {
  const g = GROUND[item];
  if (!g) return { ok: false, reason: "Unknown tile" };
  if (!inBounds(x, y)) return { ok: false, reason: "Out of bounds" };
  if (objAt(x, y)) return { ok: false, reason: "Something is in the way" };
  if (S.crops[x + "," + y]) return { ok: false, reason: "Crops are growing there" };
  if (ground(x, y) === g.ch) return { ok: false, reason: "Already " + g.name.toLowerCase(), same: true };
  return { ok: true };
}

// Tiles of a rectangle (inclusive), normalised.
export function rectTiles(x0, y0, x1, y1) {
  const out = [];
  const ax = Math.max(0, Math.min(x0, x1));
  const bx = Math.min(W - 1, Math.max(x0, x1));
  const ay = Math.max(0, Math.min(y0, y1));
  const by = Math.min(H - 1, Math.max(y0, y1));
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) out.push([x, y]);
  return out;
}

// Nearest object of given types around a tile (used for tooltips etc).
export function objectsOfType(...types) {
  return S.objects.filter((o) => types.includes(o.type));
}
