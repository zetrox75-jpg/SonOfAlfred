// Downloads item names (French) and item icons for local display.
// Usage: npm run item-data            (add -- --dry-run to only count what would be downloaded)
//
// Source: gamers4.life (robots.txt allows all agents; checked 2026-10-31). Its item list page
// embeds every item as {"id","name","icon",...,"isGlobalAvailable"} (Taiwan-only items, flagged false, are skipped): one request per language.
// Writes, both committed:
//   src/data/itemNamesFr.json  normalized English name -> French name
//   src/data/itemIcons.json    normalized English name -> icon file ("ETC/Icon_X")
// and downloads the icons of Global items into public/icons/ (game art: git ignores that folder,
// so it is bundled into the user's build but never published). Polite: 4 requests at a time,
// honest User-Agent, files already present are skipped.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const DRY = process.argv.includes("--dry-run");
const ROOT = join(import.meta.dirname, "..");
const UA = "AION2-Craft-Profit-Manager/0.1.0 (desktop app; one-time item data download)";
const ICON_BASE = "https://gamers4.life/aion-2/database/icons/assets/Game/UI/Resource/Texture/Item/";
const OUT_ICONS = join(ROOT, "public", "icons");

// Same rule as normalizeName in src/domain/validation/catalogue.ts.
const norm = (s) => s.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

async function items(lang) {
  const url = `https://gamers4.life/aion-2/database/${lang}/item/`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  let s = await res.text();
  // The records sit in an escaped JS string: unescape until plain JSON objects appear.
  for (let i = 0; i < 2 && s.includes('\\"id\\"'); i++) s = s.replace(/\\\\/g, "\u0000").replace(/\\"/g, '"').replace(/\u0000/g, "\\");
  const out = new Map();
  // One record runs from its {"id":" to the next one (records may contain nested objects).
  const starts = [...s.matchAll(/\{"id":"(\d{6,12})","name":"/g)];
  starts.forEach((m, i) => {
    if (out.has(m[1])) return;
    const rec = s.slice(m.index, starts[i + 1]?.index ?? m.index + 4000);
    const n = rec.match(/^\{"id":"\d+","name":"((?:[^"\\]|\\.)*)"/);
    if (!n) return;
    let name = n[1];
    try { name = JSON.parse(`"${n[1]}"`); } catch { /* keep raw */ }
    out.set(m[1], { name, icon: rec.match(/"icon":"([^"]*)"/)?.[1] ?? "", global: !/"isGlobalAvailable":false/.test(rec) });
  });
  if (out.size < 1000) throw new Error(`${url}: only ${out.size} items found; the page format may have changed.`);
  return out;
}

const [en, fr] = [await items("en"), await items("fr")];

const names = {}, icons = {};
for (const [id, e] of en) {
  if (!e.name.trim()) continue;
  const k = norm(e.name);
  const f = fr.get(id)?.name;
  if (f && f !== e.name && !(k in names)) names[k] = f;
  // "/assets/Game/UI/Resource/Texture/Item/ETC/Icon_X.Icon_X" (or .png) -> "ETC/Icon_X"
  const file = e.icon.match(/^\/assets\/Game\/UI\/Resource\/Texture\/Item\/([A-Za-z0-9_]+\/[A-Za-z0-9_]+)(?:\.[A-Za-z0-9_]+)?$/)?.[1];
  if (file && e.global && !(k in icons)) icons[k] = file;
}
const sorted = (o) => Object.fromEntries(Object.entries(o).sort());
const files = [...new Set(Object.values(icons))];
const todo = files.filter((f) => !existsSync(join(OUT_ICONS, `${f}.webp`)));
console.log(`items en ${en.size} / fr ${fr.size}; French names ${Object.keys(names).length}; Global items with an icon ${Object.keys(icons).length}; icon files ${files.length}, to download ${todo.length}`);
if (DRY) process.exit(0);

writeFileSync(join(ROOT, "src", "data", "itemNamesFr.json"), JSON.stringify(sorted(names)) + "\n");
writeFileSync(join(ROOT, "src", "data", "itemIcons.json"), JSON.stringify(sorted(icons)) + "\n");

let done = 0, failed = 0;
async function worker() {
  while (todo.length) {
    const f = todo.shift();
    try {
      const res = await fetch(`${ICON_BASE}${f}.webp`, { headers: { "User-Agent": UA } });
      if (!res.ok || !String(res.headers.get("content-type")).startsWith("image/")) throw new Error(`HTTP ${res.status}`);
      const dest = join(OUT_ICONS, `${f}.webp`);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      if (++done % 250 === 0) console.log(`  ${done} downloaded...`);
    } catch (e) {
      failed++;
      if (failed <= 20) console.warn(`skip ${f}: ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
console.log(`icons downloaded ${done}, failed ${failed}`);
