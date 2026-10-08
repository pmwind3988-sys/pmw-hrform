import { useState, type ReactNode } from "react";
import { Box, Button, IconButton, ListItemIcon, Menu, MenuItem, Tooltip, Typography } from "@mui/material";
import { MoreHorizRounded } from "@mui/icons-material";
import { editorial, onCanvas, onCanvasMuted, siType } from "../../theme/editorial";

export interface PageAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
}

interface PageHeaderProps {
  title: string;
  /** One sentence on what the page is for. Optional; keep it short. */
  description?: ReactNode;
  /** The ONE main action, drawn as a filled navy pill. */
  primary?: PageAction;
  /** Up to two everyday actions, drawn as quiet pills. */
  secondary?: PageAction[];
  /** Occasional or maintenance actions, tucked into a ⋯ menu. */
  more?: PageAction[];
  /** Anything else to sit at the right, before the actions (a status pill). */
  aside?: ReactNode;
}

/**
 * The top of every page inside the shell.
 *
 * A title and one sentence set straight on the canvas, with the actions at the
 * right as pills. Replaces the many page-specific header bands -- white strips
 * nested under the shell's own bar, empty bands holding only a hamburger, and
 * headers whose title was squeezed into a narrow column by four text links.
 *
 * Action hierarchy is part of the component: one filled primary, at most two
 * quiet secondaries, everything occasional behind ⋯. A page that wants five
 * equal buttons up here has to decide which one matters.
 */
export default function PageHeader({ title, description, primary, secondary = [], more = [], aside }: PageHeaderProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  return (
    <Box
      component="header"
      sx={{
        display: "flex",
        alignItems: { xs: "flex-start", sm: "center" },
        flexDirection: { xs: "column", sm: "row" },
        gap: { xs: 1.5, sm: 2 },
        mb: 3,
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography component="h2" sx={{ ...siType.display, fontSize: { xs: "1.45rem", sm: "1.75rem" }, lineHeight: 1.2, ...onCanvas }}>
          {title}
        </Typography>
        {description && (
          <Typography component="div" sx={{ ...siType.body, mt: 0.5, maxWidth: 720, ...onCanvasMuted }}>
            {description}
          </Typography>
        )}
      </Box>

      {(aside || primary || secondary.length > 0 || more.length > 0) && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", flexShrink: 0 }}>
          {aside}
          {secondary.slice(0, 2).map((action) => (
            <Button
              key={action.label}
              variant="text"
              startIcon={action.icon}
              onClick={action.onClick}
              disabled={action.disabled}
              sx={{ backgroundColor: editorial.panel, boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)", "&:hover": { backgroundColor: editorial.blueSoft } }}
            >
              {action.label}
            </Button>
          ))}
          {primary && (
            <Button variant="contained" startIcon={primary.icon} onClick={primary.onClick} disabled={primary.disabled}>
              {primary.label}
            </Button>
          )}
          {more.length > 0 && (
            <>
              <Tooltip title="More actions">
                <IconButton
                  aria-label="More actions"
                  aria-haspopup="menu"
                  onClick={(event) => setMenuAnchor(event.currentTarget)}
                  sx={{ backgroundColor: editorial.panel, "&:hover": { backgroundColor: editorial.blueSoft } }}
                >
                  <MoreHorizRounded />
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={() => setMenuAnchor(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
              >
                {more.map((action) => (
                  <MenuItem
                    key={action.label}
                    disabled={action.disabled}
                    onClick={() => {
                      setMenuAnchor(null);
                      action.onClick();
                    }}
                  >
                    {action.icon && <ListItemIcon>{action.icon}</ListItemIcon>}
                    {action.label}
                  </MenuItem>
                ))}
              </Menu>
            </>
          )}
        </Box>
      )}
    </Box>
  );
}
