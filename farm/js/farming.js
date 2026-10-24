// Fields: tilling, planting, watering, growth, harvesting, tractor jobs, and the tool dispatcher.
import { S } from "./state.js";
import { CROPS, ENERGY, CAN_CAP } from "./data.js";
import { emit, toast } from "./bus.js";
import * as world from "./world.js";
import * as economy from "./economy.js";
import * as animals from "./animals.js";

const key = (x, y) => x + "," + y;

export function cropAt(x, y) {
  return S.crops[key(x, y)] || null;
}

export function totalMinutes(c) {
  return CROPS[c.c].grow * 60;
}
export function isReady(c) {
  return c.g >= totalMinutes(c);
}
export function stage(c) {
  if (isReady(c)) return 4;
  return Math.min(3, Math.floor((c.g / totalMinutes(c)) * 4));
}

// Tool area of effect by tier: 1 = single, 2 = 3x1, 3 = 3x3.
function area(x, y, tier) {
  if (tier >= 3) {
    const out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.push([x + dx, y + dy]);
    return out;
  }
  if (tier === 2) return [[x - 1, y], [x, y], [x + 1, y]];
  return [[x, y]];
}

function canTill(x, y) {
  return world.inBounds(x, y) && world.ground(x, y) === "g" && !world.objAt(x, y);
}

export function till(x, y, free = false) {
  const tiles = free ? [[x, y]] : area(x, y, S.tools.hoe);
  const ok = tiles.filter(([tx, ty]) => canTill(tx, ty));
  if (!ok.length) {
    if (!free && world.ground(x, y) !== "s") toast("Can't till here — pick open grass", "bad");
    return 0;
  }
  if (!free && !economy.useEnergy(ENERGY.till)) return 0;
  for (const [tx, ty] of ok) S.map.ground[ty * world.W + tx] = "s";
  emit("world:changed");
  economy.addXP(ok.length);
  return ok.length;
}

function isWaterSource(x, y) {
  const o = world.objAt(x, y);
  return world.ground(x, y) === "w" || (o && o.type === "well");
}

export function refill() {
  S.canWater = CAN_CAP[(S.tools.can || 1) - 1];
  toast(`Watering can refilled (${S.canWater}) 💧`, "good");
  emit("change");
}

export function water(x, y, free = false) {
  if (isWaterSource(x, y)) {
    refill();
    return 0;
  }
  const tiles = free ? [[x, y]] : area(x, y, S.tools.can);
  const ok = tiles.filter(([tx, ty]) => {
    const c = cropAt(tx, ty);
    return c && !c.wet && !isReady(c);
  });
  if (!ok.length) {
    if (!free && !cropAt(x, y)) toast("Plant something first, then water it");
    return 0;
  }
  if (!free && S.canWater <= 0) {
    toast("Watering can is empty — tap a well or pond to refill", "bad");
    return 0;
  }
  if (!free && !economy.useEnergy(ENERGY.water)) return 0;
  let n = 0;
  for (const [tx, ty] of ok) {
    if (!free && S.canWater <= 0) break;
    cropAt(tx, ty).wet = true;
    if (!free) S.canWater--;
    n++;
  }
  emit("change");
  return n;
}

export function plant(x, y, cropId = S.settings.seed, quiet = false) {
  const def = CROPS[cropId];
  if (!def) return 0;
  if (world.ground(x, y) !== "s" || world.objAt(x, y)) {
    if (!quiet) toast("Seeds need tilled soil", "bad");
    return 0;
  }
  if (cropAt(x, y)) {
    if (!quiet) toast("Something is already growing here");
    return 0;
  }
  if (!economy.take("seed_" + cropId, 1)) {
    if (!quiet) toast(`No ${def.name.toLowerCase()} seeds — buy some in the Shop`, "bad");
    return 0;
  }
  S.crops[key(x, y)] = { c: cropId, g: 0, wet: S.time.weather === "rain", harvests: 0 };
  economy.addXP(1);
  emit("change");
  return 1;
}

function harvestOne(x, y) {
  const c = cropAt(x, y);
  if (!c || !isReady(c)) return 0;
  const def = CROPS[c.c];
  if (economy.add(c.c, 1) < 1) return -1;
  S.stats.harvested++;
  economy.addXP(Math.ceil(def.grow / 2) + 1);
  c.harvests++;
  if (def.regrow && c.harvests < def.harvests) c.g = (def.grow - def.regrow) * 60;
  else delete S.crops[key(x, y)];
  return 1;
}

