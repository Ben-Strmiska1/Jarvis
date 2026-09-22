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
- **Keyboard shortcuts** — `/` to search, `N` to jump to the add form, `Esc` to close the edit dialog.
- **Fully offline** — no backend, no build step. All data is stored in your browser's `localStorage`.

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
