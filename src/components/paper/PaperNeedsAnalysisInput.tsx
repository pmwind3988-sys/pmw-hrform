/**
 * PaperNeedsAnalysisInput.tsx — The Training Needs Analysis filled in as HR's
 * Word form (Training Needs Analysis.docx), not as the standard card form:
 *
 *   COMPANY  ☐ … ☐ …           (tick one)
 *   DEPARTMENT | ______ | YEAR | ____
 *   No | Emp. ID | Name | Training Needs | Current / Required Skill Level |
 *      Priority | Relevancy to job function | Tentative Date
 *      (a row is one training; Emp. ID + Name take a line per person)
 *   Prepared by HOD: signature, Name, Designation, Date | Approved by GHRH: (later)
 *
 * It writes to the same `NativeFormRuntime` the standard form uses, so
 * validation, the answered count and submission are unchanged — the same
 * pattern as PaperPartTwoInput. On a phone the table becomes one card per
 * person (paper-needs-analysis.css).
 */
import { useEffect, useRef, useState } from "react";
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
  needsPeopleColumns,
} from "../../utils/paperPdf/trainingNeedsAnalysisLayout";
import { isEmptyNeedsRow, removeNeedsRow, shownNeedsRowCount, writeNeedsCell, writeNeedsCells, type NeedsRow } from "./needsAnalysisRows";
import { readSchedule, scheduleColumns, scheduleProblem, scheduleValues, formatSchedule, type ScheduleColumns } from "../../utils/paperPdf/needsSchedule";
import { NEEDS_YEAR, needsYearAnswer } from "../../utils/paperPdf/needsYear";
import { chunkPeople, joinPeople, peopleProblem, readPeople, singleLine, tidyPeople, type NeedsPerson } from "../../utils/paperPdf/needsPeople";

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

/**
 * The answers to submit: no blank rows left between filled ones, no blank
 * lines among a row's people, Training Needs on one line, and a row with more
 * people than its SharePoint columns hold saved as two rows of that training.
 */
