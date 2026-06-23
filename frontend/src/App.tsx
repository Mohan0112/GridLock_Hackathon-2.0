import { useEffect, useMemo, useState } from "react";
import type { Kpis, Cell, Beat } from "./types";
import { api } from "./api";
import KpiHeader from "./components/KpiHeader";
import MapView from "./components/MapView";
import OverviewPanel from "./components/OverviewPanel";
import HotspotPanel from "./components/HotspotPanel";
import DeployPanel from "./components/DeployPanel";
import AboutModal from "./components/AboutModal";

type Tab = "overview" | "hotspot" | "deploy";
type Layer = "impact" | "density";
type Theme = "dark" | "light";
type Band = "all" | "night" | "morning" | "afternoon" | "evening" | "late";

const BANDS: { value: Band; label: string }[] = [
  { value: "all", label: "All hours" },
  { value: "night", label: "Night" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "late", label: "Late" },
];

export default function App() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [impactCells, setImpactCells] = useState<Cell[]>([]);
  const [mapCells, setMapCells] = useState<Cell[]>([]);
  const [blindCells, setBlindCells] = useState<Cell[]>([]);

  const [layer, setLayer] = useState<Layer>("impact");
  const [band, setBand] = useState<Band>("all");
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("gridlock-theme");
    return saved === "light" ? "light" : "dark";
  });
  const [showBlind, setShowBlind] = useState(true);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [flyTo, setFlyTo] = useState<{
    lat: number;
    lon: number;
    key: number;
    zoom?: number;
  } | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [railWidth, setRailWidth] = useState(400);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("gridlock-theme", theme);
  }, [theme]);

  useEffect(() => {
    Promise.all([
      api.kpis().then(setKpis),
      api.heatmap("impact").then((cells) => {
        setImpactCells(cells);
        setMapCells(cells);
      }),
      api.heatmap("blindspot").then(setBlindCells),
    ]).catch(() => setErr(true));
  }, []);

  useEffect(() => {
    const shift = band === "all" ? undefined : band;
    api
      .heatmap(layer, shift)
      .then(setMapCells)
      .catch(() => setErr(true));
  }, [layer, band]);

  function cellLookup(cell: string) {
    return (
      mapCells.find((c) => c.cell === cell) ??
      impactCells.find((c) => c.cell === cell) ??
      blindCells.find((c) => c.cell === cell) ??
      null
    );
  }

  function selectCell(cell: string) {
    setSelectedCell(cell);
    const found = cellLookup(cell);
    if (found) {
      setFlyTo({ lat: found.lat, lon: found.lon, zoom: 14.4, key: Date.now() });
    }
    setTab("hotspot");
    setRailCollapsed(false);
  }

  function pickStation(station: string) {
    const best = impactCells
      .filter((c) => c.police_station === station)
      .sort((a, b) => b.impact_score - a.impact_score)[0];
    if (best) {
      setSelectedCell(best.cell);
      setFlyTo({ lat: best.lat, lon: best.lon, zoom: 14.4, key: Date.now() });
      setTab("hotspot");
      setRailCollapsed(false);
    }
  }

  function fly(lat: number, lon: number) {
    setFlyTo({ lat, lon, zoom: 14.4, key: Date.now() });
  }

  function handlePlan(nextBeats: Beat[]) {
    setBeats(nextBeats);
    if (nextBeats.length > 0) {
      const lat = nextBeats.reduce((sum, beat) => sum + beat.lat, 0) / nextBeats.length;
      const lon = nextBeats.reduce((sum, beat) => sum + beat.lon, 0) / nextBeats.length;
      setFlyTo({ lat, lon, zoom: 11.3, key: Date.now() });
    }
  }

  function startResize(startX: number, startWidth: number) {
    function onMove(e: MouseEvent) {
      const next = startWidth + (startX - e.clientX);
      setRailWidth(Math.min(720, Math.max(300, next)));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const legend = useMemo(() => {
    if (layer === "impact")
      return {
        grad: "linear-gradient(90deg,#263240,#F2B33D,#F2762E,#E4322B)",
        lo: band === "all" ? "Low impact" : "Low shift impact",
        hi: band === "all" ? "Peak impact" : "Peak in shift",
      };
    return {
      grad: "linear-gradient(90deg,#1E2935,#46586E,#F2B33D)",
      lo: "Few",
      hi: band === "all" ? "Many violations" : "Many in shift",
    };
  }, [layer, band]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ink text-paper">
      <KpiHeader
        kpis={kpis}
        theme={theme}
        onThemeToggle={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        onAbout={() => setAboutOpen(true)}
      />
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <MapView
            layer={layer}
            theme={theme}
            showBlind={showBlind}
            cells={mapCells}
            blind={blindCells}
            beats={beats}
            selectedCell={selectedCell}
            onSelectCell={selectCell}
            flyTo={flyTo}
          />

          <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2">
            <div className="pointer-events-auto inline-flex overflow-hidden rounded-lg border border-line bg-panel/90">
              {(["impact", "density"] as Layer[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLayer(l)}
                  className={`px-3 py-1.5 text-[11px] font-medium transition ${
                    layer === l
                      ? "bg-amber/15 text-amber"
                      : "text-mist hover:text-paper"
                  }`}
                >
                  {l === "impact" ? "Impact" : "Density"}
                </button>
              ))}
            </div>
            <div className="pointer-events-auto flex flex-wrap gap-1 rounded-lg border border-line bg-panel/90 p-1">
              {BANDS.map((b) => (
                <button
                  key={b.value}
                  onClick={() => setBand(b.value)}
                  className={`rounded-md px-2 py-1 text-[10px] font-medium transition ${
                    band === b.value
                      ? "bg-amber/15 text-amber"
                      : "text-mist hover:text-paper"
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowBlind((v) => !v)}
              className={`pointer-events-auto inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition ${
                showBlind
                  ? "border-unseen/50 bg-panel/90 text-unseen"
                  : "border-line bg-panel/90 text-mist hover:text-paper"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${showBlind ? "bg-unseen" : "bg-mist"}`}
              />
              Blind spots
            </button>
          </div>

          <div className="absolute bottom-4 left-4 rounded-lg border border-line bg-panel/90 px-3 py-2.5">
            <div className="mb-1.5 text-[10px] font-medium text-mist">
              {layer === "impact" ? "Congestion impact - height = score" : "Violation volume"}
            </div>
            <div className="h-2 w-44 rounded-full" style={{ background: legend.grad }} />
            <div className="mt-1 flex justify-between text-[9px] text-mist">
              <span>{legend.lo}</span>
              <span>{legend.hi}</span>
            </div>
            {band !== "all" && (
              <div className="mt-1.5 text-[9px] text-amber">
                Weighted for {band} activity
              </div>
            )}
            {showBlind && (
              <div className="mt-2 flex items-center gap-1.5 border-t border-line pt-1.5 text-[9px] text-mist">
                <span className="h-2 w-2 rounded-full bg-unseen" />
                Blind spot - under-enforced
              </div>
            )}
            {beats.length > 0 && (
              <div className="mt-1 flex items-center gap-1.5 text-[9px] text-mist">
                <span className="flex h-2.5 w-2.5 items-center justify-center rounded-full border border-amber text-[6px] text-amber">
                  #
                </span>
                Assigned beat
              </div>
            )}
          </div>

          {railCollapsed && (
            <button
              onClick={() => setRailCollapsed(false)}
              className="absolute right-3 top-1/2 z-10 rounded-l-md border border-line bg-panel px-2 py-4 font-display text-sm font-bold text-paper"
              title="Open panel"
            >
              {"<"}
            </button>
          )}

          {err && (
            <div className="absolute right-4 top-4 rounded-lg border border-stop/50 bg-stop/10 px-3 py-2 text-xs text-stop">
              API unreachable - start the backend on :8000.
            </div>
          )}
        </div>

        <aside
          className="relative flex shrink-0 flex-col overflow-hidden border-l border-line bg-panel/40 transition-[width]"
          style={{ width: railCollapsed ? 0 : railWidth }}
        >
          {!railCollapsed && (
            <div
              onMouseDown={(e) => startResize(e.clientX, railWidth)}
              className="absolute left-0 top-0 z-20 h-full w-2 cursor-col-resize border-l border-line bg-line/20 transition hover:bg-amber/30"
              title="Drag to resize"
            >
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setRailCollapsed(true)}
                className="absolute -left-7 top-1/2 rounded-l-md border border-line bg-panel px-2 py-4 font-display text-sm font-bold text-paper"
                title="Collapse panel"
              >
                {">"}
              </button>
            </div>
          )}

          <nav className="flex shrink-0 border-b border-line pl-2">
            {([
              ["overview", "Overview"],
              ["hotspot", "Hotspot"],
              ["deploy", "Deploy"],
            ] as [Tab, string][]).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`relative flex-1 py-3 font-display text-sm font-semibold transition ${
                  tab === t ? "text-paper" : "text-mist hover:text-paper"
                }`}
              >
                {label}
                {tab === t && (
                  <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-amber" />
                )}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 pl-5">
            {tab === "overview" && (
              <OverviewPanel
                kpis={kpis}
                theme={theme}
                onPickStation={pickStation}
              />
            )}
            {tab === "hotspot" && (
              <HotspotPanel cell={selectedCell} theme={theme} />
            )}
            {tab === "deploy" && (
              <DeployPanel beats={beats} onPlan={handlePlan} onFly={fly} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
