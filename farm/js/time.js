// Game clock: ticking, day rollover, weather.
import { S, rng } from "./state.js";
import { DAY_START, DAY_END } from "./data.js";
import { emit, toast } from "./bus.js";
import * as farming from "./farming.js";
import * as animals from "./animals.js";
import * as economy from "./economy.js";

export function clock(minute = S.time.minute) {
  const h = Math.floor(minute / 60) % 24;
  const m = Math.floor(minute % 60);
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

export function weatherIcon(w = S.time.weather) {
  return { sun: "☀️", cloud: "⛅", rain: "🌧️" }[w] || "☀️";
}

// 0 (day) .. ~0.6 (deep night)
export function darkness(minute = S.time.minute) {
  const h = minute / 60;
  if (h < 7) return 0.22 * (7 - h); // dawn 6-7
  if (h < 18) return 0;
  if (h < 21) return ((h - 18) / 3) * 0.55;
  return 0.55 + Math.min(0.1, ((h - 21) / 5) * 0.1);
}

// Advance the simulation by m game minutes.
export function tick(m) {
  m = Math.max(0, Math.floor(m));
  while (m > 0) {
    const toHour = 60 - (S.time.minute % 60);
    const toEnd = DAY_END - S.time.minute;
    const step = Math.max(1, Math.min(m, toHour, toEnd));
    farming.tick(step);
    animals.tick(step);
    S.time.minute += step;
    m -= step;
    if (S.time.minute % 60 === 0) emit("hour", S.time.minute);
    if (S.time.minute >= DAY_END) rollover(true);
  }
  emit("change");
}

export function rollover(forced = false) {
  S.time.day += 1;
  S.time.minute = DAY_START;
  const r = rng(S.seed * 7 + S.time.day * 131)();
  S.time.weather = r < 0.2 ? "rain" : r < 0.45 ? "cloud" : "sun";
  const rain = S.time.weather === "rain";
  farming.onRollover(rain);
  animals.onRollover();
  economy.rerollPrices();
  S.energy = 100;
  emit("day", { forced, day: S.time.day });
  if (forced) toast("😴 You collapsed at 2 AM and woke up at home. New day!", "bad");
  else toast(`☀️ Good morning! Day ${S.time.day}${rain ? " — it's raining, crops are watered" : ""}`, "good");
  emit("change");
}

// Sleeping skips the rest of the evening (crops and animals still progress through it).
export function sleep() {
  // Step hourly (like tick) so auto-feeders top up animals during the night.
  let rest = DAY_END - S.time.minute;
  while (rest > 0) {
    const step = Math.min(60, rest);
    farming.tick(step);
    animals.tick(step);
    rest -= step;
  }
  rollover(false);
}
