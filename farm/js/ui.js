// DOM UI: HUD, hotbar, build bar, side rail, panels, toasts, tooltip.
import { S, save, exportJSON } from "./state.js";
import { HOTBAR, ITEMS, CROPS, CROP_IDS, OBJECTS, GROUND, ANIMALS, PRODUCTS, HOUSE_TIERS, SHOP_TABS, VEHICLES, CAN_CAP, AUTOFEED_COST, objectEmoji, xpForLevel } from "./data.js";
import { on, emit, toast } from "./bus.js";
import * as economy from "./economy.js";
import * as animals from "./animals.js";
import * as build from "./build.js";
import * as interior from "./interior.js";
import * as world from "./world.js";
import * as farming from "./farming.js";
import { clock, weatherIcon, sleep } from "./time.js";

const $ = (id) => document.getElementById(id);
let panel = null; // {kind, arg}
let dirty = false;
let shopTab = "Seeds";
const hud = {};

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

export function init() {
  for (const id of ["hudMoney", "hudDay", "hudEnergy", "hudEnergyText", "hudLevel", "btnSpeed", "btnPause", "hotbar", "buildbar", "toasts", "tooltip", "panelBackdrop", "panelTitle", "panelTabs", "panelBody", "panelClose"]) hud[id] = $(id);
  hud.btnSpeed.addEventListener("click", () => {
    S.settings.speed = { 1: 2, 2: 4, 4: 1 }[S.settings.speed] || 1;
    refreshHUD(true);
  });
  hud.btnPause.addEventListener("click", () => {
    S.settings.paused = !S.settings.paused;
    refreshHUD(true);
  });
  document.querySelectorAll("#rail [data-panel]").forEach((b) =>
    b.addEventListener("click", () => {
      const k = b.dataset.panel;
      if (k === "build") {
        close();
        build.B.active ? build.exit() : build.enter();
      } else if (panel && panel.kind === k) close();
      else open(k);
    })
  );
  hud.panelClose.addEventListener("click", close);
  hud.panelBackdrop.addEventListener("click", (e) => {
    if (e.target === hud.panelBackdrop) close();
  });
  on("toast", ({ msg, kind }) => showToast(msg, kind));
  on("change", () => (dirty = true));
  on("build:changed", () => {
    renderBars();
    dirty = true;
  });
  on("open:object", (o) => openObject(o));
  renderBars();
  refreshHUD(true);
}

export function isOpen() {
  return !!panel;
}

// ---------- HUD ----------
const last = {};
function set(el, key, val, prop = "textContent") {
  if (last[key] === val) return;
  last[key] = val;
  if (prop === "width") el.style.width = val;
  else el[prop] = val;
}
export function refreshHUD(force = false) {
  if (force) for (const k of Object.keys(last)) delete last[k];
  set(hud.hudMoney, "money", `💰 $${S.money.toLocaleString()}`);
  set(hud.hudDay, "day", `Day ${S.time.day} · ${clock()} ${weatherIcon()}`);
  set(hud.hudEnergy, "energy", Math.max(0, S.energy) + "%", "width");
  set(hud.hudEnergyText, "energyT", String(Math.round(S.energy)));
  const lo = xpForLevel(S.level);
  const hi = xpForLevel(S.level + 1);
  set(hud.hudLevel, "level", `⭐ Lv ${S.level} · ${Math.round(((S.xp - lo) / (hi - lo)) * 100)}%`);
  set(hud.btnSpeed, "speed", `${S.settings.speed}×`);
  set(hud.btnPause, "pause", S.settings.paused ? "▶️" : "⏸️");
  hud.hudEnergy.classList.toggle("low", S.energy < 20);
}

export function frame() {
  refreshHUD();
  if (dirty) {
    dirty = false;
    renderBars(true);
    if (panel) renderPanel();
  }
}

// ---------- hotbar / build bar ----------
export function setTool(id) {
  if (id === "tractor" && !S.vehicles.tractor) return toast("Buy a tractor in Shop › Vehicles (level 5)");
  if (S.settings.tool === id) {
    if (id === "seed") return open("seeds");
    if (id === "tractor") return open("tractor");
  }
  S.settings.tool = id;
  renderBars();
}

