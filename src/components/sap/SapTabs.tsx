import { Box, ButtonBase } from "@mui/material";
import { editorial } from "../../theme/editorial";
import { sap } from "./sapTheme";

export interface SapTab<V extends string> {
  value: V;
  label: string;
  count?: number;
}

interface SapTabsProps<V extends string> {
  label: string;
  value: V;
  onChange: (value: V) => void;
  tabs: SapTab<V>[];
}

/** A joined row of tabs, each with its count: "All (58) | Pending (12) | …". */
export default function SapTabs<V extends string>({ label, value, onChange, tabs }: SapTabsProps<V>) {
  return (
    <Box
      role="tablist"
      aria-label={label}
      sx={{
        display: "inline-flex",
        flexWrap: "wrap",
        border: `1px solid ${sap.line}`,
        borderRadius: `${sap.radius}px`,
        overflow: "hidden",
        backgroundColor: editorial.panel,
      }}
    >
      {tabs.map((tab, index) => {
        const selected = tab.value === value;
        return (
          <ButtonBase
            key={tab.value}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.value)}
            sx={{
              height: 26,
              px: 1.125,
              fontSize: sap.fontSize,
              fontFamily: "inherit",
              fontWeight: selected ? 600 : 400,
              color: selected ? editorial.white : editorial.ink,
              backgroundColor: selected ? editorial.navy : "transparent",
              borderLeft: index === 0 ? "none" : `1px solid ${sap.line}`,
              fontVariantNumeric: "tabular-nums",
              "&:hover": selected ? undefined : { backgroundColor: editorial.skySoft },
              "&.Mui-focusVisible": { outline: `2px solid ${editorial.navy}`, outlineOffset: -2 },
            }}
          >
            {tab.count === undefined ? tab.label : `${tab.label} (${tab.count})`}
          </ButtonBase>
        );
      })}
    </Box>
  );
}
