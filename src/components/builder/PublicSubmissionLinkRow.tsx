/**
 * PublicSubmissionLinkRow.tsx — who a public-link submission was tied to.
 *
 * A submission made through a public link is stored as "GUEST"; the server
 * later names the Approval Directory person it came from. This shows that, and
 * lets an HR Forms Owner correct it by typing a directory email or staff number
 * (or clear it). It reads the three link columns on their own, so a form whose
 * list does not have them yet simply shows nothing to correct.
 */
import { useEffect, useState } from "react";
import { spGet } from "../../utils/formBuilderSP";
import { setSubmissionLink } from "../../utils/publicSubmissionLinkService";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");

interface Props {
  token: string;
  listTitle: string;
  itemId: number;
  submittedBy: string;
}

interface LinkState {
  available: boolean;
  email: string;
  employeeId: string;
  match: string;
}

const MATCH_LABEL: Record<string, string> = {
  "staff-number": "matched on staff number",
  email: "matched on email",
  name: "matched on name",
  manual: "set by an admin",
};

export default function PublicSubmissionLinkRow({ token, listTitle, itemId, submittedBy }: Props) {
  const [link, setLink] = useState<LinkState | null>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reloads, setReloads] = useState(0);

  const isPublic = submittedBy.trim().toLowerCase() === "guest";

  useEffect(() => {
    if (!isPublic) return;
    let cancelled = false;
    void (async () => {
      try {
        const row = await spGet(
          token,
          `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${itemId})?$select=LinkedUserEmail,LinkedEmployeeId,LinkedMatch`,
        ) as Record<string, unknown>;
        if (cancelled) return;
        setLink({
          available: true,
          email: String(row.LinkedUserEmail ?? ""),
          employeeId: String(row.LinkedEmployeeId ?? ""),
          match: String(row.LinkedMatch ?? ""),
        });
      } catch {
        // The list has no link columns yet (the form was published before they
        // existed). Correcting adds them, so the editor is still offered.
        if (!cancelled) setLink({ available: false, email: "", employeeId: "", match: "" });
      }
    })();
    return () => { cancelled = true; };
  }, [token, listTitle, itemId, isPublic, reloads]);

  if (!isPublic || !link) return null;

  const linked = !!(link.email || link.employeeId);
  const save = async (person: string) => {
    setBusy(true);
    setError("");
    try {
      await setSubmissionLink({ delegatedToken: token, listTitle, itemId: String(itemId), person });
      setEditing(false);
      setValue("");
      setReloads((count) => count + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the link.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ fontSize: 12.5, marginTop: 4 }}>
      <span style={{ fontWeight: 600 }}>Public link submission</span>
      {" — "}
      {linked ? (
        <span>
          linked to {link.email || "a person with no email"}
          {link.employeeId ? ` (staff no. ${link.employeeId})` : ""}
          {MATCH_LABEL[link.match] ? `, ${MATCH_LABEL[link.match]}` : ""}
        </span>
      ) : (
        <span>not linked to a person</span>
      )}
      {!editing && (
        <>
          {" "}
          <button type="button" onClick={() => setEditing(true)} style={{ border: 0, background: "none", cursor: "pointer", textDecoration: "underline", padding: 0, font: "inherit", color: "inherit" }}>
            {linked ? "Change" : "Link to a person"}
          </button>
          {linked && (
            <>
              {" · "}
              <button type="button" disabled={busy} onClick={() => void save("")} style={{ border: 0, background: "none", cursor: "pointer", textDecoration: "underline", padding: 0, font: "inherit", color: "inherit" }}>
                Remove link
              </button>
            </>
          )}
        </>
      )}
      {editing && (
        <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Directory email or staff number"
            aria-label="Directory email or staff number"
            style={{ flex: "1 1 220px", minWidth: 0, padding: "4px 8px" }}
          />
          <button type="button" disabled={busy || !value.trim()} onClick={() => void save(value)}>Save</button>
          <button type="button" disabled={busy} onClick={() => { setEditing(false); setError(""); }}>Cancel</button>
        </div>
      )}
      {error && <div role="alert" style={{ color: "#b3261e", marginTop: 2 }}>{error}</div>}
    </div>
  );
}
