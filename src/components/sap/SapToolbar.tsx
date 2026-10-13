import { Box, ButtonBase } from "@mui/material";
import type { ReactNode } from "react";
import { editorial } from "../../theme/editorial";
import { sap } from "./sapTheme";

/** A row of flat icon-and-label buttons. */
export function SapToolbar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box role="toolbar" aria-label={label} sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.25 }}>
      {children}
    </Box>
  );
}

interface SapToolButtonProps {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}

export function SapToolButton({ icon, children, onClick, disabled = false, tone = "default" }: SapToolButtonProps) {
  return (
    <ButtonBase
      onClick={onClick}
      disabled={disabled}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        height: 28,
        px: 1.125,
        fontSize: sap.fontSize,
        fontFamily: "inherit",
        color: tone === "danger" ? editorial.error : editorial.ink,
        border: "1px solid transparent",
        borderRadius: `${sap.radius}px`,
        "& svg": { fontSize: 16, color: tone === "danger" ? editorial.error : editorial.navy },
        "&:hover": { backgroundColor: editorial.panel, borderColor: sap.line },
        "&.Mui-focusVisible": { outline: `2px solid ${editorial.navy}`, outlineOffset: 1 },
        "&.Mui-disabled": { color: editorial.softMuted, "& svg": { color: editorial.softMuted } },
      }}
    >
      {icon}
      {children}
    </ButtonBase>
  );
}

/** A thin vertical rule between groups of toolbar buttons. */
export function SapToolSeparator() {
  return <Box aria-hidden sx={{ width: "1px", height: 18, backgroundColor: sap.line, mx: 0.5 }} />;
}
