import {
  Alert,
  Box,
  Collapse,
  IconButton,
  Typography,
} from "@mui/material";
import { Warning as WarningIcon, Close as CloseIcon } from "@mui/icons-material";
import { useState } from "react";

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
          border: "1px solid rgba(245,158,11,0.2)",
          backgroundColor: "rgba(254,243,199,0.5)",
          "& .MuiAlert-message": {
            width: "100%",
          },
        }}
        action={
          <IconButton
            aria-label="dismiss"
            color="inherit"
            size="small"
            onClick={() => setOpen(false)}
          >
            <CloseIcon fontSize="inherit" />
          </IconButton>
        }
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: "#92400e", mb: 0.5 }}>
          Lists missing configuration
        </Typography>
        <Typography variant="body2" sx={{ color: "rgba(146,64,14,0.8)", mb: 1 }}>
          The following lists are not yet configured in the Documents config library:
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
          {missingLists.map((list) => (
            <Box
              key={list}
              sx={{
                backgroundColor: "rgba(245,158,11,0.15)",
                color: "#92400e",
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
