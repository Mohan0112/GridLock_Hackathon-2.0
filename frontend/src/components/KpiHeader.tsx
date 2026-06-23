import type { Kpis } from "../types";
import { fmt, fmt1 } from "../lib/viz";

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex flex-col">
      <div className="text-[10px] text-mist">{label}</div>
      <div
        className={`tnum font-display text-xl font-semibold leading-tight ${
          accent ? "" : "text-paper"
        }`}
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export default function KpiHeader({
  kpis,
  theme,
  onThemeToggle,
  onAbout,
}: {
  kpis: Kpis | null;
  theme: "dark" | "light";
  onThemeToggle: () => void;
  onAbout: () => void;
}) {
  return (
    <header className="flex items-center gap-6 border-b border-line bg-ink/95 px-5 py-3">
      <div className="flex items-center gap-3 pr-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-line bg-panel">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#F2762E"
            strokeLinejoin="round"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M12 3l7.5 4.5v9L12 21l-7.5-4.5v-9L12 3z" />
            <circle cx="12" cy="12" r="2.4" fill="#F2762E" stroke="none" />
          </svg>
        </div>
        <div className="leading-none">
          <div className="font-display text-lg font-bold text-paper">GRIDLOCK</div>
          <div className="text-[9px] text-mist">BTP / Parking Intelligence</div>
        </div>
      </div>

      <div className="h-8 w-px bg-line" />

      <div className="flex flex-1 items-center gap-7">
        <Stat label="Violations" value={kpis ? fmt(kpis.total_violations) : "--"} />
        <Stat
          label="Sig. hotspots"
          value={kpis ? fmt(kpis.significant_hotspots) : "--"}
          accent="#F2762E"
        />
        <Stat
          label="Blind spots"
          value={kpis ? fmt(kpis.blindspots) : "--"}
          accent="#38BDF8"
        />
        <Stat
          label="Peak impact"
          value={kpis ? fmt1(kpis.top_impact_score) : "--"}
          accent="#E4322B"
        />
        <div className="flex flex-col">
          <div className="text-[10px] text-mist">Highest-impact zone</div>
          <div className="font-display text-sm font-semibold text-paper">
            {kpis?.top_impact_station ?? "--"}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-[10px] text-mist">Window</div>
          <div className="tnum text-xs text-paper">
            {kpis ? `${kpis.date_min} to ${kpis.date_max}` : "--"}
          </div>
        </div>
        <button
          onClick={onThemeToggle}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-mist transition hover:border-amber/50 hover:text-paper"
          title={theme === "dark" ? "Switch to light" : "Switch to dark"}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
        <button
          onClick={onAbout}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-semibold text-mist transition hover:border-amber/50 hover:text-paper"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px]">
            i
          </span>
          About
        </button>
      </div>
    </header>
  );
}
