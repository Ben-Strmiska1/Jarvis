// Playwright smoke test for the farm game.
// Run: python3 -m http.server 8123 (repo root), then
//   NODE_PATH=/opt/node22/lib/node_modules node farm/tests/smoke.mjs
import { createRequire } from "node:module";

// ESM ignores NODE_PATH, so fall back to require() (which honours it) for a global playwright install.
let pw;
try {
  pw = await import("playwright");
} catch {
  pw = createRequire(import.meta.url)("playwright");
}
const { chromium } = pw;

const EXE = process.env.CHROME || "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome";
const URL = process.env.FARM_URL || "http://localhost:8123/farm/";
const SHOTS = process.env.SHOTS || "/tmp";
const errors = [];
let passed = 0;

function watch(page, label) {
  page.on("pageerror", (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[${label}] console error: ${m.text()}`);
  });
}
function assert(cond, msg) {
  if (!cond) throw new Error("Assertion failed: " + msg);
  passed++;
  console.log("  ✓ " + msg);
}
const ready = (page) => page.waitForFunction(() => window.__farm && window.__farm.state && window.__farm.state.time);
const F = (page, fn, arg) => page.evaluate(fn, arg);

async function freshGame(page) {
  await page.goto(URL);
  await ready(page);
  await page.evaluate(() => {
    window.__farmNoSave = true;
    localStorage.clear();
  });
  await page.reload();
  await ready(page);
}

async function clickTile(page, x, y, how = "mouse") {
  await F(page, ([x, y]) => window.__farm.centerOn(x + 0.5, y + 0.5), [x, y]);
  const p = await F(page, ([x, y]) => window.__farm.tileToScreen(x, y), [x, y]);
  if (how === "touch") await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(60);
}

async function desktop(browser) {
  console.log("Desktop (1280x800)");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  watch(page, "desktop");
  await freshGame(page);
  let s = await F(page, () => ({ money: __farm.state.money, day: __farm.state.time.day, seeds: __farm.state.inv.seed_wheat, objs: __farm.state.objects.length }));
  assert(s.money === 500 && s.day === 1 && s.seeds === 10 && s.objs === 2, "new game: $500, day 1, 10 wheat seeds, shack + stall");
  // Pause the real-time clock so only advance() moves time.
  await F(page, () => (__farm.state.settings.paused = true));

  // --- farming ---
  const farm = await F(page, () => {
    const f = __farm;
    const tilled = f.act("hoe", 26, 21);
    const g = f.state.map.ground[21 * f.state.map.w + 26];
    f.act("seed", 18, 18, "wheat");
    f.act("can", 18, 18);
    const wet = f.state.crops["18,18"].wet;
    f.advance(480);
    const ready = f.state.crops["18,18"].g >= 480;
    f.act("scythe", 18, 18);
    return { tilled, g, wet, ready, wheat: f.state.inv.wheat || 0, crop: !!f.state.crops["18,18"] };
  });
  assert(farm.tilled > 0 && farm.g === "s", "hoe tills grass into soil");
  assert(farm.wet, "watering marks crop wet");
  assert(farm.ready, "wheat fully grown after 8 game hours");
  assert(farm.wheat > 0 && !farm.crop, "scythe harvests wheat into inventory");

  const sale = await F(page, () => {
    const before = __farm.state.money;
    __farm.sell("wheat");
    return { before, after: __farm.state.money, left: __farm.state.inv.wheat || 0 };
  });
  assert(sale.after > sale.before && sale.left === 0, `selling wheat raises money ($${sale.before} → $${sale.after})`);

  // --- animals ---
  const an = await F(page, () => {
    const f = __farm;
    const b = f.buy("coop");
    const p = f.place("coop", 28, 18, 0);
    const chick = f.buy("animal_chicken");
    f.sleep(); // start a fresh morning
    f.buy("feed", 2);
    const coop = p.obj;
    const fed = f.act("feed", coop.x, coop.y);
    f.advance(720);
    const readyNow = f.state.animals[0].ready;
    f.act("hand", coop.x, coop.y);
    return { b: b.ok && b.build === "coop", placed: p.ok, chick: chick.ok, fed, readyNow, egg: f.state.inv.egg || 0, coopId: coop.id };
  });
  assert(an.b && an.placed, "buy + place coop");
  assert(an.chick, "buy chicken into coop");
  assert(an.fed === 1, "feed tool feeds the chicken");
  assert(an.readyNow, "egg ready after 12 fed hours");
  assert(an.egg >= 1, "hand collects egg into inventory");

  // --- build: rotate / move / remove + occupancy ---
  const bd = await F(page, (coopId) => {
    const f = __farm;
    f.state.money += 2000;
    const occBefore = [f.occupancy(30, 18), f.occupancy(28, 20)];
    const rot = f.rotate(coopId);
    const occAfter = [f.occupancy(30, 18), f.occupancy(28, 20)];
    const well = f.place("well", 33, 22, 0).obj;
    const mv = f.move(well.id, 34, 23);
    const occMove = [f.occupancy(33, 22), f.occupancy(34, 23)];
    const blocked = f.move(well.id, 28, 18).ok;
    const m0 = f.state.money;
    const rm = f.remove(well.id);
    const refund = f.state.money - m0;
    const occRm = f.occupancy(34, 23);
    const coopRm = f.remove(coopId).ok;
    const houseRm = f.remove(1).ok;
    return { occBefore, rot: rot.ok, occAfter, coopId, wellId: well.id, mv: mv.ok, occMove, blocked, rm: rm.ok, refund, occRm, coopRm, houseRm };
  }, an.coopId);
  assert(bd.occBefore[0] === bd.coopId && bd.occBefore[1] === 0, "coop occupies 3×2 footprint");
  assert(bd.rot && bd.occAfter[0] === 0 && bd.occAfter[1] === bd.coopId, "rotating coop swaps footprint to 2×3");
  assert(bd.mv && bd.occMove[0] === 0 && bd.occMove[1] === bd.wellId, "moving well updates occupancy");
  assert(!bd.blocked, "can't move onto another building");
  assert(bd.rm && bd.refund === 150 && bd.occRm === 0, "removing well refunds 50% and clears occupancy");
  assert(!bd.coopRm && !bd.houseRm, "coop with animals and farmhouse can't be removed");

  // --- interior ---
  const int = await F(page, () => {
    const f = __farm;
    const b = f.buy("furn_chair");
    const placed = f.interior.place("chair", 3, 3);
    f.interior.rotate(3, 3);
    f.interior.toggleWall(0, 5);
    const it = f.state.interior.items.find((i) => i.type === "chair");
    return { b: b.ok, placed, rot: it && it.rot, wall: f.state.interior.walls.includes("0,5"), bed: f.interior.hasBed() };
  });
  assert(int.b && int.placed && int.rot === 1, "buy, place and rotate furniture in the house");
  assert(int.wall && int.bed, "toggle interior wall; starter bed present");

  // --- silo / mill, house upgrade, tractor ---
  const ex = await F(page, () => {
    const f = __farm;
    f.state.money += 50000;
    f.state.xp = 1300;
    f.state.level = 6;
    const silo = f.place("silo", 34, 16, 0).ok;
    const cap = f.economy.siloCap();
    f.state.inv.wheat = 3;
    const milled = f.economy.mill("wheat", 3);
    const up = f.upgradeHouse().ok;
    const tier = f.state.objects.find((o) => o.type === "house").data.tier;
    const houseOcc = f.occupancy(23, 11) === 1;
    const t = ["tractor", "seeder", "harvester", "sprayer"].map((id) => f.buy(id).ok);
    f.buy("seed_wheat", 10);
    const plowed = f.tractor(30, 26, 33, 27, "plow");
    const sown = f.tractor(30, 26, 33, 27, "seeder");
    f.sleep(); // sprayer waters at dawn
    const allWet = ["30,26", "33,27"].every((k) => f.state.crops[k] && f.state.crops[k].wet);
    f.advance(480);
    const reaped = f.tractor(30, 26, 33, 27, "harvester");
    return { silo, cap, milled, feed: f.state.inv.feed, up, tier, houseOcc, t, plowed, sown, allWet, reaped };
  });
  assert(ex.silo && ex.cap === 300, "silo adds 250 storage");
  assert(ex.milled === 3 && ex.feed >= 12, "mill turns wheat into feed (1 → 4)");
  assert(ex.up && ex.tier === 1 && ex.houseOcc, "farmhouse upgrades in place to a 4×3 cottage");
  assert(ex.t.every(Boolean), "buy tractor + seeder/harvester/sprayer");
  assert(ex.plowed === 8 && ex.sown === 8, "tractor plows and seeds a 4×2 rect");
  assert(ex.allWet, "sprayer waters crops at dawn");
  assert(ex.reaped === 8, "harvester reaps the field");

  // --- save + reload ---
  const snap = await F(page, () => {
    const s = __farm.state;
    __farm.save();
    return { money: s.money, egg: s.inv.egg, objs: s.objects.length, animals: s.animals.length, items: s.interior.items.length, day: s.time.day, ground: s.map.ground.join("") };
  });
  await page.reload();
  await ready(page);
  const after = await F(page, () => {
    const s = __farm.state;
    return { money: s.money, egg: s.inv.egg, objs: s.objects.length, animals: s.animals.length, items: s.interior.items.length, day: s.time.day, ground: s.map.ground.join("") };
  });
  assert(JSON.stringify(snap) === JSON.stringify(after), "save + reload preserves state");
  const occOk = await F(page, (id) => __farm.occupancy(28, 20) === id, an.coopId);
  assert(occOk, "occupancy rebuilt on load");

  // --- real canvas clicks ---
  await F(page, () => (__farm.state.settings.paused = true));
  await page.click('#hotbar [data-tool="hoe"]');
  await clickTile(page, 25, 23);
  assert((await F(page, () => __farm.state.map.ground[23 * 48 + 25])) === "s", "mouse click with hoe tills a tile");
  await page.click('#hotbar [data-tool="seed"]');
  await clickTile(page, 25, 23);
  assert(await F(page, () => !!__farm.state.crops["25,23"]), "mouse click with seed plants");
  await page.click('#hotbar [data-tool="hand"]');
  await clickTile(page, 21, 12);
  assert(await page.isVisible("#panel"), "hand click on farmhouse opens Home panel");
  assert((await page.locator(".int-cell").count()) === 64, "interior editor shows 8×8 cottage room");
  await page.click("#panelClose");
  // tractor drag with the real mouse
  await F(page, () => (__farm.state.settings.tractorMode = "plow"));
  await page.click('#hotbar [data-tool="tractor"]');
  await F(page, () => __farm.centerOn(37.5, 21));
  const a = await F(page, () => __farm.tileToScreen(36, 20));
  const b = await F(page, () => __farm.tileToScreen(38, 21));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  const plowedTiles = await F(page, () => [36, 37, 38].flatMap((x) => [20, 21].map((y) => __farm.state.map.ground[y * 48 + x])).filter((c) => c === "s").length);
  assert(plowedTiles === 6, "mouse drag with tractor plows a 3×2 rect");
  await page.click('#hotbar [data-tool="hand"]');
  await page.keyboard.press("b");
  await page.click('.pal-item[data-type="fence"]').catch(async () => {
    await page.click(".bb-cats .chip-btn:nth-child(2)");
    await page.click('.pal-item[data-type="fence"]');
  });
  await clickTile(page, 30, 25);
  assert(await F(page, () => __farm.objAt(30, 25)?.type === "fence"), "build mode: click places a fence");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  assert(await page.isHidden("#buildbar"), "Esc leaves build mode");
  await page.click('#rail [data-panel="shop"]');
  assert(await page.isVisible("#panel .row"), "shop panel lists items");
  await page.click("#panelClose");

  await F(page, () => __farm.centerOn(23, 17));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/farm-desktop.png` });
  await F(page, () => {
    __farm.state.xp = Math.max(__farm.state.xp, 60);
    __farm.state.level = Math.max(__farm.state.level, 2);
    __farm.place("lamp", 24, 16, 0);
    __farm.advance(21 * 60 - __farm.state.time.minute);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}/farm-desktop-night.png` });
  await page.click('#rail [data-panel="shop"]');
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${SHOTS}/farm-desktop-shop.png` });
  await page.click("#panelClose");
  await ctx.close();
}

