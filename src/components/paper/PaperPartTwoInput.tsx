/**
 * PaperPartTwoInput.tsx — The HOD's Part II of the Training Evaluation Form,
 * filled in on screen but laid out as the paper form prints it: the Word
 * form's heading, a Performance Indication table with Yes / No tick cells,
 * ruled comment lines, and the Name / Signature / Position / Date sign-off.
 *
 * It writes to the same `NativeFormRuntime` the ordinary reviewer form uses,
 * so validation, the answered count and submission are unchanged. It only
 * draws Yes/No questions and comment boxes; `supportsPaperPartTwo` says when a
 * step asks only those, and the page keeps the ordinary form otherwise.
 */
import { useState, type ReactNode } from "react";
import type { NativeElement } from "../../native/schema";
import type { NativeFormRuntime } from "../../native/useNativeForm";
import { NativeControl, NativeField } from "../../native/NativeForm";
import "../../native/native-form.css";
import {
  HOD_COMMENTS_LABEL,
  HOD_COMMENTS_SUBLABEL,
  HOD_PART_TITLE,
  HOD_STATEMENT,
  PERFORMANCE_ITEMS,
} from "../../utils/paperPdf/trainingEvaluationLayout";

const INK = "#111111";
const RULE = "#333333";
const BAND = "#DAEEF3";
const ERROR = "#b3261e";
const LINE = 24;

function flatten(elements: NativeElement[]): NativeElement[] {
  return elements.flatMap((el) => (el.kind === "section" ? flatten(el.elements) : [el]));
}

/**
 * Whether a step has the paper Part II's shape: Yes/No statements to tick.
 * Anything else it asks is still drawn, with the form's own controls.
 */
export function supportsPaperPartTwo(runtime: NativeFormRuntime): boolean {
  return flatten(runtime.form.pages.flatMap((p) => p.elements)).some((el) => el.kind === "boolean");
}

export interface PaperSignOff {
  name: string;
  position: string;
  date: string;
}

export interface PaperPartTwoInputProps {
  runtime: NativeFormRuntime;
  disabled?: boolean;
  /** Filled in from the routing directory and today's date; the evaluator may change them. */
  signOff: PaperSignOff;
  onSignOffChange: (next: PaperSignOff) => void;
  /** The drawn signature, when this step asks for one outside its questions. */
  signature?: string | null;
  /** The signing control for such a signature, drawn on the Signature line. */
  signatureSlot?: ReactNode;
  /** The PART number as printed ("II"). */
  part?: string;
}

/** A sign-off line the evaluator can write on: pre-filled, still editable. */
function InputLine({ label, value, onChange, disabled, locked }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; locked: boolean }) {
  const id = `paper-signoff-${label.replace(/\W+/g, "").toLowerCase()}`;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, minWidth: 0 }}>
      <label htmlFor={id} style={{ width: 72, flexShrink: 0 }}>{label}</label>
      <input
        id={id}
        value={value}
        disabled={disabled}
        readOnly={locked}
        aria-readonly={locked}
        onChange={(event) => onChange(event.target.value)}
        style={{
          flex: 1, minWidth: 0, border: "none", borderBottom: `1px solid ${RULE}`, borderRadius: 0, padding: "2px 2px",
          font: "inherit", fontWeight: 700, color: INK, outlineOffset: 2,
          background: locked ? "transparent" : "#fffbe8", cursor: locked ? "default" : "text",
        }}
      />
    </div>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, minWidth: 0 }}>
      <span style={{ width: 72, flexShrink: 0 }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, borderBottom: `1px solid ${RULE}`, minHeight: 22, fontWeight: 700, display: "flex", alignItems: "flex-end" }}>
        {children}
      </span>
    </div>
  );
}

