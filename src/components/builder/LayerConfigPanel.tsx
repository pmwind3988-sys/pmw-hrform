/**
 * LayerConfigPanel.tsx - Full layer sequence editor for the unified "Layers" tab
 */
import { useState, useEffect, useRef } from "react";
import { C } from "./constants";
import LayerCard from "./LayerCard";
import EvalElementPicker from "./EvalElementPicker";
import PublicLinkDisplay from "./PublicLinkDisplay";
import type {
  LayerConfig,
  LayerConfigItem,
  ApprovalLayerConfig,
  EvaluationLayerConfig,
  AuthMode,
  ConfirmationType,
} from "../../types";

interface LayerConfigPanelProps {
  value: LayerConfig | null;
  onChange: (config: LayerConfig | null) => void;
  siteUsers: { email: string; name: string }[];
  formFieldNames: string[];
  slug: string;
}

const inp = {
  width: "100%",
  height: 30,
  border: `1px solid ${C.border}`,
  borderRadius: 7,
  padding: "0 9px",
  fontSize: 12,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  color: C.textPrimary,
  background: C.white,
  outline: "none",
};

const TOGGLE_BTN = (active: boolean): React.CSSProperties => ({
  flex: 1,
  height: 26,
  border: `1px solid ${active ? C.purple : C.border}`,
  borderRadius: 6,
  background: active ? C.purplePale : C.white,
  color: active ? C.purple : C.textMuted,
  fontSize: 10,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  transition: "all .1s",
});

