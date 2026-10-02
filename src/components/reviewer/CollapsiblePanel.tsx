import { useId, useState, type ReactNode } from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { R } from "./reviewerTheme";

/**
 * A titled block that opens and closes. `panel` is the navy outer bar,
 * `group` is the lighter bar used for the sections inside it.
 */
export default function CollapsiblePanel({
  title,
  variant = "panel",
  defaultOpen = true,
  children,
}: {
  title: string;
  variant?: "panel" | "group";
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const isPanel = variant === "panel";
  const Heading = isPanel ? "h2" : "h3";
  return (
    <section
      style={{
        borderRadius: isPanel ? 10 : 6,
        overflow: "hidden",
        border: `1px solid ${isPanel ? R.navy : R.navyTint}`,
        background: R.card,
        marginBottom: isPanel ? 20 : 10,
      }}
    >
      <Heading style={{ margin: 0, fontSize: isPanel ? 15 : 12, fontWeight: 600, letterSpacing: isPanel ? 0 : "0.12em", textTransform: isPanel ? "none" : "uppercase" }}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
          style={{
            width: "100%",
            minHeight: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: isPanel ? "12px 18px" : "10px 14px",
            border: "none",
            background: isPanel ? R.navy : R.navyTint,
            color: isPanel ? R.card : R.navy,
            fontFamily: "inherit",
            fontSize: "inherit",
            fontWeight: "inherit",
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          <span>{title}</span>
          <ExpandMoreIcon
            aria-hidden="true"
            fontSize="small"
            style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms ease", flexShrink: 0 }}
          />
        </button>
      </Heading>
      <div id={bodyId} hidden={!open}>
        <div style={{ padding: isPanel ? 18 : 14 }}>{children}</div>
      </div>
    </section>
  );
}
