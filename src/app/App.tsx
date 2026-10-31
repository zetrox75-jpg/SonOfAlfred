import { useEffect, useState, type ComponentType } from "react";
import DashboardPage from "../features/dashboard/DashboardPage";
import SettingsPage from "../features/settings/SettingsPage";
import CataloguePage from "../features/catalogue/CataloguePage";
import ImportExportPage from "../features/import-export/ImportExportPage";
import CalculatorPage from "../features/crafting/CalculatorPage";
import TreePage from "../features/crafting/TreePage";
import InventoryPage from "../features/crafting/InventoryPage";
import { WorkspaceProvider } from "../features/crafting/workspace";
import MarketPage from "../features/market/MarketPage";
import HistoryPage from "../features/market/HistoryPage";
import ScannerPage from "../features/scanner/ScannerPage";
import { lang, setLang, tr } from "../i18n";


interface NavEntry {
  id: string;
  label: string;
  page: ComponentType<{ onNavigate: (id: string) => void }>;
}

// README section 4: main menu, in this order.
const NAV: NavEntry[] = [
  { id: "dashboard", label: "Dashboard", page: DashboardPage },
  { id: "catalogue", label: "Catalogue", page: CataloguePage },
  { id: "calculator", label: "Craft calculator", page: CalculatorPage },
  { id: "tree", label: "Crafting tree", page: TreePage },
  { id: "scanner", label: "Profit scanner", page: ScannerPage },
  { id: "market", label: "Market / Prices", page: MarketPage },
  { id: "inventory", label: "Inventory", page: InventoryPage },
  { id: "history", label: "History", page: HistoryPage },
  { id: "import", label: "Import / Export", page: ImportExportPage },
  { id: "settings", label: "Settings", page: SettingsPage },
];

/** `upgradeBackup`: path of the backup taken before this launch upgraded the database, if any. */
export default function App({ upgradeBackup }: { upgradeBackup: string | null }) {
  const [current, setCurrent] = useState(NAV[0].id);

  // Alt+1..9 opens menu entries 1-9, Alt+0 opens the 10th (Settings).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || !/^[0-9]$/.test(e.key)) return;
      const entry = NAV[e.key === "0" ? 9 : Number(e.key) - 1];
      if (entry) {
        e.preventDefault();
        setCurrent(entry.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const entry = NAV.find((n) => n.id === current)!;
  const Page = entry.page;

  return (
    <div className="flex h-full">
      <nav aria-label={tr("Main menu")} className="flex w-60 shrink-0 flex-col border-r border-gold-400/15 bg-gradient-to-b from-night-900 to-night-950">
        <div className="flex items-center gap-3 px-5 py-5">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 rotate-45 items-center justify-center border border-gold-400/60 bg-night-800 shadow-[0_0_14px_-4px_rgb(209_173_91/0.7)]">
            <span className="h-3 w-3 bg-gradient-to-br from-gold-200 to-gold-500" />
          </span>
          <div>
            <p className="font-display text-[11px] font-semibold uppercase tracking-[0.3em] text-frost-300">{tr("AION 2 Global")}</p>
            <p className="font-display text-base font-semibold leading-tight text-gold-300">{tr("Craft Profit Manager")}</p>
          </div>
        </div>
        <div aria-hidden="true" className="ornament-rule mx-4" />
        <ul className="flex-1 overflow-y-auto py-3">
          {NAV.map((n, i) => {
            const active = n.id === current;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => setCurrent(n.id)}
                  aria-current={active ? "page" : undefined}
                  title={`Alt+${(i + 1) % 10}`}
                  className={`flex w-full cursor-pointer items-center gap-3 border-l-2 px-5 py-2 text-left text-sm transition-colors duration-150 ${
                    active
                      ? "border-gold-400 bg-gradient-to-r from-gold-400/15 to-transparent text-gold-200"
                      : "border-transparent text-slate-400 hover:bg-night-800/70 hover:text-slate-200"
                  }`}
                >
                  <span className="num w-4 text-xs text-slate-600">{(i + 1) % 10}</span>
                  <span className="flex-1">{tr(n.label)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-2 border-t border-gold-400/10 px-5 py-3">
          <p className="text-[11px] text-slate-500">{tr("v0.1.0 · local data · icons via gamers4.life")}</p>
          <div role="group" aria-label={tr("Language")} className="flex overflow-hidden rounded border border-gold-400/30 text-[11px] font-semibold">
            {(["en", "fr"] as const).map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => lang !== l && setLang(l)}
                className={`cursor-pointer px-2 py-1 uppercase ${lang === l ? "bg-gold-400 text-night-950" : "text-slate-400 hover:bg-night-700"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="flex-1 overflow-y-auto px-8 py-6">
        {upgradeBackup && (
          <p role="status" className="mb-4 rounded border border-frost-400/40 p-3 text-sm text-frost-300 break-all">
            {tr("The database was upgraded. A backup taken just before is at")} <span className="font-mono">{upgradeBackup}</span>.
          </p>
        )}
        <WorkspaceProvider>
          <Page key={current} onNavigate={setCurrent} />
        </WorkspaceProvider>
      </main>
    </div>
  );
}
