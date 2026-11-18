import { useState } from "react";
import HistoryIcon from "@mui/icons-material/History";
import {
  RECORD_VERSION_LIMIT,
  ensureListVersioning,
  getAllFormConfigs,
  readListVersioning,
  versioningIsEnough,
} from "../../utils/formBuilderSP";
import { C } from "./constants";

/** Lists that hold records besides each form's own response list. */
const RECORD_LISTS = ["Master Form", "Web Form Versions", "Form Builder Log"];

type RowState = "ok" | "needs" | "missing" | "error";

interface Row {
  title: string;
  state: RowState;
  detail: string;
}

const STATE_LABEL: Record<RowState, string> = {
  ok: "Keeping history",
  needs: "Needs turning on",
  missing: "No such list",
  error: "Could not read",
};

const STATE_COLOUR: Record<RowState, string> = {
  ok: "#107C10",
  needs: "#C50F1F",
  missing: C.textSecond,
  error: "#C50F1F",
};

const buttonStyle = {
  minHeight: 34,
  padding: "7px 12px",
  border: "none",
  borderRadius: 7,
  color: C.white,
  fontSize: 11.5,
  fontWeight: 750,
} as const;

async function readRow(token: string, title: string): Promise<Row> {
  try {
    const v = await readListVersioning(token, title);
    if (versioningIsEnough(v)) return { title, state: "ok", detail: `Keeps ${v.limit} versions of each row` };
    return {
      title,
      state: "needs",
      detail: v.enabled ? `Keeps only ${v.limit} versions of each row` : "Version history is off",
    };
  } catch (e) {
    const message = (e as Error).message || "";
    return /\b404\b/.test(message) ? { title, state: "missing", detail: "" } : { title, state: "error", detail: message.slice(0, 160) };
  }
}

/**
 * All Submissions → "Record keeping": whether SharePoint keeps earlier versions
 * of each record list's rows, so a change made straight in SharePoint (outside
 * this app) can still be traced. Checking only reads; the button changes the
 * lists' settings and nothing else. Publishing a form does the same for its
 * own lists.
 */
export default function RecordKeepingPanel({ token }: { token: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<"" | "checking" | "fixing">("");
  const [message, setMessage] = useState("");

  const check = async () => {
    setBusy("checking");
    setMessage("");
    try {
      const forms = await getAllFormConfigs(token);
      const titles = [...new Set([...forms.map((form) => String(form.Title || "").trim()).filter(Boolean), ...RECORD_LISTS])];
      const next: Row[] = [];
      for (const title of titles) next.push(await readRow(token, title));
      setRows(next);
    } catch (e) {
      setMessage(`Could not list the forms: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  };

  const fix = async () => {
    if (!rows) return;
    setBusy("fixing");
    setMessage("");
    const next = [...rows];
    let turnedOn = 0;
    let failed = 0;
    for (let i = 0; i < next.length; i += 1) {
      if (next[i].state !== "needs") continue;
      try {
        await ensureListVersioning(token, next[i].title);
        turnedOn += 1;
      } catch {
        failed += 1;
      }
      next[i] = await readRow(token, next[i].title);
      setRows([...next]);
    }
    setBusy("");
    setMessage(failed
      ? `Turned on for ${turnedOn}. ${failed} could not be changed: this needs Manage Lists permission on the SharePoint site.`
      : `Turned on for ${turnedOn}.`);
  };

  const needing = rows?.filter((row) => row.state === "needs").length ?? 0;

  return (
    <div style={{ padding: 14, border: `1px solid ${C.border}`, borderRadius: 12, background: C.white, maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <HistoryIcon style={{ color: C.purpleAccent, fontSize: 20 }} />
        <div style={{ flex: "1 1 260px" }}>
          <div style={{ fontSize: 13, fontWeight: 750, color: C.textPrimary }}>Version history on record lists</div>
          <div style={{ fontSize: 11.5, color: C.textSecond, marginTop: 2, lineHeight: 1.5 }}>
            With version history on, SharePoint keeps every earlier copy of a submission, so a change made straight in
            SharePoint can still be traced. Each list should keep at least {RECORD_VERSION_LIMIT} versions per row.
          </div>
        </div>
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void check()}
          style={{ ...buttonStyle, background: C.purple, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.55 : 1 }}
        >
          {busy === "checking" ? "Checking..." : rows ? "Check again" : "Check lists"}
        </button>
        {needing > 0 && (
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void fix()}
            style={{ ...buttonStyle, background: "#C50F1F", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.55 : 1 }}
          >
            {busy === "fixing" ? "Turning on..." : `Turn on for ${needing}`}
          </button>
        )}
      </div>
      {message && <div role="status" style={{ marginTop: 10, fontSize: 11.5, color: C.textPrimary }}>{message}</div>}
      {rows?.map((row) => (
        <div
          key={row.title}
          style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.borderLight}`, fontSize: 11.5, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}
        >
          <strong style={{ color: C.textPrimary, flex: "1 1 220px" }}>{row.title}</strong>
          <span style={{ color: STATE_COLOUR[row.state], fontWeight: 700 }}>{STATE_LABEL[row.state]}</span>
          {row.detail && <span style={{ color: C.textSecond, flexBasis: "100%" }}>{row.detail}</span>}
        </div>
      ))}
    </div>
  );
}
