import { useEffect, useRef, useState } from "react";
import type { Beat } from "../types";
import { api } from "../api";
import { fmt1 } from "../lib/viz";
import { Chip, Eyebrow } from "./ui";

interface Props {
  beats: Beat[];
  shift: string;
  onPlan: (beats: Beat[]) => void;
  onSelectBeat: (beat: Beat) => void;
}

export default function DeployPanel({ beats, shift, onPlan, onSelectBeat }: Props) {
  const [teams, setTeams] = useState(5);
  const [busy, setBusy] = useState(false);
  const latestShift = useRef(shift);
  const requestId = useRef(0);
  const shiftLabel = shift === "all" ? "all shifts" : `${shift} shift`;

  useEffect(() => {
    latestShift.current = shift;
    requestId.current += 1;
    setBusy(false);
  }, [shift]);

  async function generate() {
    const currentRequest = ++requestId.current;
    const requestedShift = shift;
    latestShift.current = shift;
    setBusy(true);
    try {
      const res = await api.beatPlan(teams, requestedShift, null);
      if (requestId.current !== currentRequest || latestShift.current !== requestedShift) return;
      onPlan(res.plan);
    } catch {
      if (requestId.current === currentRequest && latestShift.current === requestedShift) {
        onPlan([]);
      }
    } finally {
      if (requestId.current === currentRequest) setBusy(false);
    }
  }

  function exportCsv() {
    const header = [
      "priority",
      "police_station",
      "junction",
      "cell",
      "lat",
      "lon",
      "shift",
      "top_vehicle",
      "expected_impact",
      "blindspot",
    ];
    const rows = [
      header,
      ...beats.map((b) => [
        b.priority,
        b.police_station,
        b.junction_name,
        b.cell,
        b.lat,
        b.lon,
        b.time_band,
        b.top_vehicle,
        b.expected_impact,
        b.blindspot,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `gridlock-beat-plan-${shift}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3.5">
      <div>
        <Eyebrow>Plan the next shift</Eyebrow>
        <p className="mt-1.5 text-[13px] leading-relaxed text-paper/90">
          Place a limited number of teams where they intercept the most impact
          for the current map shift - kept spatially spread so beats do not overlap.
        </p>
        <div className="mt-2 inline-flex rounded-md border border-line bg-panel2/60 px-2 py-1 text-[10px] text-mist">
          Using map shift: <span className="ml-1 text-amber">{shiftLabel}</span>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-panel/80 p-3.5">
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] text-mist">Patrol teams</span>
            <span className="tnum font-display text-base font-bold text-amber">
              {teams}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={8}
            value={teams}
            onChange={(e) => setTeams(Number(e.target.value))}
            className="w-full accent-amber"
          />
        </div>

        <button
          onClick={generate}
          disabled={busy}
          className="w-full rounded-md bg-amber py-2 font-display text-sm font-semibold text-ink transition hover:bg-amber/90 disabled:opacity-50"
        >
          {busy ? "Planning..." : "Generate beat plan"}
        </button>
      </div>

      {beats.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-mist">
              {beats.length}-beat plan / {shiftLabel}
            </div>
            <button
              onClick={exportCsv}
              className="rounded border border-line px-2 py-0.5 text-[10px] text-mist transition hover:border-amber/50 hover:text-amber"
            >
              CSV
            </button>
          </div>
          {beats.map((b) => (
            <button
              key={b.cell}
              onClick={() => onSelectBeat(b)}
              className="flex w-full items-center gap-3 rounded-lg border border-line bg-panel2/60 p-2.5 text-left transition hover:border-amber/50"
            >
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-display text-sm font-bold"
                style={{
                  background: b.blindspot
                    ? "rgba(56,189,248,0.15)"
                    : "rgba(242,179,61,0.15)",
                  color: b.blindspot ? "#38BDF8" : "#F2B33D",
                }}
              >
                {b.priority}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-paper">
                  {b.police_station}
                </div>
                <div className="truncate text-[11px] text-mist">
                  {b.junction_name} / {b.top_vehicle.toLowerCase()}
                </div>
              </div>
              <div className="text-right">
                <div className="tnum text-[12px] text-amber">
                  {fmt1(b.expected_impact)}
                </div>
                <div className="text-[9px] text-mist">exp. impact</div>
              </div>
              {b.blindspot && (
                <div className="ml-1">
                  <Chip tone="unseen">blind</Chip>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
