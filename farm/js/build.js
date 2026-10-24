// Build mode: placing, moving, rotating and removing objects; painting ground tiles.
import { S } from "./state.js";
import { OBJECTS, GROUND, HOUSE_TIERS } from "./data.js";
import { emit, toast } from "./bus.js";
import * as world from "./world.js";
import * as economy from "./economy.js";

export const B = {
  active: false,
  cat: "building",
  type: null, // object or ground type being placed
  rot: 0,
  ghost: null, // {x,y} top-left tile
  sel: null, // selected existing object id
  moving: false,
  lastTile: null,
};

export function enter(type = null) {
  B.active = true;
  B.sel = null;
  B.moving = false;
  B.ghost = null;
  B.lastTile = null;
  if (type) selectType(type);
  else B.type = null;
  emit("build:changed");
}

export function exit() {
  B.active = false;
  B.type = null;
  B.sel = null;
  B.moving = false;
  B.ghost = null;
  emit("build:changed");
}

export function isGround(type) {
  return !!GROUND[type];
}

export function selectType(type) {
  const def = OBJECTS[type] || GROUND[type];
  if (!def) return;
  if (def.level > S.level) {
    toast(`${def.name} unlocks at level ${def.level}`, "bad");
    return;
  }
  B.type = type;
  B.sel = null;
  B.moving = false;
  B.rot = 0;
  B.cat = GROUND[type] || type === "fence" ? "farm" : def.cat === "deco" ? "deco" : "building";
  emit("build:changed");
}

function curFootprint() {
  if (B.moving && B.sel) {
    const o = world.getObj(B.sel);
    return world.footprint(o.type, B.rot, o.data);
  }
  if (isGround(B.type)) return { w: 1, h: 1 };
  return world.footprint(B.type, B.rot);
}

function anchorTo(tx, ty) {
  const f = curFootprint();
  B.ghost = { x: tx - Math.floor((f.w - 1) / 2), y: ty - Math.floor((f.h - 1) / 2) };
}

// Ghost description for the renderer.
export function ghostInfo() {
  if (!B.active || !B.ghost) return null;
  if (B.moving && B.sel) {
    const o = world.getObj(B.sel);
    if (!o) return null;
    const f = world.footprint(o.type, B.rot, o.data);
    const ok = world.canPlace(o.type, B.ghost.x, B.ghost.y, B.rot, o.id, o.data).ok;
    return { type: o.type, tier: o.data.tier || 0, x: B.ghost.x, y: B.ghost.y, rot: B.rot, f, ok };
  }
  if (!B.type) return null;
  if (isGround(B.type)) {
    const ok = world.canPaint(B.type, B.ghost.x, B.ghost.y).ok && S.money >= GROUND[B.type].cost;
    return { type: B.type, ground: true, x: B.ghost.x, y: B.ghost.y, rot: 0, f: { w: 1, h: 1 }, ok };
  }
  const f = world.footprint(B.type, B.rot);
  const ok = world.canPlace(B.type, B.ghost.x, B.ghost.y, B.rot).ok && S.money >= OBJECTS[B.type].cost;
  return { type: B.type, x: B.ghost.x, y: B.ghost.y, rot: B.rot, f, ok };
}

export function paint(type, x, y, quiet = false) {
  const g = GROUND[type];
  const chk = world.canPaint(type, x, y);
  if (!chk.ok) {
    if (!quiet && !chk.same) toast(chk.reason, "bad");
    return false;
  }
  if (!economy.spend(g.cost, quiet)) return false;
  world.setGround(x, y, g.ch);
  return true;
}

// Buy + place an object at an exact top-left tile.
export function purchasePlace(type, x, y, rot = 0) {
  if (GROUND[type]) return paint(type, x, y) ? { ok: true } : { ok: false };
  const def = OBJECTS[type];
  if (!def || type === "house") return { ok: false, reason: "Can't place that" };
  if (def.level > S.level) {
    toast(`Unlocks at level ${def.level}`, "bad");
    return { ok: false, reason: "locked" };
  }
  const chk = world.canPlace(type, x, y, rot);
  if (!chk.ok) {
    toast(chk.reason, "bad");
    return chk;
  }
  if (!economy.spend(def.cost)) return { ok: false, reason: "money" };
  const o = world.place(type, x, y, rot, type === "coop" || type === "barn" ? { tier: 0 } : {});
  economy.addXP(type === "fence" ? 0 : Math.max(1, Math.round(def.cost / 100)));
  if (type !== "fence") toast(`Built ${def.name}!`, "good");
  emit("change");
  return { ok: true, obj: o };
}

