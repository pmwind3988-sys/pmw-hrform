/**
 * SessionTakeoverDialog.tsx
 *
 * Shown when the API reports an active session from another browser/tab.
 * Offers the user the choice to "Take Over" or "Go Back".
 */
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
} from "@mui/material";
import { WarningAmberOutlined as WarningIcon } from "@mui/icons-material";
import type { ConflictInfo } from "../../utils/sessionManager";

interface Props {
  open: boolean;
  conflictInfo: ConflictInfo | null;
  onTakeover: () => void;
  onCancel: () => void;
}

export default function SessionTakeoverDialog({
  open,
  conflictInfo,
  onTakeover,
  onCancel,
}: Props) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: "16px",
            p: 1,
          },
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, pb: 0 }}>
        <WarningIcon sx={{ color: "#F59E0B", fontSize: 28 }} />
        <Typography variant="h6" sx={{ fontWeight: 600, color: "#111827" }}>
          Active Session Detected
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: 2, pb: 1 }}>
        <Typography variant="body1" sx={{ color: "#374151", mb: 2, lineHeight: 1.6 }}>
          Your account is currently active in another browser or tab.
        </Typography>

        {conflictInfo && (
          <Box
            sx={{
              backgroundColor: "#F9FAFB",
              borderRadius: "10px",
              p: 2,
              border: "1px solid #E5E7EB",
              mb: 1,
            }}
          >
            <Typography variant="body2" sx={{ color: "#6B7280", mb: 0.5 }}>
              Session started at:{" "}
              <strong>{conflictInfo.startedAt ? new Date(conflictInfo.startedAt).toLocaleString() : "Unknown"}</strong>
            </Typography>
            <Typography variant="body2" sx={{ color: "#6B7280" }}>
              Browser: <strong>{conflictInfo.userAgent || "Unknown"}</strong>
            </Typography>
          </Box>
        )}

        <Typography variant="body2" sx={{ color: "#9CA3AF", mt: 2 }}>
          Taking over will end the other session. You may lose unsaved work in the other browser.
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button
          onClick={onCancel}
          variant="outlined"
          sx={{
            borderRadius: "10px",
            textTransform: "none",
            fontWeight: 500,
            px: 3,
          }}
        >
          Go Back
        </Button>
        <Button
          onClick={onTakeover}
          variant="contained"
          sx={{
            borderRadius: "10px",
            textTransform: "none",
            fontWeight: 600,
            px: 3,
            backgroundColor: "#0078D4",
            "&:hover": { backgroundColor: "#106EBE" },
          }}
        >
          Take Over
        </Button>
      </DialogActions>
    </Dialog>
  );
}
