// Builds the single-file page published as the Claude-hosted artifact.
// Usage: node tools/build_artifact.js <out.html> [seed_items.json]
// The seed (optional) only fills a first-ever visit with empty storage; the
// `assignments` db collection is the real source for synced classes.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const out = process.argv[2];
const seedPath = process.argv[3];
if (!out) throw new Error("usage: node tools/build_artifact.js <out.html> [seed_items.json]");

const html = fs.readFileSync(`${ROOT}/index.html`, "utf8");
const css = fs.readFileSync(`${ROOT}/css/styles.css`, "utf8");
const js = fs.readFileSync(`${ROOT}/js/app.js`, "utf8");
const seedItems = seedPath ? fs.readFileSync(seedPath, "utf8") : "[]";

let body = html.match(/<body>([\s\S]*)<\/body>/)[1];
body = body.replace(/\s*<script src="js\/app\.js"><\/script>\s*/, "\n");

// The artifact viewer's "system" theme stamps nothing on <html>, so dark mode
// also needs a prefers-color-scheme block mirroring :root[data-theme="dark"].
const darkBlock = css.match(/:root\[data-theme="dark"\] \{[\s\S]*?\n\}/)[0];
const darkVars = darkBlock.replace(/^:root\[data-theme="dark"\] \{/, "").replace(/\}$/, "");
const mediaBlock = `\n@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {${darkVars}  }\n}\n`;
const cssWithMedia = css.replace(/(:root\[data-theme="dark"\] \{[\s\S]*?\n\}\n)/, `$1${mediaBlock}`);

const seededJs = js
  .replace('(() => {\n  "use strict";\n', `(() => {\n  "use strict";\n\n  const SEED_ITEMS = ${seedItems};\n`)
  .replace(
    `  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("Failed to load items", e);
      return [];
    }
  }`,
    `  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
      return SEED_ITEMS.map((i) => ({ ...i }));
    } catch (e) {
      console.error("Failed to load items", e);
      return SEED_ITEMS.map((i) => ({ ...i }));
    }
  }`
  );

if (seededJs === js) throw new Error("load() replacement did not match — app.js changed; update this script");

const page = `<title>Jarvis Hub</title>
<style>
${cssWithMedia}
</style>
${body}
<script>
${seededJs}
</script>
`;

fs.writeFileSync(out, page);
console.log("Written", out, "length:", page.length);
