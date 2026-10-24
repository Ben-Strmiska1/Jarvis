// All static content tables for the farm game.

export const TILE = 32;
export const MAP_W = 48;
export const MAP_H = 32;
export const DAY_START = 6 * 60; // 06:00
export const DAY_END = 26 * 60; // 02:00 next day
export const MS_PER_MIN = 500; // 1 game minute = 0.5 s at 1x
export const SAVE_KEY = "farmsim.save";
export const SAVE_VERSION = 1;
export const CATCHUP_MAX_MIN = 120;

export const ENERGY = { till: 2, water: 1, plant: 0, harvest: 1 };
export const CAN_CAP = [20, 50, 100];

// Crops: seed price / grow game-hours / sell price / unlock level.
export const CROPS = {
  lettuce: { name: "Lettuce", emoji: "🥬", seed: 6, grow: 4, sell: 13, level: 1 },
  carrot: { name: "Carrot", emoji: "🥕", seed: 8, grow: 6, sell: 18, level: 1 },
  wheat: { name: "Wheat", emoji: "🌾", seed: 10, grow: 8, sell: 22, level: 1, mill: true },
  potato: { name: "Potato", emoji: "🥔", seed: 12, grow: 10, sell: 28, level: 2 },
  soybean: { name: "Soybean", emoji: "🫘", seed: 15, grow: 12, sell: 34, level: 2, mill: true },
  corn: { name: "Corn", emoji: "🌽", seed: 20, grow: 16, sell: 45, level: 3, mill: true },
  tomato: { name: "Tomato", emoji: "🍅", seed: 25, grow: 18, sell: 14, level: 3, regrow: 6, harvests: 4 },
  onion: { name: "Onion", emoji: "🧅", seed: 14, grow: 12, sell: 32, level: 3 },
  cotton: { name: "Cotton", emoji: "☁️", seed: 35, grow: 24, sell: 80, level: 4 },
  strawberry: { name: "Strawberry", emoji: "🍓", seed: 40, grow: 20, sell: 18, level: 4, regrow: 8, harvests: 5 },
  sunflower: { name: "Sunflower", emoji: "🌻", seed: 30, grow: 20, sell: 70, level: 5 },
  pumpkin: { name: "Pumpkin", emoji: "🎃", seed: 50, grow: 36, sell: 130, level: 5 },
};
export const CROP_IDS = Object.keys(CROPS);

// Animal products.
export const PRODUCTS = {
  egg: { name: "Egg", emoji: "🥚", sell: 15 },
  duck_egg: { name: "Duck egg", emoji: "🪺", sell: 40 },
  goat_milk: { name: "Goat milk", emoji: "🍼", sell: 100 },
  truffle: { name: "Truffle", emoji: "🍄", sell: 220 },
  wool: { name: "Wool", emoji: "🧶", sell: 180 },
  milk: { name: "Milk", emoji: "🥛", sell: 120 },
};

// Animals: cost / home / feed units per day / product + interval (game minutes) / level.
export const ANIMALS = {
  chicken: { name: "Chicken", emoji: "🐔", cost: 100, home: "coop", feed: 1, product: "egg", interval: 12 * 60, level: 1 },
  duck: { name: "Duck", emoji: "🦆", cost: 150, home: "coop", feed: 1, product: "duck_egg", interval: 24 * 60, level: 2 },
  goat: { name: "Goat", emoji: "🐐", cost: 550, home: "barn", feed: 2, product: "goat_milk", interval: 24 * 60, level: 3 },
  pig: { name: "Pig", emoji: "🐖", cost: 500, home: "barn", feed: 2, product: "truffle", interval: 48 * 60, level: 4 },
  sheep: { name: "Sheep", emoji: "🐑", cost: 600, home: "barn", feed: 2, product: "wool", interval: 48 * 60, level: 4 },
  cow: { name: "Cow", emoji: "🐄", cost: 800, home: "barn", feed: 3, product: "milk", interval: 24 * 60, level: 3 },
};

export const FEED_PRICE = 4;
export const FEED_PER_MILL = 4;
export const AUTOFEED_COST = 1500;

// Farmhouse tiers (in-place upgrade). room = interior grid size.
export const HOUSE_TIERS = [
  { name: "Shack", w: 3, h: 3, cost: 0, label: "🏚️", room: 6, wall: "#a98b6a", roof: "#6d5338" },
  { name: "Cottage", w: 4, h: 3, cost: 2000, label: "🏠", room: 8, wall: "#e8d7b5", roof: "#b5523b" },
  { name: "Farmhouse", w: 4, h: 4, cost: 8000, label: "🏡", room: 10, wall: "#f1e6cf", roof: "#3f6fa8" },
  { name: "Manor", w: 5, h: 4, cost: 25000, label: "🏰", room: 12, wall: "#efe9e0", roof: "#4b3a63" },
];

