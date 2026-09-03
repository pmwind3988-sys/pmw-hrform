import { useState } from "react";
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
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  FolderOutlined,
  LockOutlined,
  VisibilityOffOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";
import { editorial } from "../../theme/editorial";
import { learningButtonSx } from "./learningUi";

interface UnlockPasswordDialogProps {
  /** What the password belongs to — a topic path, or a material title. */
  label: string;
  scope: "topic" | "material";
  busy: boolean;
  error: string;
  onSubmit: (password: string) => void;
  onClose: () => void;
}

/**
 * The password box a learner meets in front of locked content.
 *
 * **Mount this only while it is open** (`{prompt && <UnlockPasswordDialog …>}`)
 * rather than driving it from an `open` prop. The field starts empty on every
 * mount, which is the whole behaviour being asked for: the password is typed
 * again each time, and there is nowhere for the last one to be left lying.
 */
export default function UnlockPasswordDialog({
  label,
  scope,
  busy,
  error,
  onSubmit,
  onClose,
}: UnlockPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);

  const submit = () => {
    if (!password || busy) return;
    onSubmit(password);
  };

  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{ paper: { sx: { borderRadius: "12px" } } }}
    >
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
            {scope === "topic" ? <FolderOutlined /> : <LockOutlined />}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: editorial.ink, lineHeight: 1.2 }}>
              Password required
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
            ? "This topic is protected. Enter its password to see what is inside."
            : "This material is protected. The password is needed every time it is opened."}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: "12px", fontWeight: 700 }}>
            {error}
          </Alert>
        )}

        <TextField
          autoFocus
          fullWidth
          size="small"
          type={revealed ? "text" : "password"}
          label="Password"
          value={password}
          disabled={busy}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
          slotProps={{
            // A shared password read off a slide is mistyped often enough that
            // hiding it with no way to check is its own kind of lockout.
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    edge="end"
                    onClick={() => setRevealed((current) => !current)}
                    aria-label={revealed ? "Hide password" : "Show password"}
                  >
                    {revealed ? (
                      <VisibilityOffOutlined fontSize="small" />
                    ) : (
                      <VisibilityOutlined fontSize="small" />
                    )}
                  </IconButton>
                </InputAdornment>
              ),
            },
            htmlInput: { autoComplete: "off" },
          }}
        />
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy} sx={learningButtonSx}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={!password || busy}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <LockOutlined />}
          sx={learningButtonSx}
        >
          Unlock
        </Button>
      </DialogActions>
    </Dialog>
  );
}
