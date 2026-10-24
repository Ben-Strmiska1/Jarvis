// Tiny pub/sub event bus shared by all game modules.
const handlers = new Map();

export function on(evt, fn) {
  if (!handlers.has(evt)) handlers.set(evt, new Set());
  handlers.get(evt).add(fn);
  return () => off(evt, fn);
}

export function off(evt, fn) {
  const set = handlers.get(evt);
  if (set) set.delete(fn);
}

export function emit(evt, payload) {
  const set = handlers.get(evt);
  if (!set) return;
  for (const fn of [...set]) {
    try {
      fn(payload);
    } catch (err) {
      console.warn("[bus] handler for", evt, "failed:", err);
    }
  }
}

export function toast(msg, kind = "info") {
  emit("toast", { msg, kind });
}
