import { Box, ButtonBase, useMediaQuery, useTheme } from "@mui/material";
import { FirstPage, LastPage, NavigateBefore, NavigateNext } from "@mui/icons-material";
import { useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import { editorial } from "../../theme/editorial";
import { sap } from "./sapTheme";

export interface SapColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: "left" | "right";
  /** Keeps short values (dates, counts) on one line. */
  nowrap?: boolean;
  width?: number | string;
  /** Cuts long text to one line at this width, with the full text on hover. */
  maxWidth?: number;
  /** Dropped on narrow screens, so the columns that matter keep their room. */
  hideOnNarrow?: boolean;
}

interface SapGridProps<T> {
  label: string;
  columns: SapColumn<T>[];
  rows: T[];
  getKey: (row: T) => string;
  /** Highlights one row and makes rows selectable by click, Space or Enter. */
  selectedKey?: string | null;
  onSelect?: (row: T) => void;
  /** Double-click, or Enter on the selected row. */
  onOpen?: (row: T) => void;
  emptyText?: ReactNode;
  minWidth?: number;
  /**
   * Rows per page. When set, the grid pages its rows and shows a pager under
   * them; when left out, every row is drawn.
   */
  pageSize?: number;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * A dense, ruled grid: sticky header, zebra rows, one selected row.
 *
 * Rows are focusable rather than wrapped in buttons, because a row holds its
 * own controls (a "Fill in" link, say) and a button cannot contain another.
 * Click or Space selects; Enter or a double-click opens.
 */
export default function SapGrid<T>({
  label,
  columns,
  rows,
  getKey,
  selectedKey = null,
  onSelect,
  onOpen,
  emptyText = "Nothing to show.",
  minWidth = 760,
  pageSize,
}: SapGridProps<T>) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(pageSize ?? 0);
  // Back to page 1 whenever the rows themselves change (another form, another
  // status tab), so a filter never lands someone on an empty page 5.
  const signature = `${rows.length}:${rows.length > 0 ? getKey(rows[0]) : ""}`;
  const [seenSignature, setSeenSignature] = useState(signature);
  if (signature !== seenSignature) {
    setSeenSignature(signature);
    setPage(0);
  }
  const paged = Boolean(pageSize) && size > 0;
  const pageCount = paged ? Math.max(1, Math.ceil(rows.length / size)) : 1;
  const currentPage = Math.min(page, pageCount - 1);
  const shownRows = paged ? rows.slice(currentPage * size, currentPage * size + size) : rows;

  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down("md"));
  const visibleColumns = narrow ? columns.filter((column) => !column.hideOnNarrow) : columns;
  const interactive = Boolean(onSelect || onOpen);

  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === " ") {
      event.preventDefault();
      onSelect?.(row);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (onOpen) onOpen(row);
      else onSelect?.(row);
    }
  };

  const cellSx = {
    px: 1,
    py: 0.375,
    border: `1px solid ${sap.cellLine}`,
    verticalAlign: "middle",
  } as const;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
    <Box sx={{ overflow: "auto", flex: 1, minHeight: 0 }}>
      <Box
        component="table"
        aria-label={label}
        sx={{
          width: "100%",
          minWidth: narrow ? undefined : minWidth,
          borderCollapse: "collapse",
          // The panel draws the outer edge; hiding the table's own outer
          // border stops it doubling up and nudging the grid 1px past the
          // panel, which put a needless sideways scrollbar under it.
          borderStyle: "hidden",
          fontSize: sap.fontSize,
          lineHeight: 1.4,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <Box component="thead">
          <Box component="tr">
            {visibleColumns.map((column) => (
              <Box
                component="th"
                scope="col"
                key={column.key}
                sx={{
                  ...cellSx,
                  py: 0.5,
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                  backgroundColor: sap.headerBg,
                  border: `1px solid ${sap.lineSoft}`,
                  color: sap.headerInk,
                  fontWeight: 600,
                  textAlign: column.align ?? "left",
                  whiteSpace: "nowrap",
                  width: column.width,
                }}
              >
                {column.header}
              </Box>
            ))}
          </Box>
        </Box>
        <Box component="tbody">
          {rows.length === 0 ? (
            <Box component="tr">
              <Box component="td" colSpan={visibleColumns.length} sx={{ ...cellSx, py: 1.25, color: editorial.muted }}>
                {emptyText}
              </Box>
            </Box>
          ) : (
            shownRows.map((row, index) => {
              const key = getKey(row);
              const selected = key === selectedKey;
              return (
                <Box
                  component="tr"
                  key={key}
                  tabIndex={interactive ? 0 : undefined}
                  aria-selected={onSelect ? selected : undefined}
                  onClick={onSelect ? () => onSelect(row) : undefined}
                  onDoubleClick={onOpen ? () => onOpen(row) : undefined}
                  onKeyDown={interactive ? (event: KeyboardEvent<HTMLTableRowElement>) => handleKeyDown(event, row) : undefined}
                  sx={{
                    cursor: interactive ? "pointer" : undefined,
                    backgroundColor: selected ? sap.selected : index % 2 ? sap.zebra : editorial.panel,
                    boxShadow: selected ? `inset 3px 0 0 ${editorial.navy}` : undefined,
                    "&:hover": interactive && !selected ? { backgroundColor: editorial.skySoft } : undefined,
                    "&:focus-visible": { outline: `2px solid ${editorial.navy}`, outlineOffset: -2 },
                  }}
                >
                  {visibleColumns.map((column) => (
                    <Box
                      component="td"
                      key={column.key}
                      sx={{
                        ...cellSx,
                        textAlign: column.align ?? "left",
                        whiteSpace: column.nowrap || column.maxWidth ? "nowrap" : undefined,
                        ...(column.maxWidth ? { maxWidth: column.maxWidth, overflow: "hidden", textOverflow: "ellipsis" } : {}),
                      }}
                    >
                      {column.render(row)}
                    </Box>
                  ))}
                </Box>
              );
            })
          )}
        </Box>
      </Box>
    </Box>
    {paged && rows.length > 0 && (
      <SapPager
        page={currentPage}
        pageCount={pageCount}
        size={size}
        total={rows.length}
        onPage={setPage}
        onSize={(next) => {
          setSize(next);
          setPage(0);
        }}
      />
    )}
    </Box>
  );
}

