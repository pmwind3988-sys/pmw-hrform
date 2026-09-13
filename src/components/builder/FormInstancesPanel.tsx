import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useMsal } from "@azure/msal-react";
import type { SurveyJson } from "../../types";
import { C } from "./constants";
import { acquireAccessTokenSilentOrRedirect } from "../../utils/authRecovery";
import { sharePointManageScope } from "../../utils/sharePointScope";
import { getPrefillEligibleFields } from "../../utils/prefilledQr";
import { generateQrWithLogo } from "../../utils/qrWithLogo";
import { editorial } from "../../theme/editorial";
import { flattenQuestions } from "../../utils/FormBuilderEngine";
import type { FormBuilderField } from "../../types";
import {
  createFormInstance,
  deleteFormInstance,
  listFormInstances,
  updateFormInstance,
} from "../../utils/formInstancesSP";
import {
  effectiveGroupValue,
  instanceState,
  lockedRoutingFields,
  type FormInstance,
} from "../../utils/formInstances";

interface FormInstancesPanelProps {
  open: boolean;
  onClose: () => void;
  form: { Title: string; Slug?: string };
  /** The field whose value groups this form's submissions; "" when it has none. */
  groupByField: string;
  /** This form's approval layers, so locked routing fields can be named. */
  layerConfig: unknown;
  surveyJson: SurveyJson | null;
  /** Origin serving this form — the builder can author for a second site. */
  appOrigin: string;
  siteUrl?: string;
}

const font = "var(--pmw-font-main)";

/** What the draft holds while the author is filling in a fixed answer. */
type DraftValue = string | string[] | boolean;

interface ChoiceOption {
  value: string;
  text: string;
}

function choiceOptions(field: FormBuilderField): ChoiceOption[] {
  if (!Array.isArray(field.choices)) return [];
  return field.choices.map((choice) => {
    if (typeof choice === "string") return { value: choice, text: choice };
    return { value: String(choice.value), text: String(choice.text || choice.value) };
  });
}

function isEmptyDraftValue(value: DraftValue | undefined): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "boolean") return false;
  return value.trim() === "";
}

/**
 * The draft value in the shape the form fill expects. Instances reuse the
 * prefilled-QR machinery, so a checkbox is an array, a boolean is a boolean,
 * and a number is a number — not the string a plain text box would have given.
 * `undefined` means the field is blank and should not become a fixed answer.
 */
function normalizeDraftValue(field: FormBuilderField, value: DraftValue | undefined): unknown | undefined {
  if (value === undefined || isEmptyDraftValue(value)) return undefined;
  if (field.type === "checkbox") {
    return Array.isArray(value) ? value : String(value).split(",").map((item) => item.trim()).filter(Boolean);
  }
  if (field.type === "boolean") return value === true || value === "true";
  if (field.inputType === "number" || ["number", "rating", "slider", "counter", "currency", "duration"].includes(field.type)) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  return value;
}

/** The native input type for a field with no choices of its own. */
function inputTypeForField(field: FormBuilderField): string {
  if (field.inputType === "date") return "date";
  if (field.inputType === "datetime-local") return "datetime-local";
  if (field.inputType === "number") return "number";
  return "text";
}

/** How a chosen value reads back on the confirmation screen. */
function displayDraftValue(value: DraftValue): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value;
}

/**
 * A stored closing date in the shape a date box wants (yyyy-mm-dd), in local
 * time — the same reading the list shows. An empty or unparseable date gives
 * an empty box, which reads as "runs until you close it".
 */
