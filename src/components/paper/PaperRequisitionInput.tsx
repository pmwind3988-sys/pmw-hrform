/**
 * PaperRequisitionInput.tsx — The Training Requisition Form filled in on its
 * own paper form (Training Requisition Form.docx), the same sheet the
 * submission popup, reviewer page and PDF draw (trainingRequisitionLayout.ts):
 *
 *   PMW INTERNATIONAL BERHAD / DOCUMENT TITLE / FORM TITLE / COMPANIES ☐ …
 *   Employee Details   Employee Name : ___ / Position : ___  Department : ___ / Reporting Manager : ___
 *   Training Details   Course Name / Training Objective / Training Provider / Venue / Date & Time
 *   Cost               Training Fee : RM ___ … Total Cost : RM ___ / HRDC Claimable : ☐ YES ☐ NO
 *   Request by: (signed here) | Recommend by: | Approve by:   (signed after submitting)
 *   For reference: Subject | Recommender | Approver
 *
 * Every answer box is the form's own control writing to the same
 * `NativeFormRuntime` the standard view uses, so validation, conditions and
 * submission are unchanged; only the arrangement is the paper form's.
 */
import { useEffect } from "react";
import type { NativeChoice, NativeElement, NativeForm } from "../../native/schema";
import type { NativeFormRuntime } from "../../native/useNativeForm";
import { NativeControl, NativeField } from "../../native/NativeForm";
import "../../native/native-form.css";
import "./paper-requisition.css";
import { PAPER_ORGANISATION } from "../../utils/paperPdf/paperLayout";
import { REQUISITION_REFERENCE, REQUISITION_RETAIN_NOTE } from "../../utils/paperPdf/trainingRequisitionLayout";

function flatten(elements: NativeElement[]): NativeElement[] {
  return elements.flatMap((el) => (el.kind === "section" ? flatten(el.elements) : [el]));
}

const describe = (el: NativeElement) => `${el.name} ${el.title}`;

/** The Word form's cost lines, in order — the same matches the printed layout uses. */
const COST_LINES: { label: string; match: RegExp }[] = [
  { label: "Training Fee", match: /training\s*fee|trainingFee/i },
  { label: "Mileage/Transportation Fees", match: /mileage|transport/i },
  { label: "Meals Allowance X days of training", match: /meal/i },
  { label: "Accommodation", match: /accom/i },
  { label: "Other cost (Toll/Parking)", match: /other|toll|parking/i },
];

export interface RequisitionQuestions {
  company?: NativeElement;
  employeeName?: NativeElement;
  position?: NativeElement;
  department?: NativeElement;
  manager?: NativeElement;
  course?: NativeElement;
  objective?: NativeElement;
  provider?: NativeElement;
  venue?: NativeElement;
  start?: NativeElement;
  end?: NativeElement;
  costs: { label: string; element?: NativeElement }[];
  total?: NativeElement;
  hrdc?: NativeElement;
  signature?: NativeElement;
  /** Anything the Word form has no place for, drawn with the form's own controls. */
  others: NativeElement[];
}

/** Which of the form's questions fills which line of the paper form, in the printed layout's order. */
export function requisitionQuestions(form: NativeForm): RequisitionQuestions {
  const all = flatten(form.pages.flatMap((page) => page.elements)).filter((el) => el.name !== "");
  const taken = new Set<NativeElement>();
  const take = (test: (el: NativeElement) => boolean) => {
    const found = all.find((el) => !taken.has(el) && test(el));
    if (found) taken.add(found);
    return found;
  };
  const answer = (el: NativeElement) => el.kind !== "signature" && el.kind !== "static";
  const by = (re: RegExp) => take((el) => answer(el) && re.test(describe(el)));

  const company = take((el) => (el.kind === "single-choice" || el.kind === "select") && /company/i.test(describe(el)));
  const signature = take((el) => el.kind === "signature");
  const employeeName = by(/employee\s*_?name|employeeName|applicant\s*name/i);
  const position = by(/position|designation/i);
  const department = by(/department/i);
  const manager = by(/reporting|manager/i);
  const course = by(/course|program/i);
  const objective = by(/objective/i);
  const provider = by(/provider/i);
  const venue = by(/venue|location/i);
  const start = by(/start/i);
  const end = by(/\bend\b|endDate/i);
  const costs = COST_LINES.map((line) => ({ label: line.label, element: by(line.match) }));
  const total = by(/total/i);
  const hrdc = by(/hrdc|claimable/i);
  const others = all.filter((el) => !taken.has(el));
  return { company, employeeName, position, department, manager, course, objective, provider, venue, start, end, costs, total, hrdc, signature, others };
}

