import { useState } from "react";
import { Box, Typography } from "@mui/material";
import { PaletteOutlined } from "@mui/icons-material";
import { useDashboard } from "../contexts/DashboardContext";
import { useDashboardBackground } from "../hooks/useDashboardBackground";
import BackgroundPicker, { BackgroundErrorNote } from "../components/dashboard/BackgroundPicker";
import { buildDashboardBackgroundCss, findDashboardBackground } from "../utils/dashboardBackgrounds";
import { editorial, si, siType } from "../theme/editorial";
import Card from "../components/common/Card";
import PageHeader from "../components/common/PageHeader";

/**
 * Profile → Appearance.
 *
 * The dashboard background setting. The flat canvas is the DEFAULT rather than
 * the only option, so an administrator's earlier choice is never silently
 * reverted.
 *
 * Read-only for a non-administrator, because the setting is stored once for the
 * whole tenant rather than per person -- an employee changing it here would be
 * changing it for everybody.
 *
 * Saving is NOT immediate: the picker dialog applies the choice only when its
 * Save button is pressed, so the page copy says "pick, then save".
 */
export default function AppearancePage() {
  const { isAdmin } = useDashboard();
  const { setting, loading, saving, error, save } = useDashboardBackground(isAdmin);
  const [pickerOpen, setPickerOpen] = useState(false);

  /** The gallery's own label, not the stored id ("City Glass", not "city-glass"). */
  const currentLabel = loading
    ? "Loading…"
    : setting.backgroundId === "custom"
      ? "Custom image"
      : findDashboardBackground(setting.backgroundId).label;

  return (
    <Box sx={{ maxWidth: 860, mx: "auto" }}>
      <PageHeader
        title="Appearance"
        description={isAdmin ? "Pick a background, then save." : "The background is shared by the whole organisation."}
        primary={isAdmin ? { label: "Change background", icon: <PaletteOutlined />, onClick: () => setPickerOpen(true) } : undefined}
      />

      <Card>
        <Typography component="h3" sx={{ ...siType.sectionTitle, color: editorial.ink }}>
          Dashboard background
        </Typography>

        <Box
          role="img"
          aria-label={`Preview of the current background: ${currentLabel}`}
          sx={{
            mt: 2,
            height: { xs: 160, sm: 220 },
            borderRadius: `${si.radiusSheet}px`,
            background: loading ? editorial.skySoft : buildDashboardBackgroundCss(setting),
            boxShadow: `inset 0 0 0 1px ${editorial.border}`,
            display: "flex",
            alignItems: "flex-end",
            gap: 1.5,
            p: 2,
          }}
        >
          <Box sx={{ width: "60%", height: 64, borderRadius: `${si.radiusSm}px`, backgroundColor: "rgba(255,255,255,0.92)" }} />
          <Box sx={{ flex: 1, height: 64, borderRadius: `${si.radiusSm}px`, backgroundColor: "rgba(255,255,255,0.92)" }} />
        </Box>

        <Box sx={{ mt: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2 }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ ...siType.subtext, color: editorial.muted }}>Currently applied</Typography>
            <Typography sx={{ ...siType.cardTitle, color: editorial.ink }}>{currentLabel}</Typography>
          </Box>
          {!isAdmin && (
            <Typography sx={{ ...siType.subtext, color: editorial.muted, maxWidth: 360 }}>
              This is a shared setting for the whole organisation, so only an administrator can
              change it.
            </Typography>
          )}
        </Box>

        {error && (
          <Box sx={{ mt: 2 }}>
            <BackgroundErrorNote error={error} />
          </Box>
        )}
      </Card>

      {isAdmin && (
        <BackgroundPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          setting={setting}
          loading={loading}
          saving={saving}
          error={error}
          onSave={save}
        />
      )}
    </Box>
  );
}
