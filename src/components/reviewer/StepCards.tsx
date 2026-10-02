import { R } from "./reviewerTheme";

export type ReviewerStepState = "done" | "current" | "upcoming" | "rejected";

export interface ReviewerStep {
  number: number;
  title: string;
  state: ReviewerStepState;
  /** True for the step this link belongs to. */
  isYou?: boolean;
  caption: string;
}

function palette(state: ReviewerStepState) {
  switch (state) {
    case "current":
      return { bg: R.navy, border: "transparent", eyebrow: R.navyWash, title: R.card, caption: R.navyTint };
    case "done":
      return { bg: R.navyDone, border: "transparent", eyebrow: R.navyMid, title: R.navy, caption: R.muted };
    case "rejected":
      return { bg: R.redSoft, border: "transparent", eyebrow: R.red, title: R.ink, caption: R.muted };
    default:
      return { bg: R.disabledBg, border: R.line, eyebrow: R.label, title: R.label, caption: R.label };
  }
}

/** "Step 1 · You" while it is yours to act on; "Done" / "Rejected" once it is not. */
const STATE_SUFFIX: Record<ReviewerStepState, (isYou?: boolean) => string> = {
  current: (isYou) => (isYou ? " \u00b7 You" : ""),
  done: () => " \u00b7 Done",
  rejected: () => " \u00b7 Rejected",
  upcoming: () => "",
};

/** One filled box per layer, replacing the thin progress bars. */
export default function StepCards({ steps }: { steps: ReviewerStep[] }) {
  if (steps.length === 0) return null;
  return (
    <ol
      aria-label="Approval steps"
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr)",
        gap: 10,
      }}
    >
      {steps.map((step) => {
        const c = palette(step.state);
        return (
          <li
            key={step.number}
            aria-current={step.isYou ? "step" : undefined}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "14px 16px",
              background: c.bg,
              border: `1px solid ${c.border}`,
              borderRadius: 10,
              minWidth: 0,
            }}
          >
            <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.eyebrow }}>
              Step {step.number}{STATE_SUFFIX[step.state](step.isYou)}
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: c.title, overflowWrap: "anywhere" }}>{step.title}</div>
            <div style={{ fontSize: 13, color: c.caption }}>{step.caption}</div>
          </li>
        );
      })}
    </ol>
  );
}
