# Jarvis — Assignment & Test Hub

A single central hub to track every assignment, quiz, test, project, and exam across all your classes — plus notes, study guides, flashcards, practice problems, and an AI study assistant — with an easy-to-read, interactive UI.

## Features

- **Quick add bar** — title, subject, type, due date/time, priority, notes, all in one row.
- **Smart grouping** — items auto-sort into Overdue, Due Today, Tomorrow, This Week, Later, No Due Date, and Completed.
- **Dashboard stats** — overdue count, due today, due this week, and overall completion progress bar.
- **Filters & search** — by subject, type, priority, and free-text search; sort by due date, priority, subject, or recently added.
- **One-click complete** — check items off, edit inline, or delete.
- **Notes** — freeform notes tagged by subject.
- **Study Guides** — longer write-ups per unit/subject with lightweight markdown (`# heading`, `- bullets`, `**bold**`).
- **Flashcards** — add cards per subject (they group into decks automatically), then use **Study** mode: click to flip, prev/next, shuffle.
- **Practice Problems** — question + answer pairs with a "Show answer" reveal.
- **Ask Jarvis** — an embedded AI chat assistant grounded in your real assignments/notes/flashcards. This only runs in the [Claude-hosted version](https://claude.ai/artifact/BhQXyuT9jqsBZtsvXTU6KX) of the hub (it uses Claude's own infrastructure, no API key needed there) — the installed/offline copy shows a link to open that version instead of a dead chat box.
- **Light/dark theme toggle**, remembered between visits.
- **Backup/restore** — export everything (assignments + notes + guides + flashcards + practice problems) to one JSON file, import it back in (or on another device).
- **Canvas / Blackboard calendar import** — import a `.ics` calendar feed file directly; due dates, course, and type (quiz/test/exam/project) are parsed automatically. Re-importing the same feed later updates existing items in place instead of duplicating them, and preserves any items you've already marked complete.
- **Installable app (PWA)** — add it to your phone's home screen or install it on your laptop as a standalone app; works offline once installed. See **Installing as an app** below.
- **Keyboard shortcuts** — `/` to search, `N` to jump to the add form, `Esc` to close the edit dialog.
- **Fully offline** — no backend, no build step, no account linking required. All data is stored in your browser's `localStorage`.

## Installing as an app

The hub is a Progressive Web App (manifest + service worker + icons already included), so it can be installed like a native app — but it needs to be served over **https** first, which GitHub Pages gives you for free:

1. On GitHub: **Settings → Pages** → under "Build and deployment", set **Source** to "Deploy from a branch", pick this branch (or `main`, once merged) and folder `/ (root)` → **Save**.
2. GitHub gives you a URL like `https://<your-username>.github.io/Jarvis/`. Open it once to confirm it loads.
3. **On your phone** (Safari on iOS, Chrome on Android): open that URL → Share/menu → **Add to Home Screen**. It'll launch full-screen like a normal app.
4. **On your laptop** (Chrome/Edge): open the URL → click the **install icon** in the address bar (or menu → "Install Jarvis…"). It opens in its own window, pinned to your dock/taskbar.

Two versions will exist once you do this — the installed app (this repo, works offline, no AI chat) and the [Claude-hosted version](https://claude.ai/artifact/BhQXyuT9jqsBZtsvXTU6KX) (has the AI chat, needs claude.ai). Their data does **not** sync with each other — each keeps its own `localStorage`. Use Export/Import to move data between them.

## Importing from Canvas or Blackboard

There's no live sync — school LMS platforms don't expose your assignments to third-party apps without institutional approval, and even with approval it typically requires a backend server to hold credentials. Importing the calendar feed file gets you real data with no setup on the school's end:

1. **Canvas**: log in → **Account** (left sidebar) → **Settings** → scroll to **Calendar Feed** → copy the private `.ics` URL, open it in a new tab, and save the file (or use *File → Save Page As* if your browser just displays the text).
2. **Blackboard**: check **Calendar** for an export/subscribe/RSS icon — not all Blackboard instances expose one; ask your instructor or IT if you don't see it.
3. In the hub, click **Import (.json / .ics)** in the sidebar and pick the downloaded file.

Re-download and re-import periodically (e.g. weekly) to pick up new/changed due dates — it will merge cleanly with what's already in your list.

## Usage

Just open `index.html` in a browser, or serve the folder with any static file server:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Project structure

```
index.html      # markup & layout
css/styles.css  # design system (light + dark themes, responsive)
js/app.js       # app logic: state, storage, filtering, rendering
manifest.json   # PWA manifest (name, icons, standalone display)
sw.js           # service worker — caches the app shell for offline/installed use
icons/          # app icons (192/512/maskable/apple-touch)
```

All data lives in `localStorage` under the browser you use it in — use the **Export** button in the sidebar regularly to back up your list, and **Import** to restore it or move it to another browser/device.
