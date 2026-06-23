export type MetricKey = "violations" | "hotspots" | "blindspots" | "peak";

export const metricInfo: Record<
  MetricKey,
  { title: string; plain: string; why: string; color: "orange" | "unseen" | "stop" }
> = {
  violations: {
    title: "Violations",
    plain: "Parking-related tickets that passed the analysis filters.",
    why: "This is the base demand signal. It tells us where illegal parking is visible in the data before we adjust for enforcement bias.",
    color: "orange",
  },
  hotspots: {
    title: "Significant hotspots",
    plain: "Cells with unusually dense parking violations and strong congestion impact.",
    why: "These are high-confidence places to inspect first because the pattern is not just one noisy ticket burst.",
    color: "orange",
  },
  blindspots: {
    title: "Blind spots",
    plain: "Places with high violation yield per officer visit, but comparatively lower enforcement coverage.",
    why: "These are useful for reallocating patrols because each additional visit is likely to surface meaningful violations.",
    color: "unseen",
  },
  peak: {
    title: "Peak impact",
    plain: "The highest congestion-impact score among all ranked hotspot cells.",
    why: "Impact blends volume, road severity, spatial significance, persistence, and peak-hour overlap into one operational priority score.",
    color: "stop",
  },
};
