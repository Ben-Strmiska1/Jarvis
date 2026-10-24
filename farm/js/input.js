// Pointer (mouse/touch/pen), wheel and keyboard input for the map canvas.
import * as render from "./render.js";

const TAP_PX = 8;
const LONG_MS = 500;
const pointers = new Map();
let start = null; // single-pointer gesture
let pinch = null;
let H = {};
const held = new Set();

export function init(canvas, handlers) {
  H = handlers;
  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse" && !pointers.size) H.hover && H.hover(null);
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      render.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    },
    { passive: false }
  );
  window.addEventListener("keydown", (e) => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if ("wasd".includes(k) && k.length === 1) held.add(k);
    if (H.key) H.key(e);
  });
  window.addEventListener("keyup", (e) => held.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => held.clear());
}

function tileOf(e) {
  return render.screenToTile(e.clientX, e.clientY);
}

function down(e) {
  e.preventDefault();
  try {
    e.target.setPointerCapture(e.pointerId);
  } catch (err) {
    /* ignore */
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    start = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), mode: null, tile: tileOf(e), long: false, lx: e.clientX, ly: e.clientY };
    clearTimeout(start.timer);
    const s = start;
    s.timer = setTimeout(() => {
      if (start === s && !s.mode) {
        s.long = true;
        H.longpress && H.longpress(s.tile, s.x, s.y);
      }
    }, LONG_MS);
  } else if (pointers.size === 2) {
    if (start) {
      clearTimeout(start.timer);
      if (start.mode && start.mode !== "pan" && H.dragEnd) H.dragEnd(start.mode, true);
    }
    start = null;
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }
}

function move(e) {
  if (!pointers.has(e.pointerId)) {
    if (e.pointerType === "mouse" && H.hover) H.hover(tileOf(e));
    return;
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if (pinch.d > 0) render.zoomAt(mx, my, d / pinch.d);
    render.pan(mx - pinch.mx, my - pinch.my);
    pinch = { d, mx, my };
    return;
  }
  if (!start || start.id !== e.pointerId) return;
  if (!start.mode) {
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < TAP_PX) return;
    clearTimeout(start.timer);
    if (start.long) {
      // Long-press turned into a drag: treat it as a drag so dragEnd still fires on release.
      start.long = false;
      H.longpressEnd && H.longpressEnd();
    }
    start.mode = (H.dragStart && H.dragStart(start.tile)) || "pan";
  }
  if (start.mode === "pan") render.pan(e.clientX - start.lx, e.clientY - start.ly);
  else if (H.dragMove) H.dragMove(tileOf(e), start.mode, start.tile);
  start.lx = e.clientX;
  start.ly = e.clientY;
}

function up(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (!start || start.id !== e.pointerId) return;
  clearTimeout(start.timer);
  const s = start;
  start = null;
  if (s.long) {
    H.longpressEnd && H.longpressEnd();
    return;
  }
  if (!s.mode) {
    H.tap && H.tap(tileOf(e), e);
  } else if (s.mode !== "pan" && H.dragEnd) H.dragEnd(s.mode, false);
}

function cancel(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (start && start.id === e.pointerId) {
    clearTimeout(start.timer);
    if (start.mode && start.mode !== "pan" && H.dragEnd) H.dragEnd(start.mode, true);
    start = null;
    H.longpressEnd && H.longpressEnd();
  }
}

// Called every frame for held WASD panning.
export function update(dtMs) {
  if (!held.size) return;
  const v = 0.6 * dtMs;
  let dx = 0;
  let dy = 0;
  if (held.has("a")) dx += v;
  if (held.has("d")) dx -= v;
  if (held.has("w")) dy += v;
  if (held.has("s")) dy -= v;
  render.pan(dx, dy);
}
