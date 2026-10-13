import { Box, ButtonBase } from "@mui/material";
import { DescriptionOutlined, FolderOutlined, ViewListOutlined } from "@mui/icons-material";
import type { ReactNode } from "react";
import { editorial } from "../../theme/editorial";
import { sap } from "./sapTheme";

export interface SapFormTreeEntry {
  title: string;
  category: string;
  /** Submissions not yet approved or rejected. */
  open: number;
  total: number;
}

interface SapFormTreeProps {
  forms: SapFormTreeEntry[];
  /** The selected form's title, or "" for every form. */
  selected: string;
  onSelect: (title: string) => void;
}

/**
 * The left-hand tree on All Submissions: "All submissions" at the root, the
 * forms grouped under their categories, each with its open and total counts.
 *
 * Categories are headings, not choices. The list underneath filters on one form
 * at a time (`filters.formType`), and a category that looked clickable but
 * quietly showed every form would be lying about what was on screen.
 */
export default function SapFormTree({ forms, selected, onSelect }: SapFormTreeProps) {
  const categories = Array.from(new Set(forms.map((form) => form.category))).sort((a, b) => a.localeCompare(b));
  const totalOpen = forms.reduce((sum, form) => sum + form.open, 0);
  const total = forms.reduce((sum, form) => sum + form.total, 0);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", fontSize: sap.fontSize, minWidth: 0 }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 48px 48px",
          backgroundColor: sap.headerBg,
          borderBottom: `1px solid ${sap.line}`,
          color: sap.headerInk,
          fontWeight: 600,
          fontSize: 12,
          position: "sticky",
          top: 0,
          zIndex: 1,
        }}
      >
        <Box sx={{ px: 1, py: 0.5 }}>Form</Box>
        <Box sx={{ px: 1, py: 0.5, textAlign: "right", borderLeft: `1px solid ${sap.lineSoft}` }}>Open</Box>
        <Box sx={{ px: 1, py: 0.5, textAlign: "right", borderLeft: `1px solid ${sap.lineSoft}` }}>Total</Box>
      </Box>
      <Box role="tree" aria-label="Forms" sx={{ display: "flex", flexDirection: "column", py: 0.25 }}>
        <TreeRow
          depth={0}
          icon={<ViewListOutlined />}
          label="All submissions"
          open={totalOpen}
          total={total}
          selected={selected === ""}
          onClick={() => onSelect("")}
          bold
        />
        {categories.map((category) => {
          const inCategory = forms.filter((form) => form.category === category);
          return (
            <Box key={category} role="group" aria-label={category}>
              <TreeRow
                depth={1}
                icon={<FolderOutlined />}
                label={category}
                open={inCategory.reduce((sum, form) => sum + form.open, 0)}
                total={inCategory.reduce((sum, form) => sum + form.total, 0)}
                bold
              />
              {inCategory.map((form) => (
                <TreeRow
                  key={form.title}
                  depth={2}
                  icon={<DescriptionOutlined />}
                  label={form.title}
                  open={form.open}
                  total={form.total}
                  selected={selected === form.title}
                  onClick={() => onSelect(form.title)}
                />
              ))}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

interface TreeRowProps {
  depth: number;
  icon: ReactNode;
  label: string;
  open: number;
  total: number;
  selected?: boolean;
  onClick?: () => void;
  bold?: boolean;
}

function TreeRow({ depth, icon, label, open, total, selected = false, onClick, bold = false }: TreeRowProps) {
  const content = (
    <>
      <Box
        component="span"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          pl: `${8 + depth * 16}px`,
          minWidth: 0,
          fontWeight: bold ? 600 : 400,
          "& svg": { fontSize: 15, flexShrink: 0, color: selected ? editorial.white : depth === 2 ? editorial.muted : editorial.navy },
        }}
      >
        {icon}
        <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</Box>
      </Box>
      <Box
        component="span"
        sx={{
          textAlign: "right",
          pr: 1,
          fontVariantNumeric: "tabular-nums",
          fontWeight: open > 0 ? 600 : 400,
          color: selected ? editorial.white : open > 0 ? editorial.warning : editorial.muted,
        }}
      >
        {open > 0 ? open : ""}
      </Box>
      <Box component="span" sx={{ textAlign: "right", pr: 1, fontVariantNumeric: "tabular-nums", color: selected ? editorial.white : editorial.muted }}>
        {total}
      </Box>
    </>
  );

  const rowSx = {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) 48px 48px",
    alignItems: "center",
    minHeight: 28,
    width: "100%",
    textAlign: "left",
    fontSize: sap.fontSize,
    fontFamily: "inherit",
    color: selected ? editorial.white : editorial.ink,
    backgroundColor: selected ? editorial.navy : "transparent",
  } as const;

  if (!onClick) {
    return (
      <Box role="treeitem" aria-label={`${label}, ${open} open of ${total}`} sx={rowSx}>
        {content}
      </Box>
    );
  }

  return (
    <ButtonBase
      role="treeitem"
      aria-selected={selected}
      onClick={onClick}
      sx={{
        ...rowSx,
        "&:hover": selected ? undefined : { backgroundColor: editorial.skySoft },
        "&.Mui-focusVisible": { outline: `2px solid ${editorial.navy}`, outlineOffset: -2 },
      }}
    >
      {content}
    </ButtonBase>
  );
}
