(() => {
  "use strict";

  const STORAGE_KEY = "jarvis.hub.items.v1";
  const THEME_KEY = "jarvis.hub.theme";

  /** @typedef {{id:string,title:string,subject:string,type:string,dueDate:string,dueTime:string,priority:string,status:string,notes:string,createdAt:number}} Item */

  /** @type {Item[]} */
  let items = load();
  let state = {
    view: "all", // all | upcoming | overdue | completed
    subject: "",
    type: "",
    priority: "",
    sort: "due",
    query: "",
  };

  // ---------- persistence ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("Failed to load items", e);
      return [];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- date helpers ----------
  function startOfDay(d) {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
  }

  function parseDue(item) {
    if (!item.dueDate) return null;
    return new Date(`${item.dueDate}T${item.dueTime || "23:59"}`);
  }

  function daysUntil(item) {
    const due = item.dueDate ? startOfDay(new Date(item.dueDate)) : null;
    if (!due) return Infinity;
    const today = startOfDay(new Date());
    return Math.round((due - today) / 86400000);
  }

  function formatDue(item) {
    if (!item.dueDate) return "No due date";
    const d = daysUntil(item);
    const dateObj = new Date(`${item.dueDate}T00:00:00`);
    const dateStr = dateObj.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const timeStr = item.dueTime ? ` · ${formatTime(item.dueTime)}` : "";
    let rel;
    if (d < 0) rel = `Overdue by ${Math.abs(d)}d`;
    else if (d === 0) rel = "Due today";
    else if (d === 1) rel = "Due tomorrow";
    else if (d <= 7) rel = `Due in ${d}d`;
    else rel = dateStr;
    return `${rel}${d > 7 || d < 0 ? "" : ""}${timeStr}${d > 0 && d <= 7 ? " · " + dateStr : ""}`;
  }

  function formatTime(t) {
    const [h, m] = t.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, "0")}${period}`;
  }

  // ---------- derived ----------
  function isOverdue(item) {
    return item.status !== "done" && item.dueDate && daysUntil(item) < 0;
  }
  function isToday(item) {
    return item.status !== "done" && item.dueDate && daysUntil(item) === 0;
  }
  function isThisWeek(item) {
    return item.status !== "done" && item.dueDate && daysUntil(item) >= 0 && daysUntil(item) <= 7;
  }

  // ---------- DOM refs ----------
  const el = {
    listArea: document.getElementById("listArea"),
    emptyState: document.getElementById("emptyState"),
    statOverdue: document.getElementById("statOverdue"),
    statToday: document.getElementById("statToday"),
    statWeek: document.getElementById("statWeek"),
    statDone: document.getElementById("statDone"),
    progressPct: document.getElementById("progressPct"),
    progressFill: document.getElementById("progressFill"),
    subjectFilter: document.getElementById("subjectFilter"),
    typeFilter: document.getElementById("typeFilter"),
    priorityFilter: document.getElementById("priorityFilter"),
    sortSelect: document.getElementById("sortSelect"),
    searchInput: document.getElementById("searchInput"),
    viewNav: document.getElementById("viewNav"),
    addForm: document.getElementById("addForm"),
    subjectList: document.getElementById("subjectList"),
    itemTemplate: document.getElementById("itemTemplate"),
    editBackdrop: document.getElementById("editBackdrop"),
    editForm: document.getElementById("editForm"),
    themeToggle: document.getElementById("themeToggle"),
    exportBtn: document.getElementById("exportBtn"),
    importInput: document.getElementById("importInput"),
    clearCompletedBtn: document.getElementById("clearCompletedBtn"),
  };

  let editingId = null;

  // ---------- theme ----------
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const theme = saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
    el.themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
  }
  el.themeToggle.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
    el.themeToggle.textContent = next === "dark" ? "☀️" : "🌙";
  });

  // ---------- rendering ----------
  function uniqueSubjects() {
    return [...new Set(items.map((i) => i.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  function refreshSubjectOptions() {
    const subjects = uniqueSubjects();
    const currentFilter = el.subjectFilter.value;
    el.subjectFilter.innerHTML =
      `<option value="">All subjects</option>` +
      subjects.map((s) => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join("");
    el.subjectFilter.value = subjects.includes(currentFilter) ? currentFilter : "";

    el.subjectList.innerHTML = subjects.map((s) => `<option value="${escapeAttr(s)}"></option>`).join("");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  function computeStats() {
    const overdue = items.filter(isOverdue).length;
    const today = items.filter(isToday).length;
    const week = items.filter(isThisWeek).length;
    const done = items.filter((i) => i.status === "done").length;
    const total = items.length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    el.statOverdue.textContent = overdue;
    el.statToday.textContent = today;
    el.statWeek.textContent = week;
    el.statDone.textContent = done;
    el.progressPct.textContent = `${pct}%`;
    el.progressFill.style.width = `${pct}%`;
  }

  function filteredSorted() {
    let list = items.slice();

    if (state.view === "upcoming") list = list.filter((i) => i.status !== "done" && i.dueDate && daysUntil(i) >= 0);
    else if (state.view === "overdue") list = list.filter(isOverdue);
    else if (state.view === "completed") list = list.filter((i) => i.status === "done");

    if (state.subject) list = list.filter((i) => i.subject === state.subject);
    if (state.type) list = list.filter((i) => i.type === state.type);
    if (state.priority) list = list.filter((i) => i.priority === state.priority);
    if (state.query) {
      const q = state.query.toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.subject.toLowerCase().includes(q) ||
          (i.notes || "").toLowerCase().includes(q)
      );
    }

    const priorityRank = { high: 0, medium: 1, low: 2 };
    list.sort((a, b) => {
      if (state.sort === "priority") {
        return priorityRank[a.priority] - priorityRank[b.priority] || sortByDue(a, b);
      }
      if (state.sort === "subject") {
        return a.subject.localeCompare(b.subject) || sortByDue(a, b);
      }
      if (state.sort === "created") {
        return b.createdAt - a.createdAt;
      }
      return sortByDue(a, b);
    });

    return list;
  }

  function sortByDue(a, b) {
    const da = a.dueDate ? parseDue(a).getTime() : Infinity;
    const db = b.dueDate ? parseDue(b).getTime() : Infinity;
    return da - db;
  }

  function groupKey(item) {
    if (item.status === "done") return "done";
    if (!item.dueDate) return "nodate";
    const d = daysUntil(item);
    if (d < 0) return "overdue";
    if (d === 0) return "today";
    if (d === 1) return "tomorrow";
    if (d <= 7) return "week";
    return "later";
  }

  const GROUP_META = {
    overdue: { title: "⏰ Overdue", cls: "gt-overdue" },
    today: { title: "🔥 Due Today", cls: "gt-today" },
    tomorrow: { title: "☀️ Due Tomorrow", cls: "" },
    week: { title: "📅 This Week", cls: "" },
    later: { title: "🗓️ Later", cls: "" },
    nodate: { title: "📝 No Due Date", cls: "" },
    done: { title: "✅ Completed", cls: "" },
  };
  const GROUP_ORDER = ["overdue", "today", "tomorrow", "week", "later", "nodate", "done"];

  function render() {
    computeStats();
    refreshSubjectOptions();

    const list = filteredSorted();
    el.listArea.innerHTML = "";

    if (list.length === 0) {
      el.emptyState.hidden = false;
      return;
    }
    el.emptyState.hidden = true;

    // group only makes sense for "all"/"upcoming" style views; still fine elsewhere
    const groups = {};
    for (const item of list) {
      const key = state.sort === "due" ? groupKey(item) : "flat";
      (groups[key] ||= []).push(item);
    }

    const order = state.sort === "due" ? GROUP_ORDER : ["flat"];

    for (const key of order) {
      const groupItems = groups[key];
      if (!groupItems || !groupItems.length) continue;

      const groupEl = document.createElement("div");
      groupEl.className = "group";

      if (key !== "flat") {
        const meta = GROUP_META[key];
        const titleEl = document.createElement("div");
        titleEl.className = `group-title ${meta.cls}`;
        titleEl.innerHTML = `<span>${meta.title}</span><span class="group-count">${groupItems.length}</span>`;
        groupEl.appendChild(titleEl);
      }

      for (const item of groupItems) {
        groupEl.appendChild(renderItem(item));
      }

      el.listArea.appendChild(groupEl);
    }
  }

  function renderItem(item) {
    const node = el.itemTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.id = item.id;
    if (item.status === "done") node.classList.add("done");

    const check = node.querySelector(".item-check");
    check.textContent = item.status === "done" ? "✓" : "";
    check.addEventListener("click", () => toggleDone(item.id));

    node.querySelector(".item-title").textContent = item.title;

    const typeBadge = node.querySelector(".item-type");
    typeBadge.textContent = item.type;
    typeBadge.classList.add(`type-${item.type}`);

    const prioBadge = node.querySelector(".item-priority");
    prioBadge.textContent = item.priority;
    prioBadge.classList.add(`priority-${item.priority}`);

    node.querySelector(".item-subject").textContent = item.subject;

    const dueEl = node.querySelector(".item-due");
    dueEl.textContent = formatDue(item);
    if (isOverdue(item)) dueEl.classList.add("overdue");
    else if (isToday(item)) dueEl.classList.add("today");

    const notesEl = node.querySelector(".item-notes");
    if (item.notes) {
      notesEl.textContent = item.notes;
    } else {
      notesEl.remove();
    }

    node.querySelector(".edit-btn").addEventListener("click", () => openEdit(item.id));
    node.querySelector(".delete-btn").addEventListener("click", () => deleteItem(item.id));

    return node;
  }

  // ---------- mutations ----------
  function toggleDone(id) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    item.status = item.status === "done" ? "todo" : "done";
    save();
    render();
  }

  function deleteItem(id) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    if (!confirm(`Delete "${item.title}"?`)) return;
    items = items.filter((i) => i.id !== id);
    save();
    render();
  }

  function addItem(data) {
    items.push({
      id: uid(),
      title: data.title.trim(),
      subject: data.subject.trim(),
      type: data.type,
      dueDate: data.dueDate,
      dueTime: data.dueTime || "",
      priority: data.priority,
      status: "todo",
      notes: data.notes.trim(),
      createdAt: Date.now(),
    });
    save();
    render();
  }

  function updateItem(id, data) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    Object.assign(item, data);
    save();
    render();
  }

  // ---------- edit modal ----------
  function openEdit(id) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    editingId = id;
    document.getElementById("eTitle").value = item.title;
    document.getElementById("eSubject").value = item.subject;
    document.getElementById("eType").value = item.type;
    document.getElementById("eDate").value = item.dueDate;
    document.getElementById("eTime").value = item.dueTime || "";
    document.getElementById("ePriority").value = item.priority;
    document.getElementById("eStatus").value = item.status;
    document.getElementById("eNotes").value = item.notes || "";
    el.editBackdrop.hidden = false;
    document.getElementById("eTitle").focus();
  }

  function closeEdit() {
    el.editBackdrop.hidden = true;
    editingId = null;
  }

  document.getElementById("eCancel").addEventListener("click", closeEdit);
  el.editBackdrop.addEventListener("click", (e) => {
    if (e.target === el.editBackdrop) closeEdit();
  });

  el.editForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!editingId) return;
    updateItem(editingId, {
      title: document.getElementById("eTitle").value.trim(),
      subject: document.getElementById("eSubject").value.trim(),
      type: document.getElementById("eType").value,
      dueDate: document.getElementById("eDate").value,
      dueTime: document.getElementById("eTime").value,
      priority: document.getElementById("ePriority").value,
      status: document.getElementById("eStatus").value,
      notes: document.getElementById("eNotes").value.trim(),
    });
    closeEdit();
  });

  // ---------- add form ----------
  el.addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = document.getElementById("fTitle").value;
    const subject = document.getElementById("fSubject").value;
    const type = document.getElementById("fType").value;
    const dueDate = document.getElementById("fDate").value;
    const dueTime = document.getElementById("fTime").value;
    const priority = document.getElementById("fPriority").value;
    const notes = document.getElementById("fNotes").value;

    if (!title.trim() || !subject.trim() || !dueDate) return;

    addItem({ title, subject, type, dueDate, dueTime, priority, notes });
    el.addForm.reset();
    document.getElementById("fType").value = type; // keep last used type for convenience
    document.getElementById("fPriority").value = "medium";
    document.getElementById("fNotes").value = "";
    document.getElementById("fTitle").focus();
  });

  // ---------- filters / sort / search ----------
  el.viewNav.addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-item");
    if (!btn) return;
    state.view = btn.dataset.view;
    [...el.viewNav.children].forEach((c) => c.classList.toggle("active", c === btn));
    render();
  });

  el.subjectFilter.addEventListener("change", () => {
    state.subject = el.subjectFilter.value;
    render();
  });
  el.typeFilter.addEventListener("change", () => {
    state.type = el.typeFilter.value;
    render();
  });
  el.priorityFilter.addEventListener("change", () => {
    state.priority = el.priorityFilter.value;
    render();
  });
  el.sortSelect.addEventListener("change", () => {
    state.sort = el.sortSelect.value;
    render();
  });

  let searchDebounce;
  el.searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.query = el.searchInput.value.trim();
      render();
    }, 120);
  });

  // ---------- export / import ----------
  el.exportBtn.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jarvis-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  el.importInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("Invalid file format");
      if (!confirm(`Import ${parsed.length} items? This will merge with your current list.`)) return;
      const existingIds = new Set(items.map((i) => i.id));
      for (const raw of parsed) {
        if (raw && raw.title && !existingIds.has(raw.id)) {
          items.push({ ...raw, id: raw.id || uid() });
        }
      }
      save();
      render();
    } catch (err) {
      alert("Could not import file: " + err.message);
    } finally {
      e.target.value = "";
    }
  });

  el.clearCompletedBtn.addEventListener("click", () => {
    const doneCount = items.filter((i) => i.status === "done").length;
    if (!doneCount) return;
    if (!confirm(`Remove ${doneCount} completed item(s)?`)) return;
    items = items.filter((i) => i.status !== "done");
    save();
    render();
  });

  // ---------- keyboard shortcuts ----------
  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement.tagName;
    const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    if (!el.editBackdrop.hidden && e.key === "Escape") {
      closeEdit();
      return;
    }
    if (typing) return;
    if (e.key === "/") {
      e.preventDefault();
      el.searchInput.focus();
    } else if (e.key.toLowerCase() === "n") {
      e.preventDefault();
      document.getElementById("fTitle").focus();
    }
  });

  // ---------- default due date convenience ----------
  (function setDefaultDate() {
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById("fDate").min = today;
  })();

  // ---------- init ----------
  initTheme();
  render();
})();
