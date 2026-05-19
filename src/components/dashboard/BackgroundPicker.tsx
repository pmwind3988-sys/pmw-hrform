import {
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
} from "@mui/material";
import { Close, Check } from "@mui/icons-material";
import { useBackground } from "../../hooks/useBackground";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function BackgroundPicker({ open, onClose }: Props) {
  const { currentId, selectById, predefined } = useBackground();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: "20px" } } }}>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: "#111827" }}>
          Choose Background
        </Typography>
        <IconButton onClick={onClose} size="small"><Close /></IconButton>
      </DialogTitle>

      <DialogContent>
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
      </DialogContent>
    </Dialog>
  );
}
