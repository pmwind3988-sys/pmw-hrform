import { useEffect, useState } from "react";
import { editorial, si, siFocusRing, siType } from "../../theme/editorial";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Slider,
  TextField,
  Typography,
} from "@mui/material";
import {
  Check,
  Close,
  ImageSearch,
} from "@mui/icons-material";
import {
  buildCustomBackgroundCss,
  buildDashboardBackgroundDefCss,
  DASHBOARD_BACKGROUNDS,
  DEFAULT_DASHBOARD_BACKGROUND_SETTING,
  DEFAULT_IMAGE_OPACITY,
  findDashboardBackground,
  normalizeImageUrl,
  normalizeImageOpacity,
  type DashboardBackgroundSetting,
} from "../../utils/dashboardBackgrounds";
import { describeFailure } from "../../utils/friendlyError";

interface Props {
  open: boolean;
  onClose: () => void;
  setting: DashboardBackgroundSetting;
  loading: boolean;
  saving: boolean;
  error: string;
  onSave: (setting: DashboardBackgroundSetting) => Promise<DashboardBackgroundSetting>;
}

function resolveInitialId(setting: DashboardBackgroundSetting): string {
  if (setting.backgroundId === "custom") return "custom";
  return DASHBOARD_BACKGROUNDS.some((background) => background.id === setting.backgroundId)
    ? setting.backgroundId
    : DEFAULT_DASHBOARD_BACKGROUND_SETTING.backgroundId;
}

/**
 * A failed background load, in plain words. The page keeps the plain background
 * in that case, so the sentence says so instead of printing the server's status.
 */
export function BackgroundErrorNote({ error }: { error: string }) {
  const copy = describeFailure("your saved background", { error });
  return (
    <Box role="status" sx={{ borderRadius: `${si.radiusSm}px`, px: 2, py: 1.5, backgroundColor: editorial.appSurface, border: `1px solid ${editorial.border}` }}>
      <Typography sx={{ fontWeight: 700, color: editorial.ink, fontSize: "0.9rem" }}>{copy.title}</Typography>
      <Typography sx={{ color: editorial.muted, fontSize: "0.845rem", mt: 0.25 }}>The plain background is showing instead.</Typography>
      {copy.code && (
        <Typography sx={{ color: editorial.softMuted, fontSize: "0.75rem", mt: 0.5, fontVariantNumeric: "tabular-nums" }}>Reference: {copy.code}</Typography>
      )}
    </Box>
  );
}

