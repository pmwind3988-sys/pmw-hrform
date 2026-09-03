import { useEffect, useState } from "react";
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
  Radio,
  Stack,
  Typography,
} from "@mui/material";
import {
  Close,
  Lock,
  Public,
  VisibilityOutlined,
} from "@mui/icons-material";
import { editorial, editorialHairline } from "../../theme/editorial";
import type { CareerPortalAccessSetting } from "../../types";

interface Props {
  open: boolean;
  onClose: () => void;
  setting: CareerPortalAccessSetting;
  loading: boolean;
  saving: boolean;
  error: string;
  onSave: (isPublic: boolean) => Promise<CareerPortalAccessSetting>;
}

interface AccessOption {
  isPublic: boolean;
  label: string;
  description: string;
  icon: typeof Public;
}

const ACCESS_OPTIONS: AccessOption[] = [
  {
    isPublic: true,
    label: "Public",
    description:
      "Anyone with the link can browse openings and apply, no Microsoft 365 sign-in needed. External candidates included.",
    icon: Public,
  },
  {
    isPublic: false,
    label: "Signed-in accounts only",
    description:
      "Visitors must sign in with a PMW Microsoft 365 account before they can see openings or submit an application.",
    icon: Lock,
  },
];

function formatUpdated(setting: CareerPortalAccessSetting): string {
  if (!setting.updatedAt) return "";
  const when = new Date(setting.updatedAt);
  if (Number.isNaN(when.getTime())) return "";
  const stamp = when.toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
  return setting.updatedBy ? `Last changed by ${setting.updatedBy} on ${stamp}.` : `Last changed on ${stamp}.`;
}

export default function CareerPortalAccessDialog({
  open,
  onClose,
  setting,
  loading,
  saving,
  error,
  onSave,
}: Props) {
  const [selectedIsPublic, setSelectedIsPublic] = useState(setting.isPublic);

  useEffect(() => {
    if (!open) return;
    setSelectedIsPublic(setting.isPublic);
  }, [open, setting.isPublic]);

  const updatedNote = formatUpdated(setting);
  const isDirty = selectedIsPublic !== setting.isPublic;

  async function handleSave(): Promise<void> {
    try {
      await onSave(selectedIsPublic);
      onClose();
    } catch {
      /* Save errors are surfaced through the shared hook's error state. */
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: "12px" } } }}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, pb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
          <VisibilityOutlined sx={{ color: editorial.pmwBlueDark }} />
          <Typography variant="h6" sx={{ fontWeight: 700, color: editorial.ink }}>
            Career Portal Access
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" aria-label="Close career portal access settings">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Typography variant="body2" sx={{ color: editorial.muted, mb: 2 }}>
          Controls who can reach the career portal at <strong>/career-portal</strong>. Job openings and the apply form
          are both covered.
        </Typography>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <Stack spacing={1.5} role="radiogroup" aria-label="Career portal access">
            {ACCESS_OPTIONS.map((option) => {
              const selected = selectedIsPublic === option.isPublic;
              const OptionIcon = option.icon;

              return (
                <Box
                  key={option.label}
                  role="radio"
                  aria-checked={selected}
                  tabIndex={0}
                  onClick={() => setSelectedIsPublic(option.isPublic)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedIsPublic(option.isPublic);
                    }
                  }}
                  sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 1.5,
                    p: 2,
                    borderRadius: "12px",
                    cursor: "pointer",
                    border: selected ? `1px solid ${editorial.pmwBlue}` : editorialHairline,
                    backgroundColor: selected ? editorial.blueWash : editorial.white,
                    transition: "background-color 0.2s ease, border-color 0.2s ease",
                    "&:hover": { borderColor: editorial.pmwBlue },
                    "&:focus-visible": {
                      outline: `3px solid ${editorial.pmwBlueSoft}`,
                      outlineOffset: 2,
                    },
                  }}
                >
                  <Radio
                    checked={selected}
                    onChange={() => setSelectedIsPublic(option.isPublic)}
                    size="small"
                    sx={{ p: 0, mt: 0.25 }}
                    tabIndex={-1}
                  />
                  <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                      <OptionIcon sx={{ fontSize: 18, color: editorial.pmwBlueDark }} />
                      <Typography variant="body2" sx={{ fontWeight: 700, color: editorial.ink }}>
                        {option.label}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ color: editorial.muted, mt: 0.5 }}>
                      {option.description}
                    </Typography>
                  </Box>
                </Box>
              );
            })}

            {!selectedIsPublic && (
              <Alert severity="info" sx={{ mt: 0.5 }}>
                External candidates without a PMW account will not be able to view or apply for openings while this is
                on.
              </Alert>
            )}

            {updatedNote && (
              <Typography variant="caption" sx={{ color: editorial.muted }}>
                {updatedNote}
              </Typography>
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: "none", color: editorial.muted }}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={loading || saving || !isDirty}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ textTransform: "none", fontWeight: 700 }}
        >
          {saving ? "Saving..." : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
