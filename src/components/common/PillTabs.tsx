import type { ReactNode } from "react";
import { Box } from "@mui/material";
import { editorial, si, siType } from "../../theme/editorial";

export interface PillTab<T extends string> {
  value: T;
  label: string;
  /** A count shown after the label: "Problems · 22". */
  count?: number;
  icon?: ReactNode;
  /** Draws the count in the error colour, for "something needs fixing". */
  alert?: boolean;
}

interface PillTabsProps<T extends string> {
  tabs: Array<PillTab<T>>;
  value: T;
  onChange: (value: T) => void;
  "aria-label": string;
}

/**
 * Switching between views of one page, as a row of pills.
 *
 * The rounded system's replacement for underlined MUI Tabs and for rows of
 * same-size stat tiles that were really filters: the selected pill fills navy,
 * the rest sit quiet, and a count rides inside the pill it describes. Scrolls
 * sideways on a narrow screen instead of wrapping, so the content below never
 * jumps.
 */
export default function PillTabs<T extends string>({ tabs, value, onChange, ...rest }: PillTabsProps<T>) {
  return (
    <Box
      role="tablist"
      aria-label={rest["aria-label"]}
      className="no-scrollbar"
      sx={{ display: "flex", gap: 1, overflowX: "auto", pb: 0.5, mb: 2 }}
    >
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <Box
            key={tab.value}
            component="button"
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.value)}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.75,
              flexShrink: 0,
              border: "none",
              cursor: "pointer",
              minHeight: 38,
              px: 2,
              borderRadius: `${si.radiusPill}px`,
              ...siType.subtext,
              fontWeight: 600,
              whiteSpace: "nowrap",
              color: selected ? editorial.white : editorial.ink,
              backgroundColor: selected ? editorial.navy : editorial.panel,
              boxShadow: selected ? "none" : "0 1px 2px rgba(15, 23, 42, 0.06)",
              transition: "background-color 0.15s ease, color 0.15s ease",
              "&:hover": { backgroundColor: selected ? editorial.navyDeep : editorial.blueSoft },
              "& svg": { fontSize: 18 },
            }}
          >
            {tab.icon}
            {tab.label}
            {typeof tab.count === "number" && (
              <Box
                component="span"
                sx={{
                  minWidth: 22,
                  px: 0.75,
                  borderRadius: `${si.radiusPill}px`,
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 700,
                  fontSize: "0.72rem",
                  lineHeight: "20px",
                  textAlign: "center",
                  backgroundColor: selected ? "rgba(255,255,255,0.18)" : tab.alert ? editorial.errorSoft : editorial.skySoft,
                  color: selected ? editorial.white : tab.alert ? editorial.error : editorial.navyDeep,
                }}
              >
                {tab.count}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
