import type { MetricKey } from "../lib/metricInfo";
import { metricInfo } from "../lib/metricInfo";

export default function MetricInfoModal({
  metricKey,
  onClose,
}: {
  metricKey: MetricKey | null;
  onClose: () => void;
}) {
  if (!metricKey) return null;

  const info = metricInfo[metricKey];
  const colorClass =
    info.color === "unseen"
      ? "text-unseen"
      : info.color === "stop"
        ? "text-stop"
        : "text-orange";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 px-4"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-line bg-panel p-5"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={`text-sm font-semibold ${colorClass}`}>{info.title}</div>
        <p className="mt-2 text-sm leading-relaxed text-paper">{info.plain}</p>
        <p className="mt-3 text-sm leading-relaxed text-mist">{info.why}</p>
        <button
          onClick={onClose}
          className="mt-5 rounded-md border border-line px-3 py-1.5 text-sm text-mist transition hover:border-mist hover:text-paper"
        >
          Close
        </button>
      </div>
    </div>
  );
}