export function compactNeedsAnswers(form: NativeForm, values: Record<string, unknown>): Record<string, unknown> {
  const { table, year } = needsAnalysisQuestions(form);
  // The year is fixed, so that is what a Year question submits — a simulated test run can reach here still holding its sample text.
  if (year) values = { ...values, [year.name]: needsYearAnswer(year.inputType) };
  const rows = table ? values[table.name] : undefined;
  if (!table || !Array.isArray(rows)) return values;
  const cols = needsPeopleColumns(table.columns);
  const kept = (rows as NeedsRow[]).filter((row) => !isEmptyNeedsRow(row)).flatMap((row) => {
    const next: NeedsRow = { ...row };
    const need = cols.need ? next[cols.need.name] : undefined;
    if (cols.need && typeof need === "string") next[cols.need.name] = singleLine(need).trim();
    if (!cols.id && !cols.name) return [next];
    const people = tidyPeople(readPeople(cols.id ? row[cols.id.name] : undefined, cols.name ? row[cols.name.name] : undefined));
    const groups = people.length > 0 ? chunkPeople(people) : [[]];
    return groups.map((group) => {
      const out: NeedsRow = { ...next };
      const joined = joinPeople(group);
      if (cols.id) { if (joined.id.trim()) out[cols.id.name] = joined.id; else delete out[cols.id.name]; }
      if (cols.name) { if (joined.name.trim()) out[cols.name.name] = joined.name; else delete out[cols.name.name]; }
      return out;
    });
  });
  return { ...values, [table.name]: kept };
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

function Cell({ column, value, label, wide, oneLine = false, disabled, onChange }: { column: NativeColumn; value: unknown; label: string; wide: boolean; oneLine?: boolean; disabled: boolean; onChange: (next: unknown) => void }) {
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
  if (oneLine) {
    // One training per row: the box wraps a long title but takes no line break, typed or pasted.
    return (
      <>
        <textarea
          className="pna-cell"
          rows={2}
          aria-label={label}
          value={text}
          disabled={disabled}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          onChange={(e) => onChange(singleLine(e.target.value))}
        />
        {!disabled ? <div className="pna-cell-hint">One training per row</div> : null}
      </>
    );
  }
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

/**
 * Rows that cannot be submitted yet, as 1-based row numbers: a tentative date
 * started but not complete, or a line of several people with an Emp. ID and
 * no name (or the reverse). Each row says what is missing in its own box.
 */
export function unfinishedNeedsRows(form: NativeForm, values: Record<string, unknown>): number[] {
  const { table } = needsAnalysisQuestions(form);
  const rows = table ? values[table.name] : undefined;
  if (!table || !Array.isArray(rows)) return [];
  const schedule = scheduleColumns(table.columns);
  const people = needsPeopleColumns(table.columns);
  return (rows as NeedsRow[]).flatMap((row, i) => {
    if (isEmptyNeedsRow(row)) return [];
    const scheduleOpen = Boolean(schedule.days) && scheduleProblem(readSchedule(row, schedule)) !== "";
    const peopleOpen = Boolean(people.id && people.name) && peopleProblem(readPeople(row[people.id?.name ?? ""], row[people.name?.name ?? ""])) !== "";
    return scheduleOpen || peopleOpen ? [i + 1] : [];
  });
}

/**
 * The Emp. ID and Name boxes of one row, drawn as one: a line per person, the
 * ID beside its name, so several people can share a row's training. Enter in
 * a name starts the next person.
 */
function PeopleCell({ people, lineKey, label, idShare, disabled, onChange, onFocusLine }: {
  people: NeedsPerson[];
  /** Identifies this row's lines for moving the cursor: `${lineKey}-${line}`. */
  lineKey: string;
  label: string;
  /** How much of the box the Emp. ID takes, as a percentage: the two columns' own widths. */
  idShare: number;
  disabled: boolean;
  onChange: (next: NeedsPerson[]) => void;
  onFocusLine: (line: number) => void;
}) {
  const set = (line: number, patch: Partial<NeedsPerson>) => onChange(people.map((p, i) => (i === line ? { ...p, ...patch } : p)));
  const blank = (p: NeedsPerson) => p.id.trim() === "" && p.name.trim() === "";
  const lastBlank = blank(people[people.length - 1]);
  const count = tidyPeople(people).length;
  const problem = peopleProblem(people);
  const add = () => {
    if (lastBlank) return;
    onChange([...people, { id: "", name: "" }]);
    onFocusLine(people.length);
  };
  return (
    <div className="pna-people" role="group" aria-label={label} style={{ ["--pna-id-share" as string]: `${idShare}%` }}>
      {people.map((person, line) => (
        <div className="pna-person" key={line}>
          <input
            className="pna-cell pna-person-id"
            type="text"
            data-pna-line={`${lineKey}-${line}`}
            aria-label={`${label}: Emp. ID, line ${line + 1}`}
            value={person.id}
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              (e.currentTarget.nextElementSibling as HTMLElement | null)?.focus();
            }}
            onChange={(e) => set(line, { id: singleLine(e.target.value) })}
          />
          <textarea
            className="pna-cell pna-person-name"
            rows={1}
            aria-label={`${label}: Name, line ${line + 1}`}
            value={person.name}
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (line === people.length - 1) add();
              else onFocusLine(line + 1);
            }}
            onChange={(e) => set(line, { name: singleLine(e.target.value) })}
          />
          {!disabled && people.length > 1 ? (
            <button
              type="button"
              className="pna-person-remove"
              aria-label={`Remove ${person.name.trim() || person.id.trim() || `line ${line + 1}`}`}
              onClick={() => onChange(people.filter((_, i) => i !== line))}
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </div>
      ))}
      {!disabled ? (
        <div className="pna-people-foot">
          <button type="button" className="pna-add-person" disabled={lastBlank} onClick={add}>+ Add person</button>
          {count > 1 ? <span>{count} people</span> : null}
        </div>
      ) : null}
      {problem ? <div className="pna-sched-note pna-people-note" data-tone="error">{problem}</div> : null}
    </div>
  );
}

/**
 * The Tentative Date box: the date and how many back-to-back days. The form
 * no longer asks a time, so a row written here keeps no start or end.
 */
