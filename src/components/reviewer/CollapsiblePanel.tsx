import { useId, useState, type ReactNode } from "react";
import { R } from "./reviewerTheme";

/**
 * A titled block that opens and closes. `panel` is the navy outer bar,
 * `group` is the lighter bar used for the sections inside it. `meta` is the
 * dimmed count after the title ("· 19 answers", "· 9").
 */
export default function CollapsiblePanel({
  title,
  meta,
  variant = "panel",
  defaultOpen = true,
  children,
}: {
  title: string;
  meta?: string;
  variant?: "panel" | "group";
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const isPanel = variant === "panel";
  const Heading = isPanel ? "h2" : "h3";

  const chevron = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, transition: "transform 140ms", transform: `rotate(${open ? 180 : 0}deg)` }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );

  const button = (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={bodyId}
      onClick={() => setOpen((v) => !v)}
      style={
        isPanel
          ? {
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              padding: "14px 20px",
              background: R.navy,
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "inherit",
              fontSize: 15,
              color: R.card,
            }
          : {
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              margin: "10px 0 2px",
              background: R.navyTint,
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: R.navy,
            }
      }
    >
      <span style={isPanel ? { fontWeight: 600 } : undefined}>
        {title}
        {meta ? (
          <span
            style={
              isPanel
                ? { fontWeight: 400, color: R.navyWash }
                : { fontWeight: 400, letterSpacing: 0, textTransform: "none" }
            }
          >
            {" "}{meta}
          </span>
        ) : null}
      </span>
      {chevron}
    </button>
  );

  if (!isPanel) {
    return (
      <div>
        <Heading style={{ margin: 0, font: "inherit" }}>{button}</Heading>
        <div id={bodyId} hidden={!open}>{children}</div>
      </div>
    );
  }

  return (
    <section style={{ background: R.card, border: `1px solid ${R.line}`, borderRadius: 10 }}>
      <Heading style={{ margin: 0, font: "inherit" }}>{button}</Heading>
      <div id={bodyId} hidden={!open}>
        <div style={{ padding: "6px 20px 14px", display: "flex", flexDirection: "column" }}>{children}</div>
      </div>
    </section>
  );
}
