// Inventory, storage caps, buying/selling, prices, XP and levels.
import { S, rollPrices } from "./state.js";
import { ITEMS, CROPS, OBJECTS, GROUND, VEHICLES, CAN_CAP, FURNITURE, ANIMALS, FEED_PER_MILL, levelFor, shopEntries } from "./data.js";
import { emit, toast } from "./bus.js";
import * as world from "./world.js";
import * as animals from "./animals.js";

const SHOP = shopEntries();
export const shopById = Object.fromEntries(SHOP.map((e) => [e.id, e]));
export function shopList() {
  return SHOP;
}

export function count(id) {
  return S.inv[id] || 0;
}

export function siloCap() {
  return 50 + 250 * world.objectsOfType("silo").length;
}
export function goodsCap() {
  return 100 + 100 * (world.houseTier() + 1);
}
function total(kinds) {
  let n = 0;
  for (const [id, q] of Object.entries(S.inv)) if (ITEMS[id] && kinds.includes(ITEMS[id].kind)) n += q;
  return n;
}
export function siloUsed() {
  return total(["crop", "feed"]);
}
export function goodsUsed() {
  return total(["good"]);
}

// How many of `id` fit right now.
export function room(id) {
  const kind = ITEMS[id] ? ITEMS[id].kind : "seed";
  if (kind === "crop" || kind === "feed") return Math.max(0, siloCap() - siloUsed());
  if (kind === "good") return Math.max(0, goodsCap() - goodsUsed());
  return Infinity;
}

// Adds up to n; returns how many were added.
export function add(id, n = 1) {
  const k = Math.min(n, room(id));
  if (k <= 0) return 0;
  S.inv[id] = (S.inv[id] || 0) + k;
  emit("change");
  return k;
}

export function take(id, n = 1) {
  if (count(id) < n) return false;
  S.inv[id] -= n;
  if (S.inv[id] <= 0) delete S.inv[id];
  emit("change");
  return true;
}

export function spend(cost, quiet = false) {
  if (S.money < cost) {
    if (!quiet) toast(`Not enough money (need $${cost})`, "bad");
    return false;
  }
  S.money -= cost;
  emit("change");
  return true;
}

export function earn(n) {
  S.money += n;
  S.stats.earned += n;
  emit("change");
}

export function addXP(n) {
  if (n <= 0) return;
  S.xp += n;
  const lvl = levelFor(S.xp);
  if (lvl > S.level) {
    S.level = lvl;
    toast(`🎉 Level up! You are now level ${lvl}`, "good");
    emit("levelup", lvl);
  }
  emit("change");
}

export function useEnergy(n) {
  if (n <= 0) return true;
  if (S.energy < n) {
    toast("Too tired! Sleep in your house to restore energy.", "bad");
    return false;
  }
  S.energy -= n;
  return true;
}

export function price(id) {
  const base = ITEMS[id] ? ITEMS[id].base : 0;
  const m = (S.prices.mult && S.prices.mult[id]) || 1;
  return Math.max(1, Math.round(base * m));
}

export function priceTrend(id) {
  const now = S.prices.mult[id] || 1;
  const prev = (S.prices.prev && S.prices.prev[id]) || 1;
  return now > prev + 0.005 ? 1 : now < prev - 0.005 ? -1 : 0;
}

export function rerollPrices() {
  S.prices.prev = { ...S.prices.mult };
  S.prices.mult = rollPrices(S.seed, S.time.day);
  S.prices.day = S.time.day;
}

export function sell(id, n = Infinity) {
  const have = count(id);
  const q = Math.min(have, n);
  if (!ITEMS[id] || ITEMS[id].base <= 0 || q <= 0) return 0;
  const p = price(id) * q;
  take(id, q);
  earn(p);
  // 1 XP per $100 of cumulative sales, so selling one at a time gives no extra XP.
  addXP(Math.floor(S.stats.earned / 100) - Math.floor((S.stats.earned - p) / 100));
  return p;
}

