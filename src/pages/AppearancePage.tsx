import { useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { PaletteOutlined } from "@mui/icons-material";
import { useDashboard } from "../contexts/DashboardContext";
import { useDashboardBackground } from "../hooks/useDashboardBackground";
import BackgroundPicker from "../components/dashboard/BackgroundPicker";
import { findDashboardBackground } from "../utils/dashboardBackgrounds";
import { editorial, si, siType } from "../theme/editorial";
import Card from "../components/common/Card";

/**
 * Profile → Appearance.
 *
 * The dashboard background setting, which used to be reachable only from an
 * item in the header's overflow menu.
 *
 * WHY IT SURVIVED THE OVERHAUL. The SI canvas is one flat off-white, and a
 * photographic background under flat white cards is not that design. But this
 * is a real, working, tenant-wide setting an administrator may already have
 * chosen, and deleting it would have silently reverted their choice. So the
 * flat canvas became the DEFAULT rather than the only option: out of the box
 * the app looks like SI, and the gallery is still here for anyone who wants it.
 *
 * Read-only for a non-administrator, because the setting is stored once for the
 * whole tenant rather than per person — an employee changing it here would be
 * changing it for everybody, which is not what "Appearance" under "Profile"
 * leads anyone to expect.
 */
export default function AppearancePage() {
  const { isAdmin } = useDashboard();
  const { setting, loading, saving, error, save } = useDashboardBackground(isAdmin);
  const [pickerOpen, setPickerOpen] = useState(false);

  /**
   * The gallery's own label, not the stored id. Reading it live showed
   * "city-glass" where a person expects "City Glass" -- the id is a storage
   * key, and putting it on screen leaks the database into the interface.
   */
  const currentLabel = loading
    ? "Loading…"
    : setting.backgroundId === "custom"
      ? "Custom image"
      : findDashboardBackground(setting.backgroundId).label;

  return (
    <Box sx={{ maxWidth: 860, mx: "auto" }}>
      <Card>
        <Typography sx={{ ...siType.sectionTitle, color: editorial.ink }}>
          Dashboard background
        </Typography>
        <Typography sx={{ ...siType.body, color: editorial.muted, mt: 0.75 }}>
          The backdrop behind every page. The flat canvas is the default and the one the rest of
          this design is built for; the gallery offers tinted gradients and a custom image.
        </Typography>

        <Box
          sx={{
            mt: 2.5,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 2,
            p: 2,
            borderRadius: `${si.radiusSm}px`,
            backgroundColor: editorial.appSurface,
            border: `1px solid ${editorial.border}`,
          }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ ...siType.micro, color: editorial.muted }}>
              Currently applied
            </Typography>
            <Typography sx={{ ...siType.cardTitle, color: editorial.ink, mt: 0.25 }}>
              {currentLabel}
            </Typography>
          </Box>

          {isAdmin ? (
            <Button
              variant="contained"
              startIcon={<PaletteOutlined />}
              onClick={() => setPickerOpen(true)}
              sx={{
                borderRadius: `${si.radius}px`,
                minHeight: si.touchTarget,
                textTransform: "none",
                fontWeight: 700,
              }}
            >
              Change background
            </Button>
          ) : (
            <Typography sx={{ ...siType.subtext, color: editorial.muted, maxWidth: 320 }}>
              This is a shared setting for the whole organisation, so only an administrator can
              change it.
            </Typography>
          )}
        </Box>

        {error && (
          <Typography sx={{ ...siType.subtext, color: editorial.error, mt: 2 }}>{error}</Typography>
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