function dateInputValue(iso: string): string {
  const parsed = new Date(iso || "");
  if (Number.isNaN(parsed.getTime())) return "";
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${parsed.getFullYear()}-${month}-${day}`;
}

/**
 * A saved instance's fixed answers back in the shape the editor's boxes want.
 * Numbers come back as text because that is what an input holds; they are
 * normalised again on the way out, so the round trip is lossless.
 */
function draftFromPrefill(prefill: Record<string, unknown>): Record<string, DraftValue> {
  const draft: Record<string, DraftValue> = {};
  for (const [name, value] of Object.entries(prefill || {})) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) draft[name] = value.map((item) => String(item));
    else if (typeof value === "boolean") draft[name] = value;
    else draft[name] = String(value);
  }
  return draft;
}

function instanceUrl(appOrigin: string, slug: string, token: string): string {
  return `${appOrigin}/form/${slug}?instance=${token}`;
}

/**
 * Instances of a form: named runs with fixed answers, a window and a link.
 *
 * Beside Test runs and Prefilled QR rather than in its own corner of Admin,
 * because an instance belongs to a form and creating one means choosing its
 * fields — which is what the person in the builder already has in front of
 * them.
 *
 * The Prefilled QR panel stays. It is still right for a one-off link nobody
 * needs to trace; this is the tracked path, not a replacement.
 */
export default function FormInstancesPanel({
  open,
  onClose,
  form,
  groupByField,
  layerConfig,
  surveyJson,
  appOrigin,
  siteUrl,
}: FormInstancesPanelProps) {
  const { instance: msal, accounts } = useMsal();
  const [instances, setInstances] = useState<FormInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [requireSignIn, setRequireSignIn] = useState(true);
  const [values, setValues] = useState<Record<string, DraftValue>>({});
  const [locked, setLocked] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);
  /** Which instance's QR is open, and the PNG behind it. */
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  /** The instance awaiting a yes/no on deletion. */
  const [deleteTarget, setDeleteTarget] = useState<FormInstance | null>(null);
  /** Which instance's closing date is open for editing, and the date in the box. */
  const [dateFor, setDateFor] = useState<string | null>(null);
  const [dateDraft, setDateDraft] = useState("");
  /** Which published instance's fixed answers are open for editing, and the draft. */
  const [editFor, setEditFor] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, DraftValue>>({});
  const [editLocked, setEditLocked] = useState<Record<string, boolean>>({});

  const fields = getPrefillEligibleFields(surveyJson, flattenQuestions);

  const getToken = useCallback(
    () =>
      acquireAccessTokenSilentOrRedirect(msal, {
        scopes: [sharePointManageScope(siteUrl)],
        account: accounts[0],
      }),
    [msal, accounts, siteUrl],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError("");
      try {
        const token = await getToken();
        const rows = await listFormInstances(token, form.Title);
        if (!cancelled) setInstances(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load instances.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, form.Title, getToken]);

  const openQr = (id: string, url: string) => {
    if (qrFor === id) { setQrFor(null); setQrDataUrl(""); return; }
    setQrFor(id);
    setQrDataUrl("");
    generateQrWithLogo(url, {
      width: 320,
      margin: 2,
      dark: C.textPrimary,
      light: editorial.white,
      logoUrl: "/logo-128.png",
    })
      .then((dataUrl) => setQrDataUrl(dataUrl))
      // A QR that will not draw leaves the link, which still works. Better a
      // missing picture than a dialog that reports failure over a convenience.
      .catch(() => setQrDataUrl(""));
  };

  if (!open) return null;

  // Only fields with a real value become fixed answers, each normalised to the
  // shape the form fill expects (array for a checkbox, boolean, number, …).
  const chosenFrom = (draftValues: Record<string, DraftValue>) =>
    fields
      .map((field) => [field.name, normalizeDraftValue(field, draftValues[field.name])] as const)
      .filter((entry): entry is readonly [string, unknown] => entry[1] !== undefined);
  const lockedNamesOf = (
    entries: ReadonlyArray<readonly [string, unknown]>,
    lockedMap: Record<string, boolean>,
  ) => entries.map(([name]) => name).filter((name) => lockedMap[name]);
  const groupValueOf = (entries: ReadonlyArray<readonly [string, unknown]>) => {
    if (!groupByField) return "";
    const raw = entries.find(([name]) => name === groupByField)?.[1];
    return raw === undefined || raw === null ? "" : String(raw);
  };

  const chosen = chosenFrom(values);
  const lockedNames = lockedNamesOf(chosen, locked);
  const routingLocked = lockedRoutingFields(lockedNames, layerConfig);
  const groupValue = groupValueOf(chosen);
  const duplicateGroup = Boolean(
    groupValue &&
      instances.some((i) => effectiveGroupValue(i, groupByField) === groupValue.trim()),
  );

  const resetDraft = () => {
    setTitle("");
    setExpiresAt("");
    setRequireSignIn(true);
    setValues({});
    setLocked({});
    setConfirming(false);
  };

  const create = async () => {
    setBusyId("new");
    setError("");
    try {
      const token = await getToken();
      const created = await createFormInstance(token, {
        title: title.trim(),
        formTitle: form.Title,
        formSlug: form.Slug || "",
        prefill: Object.fromEntries(chosen),
        lockedFields: lockedNames,
        groupValue,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : "",
        requireSignIn,
        createdBy: accounts[0]?.username || "",
      });
      setInstances((prev) => [created, ...prev]);
      setCreating(false);
      resetDraft();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the instance.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row: FormInstance) => {
    setBusyId(row.id);
    setError("");
    try {
      const token = await getToken();
      await deleteFormInstance(token, row.id);
      setInstances((prev) => prev.filter((i) => i.id !== row.id));
      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the instance.");
    } finally {
      setBusyId(null);
    }
  };

  const setStatus = async (row: FormInstance, status: "open" | "closed") => {
    setBusyId(row.id);
    setError("");
    try {
      const token = await getToken();
      await updateFormInstance(token, row.id, { status });
      setInstances((prev) => prev.map((i) => (i.id === row.id ? { ...i, status } : i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the instance.");
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Moves an instance's closing date — later, earlier, or away entirely.
   *
   * An expired instance reopens the moment the new date is in the future,
   * because the state is read from the date rather than stored. One closed by
   * hand stays closed: that was a decision, and a new date should not undo it.
   */
  const saveExpiry = async (row: FormInstance) => {
    const expiresAt = dateDraft ? new Date(dateDraft).toISOString() : "";
    setBusyId(row.id);
    setError("");
    try {
      const token = await getToken();
      await updateFormInstance(token, row.id, { expiresAt });
      setInstances((prev) => prev.map((i) => (i.id === row.id ? { ...i, expiresAt } : i)));
      setDateFor(null);
      setDateDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the closing date.");
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Rewrites a published instance's fixed answers.
   *
   * Responses already submitted keep exactly what they were submitted with —
   * the answers are copied onto each response as it arrives, not read back
   * from here. The change applies to everyone who opens the link from now on.
   */
  const saveFields = async (row: FormInstance) => {
    const entries = chosenFrom(editValues);
    const prefill = Object.fromEntries(entries);
    const lockedForRow = lockedNamesOf(entries, editLocked);
    const nextGroup = groupValueOf(entries);
    setBusyId(row.id);
    setError("");
    try {
      const token = await getToken();
      await updateFormInstance(token, row.id, {
        prefill,
        lockedFields: lockedForRow,
        groupValue: nextGroup,
      });
      setInstances((prev) =>
        prev.map((i) =>
          i.id === row.id ? { ...i, prefill, lockedFields: lockedForRow, groupValue: nextGroup } : i,
        ),
      );
      setEditFor(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the fixed answers.");
    } finally {
      setBusyId(null);
    }
  };

  const labelSx = { fontSize: 11.5, fontWeight: 700, color: C.textPrimary, display: "block", marginBottom: 4 };
  const inputSx = {
    width: "100%",
    boxSizing: "border-box" as const,
    height: 34,
    padding: "0 10px",
    borderRadius: 7,
    border: `1px solid ${C.border}`,
    fontSize: 13.5,
    fontFamily: font,
  };

  /**
   * The fixed-answers grid. Shared by the new-instance draft and the editor on
   * a published instance so the two cannot drift apart — the same controls,
   * the same locking, the same reading of which field groups.
   */
  const renderFixedAnswers = (
    draftValues: Record<string, DraftValue>,
    setDraftValues: Dispatch<SetStateAction<Record<string, DraftValue>>>,
    lockedMap: Record<string, boolean>,
    setLockedMap: Dispatch<SetStateAction<Record<string, boolean>>>,
  ) => (
        <div style={{ display: "grid", gap: 8, maxHeight: 220, overflowY: "auto" }}>
          {fields.map((field) => {
            const draft = draftValues[field.name];
            const options = choiceOptions(field);
            const setDraft = (value: DraftValue) =>
              setDraftValues((prev) => ({ ...prev, [field.name]: value }));
            const controlSx = { ...inputSx, flex: 1, height: 30 };
            let control;
            if (field.type === "checkbox" && options.length > 0) {
              const selected = Array.isArray(draft) ? draft : [];
              control = (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  {options.map((option) => (
                    <label key={option.value} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.textSecond }}>
                      <input
                        type="checkbox"
                        checked={selected.includes(option.value)}
                        onChange={(e) =>
                          setDraft(
                            e.target.checked
                              ? [...selected, option.value]
                              : selected.filter((v) => v !== option.value),
                          )
                        }
                      />
                      {option.text}
                    </label>
                  ))}
                </div>
              );
            } else if (options.length > 0) {
              control = (
                <select
                  value={typeof draft === "string" ? draft : ""}
                  onChange={(e) => setDraft(e.target.value)}
                  style={{ ...controlSx, padding: "0 8px" }}
                >
                  <option value="">Leave blank</option>
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>{option.text}</option>
                  ))}
                </select>
              );
            } else if (field.type === "boolean") {
              control = (
                <select
                  value={draft === true ? "true" : draft === false ? "false" : ""}
                  onChange={(e) => setDraft(e.target.value === "true")}
                  style={{ ...controlSx, padding: "0 8px" }}
                >
                  <option value="">Leave blank</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              );
            } else if (field.type === "comment") {
              control = (
                <textarea
                  value={typeof draft === "string" ? draft : ""}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                  style={{ ...controlSx, height: "auto", padding: "6px 10px", resize: "vertical", fontFamily: font }}
                />
              );
            } else {
              control = (
                <input
                  type={inputTypeForField(field)}
                  value={typeof draft === "string" ? draft : ""}
                  onChange={(e) => setDraft(e.target.value)}
                  style={controlSx}
                />
              );
            }
            return (
              <div key={field.name} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ flex: "0 0 150px", fontSize: 12.5, color: C.textSecond, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingTop: 7 }}>
                  {field.title || field.name}
                  {field.name === groupByField && (
                    <span style={{ color: C.purple, fontWeight: 700 }}> · groups</span>
                  )}
                </span>
                {control}
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: C.textMuted, paddingTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(lockedMap[field.name])}
                    onChange={(e) => setLockedMap((prev) => ({ ...prev, [field.name]: e.target.checked }))}
                  />
                  Lock
                </label>
              </div>
            );
          })}
        </div>
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(17,24,39,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.white,
          borderRadius: 12,
          width: 640,
          maxWidth: "100%",
          maxHeight: "86vh",
          overflowY: "auto",
          padding: 22,
          fontFamily: font,
          boxShadow: "0 20px 48px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary }}>Instances</div>
            <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 3, lineHeight: 1.5 }}>
              Named runs of "{form.Title}" — a training event, an induction. Each has its own link
              and closing date, and its answers stay findable afterwards.
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMuted, fontSize: 13.5 }}>
            Close
          </button>
        </div>

        {!groupByField && (
          <div style={{ marginTop: 14, fontSize: 12.5, lineHeight: 1.5, color: C.amber, background: C.amberPale, borderRadius: 7, padding: "9px 11px" }}>
            This form has no grouping field set, so its submissions will not be gathered under an
            instance in All Submissions. Instances still work; they just will not group.
          </div>
        )}

        {error && (
          <div style={{ marginTop: 14, fontSize: 12.5, color: C.red, background: C.redPale, borderRadius: 7, padding: "9px 11px" }}>
            {error}
          </div>
        )}

        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            disabled={!form.Slug}
            title={form.Slug ? undefined : "Publish this form before creating an instance."}
            style={{
              marginTop: 16,
              height: 34,
              padding: "0 14px",
              border: "none",
              borderRadius: 8,
              background: form.Slug ? C.purple : C.border,
              color: C.white,
              fontSize: 13,
              fontWeight: 600,
              cursor: form.Slug ? "pointer" : "not-allowed",
            }}
          >
            New instance
          </button>
        )}

        {creating && !confirming && (
          <div style={{ marginTop: 16, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
            <label style={labelSx}>Name</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Fire Safety Briefing, March 2026"
              style={inputSx}
            />

            <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelSx}>Closes on</label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  style={inputSx}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelSx}>Who can fill it in</label>
                <select
                  value={requireSignIn ? "signed" : "anyone"}
                  onChange={(e) => setRequireSignIn(e.target.value === "signed")}
                  style={{ ...inputSx, padding: "0 8px" }}
                >
                  <option value="signed">Signed-in staff only</option>
                  <option value="anyone">Anyone with the link</option>
                </select>
              </div>
            </div>

            <div style={{ ...labelSx, marginTop: 14 }}>Fixed answers</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8, lineHeight: 1.5 }}>
              Leave a field blank to let the respondent answer it. Lock one to stop them changing
              what you set.
            </div>

            {renderFixedAnswers(values, setValues, locked, setLocked)}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button type="button" onClick={() => { setCreating(false); resetDraft(); }} style={{ height: 32, padding: "0 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.textSecond, fontSize: 12.5, cursor: "pointer" }}>
                Cancel
              </button>
              <button
                type="button"
                disabled={!title.trim()}
                onClick={() => setConfirming(true)}
                style={{ height: 32, padding: "0 14px", borderRadius: 8, border: "none", background: title.trim() ? C.purple : C.border, color: C.white, fontSize: 12.5, fontWeight: 600, cursor: title.trim() ? "pointer" : "not-allowed" }}
              >
                Review
              </button>
            </div>
          </div>
        )}

        {creating && confirming && (
          /**
           * The last cheap moment. Once a QR is printed, fixing a mistake means
           * reprinting it — so the whole thing is read back before it is made.
           */
          <div style={{ marginTop: 16, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.textPrimary }}>Check before creating</div>
            <div style={{ fontSize: 12.5, color: C.textSecond, marginTop: 8, lineHeight: 1.6 }}>
              <div><strong>{title}</strong></div>
              <div>{expiresAt ? `Closes ${expiresAt}` : "No closing date — runs until you close it"}</div>
              <div>{requireSignIn ? "Signed-in staff only" : "Anyone with the link"}</div>
              <div style={{ marginTop: 6 }}>
                {chosen.length === 0
                  ? "No fixed answers."
                  : chosen.map(([name]) => (
                      <div key={name}>
                        {name}: {displayDraftValue(values[name])}{locked[name] ? " (locked)" : ""}
                      </div>
                    ))}
              </div>
            </div>

            {!requireSignIn && (
              <div style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.5, color: C.red, background: C.redPale, borderRadius: 7, padding: "9px 11px" }}>
                Anyone holding this link can submit "{form.Title}" without signing in. This is
                recorded against your account.
              </div>
            )}

            {routingLocked.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.5, color: C.amber, background: C.amberPale, borderRadius: 7, padding: "9px 11px" }}>
                This form's approval routing reads {routingLocked.join(", ")}, and you have locked
                {routingLocked.length === 1 ? " it" : " them"}. Every response in this instance will
                go to the same approver, decided now rather than by the person filling it in.
              </div>
            )}

            {duplicateGroup && (
              <div style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.5, color: C.amber, background: C.amberPale, borderRadius: 7, padding: "9px 11px" }}>
                Another instance already uses "{groupValue}". They will share one group in All
                Submissions.
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button type="button" onClick={() => setConfirming(false)} style={{ height: 32, padding: "0 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.textSecond, fontSize: 12.5, cursor: "pointer" }}>
                Back
              </button>
              <button
                type="button"
                disabled={busyId === "new"}
                onClick={() => void create()}
                style={{ height: 32, padding: "0 14px", borderRadius: 8, border: "none", background: C.purple, color: C.white, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
              >
                {busyId === "new" ? "Creating…" : "Create instance"}
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          {loading && <div style={{ fontSize: 12.5, color: C.textMuted }}>Loading instances…</div>}
          {!loading && instances.length === 0 && (
            <div style={{ fontSize: 12.5, color: C.textMuted }}>No instances yet.</div>
          )}
          {instances.map((row) => {
            const state = instanceState(row);
            const url = instanceUrl(appOrigin, row.formSlug || form.Slug || "", row.token);
            return (
              <div key={row.id} style={{ borderTop: `1px solid ${C.border}`, padding: "11px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: state === "open" ? C.green : C.textMuted }}>
                    {state}
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: C.textPrimary, flex: 1, minWidth: 0 }}>
                    {row.title}
                  </span>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void setStatus(row, row.status === "closed" ? "open" : "closed")}
                    style={{ height: 28, padding: "0 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.white, color: C.textSecond, fontSize: 11.5, cursor: "pointer" }}
                  >
                    {row.status === "closed" ? "Reopen" : "Close"}
                  </button>
                  <button
                    type="button"
                    aria-expanded={dateFor === row.id}
                    onClick={() => {
                      if (dateFor === row.id) { setDateFor(null); setDateDraft(""); return; }
                      setDateFor(row.id);
                      setDateDraft(dateInputValue(row.expiresAt));
                    }}
                    style={{ height: 28, padding: "0 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: dateFor === row.id ? C.purplePale : C.white, color: C.textSecond, fontSize: 11.5, cursor: "pointer" }}
                  >
                    {row.expiresAt ? "Extend" : "Set date"}
                  </button>
                  <button
                    type="button"
                    aria-expanded={editFor === row.id}
                    onClick={() => {
                      if (editFor === row.id) { setEditFor(null); return; }
                      setEditFor(row.id);
                      setEditValues(draftFromPrefill(row.prefill));
                      setEditLocked(Object.fromEntries(row.lockedFields.map((name) => [name, true])));
                    }}
                    style={{ height: 28, padding: "0 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: editFor === row.id ? C.purplePale : C.white, color: C.textSecond, fontSize: 11.5, cursor: "pointer" }}
                  >
                    Edit answers
                  </button>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard?.writeText(url)}
                    style={{ height: 28, padding: "0 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.white, color: C.textSecond, fontSize: 11.5, cursor: "pointer" }}
                  >
                    Copy link
                  </button>
                  <button
                    type="button"
                    aria-expanded={qrFor === row.id}
                    onClick={() => openQr(row.id, url)}
                    style={{ height: 28, padding: "0 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: qrFor === row.id ? C.purplePale : C.white, color: C.textSecond, fontSize: 11.5, cursor: "pointer" }}
                  >
                    QR
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(row)}
                    style={{ height: 28, padding: "0 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.white, color: C.red, fontSize: 11.5, cursor: "pointer" }}
                  >
                    Delete
                  </button>
                </div>
                {dateFor === row.id && (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <input
                      type="date"
                      value={dateDraft}
                      onChange={(e) => setDateDraft(e.target.value)}
                      aria-label={`New closing date for ${row.title}`}
                      style={{ ...inputSx, width: 170, height: 30 }}
                    />
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void saveExpiry(row)}
                      style={{ height: 30, padding: "0 12px", borderRadius: 7, border: "none", background: C.purple, color: C.white, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}
                    >
                      {busyId === row.id ? "Saving…" : "Save date"}
                    </button>
                    {dateDraft && (
                      <button
                        type="button"
                        onClick={() => setDateDraft("")}
                        style={{ height: 30, padding: "0 12px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.white, color: C.textSecond, fontSize: 11.5, cursor: "pointer" }}
                      >
                        No closing date
                      </button>
                    )}
                    {state === "expired" && dateDraft && new Date(dateDraft).getTime() > Date.now() && (
                      <span style={{ fontSize: 11.5, color: C.textMuted }}>
                        Saving this reopens the link.
                      </span>
                    )}
                    {row.status === "closed" && (
                      <span style={{ fontSize: 11.5, color: C.textMuted }}>
                        This instance was closed by hand — reopen it to start taking responses again.
                      </span>
                    )}
                  </div>
                )}
                {editFor === row.id && (() => {
                  const entries = chosenFrom(editValues);
                  const nextGroup = groupValueOf(entries);
                  const wasGroup = effectiveGroupValue(row, groupByField);
                  const groupMoved = Boolean(groupByField) && nextGroup.trim() !== wasGroup;
                  const nowLocked = lockedNamesOf(entries, editLocked);
                  const nowRoutingLocked = lockedRoutingFields(nowLocked, layerConfig);
                  return (
                    <div style={{ marginTop: 10, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
                      <div style={labelSx}>Fixed answers</div>
                      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8, lineHeight: 1.5 }}>
                        Changes apply to everyone who opens the link from now on. Responses already
                        submitted keep the answers they were submitted with.
                      </div>
                      {renderFixedAnswers(editValues, setEditValues, editLocked, setEditLocked)}
                      {nowRoutingLocked.length > 0 && (
                        <div style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.5, color: C.amber, background: C.amberPale, borderRadius: 7, padding: "9px 11px" }}>
                          This form's approval routing reads {nowRoutingLocked.join(", ")}, and you have
                          locked {nowRoutingLocked.length === 1 ? "it" : "them"}. New responses in this
                          instance all go to the same approver.
                        </div>
                      )}
                      {groupMoved && (
                        <div style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.5, color: C.amber, background: C.amberPale, borderRadius: 7, padding: "9px 11px" }}>
                          {wasGroup
                            ? `This changes the grouping answer from "${wasGroup}" to ${nextGroup.trim() ? `"${nextGroup}"` : "blank"}. Responses already in stay under "${wasGroup}", so this instance will show up under both in All Submissions.`
                            : `This instance will start grouping as "${nextGroup}". Responses already in stay ungrouped.`}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                        <button
                          type="button"
                          onClick={() => setEditFor(null)}
                          style={{ height: 30, padding: "0 12px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.white, color: C.textSecond, fontSize: 11.5, cursor: "pointer" }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void saveFields(row)}
                          style={{ height: 30, padding: "0 12px", borderRadius: 7, border: "none", background: C.purple, color: C.white, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}
                        >
                          {busyId === row.id ? "Saving…" : "Save answers"}
                        </button>
                      </div>
                    </div>
                  );
                })()}
                <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 4, wordBreak: "break-all" }}>
                  {url}
                </div>
                {qrFor === row.id && (
                  <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12 }}>
                    {qrDataUrl ? (
                      <>
                        <img
                          src={qrDataUrl}
                          alt={`QR code linking to ${row.title}`}
                          style={{ width: 128, height: 128, borderRadius: 8, border: `1px solid ${C.border}` }}
                        />
                        <div style={{ display: "grid", gap: 6 }}>
                          <a
                            href={qrDataUrl}
                            download={`${row.formSlug || form.Slug || "form"}-${row.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-qr.png`}
                            style={{ minHeight: 30, padding: "0 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.textSecond, fontSize: 11.5, fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
                          >
                            Download PNG
                          </a>
                          <button
                            type="button"
                            onClick={() => void navigator.clipboard?.writeText(url)}
                            style={{ minHeight: 30, padding: "0 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.textSecond, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
                          >
                            Copy link
                          </button>
                        </div>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: C.textMuted }}>Drawing the QR code…</span>
                    )}
                  </div>
                )}
                <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 2 }}>
                  {row.expiresAt ? `Closes ${new Date(row.expiresAt).toLocaleDateString()}` : "No closing date"}
                  {row.requireSignIn ? " · signed-in only" : " · open link"}
                  {(() => {
                    const value = effectiveGroupValue(row, groupByField);
                    return value ? ` · groups as "${value}"` : "";
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {deleteTarget && (
        /*
          Yes/no, never a typed confirmation. What is at stake is said plainly:
          the responses survive, because they group by a field value rather than
          by the instance — what goes is the link, its window, and the record of
          which link each response arrived through.
        */
        <div
          onClick={(e) => { e.stopPropagation(); setDeleteTarget(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(17,24,39,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: C.white, borderRadius: 12, width: 420, maxWidth: "100%", padding: 20, fontFamily: font, boxShadow: "0 20px 48px rgba(0,0,0,0.28)" }}
          >
            <div style={{ fontSize: 14.5, fontWeight: 700, color: C.textPrimary }}>
              Delete "{deleteTarget.title}"?
            </div>
            <p style={{ fontSize: 12.5, color: C.textSecond, lineHeight: 1.6, marginTop: 8 }}>
              Its link and QR code stop working straight away. The responses already
              submitted through it are kept and stay grouped as before — what is lost is
              the record of which link each one came through. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                style={{ height: 32, padding: "0 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.textSecond, fontSize: 12.5, cursor: "pointer" }}
              >
                No, keep it
              </button>
              <button
                type="button"
                disabled={busyId === deleteTarget.id}
                onClick={() => void remove(deleteTarget)}
                style={{ height: 32, padding: "0 14px", borderRadius: 8, border: "none", background: C.red, color: C.white, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
              >
                {busyId === deleteTarget.id ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