export function harvest(x, y, tier = 1, free = false) {
  const tiles = area(x, y, tier).filter(([tx, ty]) => {
    const c = cropAt(tx, ty);
    return c && isReady(c);
  });
  if (!tiles.length) {
    const c = cropAt(x, y);
    if (!free && c) toast(`${CROPS[c.c].name} isn't ready yet (${Math.floor((c.g / totalMinutes(c)) * 100)}%)`);
    return 0;
  }
  if (!free && !economy.useEnergy(ENERGY.harvest)) return 0;
  const em = CROPS[cropAt(tiles[0][0], tiles[0][1]).c].emoji;
  let n = 0;
  for (const [tx, ty] of tiles) {
    const r = harvestOne(tx, ty);
    if (r < 0) {
      toast("Silo is full! Sell crops or build another silo.", "bad");
      break;
    }
    n += r;
  }
  if (n) toast(`Harvested ${n}× ${em}`, "good");
  emit("change");
  return n;
}

export function tick(m) {
  for (const c of Object.values(S.crops)) {
    if (!c.wet) continue;
    const t = totalMinutes(c);
    if (c.g < t) c.g = Math.min(t, c.g + m);
  }
}

export function onRollover(rain) {
  const spray = S.vehicles.attach.includes("sprayer");
  for (const c of Object.values(S.crops)) c.wet = rain || spray;
  if (spray && Object.keys(S.crops).length) toast("💦 Sprayer watered all crops at dawn");
}

// Tractor: apply current attachment over a rectangle, 0 energy.
export function tractorRect(x0, y0, x1, y1, mode = S.settings.tractorMode) {
  if (!S.vehicles.tractor) {
    toast("You don't own a tractor yet", "bad");
    return 0;
  }
  if (mode !== "plow" && !S.vehicles.attach.includes(mode)) {
    toast("You need the " + mode + " attachment", "bad");
    return 0;
  }
  let n = 0;
  for (const [x, y] of world.rectTiles(x0, y0, x1, y1)) {
    if (mode === "plow") {
      if (canTill(x, y)) {
        S.map.ground[y * world.W + x] = "s";
        n++;
      }
    } else if (mode === "seeder") {
      if (world.ground(x, y) === "s" && !world.objAt(x, y) && !cropAt(x, y)) {
        if (!plant(x, y, S.settings.seed, true)) break;
        n++;
      }
    } else if (mode === "harvester") {
      const r = harvestOne(x, y);
      if (r < 0) {
        toast("Silo is full!", "bad");
        break;
      }
      n += r;
    }
  }
  if (mode === "plow" && n) {
    emit("world:changed");
    economy.addXP(Math.ceil(n / 2));
  }
  const verb = { plow: "Plowed", seeder: "Planted", harvester: "Harvested" }[mode];
  toast(n ? `🚜 ${verb} ${n} tile${n > 1 ? "s" : ""}` : "🚜 Nothing to do there");
  emit("change");
  return n;
}

// Main tool dispatcher for a tile tap.
export function act(tool, x, y, opt) {
  if (!world.inBounds(x, y)) return 0;
  const obj = world.objAt(x, y);
  switch (tool) {
    case "hand": {
      if (obj) {
        if (animals.isHome(obj) && animals.readyCount(obj.id)) return animals.collect(obj.id);
        if (obj.type === "well") {
          refill();
          return 1;
        }
        emit("open:object", obj);
        return 0;
      }
      if (world.ground(x, y) === "w") {
        refill();
        return 1;
      }
      const c = cropAt(x, y);
      if (c) return harvest(x, y, 1);
      return 0;
    }
    case "hoe":
      return till(x, y);
    case "can":
      return water(x, y);
    case "seed":
      return plant(x, y, opt || S.settings.seed);
    case "scythe":
      return harvest(x, y, S.tools.scythe);
    case "feed":
      if (obj && animals.isHome(obj)) return animals.feedBuilding(obj.id);
      toast("Tap a coop or barn to feed its animals");
      return 0;
    case "tractor":
      return tractorRect(x, y, x, y, opt);
    default:
      return 0;
  }
}
