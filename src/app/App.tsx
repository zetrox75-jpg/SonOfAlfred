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
      <nav aria-label="Main menu" className="flex w-60 shrink-0 flex-col border-r border-night-700 bg-night-900">
        <div className="border-b border-night-700 px-5 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-frost-400">AION 2 Global</p>
          <p className="mt-1 text-lg font-semibold leading-tight text-gold-300">Craft Profit Manager</p>
        </div>
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
                  className={`flex w-full items-center gap-3 border-l-2 px-5 py-2 text-left text-sm transition-colors ${
                    active
                      ? "border-gold-400 bg-night-800 text-slate-100"
                      : "border-transparent text-slate-400 hover:bg-night-800/60 hover:text-slate-200"
                  }`}
                >
                  <span className="num w-4 text-xs text-slate-600">{(i + 1) % 10}</span>
                  <span className="flex-1">{n.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-night-700 px-5 py-3 text-[11px] text-slate-600">v0.1.0 · local data only</p>
      </nav>

      <main className="flex-1 overflow-y-auto px-8 py-6">
        {upgradeBackup && (
          <p role="status" className="mb-4 rounded border border-frost-400/40 p-3 text-sm text-frost-300 break-all">
            The database was upgraded. A backup taken just before is at <span className="font-mono">{upgradeBackup}</span>.
          </p>
        )}
        <WorkspaceProvider>
          <Page key={current} onNavigate={setCurrent} />
        </WorkspaceProvider>
      </main>
    </div>
  );
}
