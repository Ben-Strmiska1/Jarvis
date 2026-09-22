(() => {
  "use strict";

  const STORAGE_KEY = "jarvis.hub.items.v1";
  const STUDY_KEY = "jarvis.hub.study.v1";
  const THEME_KEY = "jarvis.hub.theme";
  const ARTIFACT_URL = "https://claude.ai/artifact/BhQXyuT9jqsBZtsvXTU6KX";

  /** @typedef {{id:string,title:string,subject:string,type:string,dueDate:string,dueTime:string,priority:string,status:string,url:string,notes:string,createdAt:number}} Item */

  /** @type {Item[]} */
  let items = load();
  /** @type {{notes:Array,guides:Array,cards:Array,problems:Array}} */
  let study = loadStudy();
  let state = {
    section: "assignments", // assignments | notes | guides | flashcards | practice | ask
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

  function loadStudy() {
    try {
      const raw = localStorage.getItem(STUDY_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        notes: Array.isArray(parsed?.notes) ? parsed.notes : [],
        guides: Array.isArray(parsed?.guides) ? parsed.guides : [],
        cards: Array.isArray(parsed?.cards) ? parsed.cards : [],
        problems: Array.isArray(parsed?.problems) ? parsed.problems : [],
      };
    } catch (e) {
      console.error("Failed to load study data", e);
      return { notes: [], guides: [], cards: [], problems: [] };
    }
  }

  function saveStudy() {
    localStorage.setItem(STUDY_KEY, JSON.stringify(study));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- ICS (Canvas / Blackboard calendar feed) import ----------
  function unescapeICS(s) {
    return (s || "").replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
  }

  function parseICSDate(raw) {
    if (!raw) return null;
    const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/);
    if (!m) return null;
    const [, y, mo, d, h, mi] = m;
    return { date: `${y}-${mo}-${d}`, time: h ? `${h}:${mi}` : "" };
  }

  function extractIcsUrl(ev) {
    if (ev.URL) return unescapeICS(ev.URL).trim();
    const desc = unescapeICS(ev.DESCRIPTION || "");
    const m = desc.match(/https?:\/\/[^\s)]+/);
    return m ? m[0].replace(/[.,;]+$/, "") : "";
  }

  function icsEventToItem(ev) {
    const rawSummary = unescapeICS(ev.SUMMARY || "").trim();
    if (!rawSummary) return null;
    const dt = parseICSDate(ev.DTSTART);
    if (!dt) return null;

    // Canvas/Blackboard feeds usually append the course as "Title [COURSE CODE]"
    let subject = "Imported";
    let title = rawSummary;
    const bracket = rawSummary.match(/\[([^\]]+)\]\s*$/);
    if (bracket) {
      subject = bracket[1].trim();
      title = rawSummary.slice(0, bracket.index).trim();
    }

    const lower = rawSummary.toLowerCase();
    let type = "assignment";
    if (/\bquiz\b/.test(lower)) type = "quiz";
    else if (/\b(final|exam)\b/.test(lower)) type = "exam";
    else if (/\btest\b|\bmidterm\b/.test(lower)) type = "test";
    else if (/\bproject\b/.test(lower)) type = "project";

    const uidRaw = ev.UID || `${title}-${dt.date}`;

    return {
      id: "ics-" + uidRaw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120),
      title,
      subject,
      type,
      dueDate: dt.date,
      dueTime: dt.time,
      priority: "medium",
      status: "todo",
      url: extractIcsUrl(ev),
      notes: unescapeICS(ev.DESCRIPTION || ""),
      createdAt: Date.now(),
    };
  }

  function parseICS(text) {
    // RFC5545 line folding: continuation lines start with a space/tab
    const unfolded = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
    const lines = unfolded.split(/\r\n|\n/);
    const events = [];
    let cur = null;
    for (const line of lines) {
      if (line === "BEGIN:VEVENT") {
        cur = {};
        continue;
      }
      if (line === "END:VEVENT") {
        if (cur) events.push(cur);
        cur = null;
        continue;
      }
      if (!cur) continue;
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx).split(";")[0];
      cur[key] = line.slice(idx + 1);
    }
    return events.map(icsEventToItem).filter(Boolean);
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
    sectionNav: document.getElementById("sectionNav"),
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

  // ---------- section switching ----------
  el.sectionNav.addEventListener("click", (e) => {
    const btn = e.target.closest(".section-item");
    if (!btn) return;
    switchSection(btn.dataset.section);
  });

  function switchSection(section) {
    state.section = section;
    [...el.sectionNav.children].forEach((c) => c.classList.toggle("active", c.dataset.section === section));
    document.querySelectorAll(".view-section").forEach((s) => {
      s.hidden = s.id !== `section-${section}`;
    });
    const assignOnly = section === "assignments";
    document.querySelectorAll("[data-assign-only]").forEach((n) => {
      n.style.display = assignOnly ? "" : "none";
    });
    if (section === "notes") renderNotes();
    else if (section === "guides") renderGuides();
    else if (section === "flashcards") renderDecks();
    else if (section === "practice") renderProblems();
    else if (section === "ask") initChatSection();
  }

  // ---------- rendering ----------
  function uniqueSubjects() {
    const all = [
      ...items.map((i) => i.subject),
      ...study.notes.map((n) => n.subject),
      ...study.guides.map((g) => g.subject),
      ...study.cards.map((c) => c.subject),
      ...study.problems.map((p) => p.subject),
    ];
    return [...new Set(all.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  function renderMarkdownLite(text) {
    const escaped = escapeHtml(text);
    const lines = escaped.split("\n").map((line) => {
      if (/^###\s+/.test(line)) return `<h3>${line.replace(/^###\s+/, "")}</h3>`;
      if (/^##\s+/.test(line)) return `<h3>${line.replace(/^##\s+/, "")}</h3>`;
      if (/^#\s+/.test(line)) return `<h3>${line.replace(/^#\s+/, "")}</h3>`;
      if (/^-\s+/.test(line)) return `<li>${line.replace(/^-\s+/, "")}</li>`;
      return line ? `<p>${line}</p>` : "";
    });
    return lines
      .join("\n")
      .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
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

    const titleEl = node.querySelector(".item-title");
    titleEl.textContent = item.title;
    if (item.url) {
      titleEl.href = item.url;
      titleEl.target = "_blank";
      titleEl.rel = "noopener noreferrer";
      titleEl.classList.add("has-link");
      titleEl.title = "Open assignment in a new tab";
    } else {
      titleEl.removeAttribute("href");
      titleEl.classList.remove("has-link");
      titleEl.title = "Edit";
      titleEl.addEventListener("click", (e) => {
        e.preventDefault();
        openEdit(item.id);
      });
    }

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
      url: (data.url || "").trim(),
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
    document.getElementById("eUrl").value = item.url || "";
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
      url: document.getElementById("eUrl").value.trim(),
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
    const url = document.getElementById("fUrl").value;
    const notes = document.getElementById("fNotes").value;

    if (!title.trim() || !subject.trim() || !dueDate) return;

    addItem({ title, subject, type, dueDate, dueTime, priority, url, notes });
    el.addForm.reset();
    document.getElementById("fUrl").value = "";
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
  el.exportBtn.addEventListener("click", async () => {
    const filename = `jarvis-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const data = JSON.stringify({ items, study }, null, 2);

    // When running inside a claude.ai Artifact, plain <a download> links are
    // sandboxed and silently do nothing — use the platform's save capability instead.
    if (window.claude && typeof window.claude.use === "function") {
      try {
        const downloads = await window.claude.use("downloads");
        if (downloads) {
          await downloads.save({ filename, data });
          return;
        }
      } catch (e) {
        // declined/unavailable/etc — fall through to the normal browser download below
      }
    }

    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });

  el.importInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const isICS = /\.ics$/i.test(file.name) || text.trim().startsWith("BEGIN:VCALENDAR");

      let parsedItems = null;
      let parsedStudy = null;

      if (isICS) {
        parsedItems = parseICS(text);
        if (!parsedItems.length) throw new Error("No events found in that calendar file.");
      } else {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          parsedItems = parsed;
        } else if (parsed && typeof parsed === "object") {
          parsedItems = Array.isArray(parsed.items) ? parsed.items : [];
          parsedStudy = parsed.study && typeof parsed.study === "object" ? parsed.study : null;
        } else {
          throw new Error("Invalid file format.");
        }
      }

      const itemCount = parsedItems ? parsedItems.length : 0;
      const studyCount = parsedStudy
        ? ["notes", "guides", "cards", "problems"].reduce((n, k) => n + (Array.isArray(parsedStudy[k]) ? parsedStudy[k].length : 0), 0)
        : 0;
      if (!itemCount && !studyCount) throw new Error("Nothing to import in that file.");

      const label = isICS ? "calendar events" : "items";
      const studyNote = studyCount ? ` plus ${studyCount} study item(s)` : "";
      if (!confirm(`Import ${itemCount} ${label}${studyNote}? New ones are added; ones you've already imported before are refreshed in place.`)) return;

      if (parsedItems && parsedItems.length) {
        const byId = new Map(items.map((i) => [i.id, i]));
        for (const raw of parsedItems) {
          if (!raw || !raw.title) continue;
          const id = raw.id || uid();
          if (byId.has(id)) {
            Object.assign(byId.get(id), raw, { id, status: byId.get(id).status });
          } else {
            const newItem = { ...raw, id };
            items.push(newItem);
            byId.set(id, newItem);
          }
        }
        save();
      }

      if (parsedStudy) {
        for (const key of ["notes", "guides", "cards", "problems"]) {
          const incoming = Array.isArray(parsedStudy[key]) ? parsedStudy[key] : [];
          if (!incoming.length) continue;
          const byId = new Map(study[key].map((x) => [x.id, x]));
          for (const raw of incoming) {
            if (!raw) continue;
            const id = raw.id || uid();
            if (byId.has(id)) {
              Object.assign(byId.get(id), raw, { id });
            } else {
              const newItem = { ...raw, id };
              study[key].push(newItem);
              byId.set(id, newItem);
            }
          }
        }
        saveStudy();
      }

      render();
      if (state.section === "notes") renderNotes();
      else if (state.section === "guides") renderGuides();
      else if (state.section === "flashcards") renderDecks();
      else if (state.section === "practice") renderProblems();
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
    if (e.key === "/" && state.section === "assignments") {
      e.preventDefault();
      el.searchInput.focus();
    } else if (e.key.toLowerCase() === "n" && state.section === "assignments") {
      e.preventDefault();
      document.getElementById("fTitle").focus();
    }
  });

  // ---------- default due date convenience ----------
  (function setDefaultDate() {
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById("fDate").min = today;
  })();

  // ==================================================================
  // Notes
  // ==================================================================
  function addNote(subject, title, body) {
    const note = { id: uid(), subject: subject.trim(), title: title.trim(), body: body.trim(), attachments: [], createdAt: Date.now() };
    study.notes.unshift(note);
    saveStudy();
    renderNotes();
    return note;
  }

  function deleteNote(id) {
    const n = study.notes.find((x) => x.id === id);
    if (!n) return;
    if (!confirm(`Delete note "${n.title}"?`)) return;
    for (const att of n.attachments || []) deleteFileBlob(att.id);
    study.notes = study.notes.filter((x) => x.id !== id);
    saveStudy();
    renderNotes();
  }

  // ---- file attachments ----
  // Stored in IndexedDB (works for any file type/size in both the installed copy
  // and the Claude-hosted artifact — no capability restrictions on file type).
  const FILES_DB_NAME = "jarvis-hub-files";
  const FILES_STORE = "attachments";
  const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024; // 50MB per file, generous but bounded
  let filesDbPromise = null;

  function openFilesDb() {
    if (filesDbPromise) return filesDbPromise;
    filesDbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("This browser doesn't support file storage (IndexedDB)."));
        return;
      }
      const req = indexedDB.open(FILES_DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(FILES_STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Could not open file storage."));
    });
    return filesDbPromise;
  }

  async function storeFileBlob(id, blob) {
    const db = await openFilesDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FILES_STORE, "readwrite");
      tx.objectStore(FILES_STORE).put({ id, blob });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Could not save file."));
    });
  }

  async function getFileBlob(id) {
    const db = await openFilesDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FILES_STORE, "readonly");
      const req = tx.objectStore(FILES_STORE).get(id);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => reject(req.error || new Error("Could not read file."));
    });
  }

  async function deleteFileBlob(id) {
    const db = await openFilesDb();
    return new Promise((resolve) => {
      const tx = db.transaction(FILES_STORE, "readwrite");
      tx.objectStore(FILES_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // non-fatal — the reference is removed either way
    });
  }

  function formatFileSize(bytes) {
    if (!bytes && bytes !== 0) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  async function uploadFilesToNote(note, fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        alert(`"${file.name}" is ${formatFileSize(file.size)} — attachments are capped at ${formatFileSize(MAX_ATTACHMENT_BYTES)}.`);
        continue;
      }
      const id = uid();
      try {
        await storeFileBlob(id, file);
        note.attachments.push({
          id,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        });
      } catch (err) {
        alert(`Could not attach "${file.name}": ${err && err.message ? err.message : "unknown error"}`);
      }
    }
    saveStudy();
    renderNotes();
  }

  async function downloadAttachment(att) {
    let blob;
    try {
      blob = await getFileBlob(att.id);
    } catch (err) {
      alert(`Could not read "${att.filename}": ${err && err.message ? err.message : "unknown error"}`);
      return;
    }
    if (!blob) {
      alert(`"${att.filename}" is missing from this browser's storage (attachments don't sync between devices/browsers).`);
      return;
    }
    // Inside a Claude Artifact, plain <a download> links are sandboxed — use the platform save capability there.
    if (window.claude && typeof window.claude.use === "function") {
      try {
        const downloads = await window.claude.use("downloads");
        if (downloads) {
          await downloads.save({ filename: att.filename, data: blob });
          return;
        }
      } catch (e) {
        // fall through to the normal browser download below
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = att.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  let pendingAttachNoteId = null;
  const attachFileInput = document.getElementById("attachFileInput");
  attachFileInput.addEventListener("change", async (e) => {
    const note = study.notes.find((n) => n.id === pendingAttachNoteId);
    if (note) await uploadFilesToNote(note, e.target.files);
    e.target.value = "";
    pendingAttachNoteId = null;
  });

  function renderNotes() {
    refreshSubjectOptions();
    const list = document.getElementById("notesList");
    const empty = document.getElementById("notesEmpty");
    list.innerHTML = "";
    if (!study.notes.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    for (const n of study.notes) {
      const card = document.createElement("div");
      card.className = "study-card";
      card.innerHTML = `
        <div class="study-card-top">
          <span class="study-card-title">${escapeHtml(n.title)}</span>
          <span class="study-card-subject">${escapeHtml(n.subject)}</span>
          <span class="study-card-actions"></span>
        </div>
        <div class="study-card-body">${escapeHtml(n.body)}</div>
        <div class="attachments"></div>
        <button type="button" class="attach-btn">📎 Attach file</button>
      `;
      const actions = card.querySelector(".study-card-actions");
      actions.innerHTML = `<button class="icon-btn edit-btn" title="Edit">✏️</button><button class="icon-btn delete-btn" title="Delete">🗑️</button>`;
      actions.children[0].addEventListener("click", () => openStudyEdit("notes", n.id));
      actions.children[1].addEventListener("click", () => deleteNote(n.id));

      const attachmentsEl = card.querySelector(".attachments");
      for (const att of n.attachments || []) {
        const chip = document.createElement("span");
        chip.className = "attachment-chip";
        chip.innerHTML = `<button class="attachment-download" type="button">📄 ${escapeHtml(att.filename)}</button><span>${formatFileSize(att.sizeBytes)}</span><button class="remove-attachment" title="Remove">✕</button>`;
        chip.querySelector(".attachment-download").addEventListener("click", () => downloadAttachment(att));
        chip.querySelector(".remove-attachment").addEventListener("click", async () => {
          if (!confirm(`Remove attachment "${att.filename}"?`)) return;
          await deleteFileBlob(att.id);
          n.attachments = (n.attachments || []).filter((a) => a.id !== att.id);
          saveStudy();
          renderNotes();
        });
        attachmentsEl.appendChild(chip);
      }

      card.querySelector(".attach-btn").addEventListener("click", () => {
        pendingAttachNoteId = n.id;
        attachFileInput.click();
      });

      list.appendChild(card);
    }
  }

  document.getElementById("noteForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("nTitle").value;
    const subject = document.getElementById("nSubject").value;
    const body = document.getElementById("nBody").value;
    const fileInput = document.getElementById("nFile");
    if (!title.trim() || !subject.trim()) return;
    const note = addNote(subject, title, body);
    if (fileInput.files.length) await uploadFilesToNote(note, fileInput.files);
    e.target.reset();
    document.getElementById("nTitle").focus();
  });

  // ==================================================================
  // Study Guides
  // ==================================================================
  function addGuide(subject, title, body) {
    study.guides.unshift({ id: uid(), subject: subject.trim(), title: title.trim(), body: body.trim(), createdAt: Date.now() });
    saveStudy();
    renderGuides();
  }

  function deleteGuide(id) {
    const g = study.guides.find((x) => x.id === id);
    if (!g) return;
    if (!confirm(`Delete study guide "${g.title}"?`)) return;
    study.guides = study.guides.filter((x) => x.id !== id);
    saveStudy();
    renderGuides();
  }

  function renderGuides() {
    refreshSubjectOptions();
    const list = document.getElementById("guidesList");
    const empty = document.getElementById("guidesEmpty");
    list.innerHTML = "";
    if (!study.guides.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    for (const g of study.guides) {
      const card = document.createElement("div");
      card.className = "study-card";
      card.innerHTML = `
        <div class="study-card-top">
          <span class="study-card-title">${escapeHtml(g.title)}</span>
          <span class="study-card-subject">${escapeHtml(g.subject)}</span>
          <span class="study-card-actions"></span>
        </div>
        <div class="study-card-body">${renderMarkdownLite(g.body)}</div>
      `;
      const actions = card.querySelector(".study-card-actions");
      actions.innerHTML = `<button class="icon-btn edit-btn" title="Edit">✏️</button><button class="icon-btn delete-btn" title="Delete">🗑️</button>`;
      actions.children[0].addEventListener("click", () => openStudyEdit("guides", g.id));
      actions.children[1].addEventListener("click", () => deleteGuide(g.id));
      list.appendChild(card);
    }
  }

  document.getElementById("guideForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const title = document.getElementById("gTitle").value;
    const subject = document.getElementById("gSubject").value;
    const body = document.getElementById("gBody").value;
    if (!title.trim() || !subject.trim()) return;
    addGuide(subject, title, body);
    e.target.reset();
    document.getElementById("gTitle").focus();
  });

  // ==================================================================
  // Shared edit modal (notes / guides / practice problems)
  // ==================================================================
  let studyEditingType = null;
  let studyEditingId = null;

  function openStudyEdit(type, id) {
    const item = study[type].find((x) => x.id === id);
    if (!item) return;
    studyEditingType = type;
    studyEditingId = id;
    const heading = document.getElementById("seHeading");
    const titleField = document.getElementById("seTitle");
    const subjectField = document.getElementById("seSubject");
    const bodyField = document.getElementById("seBody");
    subjectField.value = item.subject;
    if (type === "problems") {
      heading.textContent = "Edit practice problem";
      titleField.placeholder = "Question";
      bodyField.placeholder = "Answer";
      titleField.value = item.question;
      bodyField.value = item.answer;
    } else {
      heading.textContent = type === "notes" ? "Edit note" : "Edit study guide";
      titleField.placeholder = "Title";
      bodyField.placeholder = "Body";
      titleField.value = item.title;
      bodyField.value = item.body;
    }
    document.getElementById("studyEditBackdrop").hidden = false;
    titleField.focus();
  }

  function closeStudyEdit() {
    document.getElementById("studyEditBackdrop").hidden = true;
    studyEditingType = null;
    studyEditingId = null;
  }

  document.getElementById("seCancel").addEventListener("click", closeStudyEdit);
  document.getElementById("studyEditBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "studyEditBackdrop") closeStudyEdit();
  });

  document.getElementById("studyEditForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!studyEditingType || !studyEditingId) return;
    const item = study[studyEditingType].find((x) => x.id === studyEditingId);
    if (!item) return;
    const subject = document.getElementById("seSubject").value.trim();
    const titleVal = document.getElementById("seTitle").value.trim();
    const bodyVal = document.getElementById("seBody").value.trim();
    item.subject = subject;
    if (studyEditingType === "problems") {
      item.question = titleVal;
      item.answer = bodyVal;
    } else {
      item.title = titleVal;
      item.body = bodyVal;
    }
    saveStudy();
    if (studyEditingType === "notes") renderNotes();
    else if (studyEditingType === "guides") renderGuides();
    else if (studyEditingType === "problems") renderProblems();
    closeStudyEdit();
  });

  // ==================================================================
  // Flashcards
  // ==================================================================
  function addCard(subject, front, back) {
    study.cards.push({ id: uid(), subject: subject.trim(), front: front.trim(), back: back.trim(), createdAt: Date.now() });
    saveStudy();
    renderDecks();
  }

  function deleteCard(id) {
    study.cards = study.cards.filter((c) => c.id !== id);
    saveStudy();
    renderDecks();
  }

  function renderDecks() {
    refreshSubjectOptions();
    const list = document.getElementById("decksList");
    const empty = document.getElementById("decksEmpty");
    list.innerHTML = "";
    if (!study.cards.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    const bySubject = new Map();
    for (const c of study.cards) {
      if (!bySubject.has(c.subject)) bySubject.set(c.subject, []);
      bySubject.get(c.subject).push(c);
    }

    for (const [subject, cards] of bySubject) {
      const deck = document.createElement("div");
      deck.className = "deck-card";
      deck.innerHTML = `
        <div class="deck-top">
          <span class="deck-name">${escapeHtml(subject)}</span>
          <span class="deck-count">${cards.length} card${cards.length === 1 ? "" : "s"}</span>
          <button type="button" class="primary-btn study-deck-btn">▶ Study</button>
        </div>
        <div class="deck-card-list"></div>
      `;
      deck.querySelector(".study-deck-btn").addEventListener("click", () => openStudyMode(subject, cards));
      const rowsEl = deck.querySelector(".deck-card-list");
      for (const c of cards) {
        const row = document.createElement("div");
        row.className = "deck-card-row";
        row.innerHTML = `<span class="front"></span><span class="back"></span>`;
        row.querySelector(".front").textContent = c.front;
        row.querySelector(".back").textContent = c.back;
        const del = document.createElement("button");
        del.className = "icon-btn";
        del.title = "Delete card";
        del.textContent = "🗑️";
        del.addEventListener("click", () => deleteCard(c.id));
        row.appendChild(del);
        rowsEl.appendChild(row);
      }
      list.appendChild(deck);
    }
  }

  document.getElementById("cardForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const subject = document.getElementById("cSubject").value;
    const front = document.getElementById("cFront").value;
    const back = document.getElementById("cBack").value;
    if (!subject.trim() || !front.trim() || !back.trim()) return;
    addCard(subject, front, back);
    document.getElementById("cFront").value = "";
    document.getElementById("cBack").value = "";
    document.getElementById("cFront").focus();
  });

  // ---- flashcard study mode ----
  let studyDeck = [];
  let studyIndex = 0;

  function openStudyMode(subject, cards) {
    studyDeck = cards.slice();
    studyIndex = 0;
    document.getElementById("studyModeHeading").textContent = subject;
    document.getElementById("studyModeBackdrop").hidden = false;
    renderStudyCard();
  }

  function renderStudyCard() {
    document.getElementById("flipCard").classList.remove("flipped");
    const card = studyDeck[studyIndex];
    document.getElementById("flipFront").textContent = card.front;
    document.getElementById("flipBack").textContent = card.back;
    document.getElementById("studyProgress").textContent = `${studyIndex + 1} / ${studyDeck.length}`;
  }

  document.getElementById("flipCard").addEventListener("click", () => {
    document.getElementById("flipCard").classList.toggle("flipped");
  });
  document.getElementById("studyPrev").addEventListener("click", () => {
    studyIndex = (studyIndex - 1 + studyDeck.length) % studyDeck.length;
    renderStudyCard();
  });
  document.getElementById("studyNext").addEventListener("click", () => {
    studyIndex = (studyIndex + 1) % studyDeck.length;
    renderStudyCard();
  });
  document.getElementById("studyShuffle").addEventListener("click", () => {
    for (let i = studyDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [studyDeck[i], studyDeck[j]] = [studyDeck[j], studyDeck[i]];
    }
    studyIndex = 0;
    renderStudyCard();
  });
  document.getElementById("studyModeClose").addEventListener("click", () => {
    document.getElementById("studyModeBackdrop").hidden = true;
  });

  // ==================================================================
  // Practice Problems
  // ==================================================================
  function addProblem(subject, question, answer) {
    study.problems.unshift({ id: uid(), subject: subject.trim(), question: question.trim(), answer: answer.trim(), createdAt: Date.now() });
    saveStudy();
    renderProblems();
  }

  function deleteProblem(id) {
    const p = study.problems.find((x) => x.id === id);
    if (!p) return;
    if (!confirm("Delete this practice problem?")) return;
    study.problems = study.problems.filter((x) => x.id !== id);
    saveStudy();
    renderProblems();
  }

  function renderProblems() {
    refreshSubjectOptions();
    const list = document.getElementById("problemsList");
    const empty = document.getElementById("problemsEmpty");
    list.innerHTML = "";
    if (!study.problems.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    for (const p of study.problems) {
      const card = document.createElement("div");
      card.className = "study-card";
      card.innerHTML = `
        <div class="study-card-top">
          <span class="study-card-title">${escapeHtml(p.question)}</span>
          <span class="study-card-subject">${escapeHtml(p.subject)}</span>
          <span class="study-card-actions"></span>
        </div>
        <button type="button" class="reveal-btn">Show answer</button>
        <div class="problem-answer">${escapeHtml(p.answer)}</div>
      `;
      const revealBtn = card.querySelector(".reveal-btn");
      const answerEl = card.querySelector(".problem-answer");
      revealBtn.addEventListener("click", () => {
        const showing = answerEl.classList.toggle("shown");
        revealBtn.textContent = showing ? "Hide answer" : "Show answer";
      });
      const actions = card.querySelector(".study-card-actions");
      actions.innerHTML = `<button class="icon-btn edit-btn" title="Edit">✏️</button><button class="icon-btn delete-btn" title="Delete">🗑️</button>`;
      actions.children[0].addEventListener("click", () => openStudyEdit("problems", p.id));
      actions.children[1].addEventListener("click", () => deleteProblem(p.id));
      list.appendChild(card);
    }
  }

  document.getElementById("problemForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const subject = document.getElementById("pSubject").value;
    const question = document.getElementById("pQuestion").value;
    const answer = document.getElementById("pAnswer").value;
    if (!subject.trim() || !question.trim() || !answer.trim()) return;
    addProblem(subject, question, answer);
    document.getElementById("pQuestion").value = "";
    document.getElementById("pAnswer").value = "";
    document.getElementById("pQuestion").focus();
  });

  // ==================================================================
  // Ask Jarvis (Claude artifact `sample` capability, with graceful fallback)
  // ==================================================================
  let sampleFn = null;
  let sampleChecked = false;
  let chatHistory = [];

  async function ensureSample() {
    if (sampleChecked) return sampleFn;
    sampleChecked = true;
    if (!(window.claude && typeof window.claude.use === "function")) return null;
    try {
      sampleFn = await window.claude.use("sample");
    } catch (e) {
      sampleFn = null;
    }
    return sampleFn;
  }

  function buildChatContext() {
    const upcoming = items
      .filter((i) => i.status !== "done")
      .slice()
      .sort(sortByDue)
      .slice(0, 15)
      .map((i) => `- ${i.title} (${i.subject}, ${i.type}, due ${i.dueDate || "no date"})`)
      .join("\n");
    const noteTitles = study.notes.slice(0, 20).map((n) => `- ${n.title} (${n.subject})`).join("\n");
    const guideTitles = study.guides.slice(0, 20).map((g) => `- ${g.title} (${g.subject})`).join("\n");
    const deckSubjects = [...new Set(study.cards.map((c) => c.subject))].join(", ");
    return [
      "You are Jarvis, a friendly study assistant embedded in this student's assignment tracker hub.",
      "Answer questions about their coursework, help them study, quiz them using their flashcards or practice problems below, and help interpret their due dates. Be concise and encouraging.",
      "",
      "Their upcoming assignments/tests:",
      upcoming || "(none tracked)",
      "",
      "Their notes:",
      noteTitles || "(none yet)",
      "",
      "Their study guides:",
      guideTitles || "(none yet)",
      "",
      `Flashcard decks: ${deckSubjects || "(none yet)"}`,
      `Practice problems saved: ${study.problems.length}`,
    ].join("\n");
  }

  function appendChatBubble(role, text, pending) {
    const box = document.getElementById("chatMessages");
    const empty = box.querySelector(".chat-empty");
    if (empty) empty.remove();
    const wrap = document.createElement("div");
    wrap.className = `chat-msg-wrap wrap-${role}`;
    const bubble = document.createElement("div");
    bubble.className = `chat-msg ${role}${pending ? " pending" : ""}`;
    bubble.textContent = text;
    wrap.appendChild(bubble);
    box.appendChild(wrap);
    box.scrollTop = box.scrollHeight;
    return bubble;
  }

  function addSaveNoteButton(bubble) {
    if (bubble.parentElement.querySelector(".save-note-btn")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "save-note-btn";
    btn.textContent = "💾 Save as note";
    btn.addEventListener("click", () => {
      addNote("Ask Jarvis", `Chat note — ${new Date().toLocaleDateString()}`, bubble.textContent);
      btn.textContent = "✓ Saved to Notes";
      btn.disabled = true;
    });
    bubble.parentElement.appendChild(btn);
  }

  async function initChatSection() {
    document.getElementById("chatArtifactLink").href = ARTIFACT_URL;
    const fn = await ensureSample();
    const unavailable = document.getElementById("chatUnavailable");
    const form = document.getElementById("chatForm");
    if (fn) {
      unavailable.hidden = true;
      form.hidden = false;
      if (!chatHistory.length) {
        document.getElementById("chatMessages").innerHTML =
          `<div class="chat-empty">Ask about your assignments, due dates, notes, or anything you're studying.</div>`;
      }
    } else {
      unavailable.hidden = false;
      form.hidden = true;
    }
  }

  document.getElementById("chatForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chatInput");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    appendChatBubble("user", text);

    const fn = await ensureSample();
    if (!fn) {
      appendChatBubble("assistant", "The AI agent isn't available in this copy of the hub.");
      return;
    }

    const isFirstTurn = chatHistory.length === 0;
    const content = isFirstTurn ? `${buildChatContext()}\n\n---\nStudent's question: ${text}` : text;
    chatHistory.push({ role: "user", content });

    const pendingBubble = appendChatBubble("assistant", "Thinking…", true);
    try {
      const result = await fn(chatHistory, {
        onText: ({ text: partial }) => {
          pendingBubble.textContent = partial;
          pendingBubble.classList.remove("pending");
        },
        cache: false,
        modelTier: "default",
      });
      pendingBubble.textContent = result.text;
      pendingBubble.classList.remove("pending");
      addSaveNoteButton(pendingBubble);
      chatHistory.push({ role: "assistant", content: result.text });
    } catch (err) {
      pendingBubble.textContent = "Sorry, something went wrong: " + (err && err.message ? err.message : "unknown error");
      pendingBubble.classList.remove("pending");
    }
  });

  // ---------- auto-sync from the Claude-hosted page's private db ----------
  // The scheduled calendar sync writes assignments to the `assignments` collection;
  // merge them in by id, keeping the local completion status.
  async function subscribeToSyncedAssignments() {
    if (!(window.claude && typeof window.claude.use === "function")) return;
    let db;
    try {
      db = await window.claude.use("db");
    } catch (e) {
      return;
    }
    if (!db) return;
    db.collection("assignments").onSnapshot(
      (snap) => {
        const byId = new Map(items.map((i) => [i.id, i]));
        let changed = false;
        for (const doc of snap.docs) {
          const raw = doc.data();
          if (!raw || !raw.title) continue;
          const existing = byId.get(doc.id);
          if (existing) {
            const before = JSON.stringify(existing);
            Object.assign(existing, raw, { id: doc.id, status: existing.status });
            if (JSON.stringify(existing) !== before) changed = true;
          } else {
            const newItem = { ...raw, id: doc.id, status: raw.status || "todo" };
            items.push(newItem);
            byId.set(doc.id, newItem);
            changed = true;
          }
        }
        if (changed) {
          save();
          render();
        }
      },
      () => {}
    );
  }

  // ---------- installable app (service worker) ----------
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (window.claude) return; // inside a Claude Artifact sandbox — service workers aren't supported there
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  // ---------- init ----------
  initTheme();
  render();
  registerServiceWorker();
  subscribeToSyncedAssignments();
})();