function toolBadge(id) {
  if (id === "can") return `${S.canWater}/${CAN_CAP[S.tools.can - 1]}`;
  if (id === "seed") return String(economy.count("seed_" + S.settings.seed));
  if (id === "feed") return String(economy.count("feed"));
  if (id === "tractor") return { plow: "plow", seeder: "seed", harvester: "harv" }[S.settings.tractorMode];
  if (S.tools[id] > 1) return "T" + S.tools[id];
  return "";
}

let barSig = "";
function renderBars(soft = false) {
  const hb = hud.hotbar;
  const bb = hud.buildbar;
  hb.hidden = build.B.active;
  document.body.classList.toggle("build-mode", build.B.active);
  bb.hidden = !build.B.active;
  if (!build.B.active) {
    const items = HOTBAR.filter((t) => t.id !== "tractor" || S.vehicles.tractor);
    const sig = items.map((t) => t.id + toolBadge(t.id)).join() + S.settings.tool;
    if (soft && sig === barSig) return;
    barSig = sig;
    hb.innerHTML = "";
    items.forEach((t, i) => {
      hb.append(
        h("button", { class: "tool" + (S.settings.tool === t.id ? " active" : ""), title: `${t.name} (${i + 1}) — ${t.hint}`, "data-tool": t.id, onclick: () => setTool(t.id) },
          h("span", { class: "tool-emoji" }, t.id === "seed" ? CROPS[S.settings.seed].emoji : t.emoji),
          h("span", { class: "tool-name" }, t.name),
          toolBadge(t.id) ? h("span", { class: "badge" }, toolBadge(t.id)) : null)
      );
    });
    return;
  }
  const B = build.B;
  const sig = "b" + B.cat + B.type + B.sel + B.moving + S.level + Math.floor(S.money / 50);
  if (soft && sig === barSig) return;
  barSig = sig;
  bb.innerHTML = "";
  const cats = [["building", "🏗️ Buildings"], ["farm", "🌱 Farm"], ["deco", "🌳 Deco"]];
  bb.append(h("div", { class: "bb-cats" }, cats.map(([c, l]) => h("button", { class: "chip-btn" + (B.cat === c ? " active" : ""), onclick: () => { B.cat = c; B.type = null; B.sel = null; B.moving = false; renderBars(); } }, l)),
    h("button", { class: "chip-btn exit", onclick: () => build.exit() }, "✓ Done")));
  let action = null;
  if (B.sel && !B.moving) {
    const o = world.getObj(B.sel);
    const name = o.type === "house" ? HOUSE_TIERS[o.data.tier || 0].name : OBJECTS[o.type].name;
    action = h("div", { class: "bb-actions" }, h("span", { class: "bb-label" }, `${objectEmoji(o.type)} ${name}`),
      h("button", { class: "act", onclick: () => build.startMove() }, "✥ Move"),
      h("button", { class: "act", onclick: () => build.rotate() }, "⟳ Rotate"),
      o.type === "house" ? null : h("button", { class: "act danger", onclick: () => build.removeSel() }, "🗑 Remove"),
      h("button", { class: "act", onclick: () => build.cancel() }, "Done"));
  } else if (B.moving || B.type) {
    const ground = B.type && build.isGround(B.type);
    const label = B.moving ? "Tap where to move it" : ground ? "Tap or drag to paint" : B.type === "fence" ? "Tap or drag to build fence" : "Tap to position, tap again to place";
    action = h("div", { class: "bb-actions" }, h("span", { class: "bb-label" }, label),
      ground ? null : h("button", { class: "act", onclick: () => build.rotate() }, "⟳ Rotate"),
      ground || B.type === "fence" ? null : h("button", { class: "act primary", onclick: () => build.confirm() }, "✓ Place"),
      h("button", { class: "act", onclick: () => build.cancel() }, "✕ Cancel"));
  } else action = h("div", { class: "bb-actions" }, h("span", { class: "bb-label" }, "Pick an item, or tap a building to move/rotate/remove it"));
  bb.append(action);
  const pal = h("div", { class: "bb-palette" });
  const entries = [];
  for (const [id, o] of Object.entries(OBJECTS)) {
    if (o.cat === "house") continue;
    const c = id === "fence" ? "farm" : o.cat === "deco" ? "deco" : "building";
    if (c === B.cat) entries.push([id, o.name, objectEmoji(id), o.cost, o.level]);
  }
  if (B.cat === "farm") for (const [id, g] of Object.entries(GROUND)) entries.push([id, g.name, g.emoji, g.cost, g.level]);
  for (const [id, name, em, cost, lvl] of entries) {
    const locked = lvl > S.level;
    pal.append(h("button", { class: "pal-item" + (B.type === id ? " active" : "") + (locked ? " locked" : ""), "data-type": id, title: name, onclick: () => build.selectType(id) },
      h("span", { class: "tool-emoji" }, locked ? "🔒" : em), h("span", { class: "tool-name" }, name), h("span", { class: "badge" }, locked ? `Lv${lvl}` : cost ? `$${cost}` : "free")));
  }
  bb.append(pal);
}