export default function LayerConfigPanel({
  value,
  onChange,
  siteUsers,
  formFieldNames,
  slug,
}: LayerConfigPanelProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [condEnabled, setCondEnabled] = useState(!!value?.routing?.length);
  const [condField, setCondField] = useState(value?.routing?.[0]?.conditionField || "");
  const [condRules, setCondRules] = useState<{ when: string; skipLayers: number[] }[]>(
    value?.routing?.[0]?.rules?.map(r => ({ when: r.when, skipLayers: r.skipLayers || [] })) || [{ when: "", skipLayers: [] }]
  );
  const [evalPickerOpen, setEvalPickerOpen] = useState<number | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState<number | null>(null);
  const [searchQ, setSearchQ] = useState("");

  const layers = value?.layers || [];

  // Close search dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const updateLayers = (newLayers: LayerConfigItem[]) => {
    // Re-number layers
    const renumbered = newLayers.map((l, i) => ({ ...l, layerNumber: i + 1 }));
    const routing = condEnabled && condField
      ? [{ conditionField: condField, rules: condRules.map(r => ({ when: r.when, skipLayers: r.skipLayers })) }]
      : undefined;
    onChange({ version: "1.0", layers: renumbered, routing });
  };

  const addLayer = () => {
    const next = layers.length + 1;
    const newLayer: ApprovalLayerConfig = {
      layerNumber: next,
      type: "approval",
      authMode: "365",
      assignee: { type: "user", value: "" },
      confirmationType: "signature",
      allowRejectionReason: true,
    };
    updateLayers([...layers, newLayer]);
    setExpandedIdx(layers.length);
  };

  const removeLayer = (idx: number) => {
    updateLayers(layers.filter((_, i) => i !== idx));
    if (expandedIdx === idx) setExpandedIdx(null);
    else if (expandedIdx !== null && expandedIdx > idx) setExpandedIdx(expandedIdx - 1);
  };

  const moveLayer = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= layers.length) return;
    const arr = [...layers];
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    updateLayers(arr);
    if (expandedIdx === idx) setExpandedIdx(target);
    else if (expandedIdx === target) setExpandedIdx(idx);
  };

  const patchLayer = (idx: number, patch: Record<string, unknown>) => {
    updateLayers(layers.map((l, i) => {
      if (i !== idx) return l;
      return { ...l, ...patch } as LayerConfigItem;
    }));
  };

  // Search suggestions for assignee
  const suggestions = searchQ
    ? siteUsers.filter(u => u.email.toLowerCase().includes(searchQ.toLowerCase()) || u.name.toLowerCase().includes(searchQ.toLowerCase())).slice(0, 5)
    : siteUsers.slice(0, 5);

  // ── Render per-layer settings ──────────────────────────────────────────────
  const renderLayerSettings = (layer: LayerConfigItem, idx: number) => {
    const isApproval = layer.type === "approval";
    const isEval = layer.type === "evaluation";

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 9 }}>
        {/* Layer type toggle */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>
            Layer Type
          </label>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => {
              if (isApproval) return;
              const converted: ApprovalLayerConfig = {
                layerNumber: layer.layerNumber,
                type: "approval",
                authMode: layer.authMode,
                assignee: layer.assignee,
                title: layer.title,
                description: layer.description,
                publicToken: layer.publicToken,
                tokenExpiresAt: layer.tokenExpiresAt,
                notifyOnComplete: layer.notifyOnComplete,
                confirmationType: "signature",
                allowRejectionReason: true,
              };
              patchLayer(idx, converted as unknown as Record<string, unknown>);
            }} style={TOGGLE_BTN(isApproval)}>Approval</button>
            <button onClick={() => {
              if (isEval) return;
              const converted: EvaluationLayerConfig = {
                layerNumber: layer.layerNumber,
                type: "evaluation",
                authMode: layer.authMode,
                assignee: layer.assignee,
                title: layer.title,
                description: layer.description,
                publicToken: layer.publicToken,
                tokenExpiresAt: layer.tokenExpiresAt,
                notifyOnComplete: layer.notifyOnComplete,
                surveyElements: [],
              };
              patchLayer(idx, converted as unknown as Record<string, unknown>);
            }} style={TOGGLE_BTN(isEval)}>Evaluation</button>
          </div>
        </div>

        {/* Auth mode toggle */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>
            Auth Mode
          </label>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => patchLayer(idx, { authMode: "365" as AuthMode })} style={TOGGLE_BTN(layer.authMode === "365")}>
              🔒 365 Sign-in
            </button>
            <button onClick={() => {
              const patch: Partial<LayerConfigItem> & { publicToken?: string; tokenExpiresAt?: string } = { authMode: "public" as AuthMode };
              if (!layer.publicToken) patch.publicToken = crypto.randomUUID();
              if (!layer.tokenExpiresAt) {
                const d = new Date();
                d.setDate(d.getDate() + 30);
                patch.tokenExpiresAt = d.toISOString();
              }
              patchLayer(idx, patch);
            }} style={TOGGLE_BTN(layer.authMode === "public")}>
              🔗 Public Link
            </button>
          </div>
        </div>

        {/* Assignee */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>
            Assignee
          </label>
          <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
            <button
              onClick={() => patchLayer(idx, { assignee: { type: "user", value: layer.assignee.value } })}
              style={TOGGLE_BTN(layer.assignee.type === "user")}
            >
              Static
            </button>
            <button
              onClick={() => patchLayer(idx, { assignee: { type: "field-reference", value: layer.assignee.value } })}
              style={TOGGLE_BTN(layer.assignee.type === "field-reference")}
            >
              From Field
            </button>
          </div>

          {layer.assignee.type === "user" ? (
            <div ref={searchRef} style={{ position: "relative" }}>
              <input
                value={layer.assignee.value}
                onChange={e => {
                  patchLayer(idx, { assignee: { type: "user", value: e.target.value } });
                  setSearchQ(e.target.value);
                }}
                onFocus={() => setSearchOpen(idx)}
                placeholder="email@company.com"
                style={inp}
              />
              {searchOpen === idx && suggestions.length > 0 && (
                <div style={{
                  position: "absolute",
                  top: "calc(100% + 3px)",
                  left: 0,
                  right: 0,
                  zIndex: 200,
                  background: C.white,
                  border: `1px solid ${C.border}`,
                  borderRadius: 9,
                  boxShadow: C.shadowMd,
                  overflow: "hidden",
                }}>
                  {suggestions.map(u => (
                    <div
                      key={u.email}
                      onClick={() => {
                        patchLayer(idx, { assignee: { type: "user", value: u.email } });
                        setSearchOpen(null);
                        setSearchQ("");
                      }}
                      style={{ padding: "6px 9px", cursor: "pointer", borderBottom: `1px solid ${C.border}` }}
                      onMouseEnter={e => e.currentTarget.style.background = C.purplePale}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <div style={{ fontSize: 11, fontWeight: 500 }}>{u.name}</div>
                      <div style={{ fontSize: 9, color: C.textMuted }}>{u.email}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <select
              value={layer.assignee.value}
              onChange={e => patchLayer(idx, { assignee: { type: "field-reference", value: e.target.value } })}
              style={{ ...inp, height: 30 }}
            >
              <option value="">— Select field —</option>
              {formFieldNames.map(fn => (
                <option key={fn} value={fn}>{fn}</option>
              ))}
            </select>
          )}
        </div>

        {/* Approval-specific: confirmation type */}
        {isApproval && (
          <>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>
                Confirmation Type
              </label>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => patchLayer(idx, { confirmationType: "signature" as ConfirmationType })}
                  style={TOGGLE_BTN((layer as ApprovalLayerConfig).confirmationType === "signature")}
                >
                  ✍️ Signature
                </button>
                <button
                  onClick={() => patchLayer(idx, { confirmationType: "checkbox" as ConfirmationType })}
                  style={TOGGLE_BTN((layer as ApprovalLayerConfig).confirmationType === "checkbox")}
                >
                  ☑️ Checkbox
                </button>
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.textSecond }}>
              <input
                type="checkbox"
                checked={(layer as ApprovalLayerConfig).allowRejectionReason}
                onChange={e => patchLayer(idx, { allowRejectionReason: e.target.checked })}
                style={{ width: 14, height: 14, accentColor: C.purple }}
              />
              Show rejection reason
            </label>
          </>
        )}

        {/* Evaluation-specific: configure form */}
        {isEval && (
          <div>
            {evalPickerOpen === idx ? (
              <EvalElementPicker
                elements={(layer as EvaluationLayerConfig).surveyElements || []}
                onChange={els => patchLayer(idx, { surveyElements: els })}
              />
            ) : (
              <button
                onClick={() => setEvalPickerOpen(idx)}
                style={{
                  width: "100%",
                  height: 30,
                  border: `1px dashed ${C.purpleMid}`,
                  borderRadius: 7,
                  background: "none",
                  color: C.purple,
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                }}
              >
                📋 Configure Evaluation Form ({((layer as EvaluationLayerConfig).surveyElements || []).length} fields)
              </button>
            )}
            {evalPickerOpen === idx && (
              <button
                onClick={() => setEvalPickerOpen(null)}
                style={{
                  fontSize: 10,
                  color: C.textMuted,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  marginTop: 4,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                }}
              >
                Done
              </button>
            )}
          </div>
        )}

        {/* Title & description */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>
            Layer Title
          </label>
          <input
            value={layer.title || ""}
            onChange={e => patchLayer(idx, { title: e.target.value })}
            placeholder={`Layer ${idx + 1}`}
            style={inp}
          />
        </div>
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>
            Description
          </label>
          <input
            value={layer.description || ""}
            onChange={e => patchLayer(idx, { description: e.target.value })}
            placeholder="Optional description"
            style={inp}
          />
        </div>

        {/* Public link display */}
        {layer.authMode === "public" && (
          <PublicLinkDisplay
            slug={slug}
            publicToken={layer.publicToken || ""}
            tokenExpiresAt={layer.tokenExpiresAt || ""}
            onTokenChange={t => patchLayer(idx, { publicToken: t })}
            onExpiryChange={d => patchLayer(idx, { tokenExpiresAt: d })}
          />
        )}
      </div>
    );
  };

  // ── Conditional routing section ────────────────────────────────────────────
  const renderConditionalRouting = () => (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.textPrimary,
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        Conditional Routing
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={condEnabled}
          onChange={e => {
            setCondEnabled(e.target.checked);
            if (!e.target.checked) {
              // Persist the removal
              const routing = undefined;
              onChange({ version: "1.0", layers, routing });
            }
          }}
          style={{ width: 16, height: 16, accentColor: C.purple }}
        />
        <span style={{ fontSize: 11, color: C.textSecond }}>
          {condEnabled ? "Enabled" : "Disabled — all layers always active"}
        </span>
      </label>

      {condEnabled && (
        <>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>
              Condition field name
            </label>
            <input
              value={condField}
              onChange={e => setCondField(e.target.value)}
              placeholder="subject"
              style={inp}
            />
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>
            Rules ({condRules.length})
          </div>

          {condRules.map((rule, ri) => (
            <div
              key={ri}
              style={{
                background: C.offWhite,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "8px 10px",
                marginBottom: 6,
              }}
            >
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: C.textMuted, flexShrink: 0 }}>When =</span>
                <input
                  value={rule.when}
                  onChange={e => {
                    const next = condRules.map((r, i) => i === ri ? { ...r, when: e.target.value } : r);
                    setCondRules(next);
                  }}
                  placeholder="value"
                  style={{ ...inp, flex: 1, height: 26, fontSize: 11 }}
                />
                <button
                  onClick={() => setCondRules(condRules.filter((_, i) => i !== ri))}
                  style={{
                    width: 20,
                    height: 20,
                    border: "none",
                    background: C.redPale,
                    color: C.red,
                    borderRadius: 5,
                    cursor: "pointer",
                    fontSize: 10,
                    flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{ fontSize: 9, color: C.textMuted, marginBottom: 4 }}>Skip layers:</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {layers.map((l, li) => (
                  <label
                    key={li}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      fontSize: 10,
                      color: rule.skipLayers.includes(l.layerNumber) ? C.purple : C.textMuted,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={rule.skipLayers.includes(l.layerNumber)}
                      onChange={e => {
                        const skip = e.target.checked
                          ? [...rule.skipLayers, l.layerNumber]
                          : rule.skipLayers.filter(n => n !== l.layerNumber);
                        const next = condRules.map((r, i) => i === ri ? { ...r, skipLayers: skip } : r);
                        setCondRules(next);
                      }}
                      style={{ width: 12, height: 12, accentColor: C.purple }}
                    />
                    L{l.layerNumber}
                  </label>
                ))}
              </div>
            </div>
          ))}

          <button
            onClick={() => setCondRules([...condRules, { when: "", skipLayers: [] }])}
            style={{
              width: "100%",
              height: 26,
              border: `1px dashed ${C.border}`,
              borderRadius: 7,
              background: "none",
              color: C.purple,
              fontSize: 10,
              cursor: "pointer",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
            }}
          >
            + Add rule
          </button>
        </>
      )}
    </div>
  );

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div style={{ animation: "fadeUp .15s ease" }}>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 12, lineHeight: 1.6 }}>
        Configure approval and evaluation layers for this form.
      </div>

      {/* Layer cards */}
      {layers.length === 0 && (
        <div
          style={{
            background: C.amberPale,
            border: "1px solid #FDE68A",
            borderRadius: 8,
            padding: "9px 11px",
            fontSize: 11,
            color: C.amber,
            marginBottom: 10,
          }}
        >
          No layers — submissions go straight to Submitted.
        </div>
      )}

      {layers.map((layer, idx) => (
        <LayerCard
          key={idx}
          layer={layer}
          index={idx}
          total={layers.length}
          expanded={expandedIdx === idx}
          onToggleExpand={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
          onMoveUp={() => moveLayer(idx, -1)}
          onMoveDown={() => moveLayer(idx, 1)}
          onDelete={() => removeLayer(idx)}
        >
          {renderLayerSettings(layer, idx)}
        </LayerCard>
      ))}

      {/* Add layer button */}
      <button
        onClick={addLayer}
        style={{
          width: "100%",
          height: 32,
          border: `1px dashed ${C.purpleMid}`,
          borderRadius: 8,
          background: "none",
          color: C.purple,
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          marginBottom: 14,
        }}
      >
        + Add Layer
      </button>

      {/* Conditional routing */}
      {renderConditionalRouting()}
    </div>
  );
}
