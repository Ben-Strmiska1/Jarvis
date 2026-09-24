# Jarvis Hub — Handoff

_Last updated: 2026-09-24_

Read this first if you're picking up the project in a new session. The README covers features for the user; this covers **how it's built, where it runs, what's automated, and what's still open.**

---

## 1. What it is

A single-page study hub for one student (Ben: TAMU on Canvas, Blinn College on Blackboard/D2L). It tracks assignments and tests and adds Notes, Study Guides, Flashcards, Practice Problems and an AI chat ("Ask Jarvis"). It's plain HTML/CSS/JS with no build step and no backend.

## 2. Where it runs — three copies with separate data

| Copy | URL | Data | AI chat | Auto class sync |
|---|---|---|---|---|
| **Claude-hosted artifact** (main copy) | https://claude.ai/artifact/BhQXyuT9jqsBZtsvXTU6KX | browser localStorage + the artifact's private `db` | ✅ | ✅ (reads the `assignments` db collection) |
| **GitHub Pages / installed PWA** | https://ben-strmiska1.github.io/Jarvis/ | browser localStorage only | ❌ (shows a link to the hosted copy) | ❌ (manual Import) |
| Local `index.html` | — | localStorage | ❌ | ❌ |

- Each copy has its **own storage**. Nothing syncs between them except via Export → Import.
- The artifact is **private** (owner only).
- The GitHub Pages site is **public**. Never commit the student's class data or personal info to the repo.

## 3. Repo layout

```
index.html            markup; sidebar section-nav switches views
css/styles.css        design tokens (light + [data-theme="dark"]) and all components
js/app.js             everything: state, storage, render, import/export, study sections, chat, attachments, db sync
manifest.json, sw.js, icons/   PWA (install to home screen; offline app shell)
.github/workflows/pages.yml    deploys to GitHub Pages on push to main (see §6)
tools/build_artifact.js        builds the single-file page published as the artifact (see §5)
README.md             user-facing feature and setup docs
handoff.md            this file
```

**Branches:** work happens on `claude/tender-davinci-fipcgm`. `main` is the Pages deploy source.
**Current state:** `main` is **one commit behind** the feature branch; it's missing the db auto-sync commit. That's harmless, because db sync is a no-op outside the artifact. Merge (fast-forward) when convenient.

## 4. Data model (`js/app.js`)

localStorage keys:
- `jarvis.hub.items.v1`: assignments array. Item fields: `{id, title, subject, type, dueDate "YYYY-MM-DD", dueTime "HH:MM"|"", priority, status "todo"|"in-progress"|"done", url, notes, createdAt}`
- `jarvis.hub.study.v1`: `{notes:[], guides:[], cards:[], problems:[]}`. Notes carry `attachments:[{id, filename, contentType, sizeBytes}]`.
- `jarvis.hub.theme`

**File attachments** are blobs in IndexedDB (`jarvis-hub-files` / store `attachments`, keyed by attachment id). Any file type, 50 MB cap. Export/Import carries attachment *metadata* only, not the bytes. Download uses the `downloads` capability inside the artifact and a blob link elsewhere.

**Import** accepts: `.ics`, a bare JSON array of items (legacy / sync files), or `{items, study}` (full Export). It **upserts by `id`** and **preserves an existing item's `status`**, so re-importing never un-checks work.

**Clicking an assignment title:** if `url` is set, it opens the link in a new tab (↗ marker). Otherwise it opens the edit modal.

## 5. The Claude-hosted artifact

Build and publish:
```bash
node tools/build_artifact.js /path/out.html            # optional 2nd arg: seed_items.json
```
Then publish with the Artifact tool: `url` = the artifact URL above and `capabilities` = `{"downloads": true, "sample": {}, "db": {}}`. Passing `capabilities` replaces the whole set, so always include all three.

What the build does: inlines CSS/JS, adds a `prefers-color-scheme` dark block (the artifact "system" theme stamps nothing), injects `SEED_ITEMS`, and patches `load()` to fall back to the seed on a first-ever visit. **If you change `load()` in app.js, update the string match in the build script** (it throws if the match fails).

Capabilities used:
- `sample`: Ask Jarvis chat (`claude.use("sample")`). Context (upcoming items, note/guide titles, decks) goes into the first user turn.
- `downloads`: Export button and attachment download (plain `<a download>` is sandboxed there).
- `db`: collection `assignments`. The page subscribes with `onSnapshot` and merges docs into localStorage by id, keeping local `status`. Docs contain **no `status` field**.

Artifact sandbox gotchas: no `alert/confirm/prompt` UI is shown (confirm returns false → deletes are blocked in the hosted copy; see §9), no service workers, no downloads without the capability, CSP limits external scripts.

## 6. GitHub Pages

