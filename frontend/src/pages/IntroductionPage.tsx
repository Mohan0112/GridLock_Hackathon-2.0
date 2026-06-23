import { useState } from "react";
import type { Kpis } from "../types";
import MetricInfoModal from "../components/MetricInfoModal";
import type { MetricKey } from "../lib/metricInfo";
import { fmt, fmt1 } from "../lib/viz";

function KpiCard({
  metric,
  value,
  label,
  color,
  onInfo,
}: {
  metric: MetricKey;
  value: string;
  label: string;
  color: string;
  onInfo: (metric: MetricKey) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onInfo(metric)}
      aria-label={`What does ${label} mean?`}
      className="group rounded-lg border border-line bg-panel p-4 text-left transition hover:border-mist"
    >
      <div className="tnum text-2xl font-semibold" style={{ color }}>
        {value}
      </div>
      <div className="mt-1 flex items-center gap-1 text-xs text-mist">
        {label}
        <span className="opacity-0 transition group-hover:opacity-100">i</span>
      </div>
    </button>
  );
}

function Step({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <div className="text-sm font-medium text-orange">{title}</div>
      <p className="mt-2 text-sm leading-relaxed text-mist">{body}</p>
    </section>
  );
}

export default function IntroductionPage({
  kpis,
  onGoOverview,
  onGoMap,
}: {
  kpis: Kpis | null;
  onGoOverview: () => void;
  onGoMap: () => void;
}) {
  const [infoKey, setInfoKey] = useState<MetricKey | null>(null);

  return (
    <div className="h-full overflow-y-auto bg-ink">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-paper">
          Gridlock: Bengaluru parking intelligence
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-mist">
          Gridlock turns parking-violation records into an operating view for
          enforcement: where illegal parking is choking movement, where patrols
          are already watching, and which under-watched corners deserve the next
          shift.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            metric="violations"
            value={kpis ? fmt(kpis.total_violations) : "--"}
            label="violations"
            color="#F2762E"
            onInfo={setInfoKey}
          />
          <KpiCard
            metric="hotspots"
            value={kpis ? fmt(kpis.significant_hotspots) : "--"}
            label="hotspots"
            color="#F2762E"
            onInfo={setInfoKey}
          />
          <KpiCard
            metric="blindspots"
            value={kpis ? fmt(kpis.blindspots) : "--"}
            label="blind spots"
            color="#38BDF8"
            onInfo={setInfoKey}
          />
          <KpiCard
            metric="peak"
            value={kpis ? fmt1(kpis.top_impact_score) : "--"}
            label="peak impact"
            color="#E4322B"
            onInfo={setInfoKey}
          />
        </div>

        <h2 className="mt-8 text-base font-medium text-paper">How the app works</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <Step
            title="1. Measure the real pressure"
            body="The system filters parking-related violations, groups them into H3 cells, and scores each cell by volume, severity, persistence, peak-hour overlap, and hotspot strength."
          />
          <Step
            title="2. Separate hotspots from blind spots"
            body="Hotspots show high-confidence congestion pressure. Blind spots compare violations against officer-days to reveal places that are high-yield but under-watched."
          />
          <Step
            title="3. Explain the evidence"
            body="The Overview module shows the enforcement gap, violation trend, top hotspots, and under-enforced cells so the story is visible before opening the map."
          />
          <Step
            title="4. Turn analysis into a beat plan"
            body="The Map module lets you inspect each cell, switch time shifts, and generate a patrol plan using the same shift currently coloring the map."
          />
        </div>

        <p className="mt-5 max-w-3xl text-sm leading-relaxed text-mist">
          For judges and operators, the workflow is simple: start with the KPIs,
          review the evidence in Overview, click a hotspot or blind spot, then
          generate a shift-specific plan directly beside the map.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={onGoOverview}
            className="rounded-lg border border-line bg-panel px-4 py-2.5 text-sm font-medium text-paper transition hover:border-mist"
          >
            See the analysis
          </button>
          <button
            onClick={onGoMap}
            className="rounded-lg border border-orange bg-orange/10 px-4 py-2.5 text-sm font-medium text-orange transition hover:bg-orange/20"
          >
            Explore the map
          </button>
        </div>

        <MetricInfoModal metricKey={infoKey} onClose={() => setInfoKey(null)} />
      </div>
    </div>
  );
}