// Placeable world objects. cat: building | farm | deco
export const OBJECTS = {
  house: { name: "Farmhouse", cat: "house", w: 3, h: 3, cost: 0, level: 1, removable: false },
  silo: { name: "Silo", cat: "building", w: 2, h: 2, cost: 600, level: 1, label: "🌾", desc: "+250 crop/feed storage. Mill grain into feed." },
  coop: { name: "Coop", cat: "building", w: 3, h: 2, cost: 400, level: 1, label: "🐔", home: "coop", cap: [6, 12], upCost: 1200, upName: "Deluxe coop", wall: "#e0b07a", roof: "#a0522d", desc: "Houses 6 chickens/ducks (12 deluxe)." },
  barn: { name: "Barn", cat: "building", w: 4, h: 3, cost: 1500, level: 2, label: "🐄", home: "barn", cap: [4, 8], upCost: 4000, upName: "Big barn", wall: "#b8403a", roof: "#5e1d1a", desc: "Houses 4 large animals (8 big barn)." },
  well: { name: "Well", cat: "building", w: 1, h: 1, cost: 300, level: 1, desc: "Refill your watering can." },
  stall: { name: "Market stall", cat: "building", w: 2, h: 1, cost: 0, level: 1, desc: "Sell your goods." },
  fence: { name: "Fence", cat: "farm", w: 1, h: 1, cost: 5, level: 1 },
  tree: { name: "Tree", cat: "deco", w: 1, h: 1, cost: 50, level: 1, label: "🌳" },
  flowers: { name: "Flowers", cat: "deco", w: 1, h: 1, cost: 20, level: 1, label: "🌷" },
  bench: { name: "Bench", cat: "deco", w: 1, h: 1, cost: 60, level: 1, label: "🪑" },
  scarecrow: { name: "Scarecrow", cat: "deco", w: 1, h: 1, cost: 80, level: 1 },
  lamp: { name: "Lamp", cat: "deco", w: 1, h: 1, cost: 150, level: 2, label: "🏮", light: true, desc: "Lights up at night." },
};

// Ground paint items (per tile).
export const GROUND = {
  soil: { name: "Soil", ch: "s", cost: 5, emoji: "🟫", level: 1 },
  path: { name: "Path", ch: "p", cost: 2, emoji: "🟨", level: 1 },
  pond: { name: "Pond", ch: "w", cost: 50, emoji: "🟦", level: 1 },
  grass: { name: "Grass", ch: "g", cost: 0, emoji: "🟩", level: 1, desc: "Clear a tile back to grass." },
};

export const FURNITURE = {
  bed: { name: "Bed", emoji: "🛏️", cost: 200 },
  table: { name: "Table", emoji: "🍽️", cost: 80 },
  chair: { name: "Chair", emoji: "🪑", cost: 30 },
  rug: { name: "Rug", emoji: "🟥", cost: 60, floor: true },
  plant: { name: "Plant", emoji: "🪴", cost: 40 },
  stove: { name: "Stove", emoji: "♨️", cost: 300 },
  sofa: { name: "Sofa", emoji: "🛋️", cost: 250 },
  lamp: { name: "Lamp", emoji: "💡", cost: 50 },
  bookshelf: { name: "Bookshelf", emoji: "📚", cost: 150 },
  tv: { name: "TV", emoji: "📺", cost: 400 },
};

export const TOOLS = {
  hoe: { name: "Hoe", emoji: "⛏️" },
  can: { name: "Watering can", emoji: "🚿" },
  scythe: { name: "Scythe", emoji: "🔪" },
};
export const TOOL_TIERS = [
  null,
  null,
  { cost: 300, level: 2, desc: "3×1 area" },
  { cost: 1200, level: 4, desc: "3×3 area" },
];

export const VEHICLES = {
  tractor: { name: "Small tractor + plow", emoji: "🚜", cost: 5000, level: 5, desc: "Drag to till fields, no energy." },
  seeder: { name: "Seeder", emoji: "🌱", cost: 1500, level: 5, needs: "tractor", desc: "Tractor mode: drag to plant." },
  harvester: { name: "Harvester", emoji: "🧺", cost: 2500, level: 6, needs: "tractor", desc: "Tractor mode: drag to harvest." },
  sprayer: { name: "Sprayer", emoji: "💦", cost: 2000, level: 6, needs: "tractor", desc: "Waters every crop at dawn." },
};

