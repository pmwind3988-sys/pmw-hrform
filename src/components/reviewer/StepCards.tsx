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
      return { bg: R.navy, border: R.navy, eyebrow: R.navyWash, title: R.card, caption: R.navyTint };
    case "done":
      return { bg: R.navyTint, border: R.navyTint, eyebrow: R.navy, title: R.navy, caption: R.navy };
    case "rejected":
      return { bg: R.redSoft, border: R.redSoft, eyebrow: R.red, title: R.red, caption: R.red };
    default:
      return { bg: R.disabledBg, border: R.line, eyebrow: R.label, title: R.label, caption: R.label };
  }
}

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
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
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
              Step {step.number}{step.isYou ? " · You" : ""}
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: c.title, overflowWrap: "anywhere" }}>{step.title}</div>
            <div style={{ fontSize: 13, color: c.caption }}>{step.caption}</div>
          </li>
        );
      })}
    </ol>
  );
}
