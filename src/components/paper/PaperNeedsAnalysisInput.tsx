/**
 * PaperNeedsAnalysisInput.tsx — The Training Needs Analysis filled in as HR's
 * Word form (Training Needs Analysis.docx), not as the standard card form:
 *
 *   COMPANY  ☐ … ☐ …           (tick one)
 *   DEPARTMENT | ______ | YEAR | ____
 *   No | Emp. ID | Name | Training Needs | Current / Required Skill Level |
 *      Priority | Relevancy to job function | Tentative Date
 *   Prepared by HOD: signature, Name, Designation, Date | Approved by GHRH: (later)
 *
 * It writes to the same `NativeFormRuntime` the standard form uses, so
 * validation, the answered count and submission are unchanged — the same
 * pattern as PaperPartTwoInput. On a phone the table becomes one card per
 * person (paper-needs-analysis.css).
 */
import { useEffect, useState } from "react";
import type { NativeChoice, NativeColumn, NativeElement, NativeForm } from "../../native/schema";
import type { NativeFormRuntime } from "../../native/useNativeForm";
import { NativeControl, NativeField } from "../../native/NativeForm";
import "../../native/native-form.css";
import "./paper-needs-analysis.css";
import {
  NEEDS_APPROVER_CAPTION,
  NEEDS_MIN_ROWS,
  PREPARED_DESIGNATION_MATCH,
  PREPARED_NAME_MATCH,
  matchNeedsColumns,
} from "../../utils/paperPdf/trainingNeedsAnalysisLayout";
import { isEmptyNeedsRow, removeNeedsRow, shownNeedsRowCount, writeNeedsCell, writeNeedsCells, type NeedsRow } from "./needsAnalysisRows";
import { readSchedule, scheduleColumns, scheduleProblem, scheduleValues, formatSchedule, type ScheduleColumns, type ScheduleInput } from "../../utils/paperPdf/needsSchedule";

function flatten(elements: NativeElement[]): NativeElement[] {
  return elements.flatMap((el) => (el.kind === "section" ? flatten(el.elements) : [el]));
}

const describe = (el: NativeElement) => `${el.name} ${el.title}`;

export interface NeedsAnalysisQuestions {
  company?: NativeElement;
  department?: NativeElement;
  year?: NativeElement;
  table?: NativeElement;
  signature?: NativeElement;
  name?: NativeElement;
  designation?: NativeElement;
  /** Anything the Word form has no place for, drawn with the form's own controls. */
  others: NativeElement[];
}

/** Which of the form's questions fills which part of the paper form. */
export function needsAnalysisQuestions(form: NativeForm): NeedsAnalysisQuestions {
  const all = flatten(form.pages.flatMap((page) => page.elements));
  const taken = new Set<NativeElement>();
  const take = (test: (el: NativeElement) => boolean) => {
    const found = all.find((el) => !taken.has(el) && el.name !== "" && test(el));
    if (found) taken.add(found);
    return found;
  };
  const company = take((el) => (el.kind === "single-choice" || el.kind === "select") && /company/i.test(describe(el)));
  const table = take((el) => el.kind === "table");
  const signature = take((el) => el.kind === "signature");
  const name = take((el) => el.kind === "text" && PREPARED_NAME_MATCH.test(describe(el)));
  const designation = take((el) => el.kind === "text" && PREPARED_DESIGNATION_MATCH.test(describe(el)));
  const department = take((el) => /department/i.test(describe(el)));
  const year = take((el) => /\byear\b/i.test(describe(el)));
  const others = all.filter((el) => !taken.has(el));
  return { company, department, year, table, signature, name, designation, others };
}

/** The preparer's designation must be filled, as on the paper form, whatever the question was published as. */
export function requirePreparedDesignation(form: NativeForm): NativeForm {
  const { designation } = needsAnalysisQuestions(form);
  if (designation) {
    designation.required = true;
    designation.requiredMessage ||= "Enter your designation before submitting.";
  }
  return form;
}

