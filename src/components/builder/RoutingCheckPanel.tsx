import FactCheckIcon from "@mui/icons-material/FactCheck";
import type { LayerRoutingVerdict, RoutingVerdictKind } from "../../utils/routingCheck";
import { C } from "./constants";

interface RoutingCheckPanelProps {
  /** null until the check has been run for the open submission. */
  verdicts: LayerRoutingVerdict[] | null;
  checking: boolean;
  /** Layer currently being corrected, or 0. */
  fixingLayer: number;
  onCheck: () => void;
  onFix: (layer: number) => void;
}

const KIND_LABEL: Record<RoutingVerdictKind, string> = {
  match: "Matches routing",
  mismatch: "Does not match routing",
  manual: "Set by hand",
  unresolved: "Cannot check",
  waiting: "Not decided yet",
};

const KIND_COLOUR: Record<RoutingVerdictKind, string> = {
  match: "#107C10",
  mismatch: "#C50F1F",
  manual: C.purple,
  unresolved: C.textSecond,
  waiting: C.textSecond,
};

const buttonStyle = {
  minHeight: 34,
  padding: "7px 12px",
  border: "none",
  borderRadius: 7,
  color: C.white,
  fontSize: 11.5,
  fontWeight: 750,
} as const;

function names(emails: string[]): string {
  return emails.length ? emails.join(", ") : "nobody";
}

export default function RoutingCheckPanel({ verdicts, checking, fixingLayer, onCheck, onFix }: RoutingCheckPanelProps) {
  const busy = checking || fixingLayer > 0;
  return (
    <div style={{ marginTop: 12, padding: 12, border: `1px solid ${C.border}`, borderRadius: 12, background: C.white }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <FactCheckIcon style={{ color: C.purpleAccent, fontSize: 19 }} />
        <div style={{ flex: "1 1 220px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 750, color: C.textPrimary }}>Check approver / evaluator routing</div>
          <div style={{ fontSize: 11.5, color: C.textSecond, marginTop: 2 }}>
            Compares who is saved on each unfinished step with who the form's routing picks today.
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onCheck}
          style={{ ...buttonStyle, background: C.purple, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.55 : 1 }}
        >
          {checking ? "Checking..." : verdicts ? "Check again" : "Check routing"}
        </button>
      </div>

      {verdicts && verdicts.length === 0 ? (
        <div style={{ marginTop: 10, fontSize: 11.5, color: C.textSecond }}>No unfinished steps to check.</div>
      ) : null}

      {verdicts?.map((verdict) => {
        const noun = verdict.type === "evaluation" ? "evaluator" : "approver";
        return (
          <div
            key={verdict.layer}
            style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.borderLight}`, fontSize: 11.5, lineHeight: 1.55 }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <strong style={{ color: C.textPrimary }}>Layer {verdict.layer}: {verdict.title}</strong>
              <span style={{ color: KIND_COLOUR[verdict.kind], fontWeight: 700 }}>{KIND_LABEL[verdict.kind]}</span>
            </div>
            {verdict.kind === "mismatch" ? (
              <>
                <div style={{ color: C.textSecond }}>Saved {noun}: {names(verdict.saved)}</div>
                <div style={{ color: C.textSecond }}>Routing says: {names(verdict.routed)}</div>
                <div style={{ color: C.textSecond }}>
                  Fixing changes who can act. It keeps any scheduled email date and does not send anything.
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onFix(verdict.layer)}
                  style={{ ...buttonStyle, marginTop: 6, background: "#C50F1F", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.55 : 1 }}
                >
                  {fixingLayer === verdict.layer ? "Fixing..." : `Fix ${noun}`}
                </button>
              </>
            ) : verdict.kind === "match" ? (
              <div style={{ color: C.textSecond }}>{names(verdict.saved)}</div>
            ) : (
              <div style={{ color: C.textSecond }}>
                {verdict.note}
                {verdict.saved.length ? ` Saved: ${names(verdict.saved)}.` : ""}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
