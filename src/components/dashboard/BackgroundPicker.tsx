import { useState } from "react";
import {
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  TextField,
  Button,
} from "@mui/material";
import { Close, Check } from "@mui/icons-material";
import { useBackground } from "../../hooks/useBackground";

const CUSTOM_ID = "custom";

interface Props {
  open: boolean;
  onClose: () => void;
}

function buildCustomCss(url: string): string {
  return `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.3)), url("${url}") center/cover no-repeat`;
}

export default function BackgroundPicker({ open, onClose }: Props) {
  const { currentId, selectById, predefined, customUrl, setCustomUrl } = useBackground();
  const [urlInput, setUrlInput] = useState("");

  const isCustomActive = currentId === CUSTOM_ID && !!customUrl;

  const handleSetCustom = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    setCustomUrl(trimmed);
    setUrlInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSetCustom();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: "20px" } } }}>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: "#111827" }}>
          Choose Background
        </Typography>
        <IconButton onClick={onClose} size="small"><Close /></IconButton>
      </DialogTitle>

      <DialogContent>
        {/* ── Predefined grid ── */}
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 1.5 }}>
          {predefined.map((bg) => (
            <Box
              key={bg.id}
              onClick={() => { selectById(bg.id); onClose(); }}
              sx={{
                position: "relative",
                height: 80,
                borderRadius: "12px",
                cursor: "pointer",
                border: currentId === bg.id ? "2px solid #0078D4" : "2px solid transparent",
                background: bg.preview,
                boxShadow: currentId === bg.id
                  ? "0 0 0 3px rgba(0,120,212,0.15)"
                  : "0 1px 3px rgba(0,0,0,0.06)",
                transition: "all 0.2s ease",
                "&:hover": {
                  transform: "scale(1.05)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                },
                overflow: "hidden",
              }}
            >
              {currentId === bg.id && (
                <Box sx={{ position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: "50%", backgroundColor: "#0078D4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Check sx={{ fontSize: 12, color: "#fff" }} />
                </Box>
              )}
              <Typography
                variant="caption"
                sx={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  textAlign: "center",
                  fontSize: "0.65rem",
                  color: "#6B7280",
                  backgroundColor: "rgba(255,255,255,0.85)",
                  py: 0.5,
                  fontWeight: 500,
                }}
              >
                {bg.label}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* ── Custom URL section ── */}
        <Box sx={{ mt: 3, pt: 2.5, borderTop: "1px solid #e5e7eb" }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: "#374151", mb: 1 }}>
            Custom Image URL
          </Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Paste image URL…"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={handleKeyDown}
              slotProps={{ htmlInput: { sx: { fontSize: "0.875rem" } } }}
            />
            <Button
              variant="contained"
              onClick={handleSetCustom}
              disabled={!urlInput.trim()}
              sx={{ whiteSpace: "nowrap", minWidth: 64 }}
            >
              Set
            </Button>
          </Box>

          {isCustomActive && (
            <Box
              sx={{
                mt: 1.5,
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                p: 1.5,
                borderRadius: "10px",
                border: "1px solid #e5e7eb",
                backgroundColor: "#f9fafb",
              }}
            >
              <Box
                sx={{
                  width: 64,
                  height: 44,
                  borderRadius: 1,
                  background: buildCustomCss(customUrl),
                  border: "1px solid #d1d5db",
                  flexShrink: 0,
                }}
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" sx={{ color: "#6B7280", fontWeight: 500 }}>
                  Current image
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    color: "#374151",
                    wordBreak: "break-all",
                    lineHeight: 1.3,
                    mt: 0.25,
                    fontSize: "0.7rem",
                  }}
                >
                  {customUrl}
                </Typography>
              </Box>
            </Box>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
