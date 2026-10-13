import { Box } from "@mui/material";
import { Link } from "react-router-dom";
import { editorial } from "../../theme/editorial";
import { sap } from "./sapTheme";

/**
 * "By form | All submissions" — the two ways an admin can read submissions.
 *
 * Only drawn for accounts that can open `/admin/submissions` (HR Forms Owner +
 * superuser); everybody else has one view and no switch to wonder about.
 */
export default function SapViewSwitch({ current }: { current: "by-form" | "all" }) {
  const items = [
    { key: "by-form" as const, label: "By form", to: "/forms" },
    { key: "all" as const, label: "All submissions", to: "/admin/submissions" },
  ];
  return (
    <Box
      component="nav"
      aria-label="Submissions view"
      sx={{
        display: "inline-flex",
        border: `1px solid ${sap.line}`,
        borderRadius: `${sap.radius}px`,
        overflow: "hidden",
        backgroundColor: editorial.panel,
        fontSize: sap.fontSize,
      }}
    >
      {items.map((item, index) => {
        const active = item.key === current;
        return (
          <Box
            key={item.key}
            component={Link}
            to={item.to}
            aria-current={active ? "page" : undefined}
            sx={{
              px: 1.75,
              py: 0.75,
              textDecoration: "none",
              fontWeight: active ? 600 : 400,
              color: active ? editorial.white : editorial.ink,
              backgroundColor: active ? editorial.navy : "transparent",
              borderLeft: index === 0 ? "none" : `1px solid ${sap.line}`,
              "&:hover": active ? undefined : { backgroundColor: editorial.skySoft },
              "&:focus-visible": { outline: `2px solid ${editorial.navy}`, outlineOffset: -2 },
            }}
          >
            {item.label}
          </Box>
        );
      })}
    </Box>
  );
}
