// Livestock: housing, feeding, production, collection and wandering.
import { S, nextId } from "./state.js";
import { ANIMALS, OBJECTS, PRODUCTS, TILE } from "./data.js";
import { emit, toast } from "./bus.js";
import * as world from "./world.js";
import * as economy from "./economy.js";

const FED_MINUTES = 24 * 60;

export function capacity(obj) {
  const def = OBJECTS[obj.type];
  if (!def || !def.cap) return 0;
  return def.cap[obj.data.tier ? 1 : 0];
}

export function animalsIn(objId) {
  return S.animals.filter((a) => a.home === objId);
}

export function findHome(type) {
  const def = ANIMALS[type];
  if (!def) return null;
  return S.objects.find((o) => OBJECTS[o.type] && OBJECTS[o.type].home === def.home && animalsIn(o.id).length < capacity(o)) || null;
}

export function addAnimal(type, homeId) {
  const a = { id: nextId(), type, home: homeId, fed: 0, prog: 0, ready: false, happy: 1 };
  S.animals.push(a);
  emit("change");
  return a;
}

export function isHome(obj) {
  return !!(obj && OBJECTS[obj.type] && OBJECTS[obj.type].home);
}

// Feed every hungry animal in a building. Returns number fed.
export function feedBuilding(objId, quiet = false) {
  const list = animalsIn(objId).filter((a) => a.fed < FED_MINUTES / 2);
  if (!list.length) {
    if (!quiet) toast(animalsIn(objId).length ? "Everyone here is already fed" : "No animals live here yet");
    return 0;
  }
  let fed = 0;
  for (const a of list) {
    const need = ANIMALS[a.type].feed;
    if (!economy.take("feed", need)) {
      if (!quiet) toast("Out of feed! Buy feed in the shop or mill grain at a silo.", "bad");
      break;
    }
    a.fed = FED_MINUTES;
    fed++;
  }
  if (fed && !quiet) toast(`Fed ${fed} animal${fed > 1 ? "s" : ""} 🥣`, "good");
  emit("change");
  return fed;
}

export function readyCount(objId) {
  return animalsIn(objId).filter((a) => a.ready).length;
}
export function hungryCount(objId) {
  return animalsIn(objId).filter((a) => a.fed <= 0).length;
}

// Collect all ready products in a building.
export function collect(objId) {
  const ready = animalsIn(objId).filter((a) => a.ready);
  if (!ready.length) return 0;
  let got = 0;
  let full = false;
  const counts = {};
  for (const a of ready) {
    const def = ANIMALS[a.type];
    if (economy.add(def.product, 1) < 1) {
      full = true;
      break;
    }
    a.ready = false;
    a.prog = 0;
    got++;
    counts[def.product] = (counts[def.product] || 0) + 1;
    economy.addXP(Math.max(2, Math.round(def.interval / 180)));
  }
  if (got) toast("Collected " + Object.entries(counts).map(([p, n]) => `${n}× ${PRODUCTS[p].emoji}`).join(" "), "good");
  if (full) toast("House storage is full! Sell goods or upgrade your farmhouse.", "bad");
  return got;
}

export function tick(m) {
  // Auto-feeders top up hungry animals from the silo.
  for (const o of S.objects) {
    if (o.data.autofeed && hungryCount(o.id)) feedBuilding(o.id, true);
  }
  for (const a of S.animals) {
    const def = ANIMALS[a.type];
    if (!def) continue;
    if (a.fed > 0) {
      const active = Math.min(m, a.fed);
      a.fed -= m;
      if (a.fed < 0) a.fed = 0;
      if (!a.ready) {
        a.prog += active * (a.happy < 0.5 ? 0.5 : 1);
        if (a.prog >= def.interval) {
          a.prog = def.interval;
          a.ready = true;
        }
      }
    }
  }
}

export function onRollover() {
  for (const a of S.animals) {
    if (a.fed <= 0) a.happy = Math.max(0, a.happy - 0.25);
    else a.happy = Math.min(1, a.happy + 0.1);
  }
}

export function buyAutofeeder(objId, cost) {
  const o = world.getObj(objId);
  if (!o || o.data.autofeed) return false;
  if (!economy.spend(cost)) return false;
  o.data.autofeed = true;
  toast("Auto-feeder installed — animals eat from the silo automatically", "good");
  emit("change");
  return true;
}

export function upgradeHome(objId) {
  const o = world.getObj(objId);
  const def = o && OBJECTS[o.type];
  if (!def || !def.upCost || o.data.tier) return false;
  if (!economy.spend(def.upCost)) return false;
  o.data.tier = 1;
  toast(`Upgraded to ${def.upName}!`, "good");
  economy.addXP(20);
  emit("change");
  return true;
}

// ---- Wandering (render-only, not saved) ----
const pos = new Map();

function yard(o) {
  const { w, h } = world.footprint(o.type, o.rot, o.data);
  return { x0: (o.x - 1) * TILE, x1: (o.x + w + 1) * TILE, y0: (o.y + h) * TILE + 4, y1: (o.y + h + 2) * TILE - 4 };
}

export function wanderPositions() {
  return pos;
}

export function updateWander(dtMs) {
  const live = new Set();
  for (const a of S.animals) {
    const home = world.getObj(a.home);
    if (!home) continue;
    live.add(a.id);
    const y = yard(home);
    let p = pos.get(a.id);
    if (!p || p.home !== home.id || p.hx !== home.x || p.hy !== home.y) {
      p = { x: y.x0 + Math.random() * (y.x1 - y.x0), y: y.y0 + Math.random() * (y.y1 - y.y0), tx: 0, ty: 0, wait: 0, home: home.id, hx: home.x, hy: home.y, flip: false };
      p.tx = p.x;
      p.ty = p.y;
      pos.set(a.id, p);
    }
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) {
      p.wait -= dtMs;
      if (p.wait <= 0) {
        p.tx = y.x0 + Math.random() * (y.x1 - y.x0);
        p.ty = y.y0 + Math.random() * (y.y1 - y.y0);
        p.wait = 1000 + Math.random() * 3000;
      }
    } else {
      const speed = (ANIMALS[a.type].home === "coop" ? 18 : 12) * (dtMs / 1000);
      const k = Math.min(1, speed / d);
      p.x += dx * k;
      p.y += dy * k;
      p.flip = dx > 0;
    }
  }
  for (const id of [...pos.keys()]) if (!live.has(id)) pos.delete(id);
}
