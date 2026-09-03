/**
 * DepartmentDirectoryPanel.tsx — manage the Department Approver Directory rows
 * that belong to one layer's approver role, from inside the publish profile.
 *
 * The layer already names the SharePoint list, the columns, and the role value
 * it looks up at runtime. This panel edits exactly the rows that lookup will
 * read: same list, same role, nothing else.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditIcon from "@mui/icons-material/Edit";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RefreshIcon from "@mui/icons-material/Refresh";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { C } from "./constants";
import {
  createDepartmentApproverEntry,
  deleteDepartmentApproverEntry,
  directoryKey,
  ensureDepartmentApproverDirectory,
  loadDepartmentApproverDirectory,
  updateDepartmentApproverEntry,
  validateDepartmentApproverEntry,
  type DepartmentApproverDirectory,
  type DepartmentApproverEntry,
  type DepartmentApproverEntryInput,
} from "../../utils/departmentApproverDirectory";
import { getDepartmentApproverLookupConfig } from "../../utils/departmentApproverLookup";
import type { DepartmentApproverLayerAssignee } from "../../types";

interface DepartmentDirectoryPanelProps {
  assignee: DepartmentApproverLayerAssignee;
  /** SharePoint access token from the builder. Read-only hint without it. */
  token?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMPTY_INPUT: DepartmentApproverEntryInput = { department: "", approverName: "", approverEmail: "" };

const field: React.CSSProperties = {
  width: "100%",
  height: 36,
  border: `1px solid ${C.border}`,
  borderRadius: 7,
  padding: "0 9px",
  fontSize: 12.5,
  color: C.textPrimary,
  background: C.white,
  fontFamily: "var(--pmw-font-main)",
};

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  color: C.textSecond,
  marginBottom: 3,
};

function actionBtn(tone: "primary" | "quiet" | "danger", disabled = false): React.CSSProperties {
  const palette = tone === "primary"
    ? { fg: C.white, bg: C.purple, bd: C.purple }
    : tone === "danger"
      ? { fg: C.red, bg: C.white, bd: "#F0C7C7" }
      : { fg: C.textSecond, bg: C.white, bd: C.border };
  return {
    minHeight: 32,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: "0 10px",
    borderRadius: 7,
    border: `1px solid ${disabled ? C.border : palette.bd}`,
    background: disabled ? C.offWhite : palette.bg,
    color: disabled ? C.textMuted : palette.fg,
    fontSize: 11.5,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "var(--pmw-font-main)",
    transition: "background-color .12s, border-color .12s, color .12s",
  };
}

