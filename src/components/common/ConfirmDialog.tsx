import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import { DeleteForeverOutlined, WarningAmberOutlined } from "@mui/icons-material";
import { editorial, si, siType } from "../../theme/editorial";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** One or two sentences saying what will happen. Plain text, not a warning wall. */
  body: React.ReactNode;
  /** The affirmative button's label. "Delete", "Remove password" — a verb, never "Yes". */
  confirmLabel: string;
  /** Paints the action red and gives it the bin icon. */
  destructive?: boolean;
  /** Shows a spinner and locks both buttons while the action is in flight. */
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * The app's one confirmation dialog.
 *
 * It replaces two older habits. `window.confirm` — six call sites — is the
 * browser's own dialog: unstyled, unbranded, and on some platforms it names the
 * origin ("localhost:3000 says") rather than the app. And the approvals screen
 * asked the user to TYPE the word DELETE, which is friction spent on the wrong
 * thing: it proves someone can copy a word, not that they meant this row.
 *
 * Two details that are not decoration:
 *
 *   - The confirm button is NOT auto-focused. A dialog that focuses its own
 *     destructive action turns a reflexive Enter into a deletion.
 *   - The label is a verb ("Delete"), not "Yes". Read on its own, mid-task, a
 *     button saying Yes does not say what it agrees to.
 *
 * Escape and the backdrop both cancel, and both are disabled while `busy`, so a
 * stray keypress cannot dismiss the dialog while the delete is still running
 * and leave the user unsure whether it happened.
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const accent = destructive ? editorial.error : editorial.navy;

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      sx={{ zIndex: si.zDialog }}
      slotProps={{
        paper: {
          sx: {
            borderRadius: `${si.radius}px`,
            boxShadow: si.shadowRaised,
          },
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", pb: 1 }}>
        <Box
          sx={{
            width: 38,
            height: 38,
            flexShrink: 0,
            borderRadius: `${si.radiusSm}px`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: destructive ? editorial.errorSoft : editorial.blueWash,
            color: accent,
          }}
        >
          {destructive ? (
            <DeleteForeverOutlined sx={{ fontSize: 20 }} />
          ) : (
            <WarningAmberOutlined sx={{ fontSize: 20 }} />
          )}
        </Box>
        <Typography sx={{ ...siType.subsectionTitle, color: editorial.ink, mt: 0.5 }}>
          {title}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: 0, pl: 8.5 }}>
        <Typography component="div" sx={{ ...siType.body, color: editorial.muted }}>
          {body}
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1.5, gap: 1 }}>
        <Button
          onClick={onClose}
          disabled={busy}
          sx={{
            borderRadius: `${si.radius}px`,
            minHeight: si.touchTarget,
            px: 2,
            textTransform: "none",
            fontWeight: 700,
            color: editorial.muted,
          }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          color={destructive ? "error" : "primary"}
          onClick={onConfirm}
          disabled={busy}
          // Deliberately not autoFocus — see the component comment.
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{
            borderRadius: `${si.radius}px`,
            minHeight: si.touchTarget,
            px: 2.5,
            textTransform: "none",
            fontWeight: 700,
          }}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
