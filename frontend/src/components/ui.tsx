import React from "react";

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-medium text-mist">{children}</div>;
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-line bg-panel/80 p-3.5 ${className}`}>
      {children}
    </div>
  );
}

export function Chip({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "unseen" | "stop" | "amber";
}) {
  const tones: Record<string, string> = {
    default: "text-mist",
    unseen: "text-unseen",
    stop: "text-stop",
    amber: "text-amber",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border border-line bg-panel2/50 px-2 py-0.5 text-[11px] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function MeterRow({
  label,
  value,
  max,
  suffix = "",
  color = "#F2B33D",
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  color?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-28 shrink-0 truncate text-mist" title={label}>
        {label}
      </div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel2">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="tnum w-14 shrink-0 text-right text-paper">
        {value.toLocaleString("en-IN", { maximumFractionDigits: 1 })}
        {suffix}
      </div>
    </div>
  );
}
