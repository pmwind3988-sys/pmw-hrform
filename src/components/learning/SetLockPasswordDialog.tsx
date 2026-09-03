import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  ContentCopyOutlined,
  LockOutlined,
  VisibilityOffOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";
import { editorial } from "../../theme/editorial";
import { learningButtonSx } from "./learningUi";

/** Mirrors `MIN_LOCK_PASSWORD_LENGTH` in `api/_utils/learningLocks.ts`. */
export const MIN_LOCK_PASSWORD_LENGTH = 8;

interface SetLockPasswordDialogProps {
  /** What is being locked, for the heading — a material title or a topic path. */
  label: string;
  scope: "topic" | "material";
  /** True when a password already exists, so this replaces rather than sets one. */
  replacing: boolean;
  onSave: (password: string) => void;
  onClose: () => void;
}

/**
 * Where an HR Forms Owner sets the password on a topic or a material.
 *
 * **Mount only while open**, like the portal-account credential dialogs: the
 * typed password must not survive in state after the dialog closes, and a
 * `useEffect` resetting off an `open` prop would leave one material's password
 * sitting there until the next one was set.
 *
 * There is no "current password" field and no way to read one back. The server
 * stores a one-way hash, so a forgotten password is replaced, never recovered —
 * and the copy below says so, because an admin who assumes otherwise will hand
 * out a password they cannot check.
 */
export default function SetLockPasswordDialog({
  label,
  scope,
  replacing,
  onSave,
  onClose,
}: SetLockPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_LOCK_PASSWORD_LENGTH;
  const mismatched = confirmation.length > 0 && confirmation !== password;
  const canSave = password.length >= MIN_LOCK_PASSWORD_LENGTH && confirmation === password;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      // Clipboard access can be refused outright; the field is readable anyway.
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { borderRadius: "12px" } } }}>
      <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: editorial.blueWash,
              color: editorial.pmwBlueDark,
              flexShrink: 0,
            }}
          >
            <LockOutlined />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: editorial.ink, lineHeight: 1.2 }}>
              {replacing ? "Change password" : "Set a password"}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                color: editorial.muted,
                display: "block",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" sx={{ color: editorial.muted, fontWeight: 600, mb: 2 }}>
          {scope === "topic"
            ? "Everything inside this topic — subtopics included — is hidden from the hub until this password is entered."
            : "This material is hidden from preview and cannot be opened until this password is entered."}{" "}
          Staff have to enter it every time they open it.
        </Typography>

        <Stack spacing={2}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            type={revealed ? "text" : "password"}
            label="Password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setCopied(false);
            }}
            error={tooShort}
            helperText={
              tooShort ? `At least ${MIN_LOCK_PASSWORD_LENGTH} characters.` : "Share it with the people who need it."
            }
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setRevealed((current) => !current)}
                      aria-label={revealed ? "Hide password" : "Show password"}
                    >
                      {revealed ? <VisibilityOffOutlined fontSize="small" /> : <VisibilityOutlined fontSize="small" />}
                    </IconButton>
                    <IconButton size="small" edge="end" onClick={() => void copy()} disabled={!password} aria-label="Copy password">
                      <ContentCopyOutlined fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              },
              htmlInput: { autoComplete: "new-password" },
            }}
          />

          <TextField
            fullWidth
            size="small"
            type={revealed ? "text" : "password"}
            label="Confirm password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            error={mismatched}
            helperText={mismatched ? "The two passwords do not match." : " "}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canSave) onSave(password);
            }}
            slotProps={{ htmlInput: { autoComplete: "new-password" } }}
          />

          {copied && (
            <Alert severity="success" sx={{ borderRadius: "12px", fontWeight: 700 }}>
              Copied to the clipboard.
            </Alert>
          )}

          <Alert severity="info" sx={{ borderRadius: "12px", fontWeight: 600 }}>
            Write this down now. It is stored as a one-way hash, so it can be replaced later but never looked up —
            not from this screen and not from SharePoint.
          </Alert>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={learningButtonSx}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => onSave(password)} disabled={!canSave} sx={learningButtonSx}>
          {replacing ? "Replace password" : "Lock it"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
