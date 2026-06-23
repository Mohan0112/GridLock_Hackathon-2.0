// Color ramps + formatting. Colors encode meaning:
//   impact -> amber to red heat (rising congestion severity)
//   density -> slate to amber (raw volume, cooler)
//   blindspot -> cyan (what patrols are missing)

export type RGB = [number, number, number];

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

function ramp(stops: RGB[], t: number): RGB {
  t = Math.max(0, Math.min(1, t));
  const seg = t * (stops.length - 1);
  const i = Math.min(Math.floor(seg), stops.length - 2);
  const f = seg - i;
  return [
    lerp(stops[i][0], stops[i + 1][0], f),
    lerp(stops[i][1], stops[i + 1][1], f),
    lerp(stops[i][2], stops[i + 1][2], f),
  ];
}

const IMPACT_STOPS: RGB[] = [
  [38, 50, 64], // low slate
  [242, 179, 61], // amber
  [242, 118, 46], // orange
  [228, 50, 43], // stop red
];
const DENSITY_STOPS: RGB[] = [
  [30, 41, 53],
  [70, 90, 110],
  [242, 179, 61],
];
const UNSEEN: RGB = [56, 189, 248];

export function impactColor(v: number, max = 95): RGB {
  return ramp(IMPACT_STOPS, v / max);
}

export function densityColor(v: number, max: number): RGB {
  return ramp(DENSITY_STOPS, max > 0 ? v / max : 0);
}

export function blindspotColor(): RGB {
  return UNSEEN;
}

export const QUADRANT_COLOR: Record<string, string> = {
  under_enforced: "#38BDF8",
  known_hotspot: "#E4322B",
  over_watched: "#F2B33D",
  quiet: "#46586E",
};

export const QUADRANT_LABEL: Record<string, string> = {
  under_enforced: "Under-enforced",
  known_hotspot: "Known hotspot",
  over_watched: "Over-watched",
  quiet: "Quiet",
};

export const fmt = (n: number) => n.toLocaleString("en-IN");

export const fmt1 = (n: number) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: 1 });

export const TIME_BANDS = ["night", "morning", "afternoon", "evening", "late"];
