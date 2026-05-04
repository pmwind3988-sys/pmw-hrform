/**
 * FormLibrary.tsx - Sidebar component showing list of forms
 */
import { C } from "./constants";

interface FormLibraryProps {
  forms: { Id?: string; Title: string; FormID?: string; CurrentVersion?: string; Slug?: string }[];
  onEdit: (f: { Title: string }) => void;
  onNew: () => void;
  current: string;
}

const Tag = ({ children, color = C.purple, bg = C.purplePale }: { children: React.ReactNode; color?: string; bg?: string }) => (
  <span style={{
    fontSize: 10,
    fontWeight: 700,
    color,
    background: bg,
    borderRadius: 20,
    padding: "2px 9px",
    textTransform: "uppercase",
    letterSpacing: ".04em",
  }}>{children}</span>
);

export default function FormLibrary({ forms, onEdit, onNew, current }: FormLibraryProps) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{
        padding: "11px 13px",
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".06em" }}>
          Forms ({forms.length})
        </div>
        <button
          onClick={onNew}
          style={{
            height: 23,
            padding: "0 10px",
            border: "none",
            borderRadius: 6,
            background: C.purple,
            color: C.white,
            fontSize: 11,
            cursor: "pointer",
            fontFamily: "'DM Sans'",
          }}
        >
          ＋ New
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "7px 9px" }}>
        {forms.length === 0 && (
          <div style={{ textAlign: "center", padding: "20px 0", color: C.textMuted, fontSize: 11 }}>No forms yet.</div>
        )}
        {forms.map(f => (
          <div
            key={f.Id || f.Title}
            onClick={() => onEdit(f)}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${f.Title === current ? C.purple : C.border}`,
              background: f.Title === current ? C.purplePale : C.white,
              marginBottom: 5,
              cursor: "pointer",
              transition: "all .13s",
            }}
            onMouseEnter={e => {
              if (f.Title !== current) e.currentTarget.style.background = C.offWhite;
            }}
            onMouseLeave={e => {
              if (f.Title !== current) e.currentTarget.style.background = C.white;
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: f.Title === current ? C.purple : C.textPrimary, marginBottom: 2 }}>
              {f.Title}
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "monospace" }}>{f.FormID}</span>
              <Tag>v{f.CurrentVersion || "?"}</Tag>
              {f.Slug && <span style={{ fontSize: 10, color: C.textMuted }}>/forms/{f.Slug}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}