function ScheduleCell({ row, cols, label, disabled, onWrite }: { row: NeedsRow | undefined; cols: ScheduleColumns<NativeColumn>; label: string; disabled: boolean; onWrite: (cells: NeedsRow) => void }) {
  const input = { ...readSchedule(row, cols), from: "", to: "" };
  const write = (next: { firstDay: string; days: number | null }) => {
    const v = scheduleValues(next);
    const cells: NeedsRow = {};
    if (cols.firstDay) cells[cols.firstDay.name] = v.firstDay || undefined;
    if (cols.start) cells[cols.start.name] = undefined;
    if (cols.end) cells[cols.end.name] = undefined;
    if (cols.days) cells[cols.days.name] = v.days ?? undefined;
    onWrite(cells);
  };
  const problem = scheduleProblem(input);
  const summary = problem ? "" : formatSchedule(input);
  return (
    <div className="pna-sched" role="group" aria-label={label}>
      <label className="pna-sched-line">
        <span>Date</span>
        <input
          type="date"
          value={input.firstDay}
          disabled={disabled}
          aria-label={`${label}: date`}
          // Picking a date with no length yet means a one-day course until told otherwise.
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
  // On screen the Tentative Date box holds two inputs and what they work out to, so it gets more room than the printout's one line.
  const columns = matchNeedsColumns(table.columns)
    .filter((c): c is { label: string; width: number; column: NativeColumn } => Boolean(c.column))
    .map((c) => (hasSchedule && c.column === schedule.firstDay ? { ...c, width: 18 } : c));
  const total = columns.reduce((sum, c) => sum + c.width, 0) || 1;
  // Emp. ID and Name side by side are filled in as one box, a line per person.
  const people = needsPeopleColumns(table.columns);
  const idAt = columns.findIndex((c) => c.column === people.id);
  const paired = idAt >= 0 && columns[idAt + 1]?.column === people.name;
  const peopleOf = (row: NeedsRow | undefined) => readPeople(row?.[people.id?.name ?? ""], row?.[people.name?.name ?? ""]);
  const headcount = paired ? rows.reduce((sum, row) => sum + tidyPeople(peopleOf(row)).length, 0) : 0;
  // The line to put the cursor on once it is drawn (after Enter or "+ Add person").
  const focusLine = useRef<string | null>(null);
  useEffect(() => {
    if (!focusLine.current) return;
    document.querySelector<HTMLElement>(`[data-pna-line="${focusLine.current}"]`)?.focus();
    focusLine.current = null;
  });
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
                  {columns.map((c, at) => (paired && at === idAt + 1 ? null : paired && at === idAt ? (
                    <td key={c.column.name} colSpan={2} data-label="Emp. ID / Name">
                      <PeopleCell
                        people={peopleOf(row)}
                        lineKey={`${table.name}-${r}`}
                        label={`People, row ${r + 1}`}
                        idShare={(c.width / (c.width + columns[at + 1].width)) * 100}
                        disabled={disabled}
                        onChange={(next) => {
                          const joined = joinPeople(next);
                          runtime.setValue(table.name, writeNeedsCells(rows, r, {
                            [c.column.name]: joined.id || undefined,
                            [columns[at + 1].column.name]: joined.name || undefined,
                          }));
                        }}
                        onFocusLine={(line) => { focusLine.current = `${table.name}-${r}-${line}`; }}
                      />
                    </td>
                  ) : (
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
                        oneLine={c.column === people.need}
                        disabled={disabled}
                        onChange={(next) => runtime.setValue(table.name, writeNeedsCell(rows, r, c.column.name, next))}
                      />
                      )}
                    </td>
                  )))}
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
            {filled} of {count} rows filled{headcount > 0 ? ` · ${headcount} ${headcount === 1 ? "person" : "people"}` : ""}{table.maxRows > 0 ? ` · up to ${table.maxRows} rows` : ""} · empty rows are not submitted
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
  // The year is fixed (needsYear.ts): shown locked, and kept as the Year question's answer whatever was put there.
  const yearValue = year ? runtime.getValue(year.name) : undefined;
  const yearWrong = Boolean(year) && String(yearValue ?? "") !== String(NEEDS_YEAR);
  useEffect(() => {
    if (year && yearWrong && !disabled) runtime.setValue(year.name, needsYearAnswer(year.inputType));
  });

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
          <span id={year ? `field-${year.name}` : undefined}>
            <b>{NEEDS_YEAR}</b> <span className="pna-hint">· fixed for this form</span>
          </span>
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
