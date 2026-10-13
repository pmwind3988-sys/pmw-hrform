import { Box } from "@mui/material";
import type { ReactNode } from "react";
import type { SxProps, Theme } from "@mui/material/styles";
import { editorial } from "../../theme/editorial";
import { sap } from "./sapTheme";

interface SapPanelProps {
  /** Accessible name for the region. */
  label: string;
  /** Optional title strip content (a heading, tabs, a toolbar). */
  header?: ReactNode;
  /** Optional status bar along the bottom. */
  status?: ReactNode;
  children: ReactNode;
  sx?: SxProps<Theme>;
}

/** A square, outlined panel with an optional title strip and status bar. */
export default function SapPanel({ label, header, status, children, sx }: SapPanelProps) {
  return (
    <Box
      component="section"
      aria-label={label}
      sx={[
        {
          backgroundColor: editorial.panel,
          border: `1px solid ${sap.line}`,
          borderRadius: `${sap.radius}px`,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          fontSize: sap.fontSize,
          color: editorial.ink,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {header && (
        <Box
          sx={{
            backgroundColor: sap.barBg,
            borderBottom: `1px solid ${sap.line}`,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 1.25,
            px: 1,
            py: 0.5,
            minHeight: 36,
          }}
        >
          {header}
        </Box>
      )}
      <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</Box>
      {status && (
        <Box
          role="status"
          sx={{
            backgroundColor: sap.barBg,
            borderTop: `1px solid ${sap.line}`,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 1.5,
            px: 1,
            py: 0.375,
            fontSize: 12,
            color: sap.headerInk,
          }}
        >
          {status}
        </Box>
      )}
    </Box>
  );
}

/** The bold heading that sits in a panel's title strip. */
export function SapPanelTitle({ children }: { children: ReactNode }) {
  return (
    <Box component="h2" sx={{ m: 0, fontSize: 14, fontWeight: 700, color: editorial.ink }}>
      {children}
    </Box>
  );
}
