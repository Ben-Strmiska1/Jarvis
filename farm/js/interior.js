// Farmhouse interior designer (DOM CSS grid).
import { S } from "./state.js";
import { FURNITURE, HOUSE_TIERS } from "./data.js";
import { emit, toast } from "./bus.js";
import * as world from "./world.js";

export const I = { tool: "wall" }; // wall | rotate | remove | furn:<type>

export function roomSize() {
  return HOUSE_TIERS[world.houseTier()].room;
}

export function itemAt(x, y) {
  return S.interior.items.find((it) => it.x === x && it.y === y) || null;
}

export function isWall(x, y) {
  return S.interior.walls.includes(x + "," + y);
}

export function hasBed() {
  const n = roomSize();
  return S.interior.items.some((it) => it.type === "bed" && it.x < n && it.y < n);
}

export function place(type, x, y, rot = 0) {
  const n = roomSize();
  if (!FURNITURE[type]) return false;
  if (x < 0 || y < 0 || x >= n || y >= n) return false;
  if (itemAt(x, y) || isWall(x, y)) {
    toast("That spot is taken", "bad");
    return false;
  }
  const key = "furn_" + type;
  if (!(S.inv[key] > 0)) {
    toast(`You don't own a ${FURNITURE[type].name.toLowerCase()} — buy one in Shop › Furniture`, "bad");
    return false;
  }
  S.inv[key]--;
  if (!S.inv[key]) delete S.inv[key];
  S.interior.items.push({ type, x, y, rot });
  emit("change");
  return true;
}

export function remove(x, y) {
  const it = itemAt(x, y);
  if (!it) return false;
  S.interior.items = S.interior.items.filter((p) => p !== it);
  S.inv["furn_" + it.type] = (S.inv["furn_" + it.type] || 0) + 1;
  emit("change");
  return true;
}

export function rotate(x, y) {
  const it = itemAt(x, y);
  if (!it) return false;
  it.rot = (it.rot + 1) % 4;
  emit("change");
  return true;
}

export function toggleWall(x, y) {
  if (itemAt(x, y)) {
    toast("Remove the furniture first", "bad");
    return false;
  }
  const k = x + "," + y;
  const i = S.interior.walls.indexOf(k);
  if (i >= 0) S.interior.walls.splice(i, 1);
  else S.interior.walls.push(k);
  emit("change");
  return true;
}

export function tapCell(x, y) {
  const t = I.tool;
  if (t === "wall") return toggleWall(x, y);
  if (t === "rotate") return rotate(x, y);
  if (t === "remove") return remove(x, y);
  if (t.startsWith("furn:")) {
    if (itemAt(x, y)) return rotate(x, y);
    return place(t.slice(5), x, y);
  }
  return false;
}

// Build the editor DOM into `root`.
export function renderEditor(root) {
  const n = roomSize();
  root.innerHTML = "";
  const tools = document.createElement("div");
  tools.className = "int-tools";
  const opts = [
    ["wall", "🧱 Wall"],
    ["rotate", "🔄 Rotate"],
    ["remove", "🗑️ Remove"],
  ];
  for (const [id, f] of Object.entries(FURNITURE)) {
    const c = S.inv["furn_" + id] || 0;
    if (c > 0 || I.tool === "furn:" + id) opts.push(["furn:" + id, `${f.emoji} ${f.name} ×${c}`]);
  }
  for (const [id, label] of opts) {
    const b = document.createElement("button");
    b.className = "chip-btn" + (I.tool === id ? " active" : "");
    b.textContent = label;
    b.dataset.tool = id;
    b.addEventListener("click", () => {
      I.tool = id;
      renderEditor(root);
    });
    tools.appendChild(b);
  }
  root.appendChild(tools);
  if (opts.length === 3) {
    const hint = document.createElement("p");
    hint.className = "muted";
    hint.textContent = "Buy furniture in Shop › Furniture, then pick it here and tap a floor tile.";
    root.appendChild(hint);
  }

  const grid = document.createElement("div");
  grid.className = "int-grid";
  grid.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const cell = document.createElement("button");
      cell.className = "int-cell" + (isWall(x, y) ? " wall" : "") + ((x + y) % 2 ? " alt" : "");
      cell.dataset.x = x;
      cell.dataset.y = y;
      const it = itemAt(x, y);
      if (it) {
        const f = FURNITURE[it.type];
        const span = document.createElement("span");
        span.textContent = f.floor ? "" : f.emoji;
        span.style.transform = `rotate(${it.rot * 90}deg)`;
        if (f.floor) cell.classList.add("rug");
        cell.title = f.name;
        cell.appendChild(span);
      }
      cell.addEventListener("click", () => {
        if (tapCell(x, y)) renderEditor(root);
      });
      grid.appendChild(cell);
    }
  root.appendChild(grid);
}
