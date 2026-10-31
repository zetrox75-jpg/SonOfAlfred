// Every tr("...") string in src has a French translation (or is meant to stay as is).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import FR from "../src/i18n/fr.json";

const SAME_IN_FRENCH = new Set(["OTHER", "demo_items.csv", "demo_recipes.csv", "https://...", "inventory.csv", "items.csv", "prices.csv", "recipes.csv", "use=reference"]);

function keys(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return keys(p);
    if (!/\.tsx?$/.test(p)) return [];
    return [...readFileSync(p, "utf8").matchAll(/\btr\(("(?:[^"\\]|\\.)*")/g)].map((m) => JSON.parse(m[1]) as string);
  });
}

it("every interface string has a French translation", () => {
  const fr = FR as Record<string, string>;
  const missing = [...new Set(keys(join(__dirname, "../src")))].filter((k) => !(k in fr) && !SAME_IN_FRENCH.has(k));
  expect(missing).toEqual([]);
  expect(Object.entries(fr).filter(([, v]) => !v.trim())).toEqual([]);
});
