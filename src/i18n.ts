import FR from "./i18n/fr.json";

// Interface language. English text is the key; `fr.json` maps it to French and anything missing
// stays English. Item names are game data and are never translated. The choice is kept in this
// browser profile; switching reloads the window so every page renders in the new language.

export type Lang = "en" | "fr";
const KEY = "ui.lang";

function read(): Lang {
  try {
    return localStorage.getItem(KEY) === "fr" ? "fr" : "en";
  } catch {
    return "en";
  }
}

export const lang: Lang = read();
const dict = FR as Record<string, string>;

/** Translates an interface string. `{name}` placeholders are filled from `vars`. */
export function tr(text: string, vars?: Record<string, string | number>): string {
  let s = lang === "fr" ? (dict[text] ?? text) : text;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function setLang(next: Lang) {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Storage unavailable: the choice lasts until the window reloads.
  }
  location.reload();
}
