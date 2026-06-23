import { useEffect, useRef, useState } from "react";
import type { Beat, Cell, Kpis } from "./types";
import { api } from "./api";
import AboutModal from "./components/AboutModal";
import TopNav, { type Page } from "./components/TopNav";
import IntroductionPage from "./pages/IntroductionPage";
import OverviewPage from "./pages/OverviewPage";
import MapModule from "./pages/MapModule";

type Layer = "impact" | "density";
type Theme = "dark" | "light";
type Band = "all" | "night" | "morning" | "afternoon" | "evening" | "late";
type FocusKind = "impact" | "blindspot";
type PanelTab = "hotspot" | "plan";

export default function App() {
  const [page, setPage] = useState<Page>("intro");
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
  const [mapTab, setMapTab] = useState<PanelTab>("hotspot");
  const [beats, setBeats] = useState<Beat[]>([]);
  const [flyTo, setFlyTo] = useState<{
    lat: number;
    lon: number;
    key: number;
    zoom?: number;
  } | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [err, setErr] = useState(false);
  // Heatmap calls are keyed by layer + shift. Aborting stale requests prevents
  // rapid shift clicks from painting old cells over the latest selection.
  const heatmapCache = useRef(new Map<string, Cell[]>());
  const heatmapRequest = useRef(0);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("gridlock-theme", theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    api
      .kpis()
      .then((next) => {
        if (cancelled) return;
        setKpis(next);
        setErr(false);
      })
      .catch(() => !cancelled && setErr(true));

    api
      .heatmap("impact")
      .then((cells) => {
        if (cancelled) return;
        heatmapCache.current.set("impact:all", cells);
        setImpactCells(cells);
        setMapCells(cells);
        setErr(false);
      })
      .catch(() => !cancelled && setErr(true));

    api
      .heatmap("blindspot")
      .then((cells) => {
        if (cancelled) return;
        heatmapCache.current.set("blindspot:all", cells);
        setBlindCells(cells);
        setErr(false);
      })
      .catch(() => !cancelled && setErr(true));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const requestId = ++heatmapRequest.current;
    const controller = new AbortController();
    const shift = band === "all" ? undefined : band;
    const cacheKey = `${layer}:${band}`;
    const cached = heatmapCache.current.get(cacheKey);

    if (cached) {
      setMapCells(cached);
      setMapLoading(false);
      return () => controller.abort();
    }

    setMapLoading(true);
    api
      .heatmap(layer, shift, controller.signal)
      .then((cells) => {
        if (requestId !== heatmapRequest.current) return;
        heatmapCache.current.set(cacheKey, cells);
        setMapCells(cells);
        setErr(false);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (requestId === heatmapRequest.current) setErr(true);
      })
      .finally(() => {
        if (requestId === heatmapRequest.current) setMapLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [layer, band]);

  useEffect(() => {
    setBeats([]);
  }, [band]);

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
    setMapTab("hotspot");
    setPage("map");

    const found = cellLookup(cell);
    if (found) {
      setFlyTo({ lat: found.lat, lon: found.lon, zoom: 14.4, key: Date.now() });
    }
  }

  function pickCell(cell: Cell, kind: FocusKind = "impact") {
    setLayer("impact");
    setShowBlind(kind === "blindspot" ? true : showBlind);
    setSelectedCell(cell.cell);
    setMapTab("hotspot");
    setFlyTo({ lat: cell.lat, lon: cell.lon, zoom: 14.4, key: Date.now() });
    setPage("map");
  }

  function pickStation(station: string) {
    const bestBlind = blindCells
      .filter((c) => c.police_station === station)
      .sort((a, b) => b.per_officer_day - a.per_officer_day)[0];
    const bestImpact = impactCells
      .filter((c) => c.police_station === station)
      .sort((a, b) => b.impact_score - a.impact_score)[0];
    const best = bestBlind ?? bestImpact;
    if (best) {
      pickCell(best, best.blindspot ? "blindspot" : "impact");
    }
  }

  function selectBeat(beat: Beat) {
    setSelectedCell(beat.cell);
    setMapTab("hotspot");
    setFlyTo({ lat: beat.lat, lon: beat.lon, zoom: 14.4, key: Date.now() });
    setPage("map");
  }

  function handlePlan(nextBeats: Beat[]) {
    setBeats(nextBeats);
    if (nextBeats.length > 0) {
      const lat =
        nextBeats.reduce((sum, beat) => sum + beat.lat, 0) / nextBeats.length;
      const lon =
        nextBeats.reduce((sum, beat) => sum + beat.lon, 0) / nextBeats.length;
      setFlyTo({ lat, lon, zoom: 11.3, key: Date.now() });
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ink text-paper">
      <TopNav
        page={page}
        onChange={setPage}
        theme={theme}
        onToggleTheme={() => setTheme((next) => (next === "dark" ? "light" : "dark"))}
        onAbout={() => setAboutOpen(true)}
      />

      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}

      <main className="min-h-0 flex-1 overflow-hidden">
        {page === "intro" && (
          <IntroductionPage
            kpis={kpis}
            onGoOverview={() => setPage("overview")}
            onGoMap={() => setPage("map")}
          />
        )}

        {page === "overview" && (
          <OverviewPage
            kpis={kpis}
            theme={theme}
            impactCells={impactCells}
            blindCells={blindCells}
            onPickCell={pickCell}
            onPickStation={pickStation}
          />
        )}

        {page === "map" && (
          <MapModule
            layer={layer}
            setLayer={setLayer}
            band={band}
            setBand={setBand}
            showBlind={showBlind}
            setShowBlind={setShowBlind}
            tab={mapTab}
            setTab={setMapTab}
            theme={theme}
            cells={mapCells}
            blind={blindCells}
            beats={beats}
            loading={mapLoading}
            selectedCell={selectedCell}
            onSelectCell={selectCell}
            onCloseSelection={() => setSelectedCell(null)}
            onPlan={handlePlan}
            onSelectBeat={selectBeat}
            flyTo={flyTo}
          />
        )}
      </main>

      {err && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-stop/50 bg-panel px-3 py-2 text-xs text-stop shadow-lg">
          API request failed - retrying or waiting for Render to wake.
        </div>
      )}
    </div>
  );
}