export function tap(tx, ty) {
  const same = B.lastTile && B.lastTile.x === tx && B.lastTile.y === ty;
  B.lastTile = { x: tx, y: ty };
  if (B.moving && B.sel) {
    if (same && B.ghost) return confirm();
    anchorTo(tx, ty);
    return;
  }
  if (B.type) {
    if (isGround(B.type)) {
      anchorTo(tx, ty);
      paint(B.type, tx, ty);
      return;
    }
    if (same && B.ghost) return confirm();
    anchorTo(tx, ty);
    return;
  }
  const o = world.objAt(tx, ty);
  B.sel = o ? o.id : null;
  emit("build:changed");
}

// Hover (mouse) keeps the ghost under the cursor so a click places immediately.
export function hover(tx, ty) {
  if (!B.active || (!B.type && !B.moving)) return;
  anchorTo(tx, ty);
  B.lastTile = { x: tx, y: ty };
}

// Drag in build mode: paint ground/fences or drag the ghost; otherwise pan.
export function dragMode() {
  if (B.moving || (B.type && !isGround(B.type) && B.type !== "fence")) return "ghost";
  if (B.type) return "paint";
  return "pan";
}

export function dragMove(tx, ty, mode) {
  if (mode === "ghost") {
    anchorTo(tx, ty);
    B.lastTile = { x: tx, y: ty };
  } else if (mode === "paint") {
    anchorTo(tx, ty);
    if (isGround(B.type)) paint(B.type, tx, ty, true);
    else if (B.type === "fence" && world.canPlace("fence", tx, ty).ok && S.money >= OBJECTS.fence.cost) purchasePlace("fence", tx, ty, 0);
  }
}

export function confirm() {
  if (!B.ghost) {
    toast("Tap the map to position it first");
    return;
  }
  if (B.moving && B.sel) {
    const r = world.move(B.sel, B.ghost.x, B.ghost.y, B.rot);
    if (!r.ok) return toast(r.reason, "bad");
    B.moving = false;
    B.ghost = null;
    toast("Moved");
    emit("build:changed");
    emit("change");
    return;
  }
  if (B.type && !isGround(B.type)) purchasePlace(B.type, B.ghost.x, B.ghost.y, B.rot);
}

export function rotate() {
  if (B.sel && !B.moving) {
    const r = world.rotate(B.sel);
    if (!r.ok) toast("No room to rotate here", "bad");
    emit("change");
    return;
  }
  B.rot = (B.rot + 1) % 4;
  if (B.lastTile) anchorTo(B.lastTile.x, B.lastTile.y);
}

export function startMove() {
  const o = world.getObj(B.sel);
  if (!o) return;
  B.moving = true;
  B.rot = o.rot;
  B.ghost = { x: o.x, y: o.y };
  B.lastTile = null;
  emit("build:changed");
}

export function removeSel() {
  const r = world.remove(B.sel);
  if (!r.ok) return toast(r.reason, "bad");
  if (r.refund) economy.earn(r.refund);
  toast(r.refund ? `Removed — refunded $${r.refund}` : "Removed");
  B.sel = null;
  emit("build:changed");
  emit("change");
}

export function cancel() {
  if (B.moving) {
    B.moving = false;
    B.ghost = null;
  } else if (B.type) {
    B.type = null;
    B.ghost = null;
  } else if (B.sel) B.sel = null;
  else return exit();
  emit("build:changed");
}

// Farmhouse in-place upgrade.
export function upgradeHouse() {
  const h = world.house();
  if (!h) return { ok: false };
  const next = (h.data.tier || 0) + 1;
  const t = HOUSE_TIERS[next];
  if (!t) return { ok: false, reason: "Already the biggest house" };
  const chk = world.canPlace("house", h.x, h.y, h.rot, h.id, { tier: next });
  if (!chk.ok) {
    toast(`Not enough room to expand (${t.w}×${t.h}). Move the house or clear space.`, "bad");
    return chk;
  }
  if (!economy.spend(t.cost)) return { ok: false, reason: "money" };
  h.data.tier = next;
  world.rebuildOccupancy();
  emit("world:changed");
  economy.addXP(Math.round(t.cost / 100));
  toast(`🏡 Your house is now a ${t.name}!`, "good");
  emit("change");
  return { ok: true };
}