/**
 * A Start or End date/time typed only in part (15/02/yyyy) shows in its box but
 * the browser reports it as empty, so it would be saved as no date at all. The
 * first one is scrolled to and focused with a message; Submit stops on it.
 */
export function focusPartialRequisitionDate(): boolean {
  const inputs = [...document.querySelectorAll<HTMLInputElement>('#paper-requisition input[type="date"], #paper-requisition input[type="datetime-local"], #paper-requisition input[type="time"]')];
  const partial = inputs.find((input) => input.validity.badInput);
  if (!partial) return false;
  partial.setCustomValidity("Finish the date and time, or clear it.");
  partial.addEventListener("input", () => partial.setCustomValidity(""), { once: true });
  partial.scrollIntoView({ behavior: "smooth", block: "center" });
  partial.focus({ preventScroll: true });
  partial.reportValidity();
  return true;
}

function amount(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.replace(/[^0-9.-]/g, "")) : NaN;
  return Number.isFinite(n) ? n : null;
}

function money(n: number): string {
  return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayPaperDate(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function isTicked(value: unknown, choice: string): boolean {
  return Array.isArray(value) ? value.map(String).includes(choice) : value !== undefined && value !== null && String(value) === choice;
}

function Tick({ on, label, aria, disabled, onToggle }: { on: boolean; label: string; aria?: string; disabled: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="prq-tick" aria-pressed={on} aria-label={aria} disabled={disabled} onClick={onToggle}>
      <span className="prq-box" aria-hidden="true">{on ? "✓" : ""}</span>
      <span>{label}</span>
    </button>
  );
}

interface LineProps {
  label: string;
  element?: NativeElement;
  runtime: NativeFormRuntime;
  prefix?: string;
  wide?: boolean;
  shaded?: boolean;
}

/** One "Label : answer" line of the Word form, the answer box being the form's own control. */
function Line({ label, element, runtime, prefix, wide = false, shaded = false }: LineProps) {
  if (!element || !runtime.stateOf(element).visible) return null;
  return (
    <div className="prq-line" data-wide={wide ? "true" : undefined}>
      <div className="prq-label" data-shaded={shaded ? "true" : undefined}>
        {label}{element.required ? <span className="prq-req"> *</span> : null}
      </div>
      <div className="prq-colon" aria-hidden="true">:</div>
      <div className="prq-answer">
        {prefix ? <span className="prq-prefix">{prefix}</span> : null}
        <div className="nf" data-variant="reviewer"><NativeControl element={element} runtime={runtime} label={label} /></div>
      </div>
    </div>
  );
}

/** HRDC Claimable as the Word form ticks it: ☐ YES ☐ NO. */
function HrdcLine({ element, runtime, disabled }: { element?: NativeElement; runtime: NativeFormRuntime; disabled: boolean }) {
  if (!element || !runtime.stateOf(element).visible) return null;
  const value = runtime.getValue(element.name);
  const error = runtime.errors[element.name] ?? "";
  const locked = disabled || !runtime.stateOf(element).enabled;
  const choices: { on: boolean; label: string; next: unknown }[] = element.kind === "boolean"
    ? [
      { on: value === true, label: "YES", next: true },
      { on: value === false, label: "NO", next: false },
    ]
    : (runtime.stateOf(element).choices ?? element.choices).map((c: NativeChoice) => ({ on: isTicked(value, c.value), label: c.text.toUpperCase(), next: c.value }));
  return (
    <div className="prq-line" id={`field-${element.name}`}>
      <div className="prq-label" data-shaded="true">HRDC Claimable{element.required ? <span className="prq-req"> *</span> : null}</div>
      <div className="prq-colon" aria-hidden="true">:</div>
      <div className="prq-answer prq-answer-ticks" role="group" aria-label="HRDC Claimable">
        {choices.map((c) => (
          <Tick key={c.label} on={c.on} label={c.label} disabled={locked} onToggle={() => runtime.setValue(element.name, c.on ? null : c.next)} />
        ))}
        {error ? <div className="prq-error" role="alert">{error}</div> : null}
      </div>
    </div>
  );
}

export interface PaperRequisitionInputProps {
  runtime: NativeFormRuntime;
  disabled?: boolean;
  /** The form's name, printed as FORM TITLE. */
  formTitle: string;
  /** The ISO line printed as DOCUMENT TITLE. */
  documentTitle?: string;
  logoUrl?: string;
}

export default function PaperRequisitionInput({ runtime, disabled = false, formTitle, documentTitle = "", logoUrl }: PaperRequisitionInputProps) {
  const q = requisitionQuestions(runtime.form);
  const visible = (el?: NativeElement): el is NativeElement => Boolean(el) && runtime.stateOf(el as NativeElement).visible;

  // Move to the first thing that failed, as the standard form does.
  const { firstError, errorSignal } = runtime;
  useEffect(() => {
    if (!firstError) return;
    const node = document.getElementById(`field-${firstError}`);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    const control = node.querySelector<HTMLElement>("input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])");
    control?.focus({ preventScroll: true });
  }, [firstError, errorSignal]);

  const company = visible(q.company) ? q.company : undefined;
  const companyChoices = company ? (runtime.stateOf(company).choices ?? company.choices) : [];
  const companyValue = company ? runtime.getValue(company.name) : undefined;
  const companyError = company ? runtime.errors[company.name] ?? "" : "";
  const half = Math.ceil(companyChoices.length / 2);
  // Two columns down, as the Word form lists them: the first half on the left.
  const companyRows = Array.from({ length: half }, (_, i) => [companyChoices[i], companyChoices[i + half]]);

  // The total as the printout works it out when the form stores none: the cost lines added up.
  const lineAmounts = q.costs.map((c) => amount(c.element ? runtime.getValue(c.element.name) : undefined));
  const summed = lineAmounts.reduce<number>((sum, n) => sum + (n ?? 0), 0);

  const applicantName = q.employeeName ? String(runtime.getValue(q.employeeName.name) ?? "") : "";
  const others = q.others.filter((el) => visible(el));

  return (
    <div className="prq" id="paper-requisition">
      <table className="prq-header">
        <tbody>
          <tr>
            <td className="prq-logo">{logoUrl ? <img src={logoUrl} alt="Company logo" /> : null}</td>
            <td colSpan={4} className="prq-org">{PAPER_ORGANISATION}</td>
          </tr>
          <tr><td>DOCUMENT TITLE</td><td colSpan={4} className="prq-center">{documentTitle}</td></tr>
          <tr><td>FORM TITLE</td><td colSpan={4} className="prq-center prq-strong">{formTitle.toUpperCase()}</td></tr>
          {company ? companyRows.map((row, i) => (
            <tr key={i}>
              {i === 0 ? (
                <td rowSpan={companyRows.length} className="prq-companies-label" id={`field-${company.name}`} data-invalid={companyError ? "true" : undefined}>
                  COMPANIES{company.required ? <span className="prq-req"> *</span> : null}
                  <div className="prq-hint">Tick one</div>
                  {companyError ? <div className="prq-error" role="alert">{companyError}</div> : null}
                </td>
              ) : null}
              {row.map((choice, j) => {
                if (!choice) return <td key={j} colSpan={2} />;
                const on = isTicked(companyValue, choice.value);
                return (
                  <td key={j} colSpan={2} className="prq-company">
                    <Tick
                      on={on}
                      label={choice.text}
                      aria={`Company: ${choice.text}`}
                      disabled={disabled || !runtime.stateOf(company).enabled}
                      onToggle={() => runtime.setValue(company.name, on ? null : choice.value)}
                    />
                  </td>
                );
              })}
            </tr>
          )) : null}
        </tbody>
      </table>

      <section className="prq-section">
        <h3 className="prq-h1">Employee Details</h3>
        <Line label="Employee Name" element={q.employeeName} runtime={runtime} wide />
        <div className="prq-pair">
          <Line label="Position" element={q.position} runtime={runtime} />
          <Line label="Department" element={q.department} runtime={runtime} />
        </div>
        <Line label="Reporting Manager" element={q.manager} runtime={runtime} wide />
      </section>

      <section className="prq-section">
        <h4 className="prq-h2">Training Details</h4>
        <Line label="Course Name" element={q.course} runtime={runtime} wide />
        <Line label="Training Objective" element={q.objective} runtime={runtime} wide />
        <Line label="Training Provider" element={q.provider} runtime={runtime} wide />
        <Line label="Venue" element={q.venue} runtime={runtime} wide />
        <div className="prq-pair">
          <Line label="Start Date & Time" element={q.start} runtime={runtime} />
          <Line label="End Date & Time" element={q.end} runtime={runtime} />
        </div>
      </section>

      <section className="prq-section">
        <h4 className="prq-h2">Cost</h4>
        {q.costs.map((c) => <Line key={c.label} label={c.label} element={c.element} runtime={runtime} prefix="RM" shaded />)}
        {visible(q.total) ? (
          <Line label="Total Cost" element={q.total} runtime={runtime} prefix="RM" shaded />
        ) : (
          <div className="prq-line">
            <div className="prq-label" data-shaded="true">Total Cost</div>
            <div className="prq-colon" aria-hidden="true">:</div>
            <div className="prq-answer"><span className="prq-prefix">RM</span><span className="prq-total">{money(summed)}</span></div>
          </div>
        )}
        <HrdcLine element={q.hrdc} runtime={runtime} disabled={disabled} />
      </section>

      {others.length > 0 ? (
        <div className="nf prq-others" data-variant="reviewer">
          {others.map((el) => <NativeField key={el.id} element={el} runtime={runtime} />)}
        </div>
      ) : null}

      <div className="prq-signoff">
        <div className="prq-signoff-col">
          <div className="prq-caption">Request by:</div>
          {visible(q.signature) ? (
            <div className="prq-sign">
              <div className="nf" data-variant="reviewer"><NativeControl element={q.signature} runtime={runtime} label={q.signature.title || "Applicant signature"} /></div>
            </div>
          ) : <div className="prq-sign-later" />}
          <div className="prq-role">Applicant</div>
          <div className="prq-field"><span>Name:</span><span className="prq-field-value">{applicantName}</span></div>
          <div className="prq-field"><span>Date:</span><span className="prq-field-value">{todayPaperDate()}</span></div>
        </div>
        {["Recommend by:", "Approve by:"].map((caption) => (
          <div className="prq-signoff-col" data-later="true" key={caption}>
            <div className="prq-caption">{caption}</div>
            <div className="prq-sign-later">Signed after you submit</div>
            <div className="prq-role">&nbsp;</div>
            <div className="prq-field"><span>Name:</span><span className="prq-field-value" /></div>
            <div className="prq-field"><span>Date:</span><span className="prq-field-value" /></div>
          </div>
        ))}
      </div>

      <section className="prq-section">
        <h4 className="prq-h2">For reference:</h4>
        <table className="prq-reference">
          <colgroup><col style={{ width: "50%" }} /><col style={{ width: "25%" }} /><col style={{ width: "25%" }} /></colgroup>
          <thead><tr>{REQUISITION_REFERENCE.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>{REQUISITION_REFERENCE.rows.map((row) => <tr key={row[0]}>{row.map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}</tbody>
        </table>
        <p className="prq-note">{REQUISITION_RETAIN_NOTE}</p>
      </section>
    </div>
  );
}