function EntryForm({
  title,
  input,
  onChange,
  onSubmit,
  onCancel,
  saving,
  submitLabel,
}: {
  title: string;
  input: DepartmentApproverEntryInput;
  onChange: (next: DepartmentApproverEntryInput) => void;
  onSubmit: () => void;
  onCancel: () => void;
  saving: boolean;
  submitLabel: string;
}) {
  return (
    <form
      onSubmit={event => { event.preventDefault(); onSubmit(); }}
      style={{
        display: "grid",
        gap: 8,
        padding: "10px 10px 11px",
        borderRadius: 8,
        border: `1px solid ${C.purpleMid}`,
        background: C.purplePale,
      }}
    >
      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.purple }}>{title}</div>
      <label>
        <span style={fieldLabel}>Department</span>
        <input
          autoFocus
          value={input.department}
          onChange={event => onChange({ ...input, department: event.target.value })}
          placeholder="Exactly as submitted, e.g. Human Resources"
          disabled={saving}
          style={field}
        />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
        <label>
          <span style={fieldLabel}>Approver name</span>
          <input
            value={input.approverName}
            onChange={event => onChange({ ...input, approverName: event.target.value })}
            placeholder="Optional"
            disabled={saving}
            style={field}
          />
        </label>
        <label>
          <span style={fieldLabel}>Approver email</span>
          <input
            type="email"
            value={input.approverEmail}
            onChange={event => onChange({ ...input, approverEmail: event.target.value })}
            placeholder="name@company.com"
            disabled={saving}
            style={field}
          />
        </label>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 1 }}>
        <button type="submit" disabled={saving} style={{ ...actionBtn("primary", saving), flex: 1 }}>
          {saving ? "Saving…" : submitLabel}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} style={actionBtn("quiet", saving)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function DepartmentDirectoryPanel({ assignee, token }: DepartmentDirectoryPanelProps) {
  const config = getDepartmentApproverLookupConfig(assignee);
  const configKey = `${config.listName}|${config.departmentColumn}|${config.nameColumn}|${config.emailColumn}|${config.roleColumn}|${config.roleValue}`;
  const roleLabel = config.roleValue || "Approver";

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [directory, setDirectory] = useState<DepartmentApproverDirectory | null>(null);
  const [adding, setAdding] = useState<DepartmentApproverEntryInput | null>(null);
  const [editing, setEditing] = useState<{ id: number; input: DepartmentApproverEntryInput } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const entries = useMemo(() => directory?.entries ?? [], [directory]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError("");
    setConfirmDeleteId(null);
    try {
      setDirectory(await loadDepartmentApproverDirectory(token, assignee));
    } catch (error) {
      setDirectory(null);
      setLoadError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, configKey]); // eslint-disable-line react-hooks/exhaustive-deps -- assignee is read through configKey

  // Load on first open, and again whenever the list or role this panel points at
  // changes. Debounced so typing in the role or list field is one read, not one
  // read per keystroke.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => { void load(); }, 350);
    return () => clearTimeout(timer);
  }, [open, load]);

  const togglePanel = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setAdding(null);
    setEditing(null);
    setConfirmDeleteId(null);
    setNotice(null);
    setOpen(true);
  };

  const duplicateDepartments = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const entry of entries) {
      const key = directoryKey(entry.department);
      if (!key) continue;
      if (seen.has(key)) duplicates.add(key);
      seen.add(key);
    }
    return duplicates;
  }, [entries]);

  const runMutation = async (busyKey: string, action: () => Promise<void>, okText: string) => {
    if (!token) return;
    setBusy(busyKey);
    setNotice(null);
    try {
      await action();
      await load();
      setNotice({ tone: "ok", text: okText });
    } catch (error) {
      setNotice({ tone: "err", text: (error as Error).message });
    } finally {
      setBusy("");
    }
  };

  const submitNew = () => {
    if (!adding) return;
    const problem = validateDepartmentApproverEntry(adding, entries, roleLabel);
    if (problem) {
      setNotice({ tone: "err", text: problem });
      return;
    }
    void runMutation(
      "add",
      async () => {
        await createDepartmentApproverEntry(token!, assignee, adding);
        setAdding(null);
      },
      `Added ${roleLabel} for "${adding.department.trim()}".`,
    );
  };

  const submitEdit = () => {
    if (!editing) return;
    const problem = validateDepartmentApproverEntry(editing.input, entries, roleLabel, editing.id);
    if (problem) {
      setNotice({ tone: "err", text: problem });
      return;
    }
    void runMutation(
      `edit-${editing.id}`,
      async () => {
        await updateDepartmentApproverEntry(token!, assignee, editing.id, editing.input);
        setEditing(null);
      },
      `Updated ${roleLabel} for "${editing.input.department.trim()}".`,
    );
  };

  const removeEntry = (entry: DepartmentApproverEntry) => {
    void runMutation(
      `delete-${entry.id}`,
      async () => {
        await deleteDepartmentApproverEntry(token!, assignee, entry.id);
        setConfirmDeleteId(null);
      },
      `Removed ${entry.department || "entry"} from the directory.`,
    );
  };

  const provision = () => {
    void runMutation(
      "provision",
      () => ensureDepartmentApproverDirectory(token!, assignee),
      `"${config.listName}" is ready.`,
    );
  };

  const summary = !open
    ? `Add, edit, or remove the ${roleLabel} rows this layer reads`
    : loading
      ? "Reading SharePoint…"
      : directory?.exists === false
        ? "List not found in SharePoint"
        : `${entries.length} ${entries.length === 1 ? "department" : "departments"} mapped to ${roleLabel}`;

  return (
    <section style={{ borderTop: `1px solid ${C.border}`, paddingTop: 9, marginTop: 1 }}>
      <button
        type="button"
        onClick={togglePanel}
        aria-expanded={open}
        style={{
          width: "100%",
          minHeight: 38,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 2px",
          border: "none",
          background: "none",
          textAlign: "left",
          cursor: "pointer",
          fontFamily: "var(--pmw-font-main)",
        }}
      >
        <ExpandMoreIcon style={{
          fontSize: 17,
          color: C.textMuted,
          flexShrink: 0,
          transform: open ? "rotate(0deg)" : "rotate(-90deg)",
          transition: "transform .15s ease",
        }} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: C.textPrimary }}>
            {roleLabel} directory
          </span>
          <span style={{ display: "block", fontSize: 11, color: C.textSecond, lineHeight: 1.4 }}>
            {summary}
          </span>
        </span>
      </button>

      {open && (
        <div style={{ display: "grid", gap: 9, marginTop: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 11, color: C.textSecond, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {config.listName} · {config.roleColumn} = {config.roleValue || "any"}
            </span>
            <button
              type="button"
              onClick={() => void load()}
              disabled={!token || loading || !!busy}
              title="Re-read this role's rows from SharePoint"
              style={actionBtn("quiet", !token || loading || !!busy)}
            >
              <RefreshIcon style={{ fontSize: 13 }} /> {loading ? "Loading…" : "Refresh"}
            </button>
          </div>

          {!token && (
            <p style={{ fontSize: 11, color: C.amber, lineHeight: 1.5, margin: 0 }}>
              Waiting for the SharePoint session. Reopen this panel once the builder finishes signing in.
            </p>
          )}

          {loadError && (
            <div style={{ background: C.redPale, border: "1px solid #F0C7C7", borderRadius: 8, padding: "8px 9px", fontSize: 11, color: C.red, lineHeight: 1.5 }}>
              Could not read the directory: {loadError}
            </div>
          )}

          {notice && (
            <div style={{
              background: notice.tone === "ok" ? C.greenPale : C.redPale,
              border: `1px solid ${notice.tone === "ok" ? "#A7D7A7" : "#F0C7C7"}`,
              borderRadius: 8,
              padding: "8px 9px",
              fontSize: 11,
              color: notice.tone === "ok" ? C.green : C.red,
              lineHeight: 1.5,
              display: "flex",
              alignItems: "flex-start",
              gap: 6,
            }}>
              <span style={{ flex: 1 }}>{notice.text}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="Dismiss message"
                style={{ border: "none", background: "none", cursor: "pointer", color: "inherit", padding: 0, lineHeight: 1 }}
              >
                <CloseIcon style={{ fontSize: 13 }} />
              </button>
            </div>
          )}

          {token && directory && !directory.exists && (
            <div style={{ display: "grid", gap: 8, background: C.white, border: `1px dashed ${C.border}`, borderRadius: 8, padding: "11px 10px" }}>
              <p style={{ fontSize: 11.5, color: C.textSecond, lineHeight: 1.5, margin: 0 }}>
                SharePoint has no list named <strong>{config.listName}</strong>. Create it with the four
                columns this layer expects, then add the departments.
              </p>
              <button
                type="button"
                onClick={provision}
                disabled={busy === "provision"}
                style={actionBtn("primary", busy === "provision")}
              >
                {busy === "provision" ? "Creating…" : "Create the list in SharePoint"}
              </button>
            </div>
          )}

          {token && directory?.exists && directory.missingColumns.length > 0 && (
            <div style={{ display: "grid", gap: 8, background: C.amberPale, border: "1px solid #FDE68A", borderRadius: 8, padding: "9px 10px" }}>
              <p style={{ fontSize: 11, color: C.amber, lineHeight: 1.5, margin: 0, display: "flex", gap: 6 }}>
                <WarningAmberIcon style={{ fontSize: 14, flexShrink: 0 }} />
                <span>
                  {config.listName} has no <strong>{directory.missingColumns.join(", ")}</strong> column
                  {directory.missingColumns.length > 1 ? "s" : ""}. Approvals using this layer will fail until they exist.
                </span>
              </p>
              <button
                type="button"
                onClick={provision}
                disabled={busy === "provision"}
                style={actionBtn("primary", busy === "provision")}
              >
                {busy === "provision" ? "Adding…" : "Add the missing columns"}
              </button>
            </div>
          )}

          {token && directory?.exists && directory.missingColumns.length === 0 && (
            <>
              {entries.length === 0 && !adding && (
                <p style={{ fontSize: 11.5, color: C.textSecond, lineHeight: 1.5, margin: 0, background: C.white, border: `1px dashed ${C.border}`, borderRadius: 8, padding: "11px 10px" }}>
                  No {roleLabel} rows yet. Add one department per approver — the workflow matches the
                  submitted department against this list.
                </p>
              )}

              {entries.length > 0 && (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, background: C.white, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                  {entries.map((entry, index) => {
                    const isEditing = editing?.id === entry.id;
                    const duplicate = duplicateDepartments.has(directoryKey(entry.department));
                    const badEmail = !EMAIL_RE.test(entry.approverEmail);
                    return (
                      <li
                        key={entry.id}
                        style={{
                          padding: isEditing ? 8 : "9px 10px",
                          borderTop: index === 0 ? "none" : `1px solid ${C.borderLight}`,
                        }}
                      >
                        {isEditing ? (
                          <EntryForm
                            title={`Edit ${entry.department || "entry"}`}
                            input={editing.input}
                            onChange={input => setEditing({ id: entry.id, input })}
                            onSubmit={submitEdit}
                            onCancel={() => { setEditing(null); setNotice(null); }}
                            saving={busy === `edit-${entry.id}`}
                            submitLabel="Save changes"
                          />
                        ) : (
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.textPrimary, overflowWrap: "anywhere" }}>
                                {entry.department || <em style={{ color: C.amber, fontWeight: 600 }}>No department</em>}
                              </div>
                              <div style={{ fontSize: 11, color: C.textSecond, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                                {entry.approverName ? `${entry.approverName} · ` : ""}{entry.approverEmail || "No email"}
                              </div>
                              {(duplicate || badEmail) && (
                                <div style={{ fontSize: 11, color: C.amber, lineHeight: 1.5, marginTop: 2 }}>
                                  {duplicate
                                    ? `Two ${roleLabel} rows share this department — the workflow stops until one is removed.`
                                    : "This email is not valid, so the approval email cannot be sent."}
                                </div>
                              )}
                            </div>
                            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setNotice(null);
                                  setConfirmDeleteId(null);
                                  setAdding(null);
                                  setEditing({
                                    id: entry.id,
                                    input: {
                                      department: entry.department,
                                      approverName: entry.approverName,
                                      approverEmail: entry.approverEmail,
                                    },
                                  });
                                }}
                                disabled={!!busy}
                                title={`Edit ${entry.department}`}
                                style={{ ...actionBtn("quiet", !!busy), padding: "0 8px" }}
                              >
                                <EditIcon style={{ fontSize: 13 }} /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => { setNotice(null); setConfirmDeleteId(entry.id); }}
                                disabled={!!busy}
                                title={`Remove ${entry.department}`}
                                style={{ ...actionBtn("danger", !!busy), padding: "0 8px" }}
                              >
                                <DeleteOutlineIcon style={{ fontSize: 13 }} />
                              </button>
                            </div>
                          </div>
                        )}

                        {confirmDeleteId === entry.id && !isEditing && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, background: C.redPale, border: "1px solid #F0C7C7", borderRadius: 7, padding: "7px 8px" }}>
                            <span style={{ flex: 1, fontSize: 11, color: C.red, lineHeight: 1.45 }}>
                              Remove {entry.department || "this row"} from the directory?
                            </span>
                            <button
                              type="button"
                              onClick={() => removeEntry(entry)}
                              disabled={busy === `delete-${entry.id}`}
                              style={{ ...actionBtn("danger", busy === `delete-${entry.id}`), background: C.red, color: C.white, border: `1px solid ${C.red}` }}
                            >
                              {busy === `delete-${entry.id}` ? "Removing…" : "Remove"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={busy === `delete-${entry.id}`}
                              style={actionBtn("quiet", busy === `delete-${entry.id}`)}
                            >
                              Keep
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {adding ? (
                <EntryForm
                  title={`New ${roleLabel} entry`}
                  input={adding}
                  onChange={setAdding}
                  onSubmit={submitNew}
                  onCancel={() => { setAdding(null); setNotice(null); }}
                  saving={busy === "add"}
                  submitLabel={`Add ${roleLabel}`}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => { setNotice(null); setEditing(null); setConfirmDeleteId(null); setAdding(EMPTY_INPUT); }}
                  disabled={!!busy}
                  style={{ ...actionBtn("primary", !!busy), minHeight: 38 }}
                >
                  <AddIcon style={{ fontSize: 15 }} /> Add department approver
                </button>
              )}

              {directory.otherRoleCount > 0 && (
                <p style={{ fontSize: 11, color: C.textSecond, lineHeight: 1.5, margin: 0 }}>
                  {directory.otherRoleCount === 1
                    ? "1 other row in this list belongs to a different role."
                    : `${directory.otherRoleCount} other rows in this list belong to different roles.`}{" "}
                  This profile only shows and edits <strong>{config.roleValue}</strong>.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
