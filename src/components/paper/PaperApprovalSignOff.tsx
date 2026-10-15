/**
 * PaperApprovalSignOff.tsx — An approval step on a form with a paper layout
 * (Training Needs Analysis, Training Requisition), signed off the way its
 * Word form is signed: the step's caption ("Recommend by:", "Approved by
 * GHRH:"), a Signature line to sign on, then Name, the post, and Date.
 *
 * The approver's counterpart of PaperPartTwoInput's sign-off. Name and post
 * come filled in from the routing directory and locked; "Edit name and
 * position" unlocks them. The date is the day of signing — an approval keeps
 * no written date of its own, so it is not editable here.
 */
import { useState, type ReactNode } from "react";
import type { PaperSignOff } from "./PaperPartTwoInput";
import { isTrainingRequisitionForm } from "../../utils/paperPdf/paperForms";
import { requisitionCaption } from "../../utils/paperPdf/trainingRequisitionLayout";
import { NEEDS_APPROVER_CAPTION } from "../../utils/paperPdf/trainingNeedsAnalysisLayout";
import { roleName } from "../../utils/paperPdf/paperFormKit";

const INK = "#111111";
const RULE = "#333333";

/** What the step signs as, and the role printed under its line, as the paper form prints them. */
export function paperApprovalLabels(formTitle: string, layerNumber: number, totalLayers: number, layerTitle: string): { caption: string; role: string; positionLabel?: string } {
  const role = roleName(layerTitle || `Step ${layerNumber}`);
  if (isTrainingRequisitionForm(formTitle)) {
    return { caption: requisitionCaption(layerNumber - 1, Math.max(totalLayers, layerNumber)), role };
  }
  return { caption: layerNumber === 1 ? NEEDS_APPROVER_CAPTION : `Approved by ${role}:`, role: "", positionLabel: "Designation" };
}

export interface PaperApprovalSignOffProps {
  caption: string;
  role: string;
  /** The post's label ("Designation"); "Position" when unset. */
  positionLabel?: string;
  signOff: PaperSignOff;
  onSignOffChange: (next: PaperSignOff) => void;
  /** The signing control, drawn on the Signature line. */
  signatureSlot: ReactNode;
  disabled?: boolean;
}

function InputLine({ label, value, onChange, disabled, locked }: { label: string; value: string; onChange?: (value: string) => void; disabled: boolean; locked: boolean }) {
  const id = `paper-approval-${label.replace(/\W+/g, "").toLowerCase()}`;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, minWidth: 0 }}>
      <label htmlFor={id} style={{ width: 92, flexShrink: 0 }}>{label}</label>
      <input
        id={id}
        value={value}
        disabled={disabled}
        readOnly={locked || !onChange}
        aria-readonly={locked || !onChange}
        onChange={(event) => onChange?.(event.target.value)}
        style={{
          flex: 1, minWidth: 0, border: "none", borderBottom: `1px solid ${RULE}`, borderRadius: 0, padding: "2px 2px",
          font: "inherit", fontWeight: 700, color: INK, outlineOffset: 2,
          background: locked || !onChange ? "transparent" : "#fffbe8", cursor: locked || !onChange ? "default" : "text",
        }}
      />
    </div>
  );
}

export default function PaperApprovalSignOff({ caption, role, positionLabel = "Position", signOff, onSignOffChange, signatureSlot, disabled = false }: PaperApprovalSignOffProps) {
  const [unlocked, setUnlocked] = useState(false);
  const set = (key: keyof PaperSignOff) => (value: string) => onSignOffChange({ ...signOff, [key]: value });
  return (
    <div
      id="paper-approval"
      style={{
        background: "#ffffff", color: INK, border: `1px solid ${RULE}`, borderRadius: 4,
        padding: "18px 20px 22px", fontFamily: "Helvetica, Arial, sans-serif", fontSize: 14, lineHeight: 1.35,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{caption}</div>
        <button
          type="button"
          onClick={() => setUnlocked((open) => !open)}
          disabled={disabled}
          aria-pressed={unlocked}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, minHeight: 32, padding: "4px 12px", borderRadius: 6,
            border: `1px solid ${unlocked ? INK : "#c9ced6"}`, background: unlocked ? "#fffbe8" : "#ffffff",
            font: "inherit", fontSize: 13, fontWeight: 700, color: INK, cursor: disabled ? "default" : "pointer",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d={unlocked ? "M8 11V7a4 4 0 0 1 7.5-2" : "M8 11V7a4 4 0 0 1 8 0v4"} />
          </svg>
          {unlocked ? "Lock name and position" : "Edit name and position"}
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 14, minWidth: 0 }}>
        <span style={{ width: 92, flexShrink: 0, paddingTop: 8 }}>Signature:</span>
        <div className="nf" data-variant="reviewer" style={{ flex: 1, minWidth: 0, background: "transparent" }}>{signatureSlot}</div>
      </div>
      {role ? <div style={{ marginLeft: 102, marginTop: 2 }}>{role}</div> : null}

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "14px 36px" }}>
        <InputLine label="Name:" value={signOff.name} onChange={set("name")} disabled={disabled} locked={!unlocked} />
        <InputLine label={`${positionLabel}:`} value={signOff.position} onChange={set("position")} disabled={disabled} locked={!unlocked} />
        <InputLine label="Date:" value={signOff.date} disabled={disabled} locked />
      </div>
    </div>
  );
}