async function mobile(browser) {
  console.log("Mobile (390x844, touch)");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  watch(page, "mobile");
  await freshGame(page);
  await F(page, () => (__farm.state.settings.paused = true));
  const hb = await page.locator("#hotbar").boundingBox();
  assert(hb && hb.x >= 0 && hb.x + hb.width <= 390, "hotbar fits mobile width");
  await page.tap('#hotbar [data-tool="hoe"]');
  await clickTile(page, 24, 21, "touch");
  assert((await F(page, () => __farm.state.map.ground[21 * 48 + 24])) === "s", "touch tap with hoe tills a tile");
  await page.tap('#hotbar [data-tool="seed"]');
  await clickTile(page, 19, 18, "touch");
  await page.tap('#hotbar [data-tool="can"]');
  await clickTile(page, 19, 18, "touch");
  assert(await F(page, () => __farm.state.crops["19,18"]?.wet === true), "touch: plant + water");
  await F(page, () => __farm.centerOn(22, 16));
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/farm-mobile.png` });
  await page.tap('#rail [data-panel="shop"]');
  assert(await page.isVisible("#panel"), "touch opens shop sheet");
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${SHOTS}/farm-mobile-shop.png` });
  await page.tap("#panelClose");
  await page.tap('#rail [data-panel="build"]');
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${SHOTS}/farm-mobile-build.png` });
  await page.tap('#rail [data-panel="build"]');
  await page.tap('#rail [data-panel="home"]');
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${SHOTS}/farm-mobile-home.png` });
  await ctx.close();
}

const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
let failed = null;
try {
  await desktop(browser);
  await mobile(browser);
} catch (e) {
  failed = e;
} finally {
  await browser.close();
}
if (errors.length) {
  console.error("\nPage/console errors:\n" + errors.join("\n"));
}
if (failed) console.error("\nFAIL: " + failed.message);
if (failed || errors.length) process.exit(1);
console.log(`\nPASS: ${passed} checks, 0 page/console errors. Screenshots in ${SHOTS}`);