// Inventory item catalogue. kind: crop | good | feed | seed | furn
export const ITEMS = {};
for (const [id, c] of Object.entries(CROPS)) {
  ITEMS[id] = { name: c.name, emoji: c.emoji, base: c.sell, kind: "crop" };
  ITEMS["seed_" + id] = { name: c.name + " seeds", emoji: c.emoji, base: 0, kind: "seed", crop: id };
}
for (const [id, p] of Object.entries(PRODUCTS)) ITEMS[id] = { name: p.name, emoji: p.emoji, base: p.sell, kind: "good" };
ITEMS.feed = { name: "Animal feed", emoji: "🥣", base: 0, kind: "feed" };
for (const [id, f] of Object.entries(FURNITURE)) ITEMS["furn_" + id] = { name: f.name, emoji: f.emoji, base: 0, kind: "furn" };

export const SELLABLE = Object.keys(ITEMS).filter((k) => ITEMS[k].base > 0);

// Hotbar layout (keys 1-7).
export const HOTBAR = [
  { id: "hand", name: "Hand", emoji: "✋", hint: "Collect, harvest, open buildings" },
  { id: "hoe", name: "Hoe", emoji: "⛏️", hint: "Till grass into soil" },
  { id: "can", name: "Water", emoji: "🚿", hint: "Water crops; tap a well/pond to refill" },
  { id: "scythe", name: "Scythe", emoji: "🔪", hint: "Harvest ripe crops" },
  { id: "seed", name: "Seed", emoji: "🌱", hint: "Plant seeds (tap again to choose)" },
  { id: "feed", name: "Feed", emoji: "🥣", hint: "Feed animals in a coop/barn" },
  { id: "tractor", name: "Tractor", emoji: "🚜", hint: "Drag over fields" },
];

export const SHOP_TABS = ["Seeds", "Tools", "Vehicles", "Animals", "Buildings", "Deco", "Furniture"];

// Flat shop catalogue built from the tables above.
export function shopEntries() {
  const list = [];
  for (const [id, c] of Object.entries(CROPS)) {
    list.push({ id: "seed_" + id, tab: "Seeds", name: c.name + " seeds", emoji: c.emoji, cost: c.seed, level: c.level, desc: `${c.grow}h · sells $${c.sell}${c.regrow ? ` · regrows ${c.harvests}×` : ""}`, qty: true });
  }
  list.push({ id: "feed", tab: "Seeds", name: "Animal feed", emoji: "🥣", cost: FEED_PRICE, level: 1, desc: "1 unit. Stored in silo.", qty: true });
  for (const [tool, t] of Object.entries(TOOLS)) {
    for (const tier of [2, 3]) {
      const tt = TOOL_TIERS[tier];
      list.push({ id: `${tool}${tier}`, tab: "Tools", name: `${t.name} T${tier}`, emoji: t.emoji, cost: tt.cost, level: tt.level, desc: tool === "can" ? `Holds ${CAN_CAP[tier - 1]} water` : tt.desc, tool, tier });
    }
  }
  for (const [id, v] of Object.entries(VEHICLES)) list.push({ id, tab: "Vehicles", name: v.name, emoji: v.emoji, cost: v.cost, level: v.level, desc: v.desc });
  for (const [id, a] of Object.entries(ANIMALS)) {
    const p = PRODUCTS[a.product];
    list.push({ id: "animal_" + id, tab: "Animals", name: a.name, emoji: a.emoji, cost: a.cost, level: a.level, desc: `Lives in ${a.home} · eats ${a.feed}/day · ${p.emoji} every ${a.interval / 60}h ($${p.sell})` });
  }
  for (const [id, o] of Object.entries(OBJECTS)) {
    if (o.cat === "house") continue;
    const tab = o.cat === "deco" ? "Deco" : "Buildings";
    list.push({ id, tab, name: o.name, emoji: objectEmoji(id), cost: o.cost, level: o.level, desc: o.desc || `${o.w}×${o.h}`, build: true });
  }
  for (const [id, g] of Object.entries(GROUND)) list.push({ id, tab: "Buildings", name: g.name + " tile", emoji: g.emoji, cost: g.cost, level: g.level, desc: g.desc || "Paint tiles in build mode", build: true });
  for (const [id, f] of Object.entries(FURNITURE)) list.push({ id: "furn_" + id, tab: "Furniture", name: f.name, emoji: f.emoji, cost: f.cost, level: 1, desc: "Place it inside your house" });
  return list;
}

export function objectEmoji(type) {
  const map = { silo: "🛢️", coop: "🐔", barn: "🐄", well: "🪣", stall: "🧺", fence: "🚧", scarecrow: "🧑‍🌾", house: "🏠" };
  return map[type] || OBJECTS[type]?.label || "❓";
}

export function levelFor(xp) {
  return Math.floor(Math.sqrt(xp / 50)) + 1;
}
export function xpForLevel(level) {
  return 50 * (level - 1) * (level - 1);
}
