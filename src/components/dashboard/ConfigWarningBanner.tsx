import {
  Alert,
  Box,
  Collapse,
  IconButton,
  Typography,
} from "@mui/material";
import { Warning as WarningIcon, Close as CloseIcon } from "@mui/icons-material";
import { useState } from "react";
import { editorial } from "../../theme/editorial";

interface ConfigWarningBannerProps {
  missingLists: string[];
}

export default function ConfigWarningBanner({ missingLists }: ConfigWarningBannerProps) {
  const [open, setOpen] = useState(true);

  if (missingLists.length === 0 || !open) return null;

  return (
    <Collapse in={open}>
      <Alert
        severity="warning"
        icon={<WarningIcon />}
        sx={{
          borderRadius: "12px",
          border: `1px solid ${editorial.yellowSoft}`,
          backgroundColor: "rgba(255, 248, 184, 0.45)",
          "& .MuiAlert-message": {
            width: "100%",
          },
          "& .MuiAlert-icon": {
            color: editorial.warning,
          },
        }}
        action={
          <IconButton
            aria-label="dismiss"
            color="inherit"
            size="small"
            onClick={() => setOpen(false)}
            sx={{
              borderRadius: "10px",
              "&:focus-visible": {
                outline: `3px solid ${editorial.yellowSoft}`,
                outlineOffset: 2,
              },
            }}
          >
            <CloseIcon fontSize="inherit" />
          </IconButton>
        }
      >
        <Typography variant="body2" sx={{ fontWeight: 800, color: editorial.warning, mb: 0.5 }}>
          Lists missing configuration
        </Typography>
        <Typography variant="body2" sx={{ color: editorial.muted, mb: 1 }}>
          The following lists are not yet configured in the Documents config library:
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
          {missingLists.map((list) => (
            <Box
              key={list}
              sx={{
                backgroundColor: editorial.yellowSoft,
                color: editorial.warning,
                fontFamily: "monospace",
                fontSize: "0.75rem",
                px: 1.5,
                py: 0.5,
                borderRadius: "6px",
              }}
            >
              {list}
            </Box>
          ))}
        </Box>
      </Alert>
    </Collapse>
  );
}