// ---------- panels ----------
export function open(kind, arg) {
  panel = { kind, arg };
  hud.panelBackdrop.hidden = false;
  document.body.classList.add("panel-open");
  renderPanel(true);
  emit("panel", kind);
}
export function close() {
  panel = null;
  hud.panelBackdrop.hidden = true;
  document.body.classList.remove("panel-open");
  hud.panelBody.innerHTML = "";
  emit("panel", null);
}

function openObject(o) {
  if (o.type === "house") return open("home");
  if (o.type === "stall") return open("market");
  open("object", o.id);
}

function renderPanel(reset = false) {
  const body = hud.panelBody;
  const scroll = reset ? 0 : body.scrollTop;
  hud.panelTabs.innerHTML = "";
  hud.panelTabs.hidden = true;
  body.innerHTML = "";
  const fn = PANELS[panel.kind];
  if (!fn) return close();
  hud.panelTitle.textContent = fn(body, panel.arg) || "";
  body.scrollTop = scroll;
}

function row(emoji, title, sub, ...actions) {
  return h("div", { class: "row" }, h("span", { class: "row-emoji" }, emoji), h("div", { class: "row-main" }, h("div", { class: "row-title" }, title), sub ? h("div", { class: "row-sub" }, sub) : null), h("div", { class: "row-actions" }, ...actions));
}
function btn(label, onclick, cls = "", disabled = false) {
  return h("button", { class: "btn " + cls, onclick, disabled }, label);
}
function section(title) {
  return h("h3", { class: "sec" }, title);
}

