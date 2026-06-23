import type { Dispatch, SetStateAction } from "react";
import type { Beat, Cell } from "../types";
import DeployPanel from "../components/DeployPanel";
import HotspotPanel from "../components/HotspotPanel";
import MapView from "../components/MapView";

type Layer = "impact" | "density";
type Band = "all" | "night" | "morning" | "afternoon" | "evening" | "late";
type PanelTab = "hotspot" | "plan";

const BANDS: { value: Band; label: string; tip: string }[] = [
  { value: "all", label: "All hours", tip: "All times of day combined." },
  { value: "night", label: "Night", tip: "Night: 12 AM to 5 AM." },
  { value: "morning", label: "Morning", tip: "Morning: 5 AM to 12 PM." },
  { value: "afternoon", label: "Afternoon", tip: "Afternoon: 12 PM to 5 PM." },
  { value: "evening", label: "Evening", tip: "Evening: 5 PM to 9 PM." },
  { value: "late", label: "Late", tip: "Late: 9 PM to 12 AM." },
];

export default function MapModule({
  layer,
  setLayer,
  band,
  setBand,
  showBlind,
  setShowBlind,
  tab,
  setTab,
  theme,
  cells,
  blind,
  beats,
  loading,
  selectedCell,
  onSelectCell,
  onCloseSelection,
  onPlan,
  onSelectBeat,
  flyTo,
}: {
  layer: Layer;
  setLayer: Dispatch<SetStateAction<Layer>>;
  band: Band;
  setBand: Dispatch<SetStateAction<Band>>;
  showBlind: boolean;
  setShowBlind: Dispatch<SetStateAction<boolean>>;
  tab: PanelTab;
  setTab: Dispatch<SetStateAction<PanelTab>>;
  theme: "dark" | "light";
  cells: Cell[];
  blind: Cell[];
  beats: Beat[];
  loading: boolean;
  selectedCell: string | null;
  onSelectCell: (cell: string) => void;
  onCloseSelection: () => void;
  onPlan: (beats: Beat[]) => void;
  onSelectBeat: (beat: Beat) => void;
  flyTo: { lat: number; lon: number; key: number; zoom?: number } | null;
}) {
  const legend =
    layer === "impact"
      ? {
          grad: "linear-gradient(90deg,#263240,#F2B33D,#F2762E,#E4322B)",
          lo: band === "all" ? "Low impact" : "Low shift impact",
          hi: band === "all" ? "Peak impact" : "Peak in shift",
        }
      : {
          grad: "linear-gradient(90deg,#1E2935,#46586E,#F2B33D)",
          lo: "Few",
          hi: band === "all" ? "Many violations" : "Many in shift",
        };

  return (
    <div className="flex h-full w-full overflow-hidden bg-ink">
      <div className="relative min-w-0 flex-1">
        <MapView
          layer={layer}
          theme={theme}
          showBlind={showBlind}
          cells={cells}
          blind={blind}
          beats={beats}
          selectedCell={selectedCell}
          onSelectCell={onSelectCell}
          flyTo={flyTo}
        />

        <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-wrap items-start gap-2">
          <div className="pointer-events-auto inline-flex w-fit overflow-hidden rounded-lg border border-line bg-panel/90 backdrop-blur">
            <button
              title="Congestion-impact score per cell: taller and brighter means more traffic impact."
              onClick={() => setLayer("impact")}
              className={`px-3 py-1.5 text-[11px] font-medium transition ${
                layer === "impact"
                  ? "bg-orange/15 text-orange"
                  : "text-mist hover:text-paper"
              }`}
            >
              Impact
            </button>
            <button
              title="Raw number of parking violations per cell, without impact weighting."
              onClick={() => setLayer("density")}
              className={`px-3 py-1.5 text-[11px] font-medium transition ${
                layer === "density"
                  ? "bg-orange/15 text-orange"
                  : "text-mist hover:text-paper"
              }`}
            >
              Density
            </button>
          </div>

          <div className="pointer-events-auto flex w-fit flex-wrap gap-1 rounded-lg border border-line bg-panel/90 p-1 backdrop-blur">
            {BANDS.map((nextBand) => (
              <button
                key={nextBand.value}
                title={nextBand.tip}
                onClick={() => setBand(nextBand.value)}
                className={`rounded-md px-2 py-1 text-[10px] font-medium transition ${
                  band === nextBand.value
                    ? "bg-orange/15 text-orange"
                    : "text-mist hover:text-paper"
                }`}
              >
                {nextBand.label}
              </button>
            ))}
          </div>

          <button
            title="Show under-watched cells with high violation yield per officer visit."
            onClick={() => setShowBlind((value) => !value)}
            className={`pointer-events-auto inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition ${
              showBlind
                ? "border-unseen/50 bg-panel/90 text-unseen"
                : "border-line bg-panel/90 text-mist hover:text-paper"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${showBlind ? "bg-unseen" : "bg-mist"}`} />
            Blind spots
          </button>
        </div>

        {loading && (
          <div className="absolute right-4 top-4 z-10 rounded-lg border border-line bg-panel/90 px-3 py-2 text-[11px] text-mist shadow-lg backdrop-blur">
            Updating {band === "all" ? "all-hour" : band} cells...
          </div>
        )}

        <div className="absolute bottom-4 left-4 z-10 rounded-lg border border-line bg-panel/90 px-3 py-2.5 backdrop-blur">
          <div className="mb-1.5 text-[10px] font-medium text-mist">
            {layer === "impact" ? "Congestion impact - height = score" : "Violation volume"}
          </div>
          <div className="h-2 w-44 rounded-full" style={{ background: legend.grad }} />
          <div className="mt-1 flex justify-between text-[9px] text-mist">
            <span>{legend.lo}</span>
            <span>{legend.hi}</span>
          </div>
          {band !== "all" && (
            <div className="mt-1.5 text-[9px] text-orange">Weighted for {band} activity</div>
          )}
          {showBlind && (
            <div className="mt-2 flex items-center gap-1.5 border-t border-line pt-1.5 text-[9px] text-mist">
              <span className="h-2 w-2 rounded-full bg-unseen" />
              Blind spot - under-enforced
            </div>
          )}
          {beats.length > 0 && (
            <div className="mt-1 flex items-center gap-1.5 text-[9px] text-mist">
              <span className="flex h-2.5 w-2.5 items-center justify-center rounded-full border border-orange text-[6px] text-orange">
                #
              </span>
              Assigned beat
            </div>
          )}
        </div>
      </div>

      <aside className="flex w-[390px] shrink-0 flex-col border-l border-line bg-panel">
        <div className="flex shrink-0 border-b border-line">
          <button
            onClick={() => setTab("hotspot")}
            className={`relative flex-1 py-3 text-sm font-medium transition ${
              tab === "hotspot" ? "text-orange" : "text-mist hover:text-paper"
            }`}
          >
            Hotspot
            {tab === "hotspot" && (
              <span className="absolute inset-x-8 bottom-0 h-0.5 rounded-full bg-orange" />
            )}
          </button>
          <button
            onClick={() => setTab("plan")}
            className={`relative flex-1 py-3 text-sm font-medium transition ${
              tab === "plan" ? "text-orange" : "text-mist hover:text-paper"
            }`}
          >
            Plan
            {tab === "plan" && (
              <span className="absolute inset-x-8 bottom-0 h-0.5 rounded-full bg-orange" />
            )}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "hotspot" && (
            <>
              {selectedCell && (
                <button
                  onClick={onCloseSelection}
                  className="mb-3 rounded-md border border-line px-2 py-1 text-xs text-mist transition hover:border-mist hover:text-paper"
                >
                  Clear selection
                </button>
              )}
              <HotspotPanel cell={selectedCell} theme={theme} />
            </>
          )}

          {tab === "plan" && (
            <DeployPanel
              beats={beats}
              shift={band}
              onPlan={onPlan}
              onSelectBeat={onSelectBeat}
            />
          )}
        </div>
      </aside>
    </div>
  );
}