export default function PaperPartTwoInput({ runtime, disabled = false, signOff, onSignOffChange, signature, signatureSlot, part = "II" }: PaperPartTwoInputProps) {
  const setSignOff = (key: keyof PaperSignOff) => (value: string) => onSignOffChange({ ...signOff, [key]: value });
  // Name, position and date come filled in and locked; the evaluator unlocks
  // them to correct something, then locks them again.
  const [detailsUnlocked, setDetailsUnlocked] = useState(false);
  const locked = !detailsUnlocked;
  const visible = flatten(runtime.page.elements).filter((el) => runtime.stateOf(el).visible);
  const statements = visible.filter((el) => el.kind === "boolean");
  const comments = visible.filter((el) => el.kind === "textarea");
  // A signature question signs the sign-off line; every other question keeps
  // the form's own control, so it behaves exactly as it always has.
  const signatureField = visible.find((el) => el.kind === "signature");
  const others = visible.filter((el) => !["boolean", "textarea"].includes(el.kind) && el !== signatureField);
  // The Word form's own wording, when the step asks the same four statements.
  const label = (el: NativeElement, i: number) =>
    statements.length === PERFORMANCE_ITEMS.length ? PERFORMANCE_ITEMS[i] : el.title;
  const valueOf = (el: NativeElement) => {
    const v = runtime.getValue(el.name);
    return v === true || v === "true" ? true : v === false || v === "false" ? false : null;
  };
  const statementErrors = statements.some((el) => runtime.errors[el.name]);

  const cell = { border: `1px solid ${RULE}`, padding: "6px 8px", verticalAlign: "middle" } as const;
  const tick = (el: NativeElement, i: number, answer: boolean) => {
    const on = valueOf(el) === answer;
    const enabled = !disabled && runtime.stateOf(el).enabled && !el.readOnly;
    return (
      <td style={{ ...cell, padding: 0, width: 56 }}>
        <button
          type="button"
          aria-pressed={on}
          aria-label={`${label(el, i)}: ${answer ? "Yes" : "No"}`}
          disabled={!enabled}
          onClick={() => runtime.setValue(el.name, on ? null : answer)}
          style={{
            width: "100%", minHeight: 40, border: "none", background: on ? "#eef5fb" : "transparent",
            cursor: enabled ? "pointer" : "default", fontSize: 18, fontWeight: 700, color: INK,
          }}
        >
          {on ? "✓" : ""}
        </button>
      </td>
    );
  };

  return (
    <div
      id="paper-part-two"
      style={{
        background: "#ffffff", color: INK, border: `1px solid ${RULE}`, borderRadius: 4,
        padding: "20px 20px 24px", fontFamily: "Helvetica, Arial, sans-serif", fontSize: 14, lineHeight: 1.35,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>PART {part} – {HOD_PART_TITLE}</div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 420 }}>
          <thead>
            <tr style={{ background: BAND }}>
              <th style={{ ...cell, textAlign: "left" }}>Performance Indication:</th>
              <th style={{ ...cell, width: 56, textAlign: "center" }}>Yes</th>
              <th style={{ ...cell, width: 56, textAlign: "center" }}>No</th>
            </tr>
          </thead>
          <tbody>
            {statements.map((el, i) => (
              <tr key={el.id} id={el.name} style={runtime.errors[el.name] ? { boxShadow: `inset 3px 0 0 ${ERROR}` } : undefined}>
                <td style={{ ...cell, paddingLeft: 12 }}>
                  <span style={{ display: "inline-block", minWidth: 22 }}>{i + 1}.</span>
                  {label(el, i)}
                </td>
                {tick(el, i, true)}
                {tick(el, i, false)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {statementErrors ? (
        <div role="alert" style={{ color: ERROR, fontSize: 13, marginTop: 6 }}>Tick Yes or No for every statement.</div>
      ) : null}

      {comments.map((el, i) => {
        const value = String(runtime.getValue(el.name) ?? "");
        const lines = Math.max(4, value.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 90)), 0));
        const error = runtime.errors[el.name];
        return (
          <div key={el.id} id={el.name} style={{ marginTop: 18 }}>
            <label htmlFor={`paper-${el.id}`} style={{ display: "block" }}>
              {i === 0 ? HOD_COMMENTS_LABEL : el.title}
            </label>
            {i === 0 ? <div>{HOD_COMMENTS_SUBLABEL}</div> : null}
            <textarea
              id={`paper-${el.id}`}
              value={value}
              disabled={disabled || el.readOnly}
              onChange={(event) => runtime.setValue(el.name, event.target.value)}
              aria-invalid={Boolean(error)}
              rows={lines}
              style={{
                display: "block", width: "100%", boxSizing: "border-box", marginTop: 6, border: "none", outline: "none",
                resize: "vertical", padding: "0 2px", font: "inherit", fontWeight: 700, color: INK, lineHeight: `${LINE}px`,
                background: `repeating-linear-gradient(to bottom, transparent 0 ${LINE - 1}px, ${error ? ERROR : RULE} ${LINE - 1}px ${LINE}px)`,
                minHeight: LINE * 4,
              }}
            />
            {error ? <div role="alert" style={{ color: ERROR, fontSize: 13, marginTop: 4 }}>{error}</div> : null}
          </div>
        );
      })}

      {others.length > 0 && (
        <div className="nf" data-variant="reviewer" style={{ marginTop: 18, background: "transparent" }}>
          {others.map((el) => <NativeField key={el.id} element={el} runtime={runtime} />)}
        </div>
      )}

      <div style={{ marginTop: 24 }}>{HOD_STATEMENT}</div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
        <button
          type="button"
          onClick={() => setDetailsUnlocked((open) => !open)}
          disabled={disabled}
          aria-pressed={detailsUnlocked}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, minHeight: 32, padding: "4px 12px", borderRadius: 6,
            border: `1px solid ${detailsUnlocked ? INK : "#c9ced6"}`, background: detailsUnlocked ? "#fffbe8" : "#ffffff",
            font: "inherit", fontSize: 13, fontWeight: 700, color: INK, cursor: disabled ? "default" : "pointer",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d={detailsUnlocked ? "M8 11V7a4 4 0 0 1 7.5-2" : "M8 11V7a4 4 0 0 1 8 0v4"} />
          </svg>
          {detailsUnlocked ? "Lock name, position and date" : "Edit name, position and date"}
        </button>
      </div>
      {/* Two columns, as the paper form prints them: Name and Position on the
          left, Signature and Date on the right. Stacks on a narrow screen. */}
      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px 36px", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <InputLine label="Name:" value={signOff.name} onChange={setSignOff("name")} disabled={disabled} locked={locked} />
          <InputLine label="Position:" value={signOff.position} onChange={setSignOff("position")} disabled={disabled} locked={locked} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {signatureField || signatureSlot ? (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
              <span style={{ width: 72, flexShrink: 0, paddingTop: 8 }}>Signature:</span>
              <div className="nf" data-variant="reviewer" style={{ flex: 1, minWidth: 0, background: "transparent" }}>
                {signatureField ? <NativeControl element={signatureField} runtime={runtime} label={signatureField.title || "Signature"} /> : signatureSlot}
              </div>
            </div>
          ) : (
            <Line label="Signature:">
              {signature ? <img src={signature} alt="Your signature" style={{ height: 56, maxWidth: "100%", objectFit: "contain" }} /> : null}
            </Line>
          )}
          <InputLine label="Date:" value={signOff.date} onChange={setSignOff("date")} disabled={disabled} locked={locked} />
        </div>
      </div>
    </div>
  );
}
