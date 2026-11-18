import EditNoteIcon from "@mui/icons-material/EditNote";
import type { SubmissionCorrectionEntry } from "../../utils/workflowAssignmentData";
import { C } from "./constants";

interface SubmissionCorrectionsPanelProps {
  /** The submitter's corrections, oldest first (`readSubmissionCorrections`). */
  corrections: SubmissionCorrectionEntry[];
  /** Formats an ISO timestamp for Malaysia, the way the rest of the page does. */
  formatTime: (iso: string) => string;
}

/** Long answers (a table, a long comment) are clipped on screen; the export carries them in full. */
function clip(text: string): string {
  if (!text) return "(blank)";
  return text.length > 280 ? `${text.slice(0, 279)}…` : text;
}

/**
 * Every correction the submitter made before any step was decided: when,
 * from which account, and each answer before and after. Drawn only when
 * there is at least one, so an uncorrected submission shows nothing extra.
 */
export default function SubmissionCorrectionsPanel({ corrections, formatTime }: SubmissionCorrectionsPanelProps) {
  if (corrections.length === 0) return null;
  return (
    <div style={{ marginTop: 12, padding: 12, border: `1px solid ${C.border}`, borderRadius: 12, background: C.white }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <EditNoteIcon style={{ color: C.purpleAccent, fontSize: 20 }} />
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 750, color: C.textPrimary }}>Corrected by the submitter</div>
          <div style={{ fontSize: 11.5, color: C.textSecond, marginTop: 2 }}>
            Changed before any step was decided. The answers shown above are the corrected ones.
          </div>
        </div>
      </div>
      {[...corrections].reverse().map((entry, index) => (
        <div key={`${entry.at}-${index}`} style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.borderLight}`, fontSize: 11.5, lineHeight: 1.55 }}>
          <div style={{ color: C.textPrimary, fontWeight: 700 }}>
            {formatTime(entry.at)} {"·"} {entry.by}
          </div>
          {entry.changes.map((change) => (
            <div key={change.question} style={{ marginTop: 6 }}>
              <div style={{ color: C.textPrimary, fontWeight: 600 }}>{change.label || change.question}</div>
              <div style={{ color: C.textSecond, overflowWrap: "anywhere" }}>Before: {clip(change.before)}</div>
              <div style={{ color: C.textSecond, overflowWrap: "anywhere" }}>After: {clip(change.after)}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
