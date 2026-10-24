// Game state: creation, persistence, migration, export/import.
import { MAP_W, MAP_H, DAY_START, SAVE_KEY, SAVE_VERSION, CROP_IDS, SELLABLE } from "./data.js";

export let S = null;
export function setState(s) {
  S = s;
}

// Deterministic PRNG (mulberry32).
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function rollPrices(seed, day) {
  const r = rng(seed * 31 + day * 977);
  const mult = {};
  for (const id of SELLABLE) mult[id] = Math.round((0.85 + r() * 0.3) * 100) / 100;
  return mult;
}

export function newGame(seed = (Date.now() % 1e9) | 0) {
  const w = MAP_W;
  const h = MAP_H;
  const ground = new Array(w * h).fill("g");
  const set = (x, y, ch) => {
    if (x >= 0 && y >= 0 && x < w && y < h) ground[y * w + x] = ch;
  };
  // Pond (ellipse) in the north-west.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x - 9.5) / 3.6;
      const dy = (y - 9.5) / 2.4;
      if (dx * dx + dy * dy <= 1) set(x, y, "w");
    }
  // Paths.
  for (let x = 16; x <= 30; x++) set(x, 14, "p");
  for (let y = 15; y <= 17; y++) set(21, y, "p");
  // 12 starting soil tiles.
  for (let y = 18; y <= 19; y++) for (let x = 18; x <= 23; x++) set(x, y, "s");

  const prices = rollPrices(seed, 1);
  return {
    v: SAVE_VERSION,
    seed,
    money: 500,
    xp: 0,
    level: 1,
    energy: 100,
    time: { day: 1, minute: DAY_START, weather: "sun" },
    tools: { hoe: 1, can: 1, scythe: 1 },
    canWater: 20,
    vehicles: { tractor: 0, attach: [] },
    inv: { seed_wheat: 10 },
    prices: { day: 1, mult: prices, prev: { ...prices } },
    map: { w, h, ground },
    objects: [
      { id: 1, type: "house", x: 20, y: 11, rot: 0, data: { tier: 0 } },
      { id: 2, type: "stall", x: 25, y: 13, rot: 0, data: {} },
    ],
    crops: {},
    animals: [],
    interior: { walls: [], items: [{ type: "bed", x: 1, y: 1, rot: 0 }] },
    stats: { earned: 0, harvested: 0 },
    nextId: 3,
    settings: { speed: 1, paused: false, tool: "hand", seed: "wheat", tractorMode: "plow" },
    savedAt: Date.now(),
  };
}

export function serialize(s = S) {
  const out = { ...s, map: { ...s.map, ground: s.map.ground.join("") }, savedAt: Date.now() };
  return JSON.stringify(out);
}

export function save() {
  if (!S) return false;
  try {
    localStorage.setItem(SAVE_KEY, serialize());
    return true;
  } catch (e) {
    console.warn("save failed", e);
    return false;
  }
}

// Bring any older/partial save up to the current shape.
export function migrate(d) {
  if (!d || typeof d !== "object") throw new Error("Invalid save");
  const def = newGame(d.seed || 1);
  if (!d.v) d.v = 1;
  for (const k of Object.keys(def)) if (d[k] === undefined) d[k] = def[k];
  for (const k of ["time", "tools", "vehicles", "prices", "stats", "settings", "interior"]) {
    d[k] = { ...def[k], ...(d[k] || {}) };
  }
  if (!d.map || !d.map.ground) d.map = def.map;
  if (typeof d.map.ground === "string") d.map.ground = d.map.ground.split("");
  if (d.map.ground.length !== d.map.w * d.map.h) d.map = def.map;
  if (!Array.isArray(d.objects)) d.objects = def.objects;
  if (!Array.isArray(d.animals)) d.animals = [];
  for (const o of d.objects) o.data = o.data || {};
  for (const a of d.animals) {
    if (a.happy === undefined) a.happy = 1;
    if (a.prog === undefined) a.prog = 0;
    if (a.fed === undefined) a.fed = 0;
  }
  if (!CROP_IDS.includes(d.settings.seed)) d.settings.seed = "wheat";
  d.nextId = Math.max(d.nextId || 1, ...d.objects.map((o) => o.id + 1), ...d.animals.map((a) => a.id + 1));
  d.v = SAVE_VERSION;
  return d;
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.warn("load failed, starting new game", e);
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    /* ignore */
  }
}

export function exportJSON() {
  return serialize();
}

export function importJSON(text) {
  return migrate(JSON.parse(text));
}

export function nextId() {
  return S.nextId++;
}
