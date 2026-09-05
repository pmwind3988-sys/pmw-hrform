import { useCallback, useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import type { SurveyJson } from "../../types";
import { C } from "./constants";
import { acquireAccessTokenSilentOrRedirect } from "../../utils/authRecovery";
import { sharePointManageScope } from "../../utils/sharePointScope";
import { getPrefillEligibleFields } from "../../utils/prefilledQr";
import { generateQrWithLogo } from "../../utils/qrWithLogo";
import { editorial } from "../../theme/editorial";
import { flattenQuestions } from "../../utils/FormBuilderEngine";
import {
  createFormInstance,
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
  const [values, setValues] = useState<Record<string, string>>({});
  const [locked, setLocked] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);
  /** Which instance's QR is open, and the PNG behind it. */
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");

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

  const chosen = Object.entries(values).filter(([, v]) => v !== "");
  const lockedNames = chosen.map(([name]) => name).filter((name) => locked[name]);
  const routingLocked = lockedRoutingFields(lockedNames, layerConfig);
  const groupValue = groupByField ? (values[groupByField] ?? "") : "";
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

            <div style={{ display: "grid", gap: 8, maxHeight: 220, overflowY: "auto" }}>
              {fields.map((field) => (
                <div key={field.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flex: "0 0 150px", fontSize: 12.5, color: C.textSecond, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {field.title || field.name}
                    {field.name === groupByField && (
                      <span style={{ color: C.purple, fontWeight: 700 }}> · groups</span>
                    )}
                  </span>
                  <input
                    value={values[field.name] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                    style={{ ...inputSx, flex: 1, height: 30 }}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: C.textMuted }}>
                    <input
                      type="checkbox"
                      checked={Boolean(locked[field.name])}
                      onChange={(e) => setLocked((prev) => ({ ...prev, [field.name]: e.target.checked }))}
                    />
                    Lock
                  </label>
                </div>
              ))}
            </div>

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
                  : chosen.map(([name, value]) => (
                      <div key={name}>
                        {name}: {value}{locked[name] ? " (locked)" : ""}
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
                </div>
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
    </div>
  );
}
