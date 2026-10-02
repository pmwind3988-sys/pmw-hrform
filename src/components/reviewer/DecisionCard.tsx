import type { ReactNode } from "react";
import { CARD_SHADOW, R } from "./reviewerTheme";

/**
 * The block the reviewer acts in.
 *
 * `bar` (evaluations) is a navy title bar with the progress on its right and
 * the questions sitting directly on the page below it. `card` (approvals) is a
 * white card headed by a plain title.
 */
export default function DecisionCard({
  id,
  title,
  meta,
  variant = "card",
  children,
}: {
  id?: string;
  title: string;
  meta?: string;
  variant?: "bar" | "card";
  children: ReactNode;
}) {
  if (variant === "bar") {
    return (
      <section id={id} style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            padding: "14px 20px",
            background: R.navy,
            borderRadius: 10,
          }}
        >
          <h2 style={{ margin: 0, fontWeight: 700, fontSize: 17, lineHeight: 1.3, letterSpacing: "-0.01em", color: R.card }}>{title}</h2>
          {meta ? (
            <span role="status" aria-live="polite" style={{ fontSize: 13.5, color: R.navyWash, textAlign: "right" }}>{meta}</span>
          ) : null}
        </div>
        {children}
      </section>
    );
  }
  return (
    <section
      id={id}
      style={{
        background: R.card,
        border: `1px solid ${R.line}`,
        borderRadius: 6,
        boxShadow: CARD_SHADOW,
        padding: 28,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <h2 style={{ margin: 0, fontWeight: 700, fontSize: 20, lineHeight: 1.3, letterSpacing: "-0.01em", color: R.ink }}>{title}</h2>
      {children}
    </section>
  );
}
