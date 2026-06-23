import { useEffect } from "react";
import { Eyebrow } from "./ui";

export default function AboutModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/75 px-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-2xl rounded-lg border border-line bg-panel p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <Eyebrow>Methodology</Eyebrow>
            <h2 className="mt-1 font-display text-xl font-bold text-paper">
              How Gridlock ranks enforcement zones
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-line px-2 py-1 text-xs text-mist transition hover:border-mist hover:text-paper"
            aria-label="Close about modal"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 text-[13px] leading-relaxed text-paper/90">
          <section>
            <h3 className="font-display text-sm font-semibold text-paper">
              What Gridlock does
            </h3>
            <p className="mt-1 text-mist">
              Gridlock finds illegal-parking hotspots, estimates congestion
              impact, flags under-enforced zones, forecasts station load, and
              generates deployable beat plans.
            </p>
          </section>

          <section>
            <h3 className="font-display text-sm font-semibold text-paper">
              Congestion impact score
            </h3>
            <p className="mt-1 text-mist">
              The 0-100 score blends Volume (0.30), road severity (0.30),
              cluster significance via Gi* (0.15), persistence (0.15), and peak
              overlap (0.10).
            </p>
          </section>

          <section>
            <h3 className="font-display text-sm font-semibold text-paper">
              Bias correction
            </h3>
            <p className="mt-1 text-mist">
              Tickets are logged where patrols already go. Dividing violations
              by officer-days reveals per-visit yield, which helps separate
              heavily watched places from places worth checking next.
            </p>
          </section>

          <section>
            <h3 className="font-display text-sm font-semibold text-paper">
              Blind Spots
            </h3>
            <p className="mt-1 text-mist">
              Blind spots are below-median volume but above-median yield
              candidates: practical "send a patrol to confirm" zones.
            </p>
          </section>

          <section className="rounded-md border border-line bg-panel2/50 px-3 py-2">
            <h3 className="font-display text-sm font-semibold text-paper">
              Data note
            </h3>
            <p className="mt-1 text-mist">
              The dataset is simulated, so findings are framed as operational
              guidance and a demonstration of bias correction rather than
              claims about real city conditions.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
