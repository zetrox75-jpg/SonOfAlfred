import { useId, useMemo, useState, type ReactNode } from "react";
import { normalizeName } from "../domain/validation/catalogue";
import ICONS from "../data/itemIcons.json";
import NAMES_FR from "../data/itemNamesFr.json";
import { lang } from "../i18n";
import { inputCls } from "./ui";

// Item icons: game art downloaded once by `npm run item-data` into public/icons (not in git), found
// by item name through src/data/itemIcons.json. No network at run time. An item without an icon,
// or a build made before the download, gets a letter tile.

const FILES = ICONS as Record<string, string>;
export const iconFor = (name: string): string | null => {
  const f = FILES[normalizeName(name)];
  return f ? `/icons/${f}.webp` : null;
};

const FR = NAMES_FR as Record<string, string>;

/** Display name: French when the interface is French and a translation exists. The English name
 * stays the key for prices, recipes and icons. */
export const itemLabel = (name: string): string => (lang === "fr" ? FR[normalizeName(name)] ?? name : name);

/** Search in both languages. `q` is already normalized. */
export const itemMatches = (name: string, q: string): boolean =>
  !q || normalizeName(name).includes(q) || (lang === "fr" && normalizeName(itemLabel(name)).includes(q));

export interface ItemLike {
  id: number;
  name: string;
  game_region?: string;
}

const SIZES = { sm: "h-5 w-5 text-[10px]", md: "h-7 w-7 text-xs", lg: "h-10 w-10 text-sm" };

/** Decorative: the name is always written next to it. */
export function ItemIcon({ name, size = "sm" }: { name: string; size?: keyof typeof SIZES }) {
  const [failed, setFailed] = useState(false);
  const src = iconFor(name);
  const frame = `item-frame inline-flex shrink-0 items-center justify-center overflow-hidden rounded ${SIZES[size]}`;
  if (!src || failed) {
    return <span aria-hidden="true" className={`${frame} font-display font-semibold text-gold-300`}>{name.trim().charAt(0).toUpperCase() || "?"}</span>;
  }
  return (
    <span aria-hidden="true" className={frame}>
      <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} className="h-full w-full object-cover" />
    </span>
  );
}

export function ItemName({ name, size = "sm", children, className = "" }: { name: string; size?: keyof typeof SIZES; children?: ReactNode; className?: string }) {
  const label = itemLabel(name);
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 align-middle ${className}`} title={label !== name ? name : undefined}>
      <ItemIcon name={name} size={size} />
      <span className="truncate">{label}</span>
      {children}
    </span>
  );
}

/**
 * Text field with item suggestions (icon + name), WAI-ARIA combobox: arrows move, Enter picks,
 * Escape closes. `onChange` gets every keystroke; `onPick` the chosen item.
 */
export function ItemPicker({ items, value, onChange, onPick, label, placeholder, className = "", max = 40 }: {
  items: ItemLike[];
  value: string;
  onChange: (text: string) => void;
  onPick?: (item: ItemLike) => void;
  label: string;
  placeholder?: string;
  className?: string;
  max?: number;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = useMemo(() => {
    const q = normalizeName(value);
    if (!q) return items.slice(0, max);
    const starts: ItemLike[] = [], contains: ItemLike[] = [];
    for (const i of items) {
      const n = normalizeName(i.name), l = normalizeName(itemLabel(i.name));
      if (l.startsWith(q) || n.startsWith(q)) starts.push(i);
      else if (l.includes(q) || n.includes(q)) contains.push(i);
      if (starts.length >= max) break;
    }
    return [...starts, ...contains].slice(0, max);
  }, [items, value, max]);
  const show = open && matches.length > 0;
  const pick = (i: ItemLike) => {
    onChange(itemLabel(i.name));
    onPick?.(i);
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <input
        role="combobox"
        aria-label={label}
        aria-expanded={show}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={show ? `${id}-${active}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        className={inputCls}
        value={value}
        onChange={(e) => { onChange(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && show) { e.preventDefault(); pick(matches[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {show && (
        <ul id={`${id}-list`} role="listbox" aria-label={`${label} suggestions`}
          className="absolute z-30 mt-1 max-h-80 w-full min-w-72 overflow-y-auto rounded-md border border-gold-400/25 bg-night-900 py-1 shadow-xl shadow-black/60">
          {matches.map((i, n) => (
            <li key={i.id} id={`${id}-${n}`} role="option" aria-selected={n === active}
              onMouseDown={(e) => { e.preventDefault(); pick(i); }}
              onMouseEnter={() => setActive(n)}
              className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm ${n === active ? "bg-gold-400/15 text-gold-300" : "text-slate-200"}`}>
              <ItemIcon name={i.name} size="md" />
              <span className="flex-1 truncate" title={itemLabel(i.name) !== i.name ? i.name : undefined}>{itemLabel(i.name)}</span>
              {i.game_region && i.game_region !== "GLOBAL" && <span className="text-[11px] text-stale">{i.game_region}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