interface SapPagerProps {
  page: number;
  pageCount: number;
  size: number;
  total: number;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
}

/** "Rows 26–50 of 160 · ⏮ ◀ Page 2 of 7 ▶ ⏭ · Rows per page [25]" */
function SapPager({ page, pageCount, size, total, onPage, onSize }: SapPagerProps) {
  const first = page * size + 1;
  const last = Math.min(total, first + size - 1);
  const buttons = [
    { label: "First page", icon: <FirstPage />, to: 0, disabled: page === 0 },
    { label: "Previous page", icon: <NavigateBefore />, to: page - 1, disabled: page === 0 },
    { label: "Next page", icon: <NavigateNext />, to: page + 1, disabled: page >= pageCount - 1 },
    { label: "Last page", icon: <LastPage />, to: pageCount - 1, disabled: page >= pageCount - 1 },
  ];
  const pagerButton = (button: (typeof buttons)[number]) => (
    <ButtonBase
      key={button.label}
      aria-label={button.label}
      title={button.label}
      disabled={button.disabled}
      onClick={() => onPage(button.to)}
      sx={{
        width: 28,
        height: 26,
        border: `1px solid ${sap.line}`,
        borderRadius: `${sap.radius}px`,
        backgroundColor: editorial.panel,
        color: editorial.navy,
        "& svg": { fontSize: 18 },
        "&:hover": { backgroundColor: editorial.skySoft },
        "&.Mui-focusVisible": { outline: `2px solid ${editorial.navy}`, outlineOffset: 1 },
        "&.Mui-disabled": { color: editorial.softMuted, backgroundColor: sap.zebra },
      }}
    >
      {button.icon}
    </ButtonBase>
  );

  return (
    <Box
      component="nav"
      aria-label="Pages"
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 1,
        px: 1,
        py: 0.5,
        borderTop: `1px solid ${sap.line}`,
        backgroundColor: sap.barBg,
        fontSize: sap.fontSize,
        color: sap.headerInk,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <Box component="span" aria-live="polite">{`Rows ${first}–${last} of ${total}`}</Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mx: "auto" }}>
        {buttons.slice(0, 2).map(pagerButton)}
        <Box component="span" sx={{ px: 1, whiteSpace: "nowrap" }}>{`Page ${page + 1} of ${pageCount}`}</Box>
        {buttons.slice(2).map(pagerButton)}
      </Box>
      <Box component="label" sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        Rows per page
        <Box
          component="select"
          value={size}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => onSize(Number(event.target.value))}
          sx={{ font: "inherit", height: 26, border: `1px solid ${sap.line}`, borderRadius: `${sap.radius}px`, backgroundColor: editorial.panel, px: 0.5 }}
        >
          {PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
