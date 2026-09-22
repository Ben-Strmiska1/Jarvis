# Jarvis — Assignment & Test Hub

A single central hub to track every assignment, quiz, test, project, and exam across all your classes — with an easy-to-read, interactive UI.

## Features

- **Quick add bar** — title, subject, type, due date/time, priority, notes, all in one row.
- **Smart grouping** — items auto-sort into Overdue, Due Today, Tomorrow, This Week, Later, No Due Date, and Completed.
- **Dashboard stats** — overdue count, due today, due this week, and overall completion progress bar.
- **Filters & search** — by subject, type, priority, and free-text search; sort by due date, priority, subject, or recently added.
- **One-click complete** — check items off, edit inline, or delete.
- **Light/dark theme toggle**, remembered between visits.
- **Backup/restore** — export all items to JSON, import them back in (or on another device).
- **Canvas / Blackboard calendar import** — import a `.ics` calendar feed file directly; due dates, course, and type (quiz/test/exam/project) are parsed automatically. Re-importing the same feed later updates existing items in place instead of duplicating them, and preserves any items you've already marked complete.
- **Keyboard shortcuts** — `/` to search, `N` to jump to the add form, `Esc` to close the edit dialog.
- **Fully offline** — no backend, no build step, no account linking required. All data is stored in your browser's `localStorage`.

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
```

All data lives in `localStorage` under the browser you use it in — use the **Export** button in the sidebar regularly to back up your list, and **Import** to restore it or move it to another browser/device.
