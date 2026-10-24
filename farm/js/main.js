// Bootstrap, main loop, autosave and the window.__farm debug hook.
import * as state from "./state.js";
import { MS_PER_MIN, CATCHUP_MAX_MIN, HOTBAR } from "./data.js";
import { on, emit, toast } from "./bus.js";
import * as world from "./world.js";
import * as render from "./render.js";
import * as input from "./input.js";
import * as time from "./time.js";
import * as farming from "./farming.js";
import * as animals from "./animals.js";
import * as economy from "./economy.js";
import * as build from "./build.js";
import * as interior from "./interior.js";
import * as ui from "./ui.js";

const canvas = document.getElementById("game");
let acc = 0;
let lastT = 0;

function startGame(s) {
  state.setState(s);
  world.init();
  render.resize();
  const h = world.house();
  if (h) render.centerOn(h.x + 2, h.y + 4);
  build.exit();
  emit("change");
}

function catchUp() {
  const S = state.S;
  const elapsed = Date.now() - (S.savedAt || Date.now());
  const mins = Math.min(CATCHUP_MAX_MIN, Math.floor(elapsed / MS_PER_MIN));
  if (mins >= 10 && !S.settings.paused) {
    time.tick(mins);
    toast(`⏳ While you were away, ${mins >= 60 ? Math.floor(mins / 60) + "h" : mins + " min"} passed on the farm`);
  }
}

export function paused() {
  return state.S.settings.paused || ui.isOpen() || document.hidden;
}

function loop(t) {
  const dt = Math.min(250, lastT ? t - lastT : 16);
  lastT = t;
  if (!paused()) {
    acc += dt * (state.S.settings.speed || 1);
    const mins = Math.floor(acc / MS_PER_MIN);
    if (mins > 0) {
      acc -= mins * MS_PER_MIN;
      time.tick(mins);
    }
  }
  animals.updateWander(dt);
  input.update(dt);
  render.draw(t);
  ui.frame();
  requestAnimationFrame(loop);
}

// ---------- input wiring ----------
let rectStart = null;
const handlers = {
  tap(tile) {
    ui.tooltip(null);
    if (build.B.active) build.tap(tile.x, tile.y);
    else farming.act(state.S.settings.tool, tile.x, tile.y);
    emit("change");
  },
  hover(tile) {
    render.overlay.hover = tile;
    if (tile && build.B.active) build.hover(tile.x, tile.y);
  },
  dragStart(tile) {
    if (build.B.active) {
      const m = build.dragMode();
      if (m !== "pan") build.dragMove(tile.x, tile.y, m);
      return m;
    }
    if (state.S.settings.tool === "tractor" && state.S.vehicles.tractor) {
      rectStart = tile;
      render.overlay.rect = { x0: tile.x, y0: tile.y, x1: tile.x, y1: tile.y };
      return "rect";
    }
    return "pan";
  },
  dragMove(tile, mode) {
    if (mode === "rect" && rectStart) render.overlay.rect = { x0: rectStart.x, y0: rectStart.y, x1: tile.x, y1: tile.y };
    else build.dragMove(tile.x, tile.y, mode);
  },
  dragEnd(mode, cancelled) {
    if (mode === "rect") {
      const r = render.overlay.rect;
      render.overlay.rect = null;
      rectStart = null;
      if (r && !cancelled) farming.tractorRect(r.x0, r.y0, r.x1, r.y1);
    }
    emit("change");
  },
  longpress(tile, x, y) {
    ui.tooltip(ui.tileInfo(tile.x, tile.y), x, y);
  },
  longpressEnd() {
    setTimeout(() => ui.tooltip(null), 1200);
  },
  key(e) {
    const k = e.key.toLowerCase();
    if (k === "escape") {
      if (ui.isOpen()) ui.close();
      else if (build.B.active) build.cancel();
      return;
    }
    if (ui.isOpen()) return;
    if (k === "b") return build.B.active ? build.exit() : build.enter();
    if (k === "r" && build.B.active) return build.rotate();
    if (/^[1-7]$/.test(k) && !build.B.active) {
      const items = HOTBAR.filter((t) => t.id !== "tractor" || state.S.vehicles.tractor);
      const t = items[+k - 1];
      if (t) ui.setTool(t.id);
    }
  },
};

// ---------- persistence ----------
function doSave() {
  if (window.__farmNoSave) return; // lets tests wipe the save without beforeunload re-writing it
  state.save();
}
on("hour", doSave);
on("day", doSave);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) doSave();
  lastT = 0;
});
window.addEventListener("beforeunload", doSave);
on("game:new", () => {
  state.clearSave();
  startGame(state.newGame());
  doSave();
  toast("🌱 A fresh farm awaits!", "good");
});
on("game:import", (text) => {
  try {
    startGame(state.importJSON(text));
    doSave();
    toast("Save imported", "good");
  } catch (e) {
    toast("Import failed: " + e.message, "bad");
  }
});

// ---------- boot ----------
function boot() {
  const loaded = state.load();
  state.setState(loaded || state.newGame());
  world.init();
  render.init(canvas);
  input.init(canvas, handlers);
  ui.init();
  if (loaded) catchUp();
  else toast("🌾 Welcome! Till, plant and water your field to get started.", "good");
  doSave();
  requestAnimationFrame(loop);
}

boot();

// ---------- debug / test hook ----------
window.__farm = {
  get state() {
    return state.S;
  },
  act(tool, x, y, opt) {
    const r = farming.act(tool, x, y, opt);
    emit("change");
    return r;
  },
  advance(min) {
    time.tick(min);
  },
  sleep: () => time.sleep(),
  buy: (id, qty) => economy.buy(id, qty),
  sell: (id, n) => economy.sell(id, n),
  sellAll: () => economy.sellAll(),
  place: (type, x, y, rot = 0) => build.purchasePlace(type, x, y, rot),
  move: (id, x, y, rot) => world.move(id, x, y, rot),
  rotate: (id) => world.rotate(id),
  remove(id) {
    const r = world.remove(id);
    if (r.ok && r.refund) economy.earn(r.refund);
    return r;
  },
  objAt: (x, y) => world.objAt(x, y),
  occupancy: (x, y) => world.occ[y * world.W + x],
  feed: (id) => animals.feedBuilding(id),
  collect: (id) => animals.collect(id),
  interior: { place: interior.place, remove: interior.remove, rotate: interior.rotate, toggleWall: interior.toggleWall, hasBed: interior.hasBed },
  upgradeHouse: () => build.upgradeHouse(),
  tractor: (x0, y0, x1, y1, mode) => farming.tractorRect(x0, y0, x1, y1, mode),
  save: () => state.save(),
  tileToScreen: (x, y) => render.tileToScreen(x, y),
  cam: render.cam,
  centerOn: (x, y) => render.centerOn(x, y),
  setTool: (t) => ui.setTool(t),
  ui,
  build,
  economy,
  farming,
};