export default function BackgroundPicker({
  open,
  onClose,
  setting,
  loading,
  saving,
  error,
  onSave,
}: Props) {
  const [selectedId, setSelectedId] = useState(resolveInitialId(setting));
  const [customUrl, setCustomUrl] = useState(setting.customImageUrl);
  const [customSource, setCustomSource] = useState(setting.customImageSource || "");
  const [imageOpacity, setImageOpacity] = useState(normalizeImageOpacity(setting.imageOpacity ?? DEFAULT_IMAGE_OPACITY));
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelectedId(resolveInitialId(setting));
    setCustomUrl(setting.customImageUrl);
    setCustomSource(setting.customImageSource || "");
    setImageOpacity(normalizeImageOpacity(setting.imageOpacity ?? DEFAULT_IMAGE_OPACITY));
    setValidationError("");
  }, [open, setting.backgroundId, setting.customImageSource, setting.customImageUrl, setting.imageOpacity]);

  const customPreviewUrl = normalizeImageUrl(customUrl);
  const selectedBackground = findDashboardBackground(selectedId);
  const previewCss = selectedId === "custom"
    ? buildCustomBackgroundCss(customUrl, imageOpacity)
    : buildDashboardBackgroundDefCss(selectedBackground, imageOpacity);

  async function handleSave(): Promise<void> {
    const nextCustomUrl = selectedId === "custom" ? normalizeImageUrl(customUrl) : "";
    const nextCustomSource = selectedId === "custom" ? customSource.trim() : "";
    if (selectedId === "custom" && !nextCustomUrl) {
      setValidationError("Enter a valid http or https image URL.");
      return;
    }
    if (selectedId === "custom" && !nextCustomSource) {
      setValidationError("Enter the image source, owner, or license note.");
      return;
    }

    try {
      await onSave({
        backgroundId: selectedId,
        customImageUrl: nextCustomUrl || "",
        customImageSource: nextCustomSource,
        imageOpacity,
      });
      onClose();
    } catch {
      /* Save errors are surfaced by the shared background hook. */
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth slotProps={{ paper: { sx: { borderRadius: `${si.radiusSheet}px` } } }}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, pb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
          <ImageSearch sx={{ color: editorial.pmwBlue }} />
          <Typography component="span" sx={{ ...siType.sectionTitle, color: editorial.ink }}>
            Dashboard background
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Close background picker">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {validationError ? (
          <Alert severity="error" sx={{ mb: 2, borderRadius: `${si.radiusSm}px` }}>
            {validationError}
          </Alert>
        ) : error ? (
          <Box sx={{ mb: 2 }}>
            <BackgroundErrorNote error={error} />
          </Box>
        ) : null}

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 260px" }, gap: 2.5 }}>
          <Box>
            <Box
              role="group"
              aria-label="Backgrounds"
              sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 1.5 }}
            >
              {DASHBOARD_BACKGROUNDS.map((background) => {
                const selected = selectedId === background.id;
                return (
                  <Box
                    key={background.id}
                    component="button"
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setSelectedId(background.id);
                      setValidationError("");
                    }}
                    sx={{
                      appearance: "none",
                      border: 0,
                      background: "none",
                      cursor: "pointer",
                      p: 0.5,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 0.75,
                      borderRadius: `${si.radiusSm}px`,
                      font: "inherit",
                      "&:focus-visible": siFocusRing,
                    }}
                  >
                    <Box
                      aria-hidden
                      sx={{
                        position: "relative",
                        width: 64,
                        height: 64,
                        borderRadius: "50%",
                        background: buildDashboardBackgroundDefCss(background, imageOpacity, true),
                        boxShadow: selected
                          ? `0 0 0 3px ${editorial.white}, 0 0 0 5px ${editorial.navy}`
                          : `inset 0 0 0 1px ${editorial.border}`,
                        transition: "box-shadow 0.18s ease, transform 0.18s ease",
                        ".MuiBox-root:hover > &": { transform: "scale(1.05)" },
                      }}
                    >
                      {selected && (
                        <Box sx={{ position: "absolute", right: -2, bottom: -2, width: 22, height: 22, borderRadius: "50%", backgroundColor: editorial.navy, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Check sx={{ fontSize: 15, color: editorial.white }} />
                        </Box>
                      )}
                    </Box>
                    <Typography sx={{ ...siType.subtext, color: selected ? editorial.ink : editorial.muted, fontWeight: selected ? 700 : 500, textAlign: "center" }}>
                      {background.label}
                    </Typography>
                  </Box>
                );
              })}
            </Box>

            <Box sx={{ mt: 2.5, p: 2, borderRadius: `${si.radius}px`, backgroundColor: selectedId === "custom" ? editorial.sky : editorial.skySoft }}>
              <Typography component="h3" sx={{ ...siType.cardTitle, color: editorial.ink, mb: 1 }}>
                Custom image
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr auto" }, gap: 1 }}>
                <TextField
                  size="small"
                  value={customUrl}
                  onFocus={() => setSelectedId("custom")}
                  onChange={(event) => {
                    setSelectedId("custom");
                    setCustomUrl(event.target.value);
                    setValidationError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleSave();
                  }}
                  placeholder="https://example.com/background.jpg"
                  slotProps={{ htmlInput: { "aria-label": "Custom image URL", sx: { fontSize: "0.875rem" } } }}
                  sx={{ "& .MuiOutlinedInput-root": { backgroundColor: editorial.white } }}
                />
                <Button
                  variant={selectedId === "custom" ? "contained" : "outlined"}
                  aria-pressed={selectedId === "custom"}
                  onClick={() => setSelectedId("custom")}
                  sx={{ minWidth: 92 }}
                >
                  Select
                </Button>
              </Box>
              {selectedId === "custom" && (
                <TextField
                  label="Image source or credit"
                  size="small"
                  value={customSource}
                  onChange={(event) => {
                    setCustomSource(event.target.value);
                    setValidationError("");
                  }}
                  placeholder="PMW owned asset, photographer, license, or source URL"
                  fullWidth
                  sx={{ mt: 1.25, "& .MuiOutlinedInput-root": { backgroundColor: editorial.white } }}
                />
              )}
            </Box>

            <Box sx={{ mt: 2, p: 2, borderRadius: `${si.radius}px`, backgroundColor: editorial.skySoft }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, mb: 0.75 }}>
                <Typography component="h3" sx={{ ...siType.cardTitle, color: editorial.ink }}>
                  Image opacity
                </Typography>
                <Typography sx={{ ...siType.data, color: editorial.muted }}>
                  {Math.round(imageOpacity * 100)}%
                </Typography>
              </Box>
              <Slider
                value={Math.round(imageOpacity * 100)}
                min={0}
                max={100}
                step={1}
                onChange={(_, value) => {
                  const nextValue = Array.isArray(value) ? value[0] : value;
                  setImageOpacity(normalizeImageOpacity(nextValue / 100));
                }}
                aria-label="Image opacity"
                sx={{ color: editorial.pmwBlue }}
              />
            </Box>
          </Box>

          <Box>
            <Typography component="h3" sx={{ ...siType.cardTitle, color: editorial.ink, mb: 1 }}>
              Preview
            </Typography>
            <Box
              sx={{
                height: { xs: 180, md: 300 },
                borderRadius: `${si.radius}px`,
                background: previewCss,
                boxShadow: `inset 0 0 0 1px ${editorial.border}`,
                overflow: "hidden",
                position: "relative",
              }}
            >
              <Box sx={{ position: "absolute", left: 16, right: 16, top: 18, height: 38, borderRadius: `${si.radiusSm}px`, backgroundColor: "rgba(255,255,255,0.92)" }} />
              <Box sx={{ position: "absolute", left: 16, right: 16, top: 72, height: 74, borderRadius: `${si.radiusSm}px`, backgroundColor: "rgba(255,255,255,0.9)" }} />
              <Box sx={{ position: "absolute", left: 16, right: 16, top: 162, bottom: 18, borderRadius: `${si.radiusSm}px`, backgroundColor: "rgba(255,255,255,0.88)" }} />
              {loading && (
                <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.52)" }}>
                  <CircularProgress size={28} />
                </Box>
              )}
            </Box>
            {selectedId === "custom" && customPreviewUrl && (
              <Typography sx={{ ...siType.subtext, color: editorial.muted, mt: 1, wordBreak: "break-all" }}>
                {customPreviewUrl}
              </Typography>
            )}
            <Typography sx={{ ...siType.subtext, color: editorial.muted, mt: 0.75, wordBreak: "break-word" }}>
              {selectedId === "custom" ? customSource.trim() : selectedBackground.source || selectedBackground.category}
            </Typography>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => { void handleSave(); }}
          disabled={saving}
          aria-label={saving ? "Saving" : undefined}
          sx={{ minWidth: 120 }}
        >
          {saving ? <CircularProgress size={20} color="inherit" /> : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
