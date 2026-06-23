import { useMemo } from "react";
import type { Cell, Kpis } from "../types";
import OverviewPanel from "../components/OverviewPanel";
import { fmt1 } from "../lib/viz";

type FocusKind = "impact" | "blindspot";

function nameOf(cell: Cell) {
  return cell.police_station || cell.junction_name || cell.cell;
}

export default function OverviewPage({
  kpis,
  theme,
  impactCells,
  blindCells,
  onPickCell,
  onPickStation,
}: {
  kpis: Kpis | null;
  theme: "dark" | "light";
  impactCells: Cell[];
  blindCells: Cell[];
  onPickCell: (cell: Cell, kind: FocusKind) => void;
  onPickStation: (station: string) => void;
}) {
  const topHotspots = useMemo(
    () =>
      [...impactCells]
        .filter((cell) => cell.impact_score != null)
        .sort((a, b) => b.impact_score - a.impact_score)
        .slice(0, 8),
    [impactCells],
  );

  const topBlind = useMemo(
    () =>
      [...blindCells]
        .filter((cell) => cell.blindspot)
        .sort((a, b) => b.per_officer_day - a.per_officer_day)
        .slice(0, 8),
    [blindCells],
  );

  return (
    <div className="h-full overflow-y-auto bg-ink">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-paper">Overview</h1>
        <p className="mt-1 max-w-3xl text-sm text-mist">
          The evidence layer: enforcement gap, daily trend, forecast, repeat
          offenders, and click-through lists for hotspots and blind spots.
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <OverviewPanel kpis={kpis} theme={theme} onPickStation={onPickStation} />

          <aside className="space-y-4">
            <section className="rounded-lg border border-line bg-panel p-4">
              <div className="text-sm font-medium text-paper">Top hotspots</div>
              <p className="mt-1 text-xs text-mist">
                Click a row to open it on the impact map.
              </p>
              <div className="mt-3 space-y-1.5">
                {topHotspots.map((cell, index) => (
                  <button
                    key={cell.cell}
                    onClick={() => onPickCell(cell, "impact")}
                    className="flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-2 py-1.5 text-left transition hover:border-orange/40 hover:bg-panel2/60"
                  >
                    <span className="min-w-0 truncate text-[13px] text-paper">
                      {index + 1}. {nameOf(cell)}
                    </span>
                    <span className="tnum shrink-0 text-[12px] font-medium text-orange">
                      {fmt1(cell.impact_score)}
                    </span>
                  </button>
                ))}
                {topHotspots.length === 0 && (
                  <div className="text-xs text-mist">Loading hotspots...</div>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-line bg-panel p-4">
              <div className="text-sm font-medium text-unseen">
                Blind spots: under-watched, high-yield
              </div>
              <p className="mt-1 text-xs text-mist">
                Click a row to open it on the map with blind spots highlighted.
              </p>
              <div className="mt-3 space-y-1.5">
                {topBlind.map((cell, index) => (
                  <button
                    key={cell.cell}
                    onClick={() => onPickCell(cell, "blindspot")}
                    className="flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-2 py-1.5 text-left transition hover:border-unseen/50 hover:bg-panel2/60"
                  >
                    <span className="min-w-0 truncate text-[13px] text-paper">
                      {index + 1}. {nameOf(cell)}
                    </span>
                    <span className="tnum shrink-0 text-[12px] font-medium text-unseen">
                      {fmt1(cell.per_officer_day)}/visit
                    </span>
                  </button>
                ))}
                {topBlind.length === 0 && (
                  <div className="text-xs text-mist">Loading blind spots...</div>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