export function sellAll() {
  let sum = 0;
  for (const id of Object.keys(S.inv)) if (ITEMS[id] && ITEMS[id].base > 0) sum += sell(id);
  if (sum > 0) toast(`Sold everything for $${sum}`, "good");
  else toast("Nothing to sell");
  return sum;
}

// Grain -> feed at a silo.
export function mill(cropId, n = 1) {
  if (!CROPS[cropId] || !CROPS[cropId].mill) return 0;
  let done = 0;
  for (let i = 0; i < n; i++) {
    if (count(cropId) < 1) break;
    // Removing 1 crop frees 1 slot; need room for FEED_PER_MILL - 1 more.
    if (room("feed") < FEED_PER_MILL - 1) {
      if (!done) toast("Silo is too full to mill", "bad");
      break;
    }
    take(cropId, 1);
    add("feed", FEED_PER_MILL);
    done++;
  }
  if (done) toast(`Milled ${done} ${CROPS[cropId].name} → ${done * FEED_PER_MILL} feed`, "good");
  return done;
}

// Purchase from the shop. Returns { ok, reason, build? }.
export function buy(id, qty = 1) {
  const e = shopById[id];
  if (!e) return fail("Unknown item");
  if (e.level > S.level) return fail(`Unlocks at level ${e.level}`);
  if (e.build) return { ok: true, build: id };

  if (id.startsWith("seed_") || id === "feed") {
    let n = qty;
    if (id === "feed") n = Math.min(n, room("feed"));
    if (n <= 0) return fail("Silo is full");
    if (!spend(e.cost * n)) return fail("Not enough money", true);
    S.inv[id] = (S.inv[id] || 0) + n;
    emit("change");
    return { ok: true, n };
  }
  if (e.tool) {
    const cur = S.tools[e.tool] || 1;
    if (cur >= e.tier) return fail("Already owned");
    if (cur < e.tier - 1) return fail(`Buy tier ${e.tier - 1} first`);
    if (!spend(e.cost)) return fail("Not enough money", true);
    S.tools[e.tool] = e.tier;
    if (e.tool === "can") S.canWater = CAN_CAP[e.tier - 1];
    toast(`Upgraded ${e.name}!`, "good");
    return { ok: true };
  }
  if (VEHICLES[id]) {
    const v = VEHICLES[id];
    if (id === "tractor" ? S.vehicles.tractor : S.vehicles.attach.includes(id)) return fail("Already owned");
    if (v.needs && !S.vehicles[v.needs]) return fail("Buy the tractor first");
    if (!spend(e.cost)) return fail("Not enough money", true);
    if (id === "tractor") {
      S.vehicles.tractor = 1;
      if (!S.vehicles.attach.includes("plow")) S.vehicles.attach.push("plow");
    } else S.vehicles.attach.push(id);
    toast(`Bought ${v.name}!`, "good");
    emit("change");
    return { ok: true };
  }
  if (id.startsWith("animal_")) {
    const type = id.slice(7);
    const home = animals.findHome(type);
    if (!home) return fail(`Need a ${ANIMALS[type].home} with free space`);
    if (!spend(e.cost)) return fail("Not enough money", true);
    const a = animals.addAnimal(type, home.id);
    toast(`${ANIMALS[type].emoji} A new ${ANIMALS[type].name.toLowerCase()} moved into your ${home.type}!`, "good");
    addXP(5);
    return { ok: true, animal: a };
  }
  if (id.startsWith("furn_")) {
    if (!spend(e.cost)) return fail("Not enough money", true);
    S.inv[id] = (S.inv[id] || 0) + 1;
    toast(`Bought ${FURNITURE[id.slice(5)].name} — place it from Home`, "good");
    emit("change");
    return { ok: true };
  }
  return fail("Can't buy that");
}

function fail(reason, quiet = false) {
  if (!quiet) toast(reason, "bad");
  return { ok: false, reason };
}

export function costOf(type) {
  if (OBJECTS[type]) return OBJECTS[type].cost;
  if (GROUND[type]) return GROUND[type].cost;
  return 0;
}