const PANELS = {
  inventory(body) {
    body.append(h("div", { class: "caps" }, h("span", {}, `🌾 Silo ${economy.siloUsed()}/${economy.siloCap()}`), h("span", {}, `🏠 House storage ${economy.goodsUsed()}/${economy.goodsCap()}`)));
    const groups = [["crop", "Crops"], ["good", "Animal goods"], ["feed", "Feed"], ["seed", "Seeds"], ["furn", "Furniture (place from Home)"]];
    let any = false;
    for (const [kind, title] of groups) {
      const ids = Object.keys(S.inv).filter((id) => ITEMS[id] && ITEMS[id].kind === kind && S.inv[id] > 0);
      if (!ids.length) continue;
      any = true;
      body.append(section(title));
      const grid = h("div", { class: "inv-grid" });
      for (const id of ids) grid.append(h("div", { class: "inv-item", title: ITEMS[id].name }, h("span", { class: "inv-emoji" }, ITEMS[id].emoji), h("span", { class: "inv-n" }, S.inv[id]), h("span", { class: "inv-name" }, ITEMS[id].name)));
      body.append(grid);
    }
    if (!any) body.append(h("p", { class: "muted" }, "Your inventory is empty."));
    body.append(section("Equipment"));
    body.append(h("p", {}, `⛏️ Hoe T${S.tools.hoe} · 🚿 Can T${S.tools.can} (${S.canWater}/${CAN_CAP[S.tools.can - 1]}) · 🔪 Scythe T${S.tools.scythe}`));
    if (S.vehicles.tractor) body.append(h("p", {}, "🚜 Tractor: " + S.vehicles.attach.join(", ")));
    return "🎒 Inventory";
  },

  shop(body) {
    hud.panelTabs.hidden = false;
    for (const t of SHOP_TABS) hud.panelTabs.append(h("button", { class: "tab" + (shopTab === t ? " active" : ""), onclick: () => { shopTab = t; renderPanel(true); } }, t));
    for (const e of economy.shopList().filter((x) => x.tab === shopTab)) {
      const locked = e.level > S.level;
      let actions = [];
      let sub = e.desc;
      if (locked) actions = [h("span", { class: "lock" }, `🔒 Lv ${e.level}`)];
      else if (e.build) actions = [btn(e.cost ? `$${e.cost} · Place` : "Place", () => { close(); build.enter(e.id); }, "primary")];
      else if (e.qty) actions = [btn(`$${e.cost}`, () => economy.buy(e.id, 1)), btn(`×10 $${e.cost * 10}`, () => economy.buy(e.id, 10))];
      else {
        let owned = false;
        if (e.tool) owned = S.tools[e.tool] >= e.tier;
        else if (VEHICLES[e.id]) owned = e.id === "tractor" ? !!S.vehicles.tractor : S.vehicles.attach.includes(e.id);
        actions = [owned ? h("span", { class: "owned" }, "✓ Owned") : btn(`$${e.cost.toLocaleString()}`, () => economy.buy(e.id), "primary", S.money < e.cost)];
        if (e.id.startsWith("furn_") && S.inv[e.id]) sub += ` · own ${S.inv[e.id]}`;
        if (e.id.startsWith("animal_")) {
          const n = S.animals.filter((a) => a.type === e.id.slice(7)).length;
          if (n) sub += ` · you have ${n}`;
        }
      }
      body.append(row(locked ? "🔒" : e.emoji, e.name, sub, ...actions));
    }
    return `🛒 Shop · $${S.money.toLocaleString()}`;
  },

  market(body) {
    body.append(h("div", { class: "market-top" }, btn("💰 Sell all", () => economy.sellAll(), "primary big"), h("span", { class: "muted" }, "Prices change daily (±15%)")));
    const own = Object.keys(S.inv).filter((id) => ITEMS[id] && ITEMS[id].base > 0 && S.inv[id] > 0);
    if (!own.length) body.append(h("p", { class: "muted" }, "Nothing to sell yet — harvest crops or collect animal goods."));
    for (const id of own) {
      const p = economy.price(id);
      body.append(row(ITEMS[id].emoji, `${ITEMS[id].name} ×${S.inv[id]}`, h("span", {}, `$${p} each `, trend(id)), btn("Sell 1", () => economy.sell(id, 1)), btn(`All $${p * S.inv[id]}`, () => economy.sell(id), "primary")));
    }
    body.append(section("Today's prices"));
    const grid = h("div", { class: "price-grid" });
    for (const id of [...CROP_IDS, ...Object.keys(PRODUCTS)]) grid.append(h("div", { class: "price" }, `${ITEMS[id].emoji} $${economy.price(id)} `, trend(id)));
    body.append(grid);
    return "⚖️ Market";
  },

  seeds(body) {
    for (const id of CROP_IDS) {
      const n = economy.count("seed_" + id);
      const c = CROPS[id];
      if (!n && c.level > S.level) continue;
      body.append(row(c.emoji, `${c.name} seeds ×${n}`, `${c.grow}h · sells $${c.sell}`, n ? btn(S.settings.seed === id ? "✓ Selected" : "Select", () => { S.settings.seed = id; S.settings.tool = "seed"; close(); emit("change"); }, S.settings.seed === id ? "" : "primary") : btn(`Buy $${c.seed}`, () => economy.buy("seed_" + id, 1))));
    }
    return "🌱 Choose seeds";
  },

  tractor(body) {
    const modes = [["plow", "🚜 Plow", "Drag to till grass"], ["seeder", "🌱 Seeder", "Drag to plant selected seed"], ["harvester", "🧺 Harvester", "Drag to harvest ripe crops"]];
    for (const [m, n, d] of modes) {
      const has = m === "plow" || S.vehicles.attach.includes(m);
      body.append(row(n.split(" ")[0], n.slice(3), d, has ? btn(S.settings.tractorMode === m ? "✓ Active" : "Use", () => { S.settings.tractorMode = m; S.settings.tool = "tractor"; close(); emit("change"); }, "primary") : h("span", { class: "lock" }, "Buy in Shop")));
    }
    if (S.vehicles.attach.includes("sprayer")) body.append(h("p", { class: "muted" }, "💦 Sprayer: waters every crop automatically at dawn."));
    return "🚜 Tractor attachment";
  },

  object(body, id) {
    const o = world.getObj(id);
    if (!o) {
      setTimeout(close);
      return "";
    }
    const def = OBJECTS[o.type];
    if (def.desc) body.append(h("p", { class: "muted" }, def.desc));
    if (o.type === "silo") {
      body.append(h("p", {}, `Storage: ${economy.siloUsed()}/${economy.siloCap()} (crops + feed) · 🥣 Feed: ${economy.count("feed")}`));
      body.append(section("Mill grain → feed (1 → 4)"));
      const mills = CROP_IDS.filter((c) => CROPS[c].mill);
      for (const c of mills) body.append(row(CROPS[c].emoji, `${CROPS[c].name} ×${economy.count(c)}`, "", btn("Mill 1", () => economy.mill(c, 1), "", !economy.count(c)), btn("Mill all", () => economy.mill(c, economy.count(c)), "primary", !economy.count(c))));
    } else if (animals.isHome(o)) {
      const list = animals.animalsIn(o.id);
      const cap = animals.capacity(o);
      body.append(h("p", {}, `${list.length}/${cap} animals · 🥣 Feed in silo: ${economy.count("feed")}`));
      body.append(h("div", { class: "btn-row" },
        btn(`🥣 Feed (${animals.hungryCount(o.id)} hungry)`, () => animals.feedBuilding(o.id), "primary"),
        btn(`🧺 Collect (${animals.readyCount(o.id)})`, () => animals.collect(o.id), "primary", !animals.readyCount(o.id)),
        btn("🛒 Buy animals", () => { shopTab = "Animals"; open("shop"); })));
      for (const a of list) {
        const ad = ANIMALS[a.type];
        const st = a.ready ? `${PRODUCTS[ad.product].emoji} ready!` : a.fed > 0 ? `producing ${Math.floor((a.prog / ad.interval) * 100)}% · fed ${Math.ceil(a.fed / 60)}h` : "🍽️ hungry";
        body.append(row(ad.emoji, ad.name, `${st} · ${"❤️".repeat(Math.max(1, Math.round(a.happy * 4)))}`));
      }
      body.append(section("Upgrades"));
      if (!o.data.tier) body.append(row("⬆️", def.upName, `Capacity ${def.cap[1]}`, btn(`$${def.upCost}`, () => animals.upgradeHome(o.id), "primary", S.money < def.upCost)));
      if (!o.data.autofeed) body.append(row("⚙️", "Auto-feeder", "Feeds hungry animals from the silo", btn(`$${AUTOFEED_COST}`, () => animals.buyAutofeeder(o.id, AUTOFEED_COST), "primary", S.money < AUTOFEED_COST)));
      else body.append(h("p", { class: "muted" }, "⚙️ Auto-feeder installed."));
    } else if (o.type === "well") {
      body.append(btn("💧 Refill watering can", () => farming.refill(), "primary big"));
    }
    body.append(h("p", { class: "muted small" }, "Use 🏗️ Build to move, rotate or remove."));
    const name = o.data.tier && def.upName ? def.upName : def.name;
    return `${objectEmoji(o.type)} ${name}`;
  },

  home(body) {
    const tier = world.houseTier();
    const t = HOUSE_TIERS[tier];
    const next = HOUSE_TIERS[tier + 1];
    body.append(h("div", { class: "btn-row" },
      btn(interior.hasBed() ? "😴 Sleep until morning" : "😴 Sleep (needs a bed)", () => {
        if (!interior.hasBed()) return toast("Place a bed in your house first", "bad");
        close();
        sleep();
        save();
      }, "primary big", !interior.hasBed()),
      next ? btn(`⬆️ Upgrade to ${next.name} (${next.w}×${next.h}) $${next.cost.toLocaleString()}`, () => build.upgradeHouse(), "", S.money < next.cost) : null));
    body.append(h("p", { class: "muted" }, `${t.name} · room ${t.room}×${t.room} · house storage ${economy.goodsUsed()}/${economy.goodsCap()}. Pick a tool, then tap tiles to design your interior.`));
    const ed = h("div", { class: "interior" });
    interior.renderEditor(ed);
    body.append(ed);
    return `${t.label} Home — ${t.name}`;
  },

  menu(body) {
    body.append(h("div", { class: "btn-row" },
      btn("💾 Save now", () => { save() ? toast("Game saved", "good") : toast("Save failed", "bad"); }, "primary"),
      btn("📤 Export save", () => {
        const blob = new Blob([exportJSON()], { type: "application/json" });
        const a = h("a", { href: URL.createObjectURL(blob), download: `farm-day${S.time.day}.json` });
        document.body.append(a);
        a.click();
        a.remove();
      }),
      btn("📥 Import save", () => fileInput.click())));
    const fileInput = h("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: async (e) => {
      const f = e.target.files[0];
      if (f) emit("game:import", await f.text());
    } });
    body.append(fileInput);
    body.append(section("Settings"));
    body.append(h("div", { class: "btn-row" }, ...[1, 2, 4].map((s) => btn(`${s}× speed`, () => { S.settings.speed = s; emit("change"); }, S.settings.speed === s ? "primary" : ""))));
    body.append(section("Stats"));
    body.append(h("p", {}, `Day ${S.time.day} · Level ${S.level} (${S.xp} XP) · Earned $${S.stats.earned.toLocaleString()} · Harvested ${S.stats.harvested} · Animals ${S.animals.length}`));
    body.append(section("How to play"));
    body.append(h("ul", { class: "help" },
      h("li", {}, "Pick a tool in the bottom bar (keys 1–7), then tap tiles. Hoe tills, Seed plants, Water waters, Scythe/Hand harvests."),
      h("li", {}, "Crops only grow while watered. Water resets every morning unless it rains."),
      h("li", {}, "Sell at the Market. Buy seeds, tools, tractors and animals in the Shop."),
      h("li", {}, "Build mode (B): place coops, barns, silos, fences, paths and soil. R rotates, Esc cancels."),
      h("li", {}, "Feed animals every day (Feed tool or the building panel), then collect goods with Hand."),
      h("li", {}, "Drag to pan, pinch / scroll to zoom, long-press for info. Sleep in Home to restore energy.")));
    let armed = false;
    const ng = btn("🆕 New game", () => {
      if (!armed) {
        armed = true;
        ng.textContent = "⚠️ Tap again to erase your farm";
        return;
      }
      close();
      emit("game:new");
    }, "danger");
    body.append(h("div", { class: "btn-row" }, ng, h("a", { class: "btn", href: "../" }, "← Back to Jarvis")));
    return "☰ Menu";
  },
};

