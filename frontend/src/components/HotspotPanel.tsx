import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HotspotDetail } from "../types";
import { api } from "../api";
import { fmt, fmt1 } from "../lib/viz";
import { Card, Chip, Eyebrow, MeterRow } from "./ui";

const BREAKDOWN_META: [keyof HotspotDetail["impact_breakdown"], string, string][] = [
  ["volume", "Volume", "#E4322B"],
  ["severity", "Road severity", "#F2762E"],
  ["persistence", "Persistence", "#F2B33D"],
  ["significance", "Cluster sig.", "#38BDF8"],
  ["peak", "Peak overlap", "#34D399"],
];

export default function HotspotPanel({
  cell,
  theme,
}: {
  cell: string | null;
  theme: "dark" | "light";
}) {
  const grid = theme === "light" ? "#D9DEE6" : "#2A323D";
  const axis = theme === "light" ? "#5A6675" : "#8B97A7";
  const [data, setData] = useState<HotspotDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cell) {
      setData(null);
      return;
    }
    setLoading(true);
    api
      .hotspot(cell)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [cell]);

  if (!cell) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="mb-3 h-10 w-10 rotate-12 rounded-md border border-dashed border-line" />
        <div className="font-display text-sm text-paper">No cell selected</div>
        <div className="mt-1 text-xs text-mist">
          Tap any hex on the map to break down what drives its congestion impact.
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return <div className="px-1 py-4 text-xs text-mist">Loading cell...</div>;
  }

  const h = data.hotspot;
  const total = BREAKDOWN_META.reduce(
    (sum, [key]) => sum + (data.impact_breakdown[key] || 0),
    0,
  );
  const maxVeh = Math.max(1, ...data.vehicle_mix.map((v) => v.n));
  const maxHour = Math.max(1, ...data.hourly.map((x) => x.n));

  return (
    <div className="space-y-3.5">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-display text-lg font-bold leading-tight text-paper">
              {h.police_station}
            </div>
            <div className="text-xs text-mist">{h.junction_name}</div>
          </div>
          <div className="text-right">
            <div className="tnum font-display text-3xl font-bold leading-none text-stop">
              {fmt1(Number(h.impact_score))}
            </div>
            <div className="text-[9px] text-mist">impact</div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {h.is_hotspot && (
            <Chip tone="stop">significant / z {fmt1(Number(h.gi_z))}</Chip>
          )}
          {h.blindspot && <Chip tone="unseen">blind spot</Chip>}
          <Chip>{fmt(Number(h.violations))} violations</Chip>
          <Chip>{fmt1(Number(h.per_officer_day))}/visit</Chip>
          <Chip>{Number(h.active_days)} active days</Chip>
          {data.repeat?.share > 0 && (
            <Chip tone="amber">
              {Math.round(data.repeat.share * 100)}% repeat -{" "}
              {fmt(data.repeat.plates)} plates
            </Chip>
          )}
        </div>
        {h.why && (
          <p className="mt-2 rounded-md border border-line bg-panel2/50 px-2.5 py-1.5 text-[11px] leading-relaxed text-mist">
            {h.why}
          </p>
        )}
      </div>

      <Card>
        <Eyebrow>What drives the impact score</Eyebrow>
        <div className="mt-2.5 space-y-1.5">
          {BREAKDOWN_META.map(([key, label, color]) => (
            <MeterRow
              key={key}
              label={label}
              value={data.impact_breakdown[key]}
              max={total}
              color={color}
            />
          ))}
        </div>
      </Card>

      <Card>
        <Eyebrow>Vehicle mix</Eyebrow>
        <div className="mt-2.5 space-y-1.5">
          {data.vehicle_mix.map((v) => (
            <MeterRow
              key={v.vehicle_type}
              label={v.vehicle_type || "--"}
              value={v.n}
              max={maxVeh}
              color="#8B97A7"
            />
          ))}
        </div>
      </Card>

      <Card>
        <Eyebrow>Hourly pattern</Eyebrow>
        <div className="mt-2 h-[120px] w-full">
          <ResponsiveContainer>
            <AreaChart data={data.hourly} margin={{ top: 6, right: 6, bottom: 0, left: -24 }}>
              <defs>
                <linearGradient id="hr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F2B33D" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="#F2B33D" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="hour"
                tick={{ fill: axis, fontSize: 9, fontFamily: "Inter" }}
                tickLine={false}
                axisLine={{ stroke: grid }}
                interval={3}
              />
              <YAxis hide domain={[0, maxHour]} />
              <Tooltip
                content={({ active, payload, label }: any) =>
                  active && payload?.length ? (
                    <div className="rounded border border-line bg-panel px-2 py-1 text-[10px] text-paper">
                      {String(label).padStart(2, "0")}:00 / {fmt(payload[0].value)}
                    </div>
                  ) : null
                }
              />
              <Area
                type="monotone"
                dataKey="n"
                stroke="#F2B33D"
                strokeWidth={1.5}
                fill="url(#hr)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <Eyebrow>Top violation tags</Eyebrow>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {data.tags.map((t) => (
            <Chip key={t.tag}>
              {t.tag.toLowerCase()} / {fmt(t.n)}
            </Chip>
          ))}
        </div>
      </Card>
    </div>
  );
}