- Workflow `.github/workflows/pages.yml` runs on push to `main` or the feature branch, plus manual dispatch. It uses `configure-pages` with `enablement: true`, then upload and deploy.
- **The `github-pages` environment only allows deploys from `main`.** Runs from the feature branch fail instantly with no logs. Deploy by updating `main`.
- Pages source is set to "GitHub Actions" (the user did this once in Settings; a workflow token can't do it).

## 7. Automatic class sync (Routine)

- **Routine:** "Jarvis class sync (Mon/Wed, auto-updates hub)", `trig_01PMqJ4srWYBUNRkpcPzrjkr`, cron `0 11 * * 1,3` (6 AM Central during daylight time; becomes 5 AM Central after DST ends Nov 1).
- It fires **into the original long session** (`session_01CAumDVHCCcfFNgZt9UeWCS`), because that session holds the Google Calendar connector. That makes each run **expensive** (it re-reads a huge context).
- **Pipeline:** Google Calendar `list_events` on two imported LMS calendars → transform in node → compare against `ArtifactData list assignments` → `ArtifactData batch set` only new/changed docs. It never deletes. On a blocking failure it sends a PushNotification.
  - Canvas calendar: `no40uovcganfah5ekjsoeb6vpo2jn1s5@import.calendar.google.com`
  - Blackboard calendar: `pbfi4hgth1jv54ls7k63f5859afpjbhp@import.calendar.google.com`
- **Transform rules** (must stay identical, or ids stop matching):
  - Times: UTC `dateTime` → America/Chicago local date/time (the raw UTC date is a day off for 11:59 PM deadlines). All-day `date` → first 10 chars.
  - Canvas: keep every event. subject = trailing `[...]`, taking the part before the first `:` (drops section lists like `AERS-101:500,501…`).
  - Blackboard: keep only summaries ending ` - Due` (skip "Available"/"Availability Ends" duplicates and Zoom class blocks). subject = `location` minus `Fall YYYY - ` and the trailing `(CODE)`.
  - **id:** `h=0; for c: h=(h*31+code)>>>0; "gcal-"+h.toString(36)`, seeded with `"canvas:" + RAW summary incl. [bracket] + dueDate` or `"bb:" + event id`.
  - url: the line after `Quizzes:`/`Dropbox:`, else the `View event -` line, else "". **Never take the first URL in the text** (descriptions embed unrelated YouTube links first). If the new url is "" but the stored doc has one, keep the stored one (a few Canvas file links were backfilled by hand).
- **Result of the last run (2026-09-23):** 34 items, 0 new, 1 changed. Chapter 8 "Producing Goods and Coca Cola" moved to 2026-09-27 23:59.
- 10 Canvas items (AERS-101, HORT 335 exams and extra credit) have **no link available**. Their calendar events carry no description.

### Making the sync cheap (open item)
A fresh-session-per-run Routine created from a Claude Code session **can't carry connectors** (org restriction), so it would fail. The user must create it in the **claude.ai Routines UI with Google Calendar attached**. Paste in the prompt from the current Routine (`list_triggers` shows it). Then delete `trig_01PMqJ4srWYBUNRkpcPzrjkr`.

## 8. Decisions and why

- **No backend.** Everything is client-side. LMS APIs need institutional approval plus a server to hold credentials; the Google Calendar imports already contain the data.
- **Microsoft 365 was abandoned:** Outlook had no class data, and the student's LMS feeds live in Google Calendar.
- **AI chat and auto-sync are artifact-only.** They depend on Claude runtime capabilities; a real standalone-app agent would need the user's own API key plus a backend. The user declined that route.
- **Attachments use IndexedDB, not the `assets` capability:** `assets` rejects .docx/.pptx/.zip, and IndexedDB works in both copies.
- **Class data is never baked into the public Pages site** (privacy).

## 9. Known issues / next steps

1. **Import and Delete are broken in the hosted copy (highest priority).** The artifact viewer makes `confirm()` return false, so every code path gated on it silently does nothing there: **Import (.json/.ics)**, every delete (assignment, note, guide, problem, attachment) and "Clear done". Import still works in the Pages/local copies; in the hosted copy, synced classes arrive via db instead. Fix: replace `confirm()` with an in-page confirmation, and replace `alert()` too, since those messages never show in the artifact (import errors, the attachment size cap).
2. Move the sync to a cheap Routine (§7).
3. Fast-forward `main` to the feature branch so Pages has the latest code.
4. The sidebar subject filter only filters Assignments. Notes and other study sections ignore it.
5. Service-worker cache name is `jarvis-hub-v1`. Bump it when shipping app-shell changes, or installed PWAs may serve stale files.
6. Unverified in a real viewer: I tested the db auto-merge by writing and reading back through `ArtifactData`, not by watching the live page pick it up.

## 10. Testing approach used

Serve with `python3 -m http.server`, then drive it with Playwright (`NODE_PATH=$(npm root -g)`, `executablePath: '/opt/pw-browsers/chromium'`). To check the artifact build, wrap its output in a doctype/head/body shell and load it via `file://`. A recurring bug class: a component with an explicit CSS `display` **overrides the `hidden` attribute**. Any element toggled with `.hidden` needs a matching `[hidden] { display: none }` rule. This hit the edit modal and the chat input.