function trend(id) {
  const t = economy.priceTrend(id);
  return h("span", { class: t > 0 ? "up" : t < 0 ? "down" : "flat" }, t > 0 ? "▲" : t < 0 ? "▼" : "•");
}

// ---------- toasts & tooltip ----------
export function showToast(msg, kind = "info") {
  const el = h("div", { class: "toast " + kind }, msg);
  hud.toasts.append(el);
  while (hud.toasts.children.length > 4) hud.toasts.firstChild.remove();
  setTimeout(() => el.classList.add("out"), 2400);
  setTimeout(() => el.remove(), 2900);
}

export function tooltip(text, x, y) {
  const t = hud.tooltip;
  if (!text) {
    t.hidden = true;
    return;
  }
  t.textContent = text;
  t.hidden = false;
  const w = t.offsetWidth;
  t.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2)) + "px";
  t.style.top = Math.max(60, y - t.offsetHeight - 24) + "px";
}

export function tileInfo(x, y) {
  if (!world.inBounds(x, y)) return "";
  const o = world.objAt(x, y);
  if (o) {
    if (o.type === "house") return `${HOUSE_TIERS[o.data.tier || 0].name} — tap with ✋ to open Home`;
    const def = OBJECTS[o.type];
    if (animals.isHome(o)) return `${def.name}: ${animals.animalsIn(o.id).length}/${animals.capacity(o)} animals, ${animals.readyCount(o.id)} ready, ${animals.hungryCount(o.id)} hungry`;
    return def.name + (def.desc ? " — " + def.desc : "");
  }
  const c = farming.cropAt(x, y);
  if (c) {
    const def = CROPS[c.c];
    if (farming.isReady(c)) return `${def.emoji} ${def.name} — ready to harvest!`;
    const left = Math.ceil((farming.totalMinutes(c) - c.g) / 60);
    return `${def.emoji} ${def.name} ${Math.floor((c.g / farming.totalMinutes(c)) * 100)}% · ${left}h left · ${c.wet ? "💧 watered" : "🏜️ needs water"}`;
  }
  return { g: "Grass — till it with the hoe", s: "Tilled soil — plant seeds here", p: "Path", w: "Pond — refill your watering can" }[world.ground(x, y)] || "";
}