/** The answers to submit, without the blank rows left between filled ones on the paper table. */
export function compactNeedsAnswers(form: NativeForm, values: Record<string, unknown>): Record<string, unknown> {
  const { table } = needsAnalysisQuestions(form);
  const rows = table ? values[table.name] : undefined;
  if (!table || !Array.isArray(rows)) return values;
  return { ...values, [table.name]: (rows as NeedsRow[]).filter((row) => !isEmptyNeedsRow(row)) };
}

function todayPaperDate(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function Tick({ on, label, aria, disabled, onToggle }: { on: boolean; label: string; aria?: string; disabled: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="pna-tick" aria-pressed={on} aria-label={aria} disabled={disabled} onClick={onToggle}>
      <span className="pna-box" aria-hidden="true">{on ? "✓" : ""}</span>
      <span>{label}</span>
    </button>
  );
}

function isTicked(value: unknown, choice: string): boolean {
  return Array.isArray(value) ? value.map(String).includes(choice) : value !== undefined && value !== null && String(value) === choice;
}

function Cell({ column, value, label, wide, disabled, onChange }: { column: NativeColumn; value: unknown; label: string; wide: boolean; disabled: boolean; onChange: (next: unknown) => void }) {
  if (column.cellType === "select" || column.choices.length > 0) {
    return (
      <div className="pna-ticks" role="group" aria-label={label}>
        {column.choices.map((choice: NativeChoice) => {
          const on = isTicked(value, choice.value);
          return <Tick key={choice.value} on={on} label={choice.text} aria={`${label}: ${choice.text}`} disabled={disabled} onToggle={() => onChange(on ? "" : choice.value)} />;
        })}
      </div>
    );
  }
  if (column.cellType === "boolean") {
    return <div className="pna-ticks"><Tick on={value === true} label="Yes" aria={label} disabled={disabled} onToggle={() => onChange(value === true ? null : true)} /></div>;
  }
  const text = value === undefined || value === null ? "" : String(value);
  if (wide && column.cellType === "text") {
    return <textarea className="pna-cell" rows={3} aria-label={label} value={text} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <input
      className="pna-cell"
      type={column.cellType === "date" ? "date" : column.cellType === "number" ? "number" : "text"}
      aria-label={label}
      value={text}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Rows whose tentative schedule is started but not complete, as 1-based row numbers. */
export function incompleteScheduleRows(form: NativeForm, values: Record<string, unknown>): number[] {
  const { table } = needsAnalysisQuestions(form);
  const rows = table ? values[table.name] : undefined;
  if (!table || !Array.isArray(rows)) return [];
  const cols = scheduleColumns(table.columns);
  if (!cols.start && !cols.end && !cols.days) return [];
  return (rows as NeedsRow[]).flatMap((row, i) => {
    if (isEmptyNeedsRow(row)) return [];
    const input = readSchedule(row, cols);
    // A finished schedule has its start written; times are not kept until it is.
    return (input.firstDay || input.days) && !row[cols.start?.name ?? ""] ? [i + 1] : [];
  });
}

/**
 * The Tentative Date box: first day, number of days and one time range for
 * every day. The four stored columns are written together; start and end
 * stay blank until the schedule is complete.
 */
function ScheduleCell({ row, cols, label, disabled, onWrite }: { row: NeedsRow | undefined; cols: ScheduleColumns<NativeColumn>; label: string; disabled: boolean; onWrite: (cells: NeedsRow) => void }) {
  const stored = readSchedule(row, cols);
  // Times are only stored once the schedule is complete, so they are held here until then.
  const [times, setTimes] = useState({ from: stored.from, to: stored.to });
  const input: ScheduleInput = { ...stored, from: row?.[cols.start?.name ?? ""] ? stored.from : times.from, to: row?.[cols.end?.name ?? ""] ? stored.to : times.to };
  const write = (next: ScheduleInput) => {
    setTimes({ from: next.from, to: next.to });
    const v = scheduleValues(next);
    const cells: NeedsRow = {};
    if (cols.firstDay) cells[cols.firstDay.name] = v.firstDay || undefined;
    if (cols.start) cells[cols.start.name] = v.start || undefined;
    if (cols.end) cells[cols.end.name] = v.end || undefined;
    if (cols.days) cells[cols.days.name] = v.days ?? undefined;
    onWrite(cells);
  };
  const problem = scheduleProblem(input);
  const summary = problem ? "" : formatSchedule(input);
  return (
    <div className="pna-sched" role="group" aria-label={label}>
      <label className="pna-sched-line">
        <span>First day</span>
        <input
          type="date"
          value={input.firstDay}
          disabled={disabled}
          aria-label={`${label}: first day`}
          // Picking a first day with no length yet means a one-day course until told otherwise.
          onChange={(e) => write({ ...input, firstDay: e.target.value, days: e.target.value && !input.days ? 1 : input.days })}
        />
      </label>
      <label className="pna-sched-line">
        <span>Days</span>
        <input
          type="number"
          min={1}
          max={60}
          inputMode="numeric"
          className="pna-sched-days"
          value={input.days ?? ""}
          disabled={disabled}
          aria-label={`${label}: number of days`}
          onChange={(e) => write({ ...input, days: e.target.value === "" ? null : Number(e.target.value) })}
        />
      </label>
      {/* One time range holds for every day. */}
      <label className="pna-sched-line">
        <span>From</span>
        <input type="time" value={input.from} disabled={disabled} aria-label={`${label}: start time each day`} onChange={(e) => write({ ...input, from: e.target.value })} />
      </label>
      <label className="pna-sched-line">
        <span>To</span>
        <input type="time" value={input.to} disabled={disabled} aria-label={`${label}: end time each day`} onChange={(e) => write({ ...input, to: e.target.value })} />
      </label>
      {problem ? <div className="pna-sched-note" data-tone="error">{problem}</div> : summary ? <div className="pna-sched-note">{summary}</div> : null}
    </div>
  );
}

function NeedsTable({ table, runtime, disabled }: { table: NativeElement; runtime: NativeFormRuntime; disabled: boolean }) {
  const [opened, setOpened] = useState(0);
  const value = runtime.getValue(table.name);
  const rows: NeedsRow[] = Array.isArray(value) ? (value as NeedsRow[]) : [];
  const schedule = scheduleColumns(table.columns);
  const hasSchedule = Boolean(schedule.start || schedule.end || schedule.days);
  // On screen the Tentative Date box holds four inputs, so it gets the room the printout gives its one line.
  const columns = matchNeedsColumns(table.columns)
    .filter((c): c is { label: string; width: number; column: NativeColumn } => Boolean(c.column))
    .map((c) => (hasSchedule && c.column === schedule.firstDay ? { ...c, width: 24 } : c));
  const total = columns.reduce((sum, c) => sum + c.width, 0) || 1;
  const count = shownNeedsRowCount(rows.length, opened, Math.max(NEEDS_MIN_ROWS, table.minRows), table.maxRows);
  const canAdd = !disabled && (table.maxRows <= 0 || count < table.maxRows);
  const error = runtime.errors[table.name] ?? "";
  const filled = rows.filter((row) => !isEmptyNeedsRow(row)).length;

  if (columns.length === 0) return <p className="pna-hint">This table has no columns configured.</p>;
  return (
    <div id={`field-${table.name}`}>
      <div className="pna-table-scroll">
        <table className="pna-table" data-invalid={error ? "true" : undefined} aria-label={table.title || "Training needs"}>
          <colgroup>
            <col style={{ width: "5%" }} />
            {columns.map((c) => <col key={c.column.name} style={{ width: `${(c.width / total) * 95}%` }} />)}
          </colgroup>
          <thead>
            <tr>
              <th scope="col">No</th>
              {columns.map((c) => <th key={c.column.name} scope="col">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: count }, (_, r) => {
              const row = rows[r];
              return (
                <tr key={r}>
                  <td className="pna-no">
                    <span className="pna-no-label"><span className="pna-row-word">Row </span>{r + 1}</span>
                    {!disabled && !isEmptyNeedsRow(row) ? (
                      <button type="button" className="pna-clear" aria-label={`Clear row ${r + 1}`} onClick={() => runtime.setValue(table.name, removeNeedsRow(rows, r))}>
                        Clear
                      </button>
                    ) : null}
                  </td>
                  {columns.map((c) => (
                    <td key={c.column.name} data-label={c.label}>
                      {hasSchedule && c.column === schedule.firstDay ? (
                        <ScheduleCell
                          row={row}
                          cols={schedule}
                          label={`${c.label}, row ${r + 1}`}
                          disabled={disabled}
                          onWrite={(cells) => runtime.setValue(table.name, writeNeedsCells(rows, r, cells))}
                        />
                      ) : (
                      <Cell
                        column={c.column}
                        value={row?.[c.column.name]}
                        label={`${c.label}, row ${r + 1}`}
                        wide={c.width >= 13}
                        disabled={disabled}
                        onChange={(next) => runtime.setValue(table.name, writeNeedsCell(rows, r, c.column.name, next))}
                      />
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error ? <div className="pna-error" role="alert">{error}</div> : null}
      {!disabled ? (
        <div className="pna-table-foot">
          <button type="button" className="pna-add" disabled={!canAdd} onClick={() => setOpened(count + 1)}>+ Add row</button>
          <span>
            {filled} of {count} rows filled{table.maxRows > 0 ? ` · up to ${table.maxRows} rows` : ""} · empty rows are not submitted
          </span>
        </div>
      ) : null}
    </div>
  );
}

export interface PaperNeedsAnalysisInputProps {
  runtime: NativeFormRuntime;
  disabled?: boolean;
  /** The preparer's name as filled in for them (directory, else their account); shown locked while unchanged. */
  preparedByName?: string;
  /** The preparer's post from the Approval Directory, when they are listed with one. */
  preparedByPosition?: string;
}

export default function PaperNeedsAnalysisInput({ runtime, disabled = false, preparedByName = "", preparedByPosition = "" }: PaperNeedsAnalysisInputProps) {
  const q = needsAnalysisQuestions(runtime.form);
  const visible = (el?: NativeElement): el is NativeElement => Boolean(el) && runtime.stateOf(el as NativeElement).visible;

  // Move to the first thing that failed, as the standard form does, so a
  // rejected Submit lands on the empty box rather than doing nothing visible.
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
  const companyOrder = Array.from({ length: half }, (_, i) => [companyChoices[i], companyChoices[i + half]]).flat().filter((c): c is NativeChoice => Boolean(c));

  const designation = q.designation;
  const nameValue = q.name ? String(runtime.getValue(q.name.name) ?? "") : preparedByName;
  const nameLocked = !q.name || (nameValue !== "" && nameValue === preparedByName);
  const designationValue = q.designation ? String(runtime.getValue(q.designation.name) ?? "") : "";
  const designationError = q.designation ? runtime.errors[q.designation.name] ?? "" : "";
  const designationNote = designationError
    || (preparedByPosition && designationValue === preparedByPosition
      ? "Filled in from the Approval Directory — change it if it is out of date."
      : "Type your position.");

  const others = q.others.filter((el) => visible(el));
  const year = visible(q.year) ? q.year : undefined;

  return (
    <div className="pna" id="paper-needs-analysis">
      {company ? (
        <div id={`field-${company.name}`}>
          <div
            className="pna-companies"
            role="group"
            aria-label={company.title || "Company"}
            data-invalid={companyError ? "true" : undefined}
            style={{ ["--pna-company-rows" as string]: String(Math.max(1, half)) }}
          >
            <div className="pna-companies-label">
              {(company.title || "Company").toUpperCase()} {company.required ? <span className="pna-req">*</span> : null}
              <div className="pna-hint" style={{ fontWeight: 400, marginTop: 4 }}>Tick one</div>
            </div>
            {companyOrder.map((choice) => {
              const on = isTicked(companyValue, choice.value);
              return (
                <div key={choice.value}>
                  <Tick on={on} label={choice.text} disabled={disabled || !runtime.stateOf(company).enabled} onToggle={() => runtime.setValue(company.name, on ? null : choice.value)} />
                </div>
              );
            })}
          </div>
          {companyError ? <div className="pna-error" role="alert">{companyError}</div> : null}
        </div>
      ) : null}

      <div className="pna-head">
        <div className="pna-head-label">DEPARTMENT {q.department?.required ? <span className="pna-req">&nbsp;*</span> : null}</div>
        <div className="pna-head-value">
          {visible(q.department) ? (
            <div className="nf" data-variant="reviewer"><NativeControl element={q.department} runtime={runtime} label={q.department.title || "Department"} /></div>
          ) : null}
        </div>
        <div className="pna-head-label">YEAR</div>
        <div className="pna-head-value">
          {year ? (
            <div className="nf" data-variant="reviewer"><NativeControl element={year} runtime={runtime} label={year.title || "Year"} /></div>
          ) : (
            <span><b>{new Date().getFullYear()}</b> <span className="pna-hint">· filled in for you</span></span>
          )}
        </div>
      </div>

      {visible(q.table) ? <NeedsTable table={q.table} runtime={runtime} disabled={disabled} /> : null}

      {others.length > 0 ? (
        <div className="nf pna-others" data-variant="reviewer">
          {others.map((el) => <NativeField key={el.id} element={el} runtime={runtime} />)}
        </div>
      ) : null}

      <div className="pna-signoff">
        <div className="pna-signoff-col">
          <div className="pna-caption">Prepared by HOD:</div>
          {visible(q.signature) ? (
            <div className="pna-sign">
              <div className="nf" data-variant="reviewer"><NativeControl element={q.signature} runtime={runtime} label={q.signature.title || "Signature"} /></div>
            </div>
          ) : null}
          <div className="pna-line" id={q.name ? `field-${q.name.name}` : undefined}>
            <label htmlFor="pna-prepared-name">Name:</label>
            <input
              id="pna-prepared-name"
              className="pna-line-input"
              value={nameValue}
              readOnly={nameLocked}
              aria-readonly={nameLocked}
              disabled={disabled}
              placeholder="Type your name"
              onChange={(e) => q.name && runtime.setValue(q.name.name, e.target.value)}
            />
          </div>
          {q.designation ? (
            <div id={`field-${q.designation.name}`}>
              <div className="pna-line">
                <label htmlFor="pna-prepared-designation">Designation: <span className="pna-req">*</span></label>
                <input
                  id="pna-prepared-designation"
                  className="pna-line-input"
                  value={designationValue}
                  disabled={disabled}
                  aria-invalid={designationError ? true : undefined}
                  aria-describedby="pna-prepared-designation-note"
                  placeholder="Type your position"
                  onChange={(e) => designation && runtime.setValue(designation.name, e.target.value)}
                />
              </div>
              <div id="pna-prepared-designation-note" className={designationError ? "pna-error pna-line-note" : "pna-hint pna-line-note"} role={designationError ? "alert" : undefined}>
                {designationNote}
              </div>
            </div>
          ) : null}
          <div className="pna-line"><span>Date:</span><span className="pna-line-value">{todayPaperDate()}</span></div>
        </div>
        <div className="pna-signoff-col" data-later="true">
          <div className="pna-caption">{NEEDS_APPROVER_CAPTION}</div>
          <div className="pna-sign-later">Signed by the approver after you submit</div>
          <div className="pna-line"><span>Name:</span><span className="pna-line-value" /></div>
          <div className="pna-line"><span>Designation:</span><span className="pna-line-value" /></div>
          <div className="pna-line"><span>Date:</span><span className="pna-line-value" /></div>
        </div>
      </div>
    </div>
  );
}
