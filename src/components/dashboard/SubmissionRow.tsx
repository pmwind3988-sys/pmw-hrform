import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  ChevronRight as ChevronRightIcon,
  DeleteOutlined as DeleteIcon,
  LayersOutlined as LayersIcon,
  NumbersOutlined as NumbersIcon,
} from "@mui/icons-material";
import type { KeyboardEvent, MouseEvent } from "react";
import type { Submission, ListMetaEntry } from "../../types";
import ListBadge from "./ListBadge";
import StatusBadge from "./StatusBadge";
import { editorial, si } from "../../theme/editorial";
import { SUBMISSION_GRID_COLUMNS, SUBMISSION_GRID_GAP } from "./submissionGrid";
import {
  formatDashboardDate,
  formatDashboardTime,
  getSubmittedByDisplayName,
  getFormReference,
  getSubmissionDisplayTitle,
} from "../../utils/submissionDisplay";

interface SubmissionRowProps {
  item: Submission;
  onView: (item: Submission) => void;
  onDelete?: (item: Submission) => void;
  isAdmin: boolean;
  canDelete?: boolean;
  isDeleting?: boolean;
  listMetaMap: Record<string, ListMetaEntry>;
}

export default function SubmissionRow({
  item,
  onView,
  onDelete,
  isAdmin,
  canDelete = false,
  isDeleting = false,
  listMetaMap,
}: SubmissionRowProps) {
  const theme = useTheme();
  // The six-column table needs ~1080px of hard minimum width, so anything
  // narrower than md gets the stacked card instead of overflowing the page.
  const isCompact = useMediaQuery(theme.breakpoints.down("md"));
  const meta = listMetaMap[item.listTitle] ?? {
    icon: "📋",
    color: editorial.ink,
    pale: editorial.blueWash,
    category: "General",
  };

  const displayTitle = getSubmissionDisplayTitle(item);
  // What a card is named on a phone. `title` on these lists usually holds the
  // submitter's name, so on someone's OWN submissions the card read as their
  // name every time. The card leads with the form; the who moves to the
  // "Submitted by" line admins already get. The desktop table keeps
  // `displayTitle`, because it has a column of its own for the form.
  const rowTitle = item.listTitle || displayTitle;
  const submitterDisplay = getSubmittedByDisplayName(item);
  const formReference = getFormReference(item);
  const submittedAt = formatDashboardDate(item.submittedAt);
  const submittedTime = formatDashboardTime(item.submittedAt);
  const statusKey = (item.formStatus ?? "").toLowerCase().replace(/[\s_-]/g, "");
  const layerOutcomeLabel = statusKey.includes("reject")
    ? "rejected"
    : statusKey === "fullyapproved" || statusKey === "completed" || statusKey === "approved"
      ? "complete"
      : "";
  const layerLabel =
    item.totalLayers > 1 && item.currentLayer !== undefined
      ? item.currentLayer > 0
        ? `Layer ${item.currentLayer}/${item.totalLayers}${layerOutcomeLabel ? ` ${layerOutcomeLabel}` : ""}`
        : `${item.totalLayers} layers`
      : null;
  const handleOpen = () => onView(item);
  const handleDelete = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onDelete?.(item);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpen();
    }
  };
  const identityChipSx = {
    borderRadius: `${si.radiusPill}px`,
    backgroundColor: editorial.blueWash,
    color: editorial.pmwBlueDark,
    border: "none",
    fontWeight: 700,
    fontSize: "0.72rem",
    height: 24,
    "& .MuiChip-icon": {
      color: editorial.pmwBlueDark,
    },
  } as const;
  const layerChipSx = {
    borderRadius: `${si.radiusPill}px`,
    backgroundColor: editorial.skySoft,
    color: editorial.navyDeep,
    border: "none",
    fontWeight: 700,
    fontSize: "0.72rem",
    height: 24,
    "& .MuiChip-icon": {
      color: editorial.pmwPurpleDark,
    },
  } as const;

  if (isCompact) {
    return (
      <Box
        role="button"
        tabIndex={0}
        aria-label={`View submission ${displayTitle}`}
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        sx={{
          backgroundColor: editorial.panel,
          borderRadius: `${si.radius}px`,
          boxShadow: si.shadow,
          p: 2,
          mb: 1.5,
          cursor: "pointer",
          transition: "background-color 0.15s ease",
          "&:hover": {
            backgroundColor: editorial.blueSoft,
          },
          "&:focus-visible": {
            outline: `2px solid ${editorial.navy}`,
            outlineOffset: 2,
          },
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body1" sx={{ fontWeight: 700, color: editorial.ink, mb: 0.5 }}>
              {rowTitle}
            </Typography>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Chip icon={<NumbersIcon />} label={`Ref ${item.referenceNo || item.submissionId}`} size="small" sx={identityChipSx} />
              <Typography variant="caption" sx={{ color: editorial.muted }}>
                {submittedAt}
              </Typography>
            </Box>
          </Box>
          <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
            {canDelete && (
              <Tooltip title="Delete submission and managed files">
                <span onClick={(event) => event.stopPropagation()}>
                  <IconButton
                    aria-label={`Delete submission ${displayTitle}`}
                    onClick={handleDelete}
                    disabled={isDeleting}
                    size="small"
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      // Quiet until reached for: grey at rest, red only under
                      // the pointer. A red slab on every card was the easiest
                      // thing on it to hit by mistake.
                      color: editorial.softMuted,
                      transition: "background-color 0.18s ease, color 0.18s ease",
                      "&:hover": {
                        backgroundColor: editorial.errorSoft,
                        color: editorial.error,
                      },
                    }}
                  >
                    {isDeleting ? <CircularProgress size={18} color="inherit" /> : <DeleteIcon sx={{ fontSize: 18 }} />}
                  </IconButton>
                </span>
              </Tooltip>
            )}
            <ChevronRightIcon aria-hidden sx={{ color: editorial.softMuted, fontSize: 22, alignSelf: "center" }} />
          </Stack>
        </Box>
        {/* No form badge here: the card is already titled with the form. */}
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", mb: 1.5 }}>
          <StatusBadge status={item.formStatus} />
          {layerLabel && (
            <Chip icon={<LayersIcon />} label={layerLabel} size="small" sx={layerChipSx} />
          )}
        </Box>
        <Stack spacing={0.25}>
          <Typography variant="caption" sx={{ color: editorial.muted, display: "block" }}>
            {meta.category}{submittedTime ? ` · ${submittedTime}` : ""}
          </Typography>
          {isAdmin && (
            <Typography variant="caption" sx={{ color: editorial.muted, display: "block" }}>
              Submitted by {submitterDisplay}
            </Typography>
          )}
        </Stack>
      </Box>
    );
  }

  return (
    <Box
      role="button"
      tabIndex={0}
      aria-label={`View submission ${displayTitle}`}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      sx={{
        display: "grid",
        gridTemplateColumns: isAdmin ? SUBMISSION_GRID_COLUMNS.admin : SUBMISSION_GRID_COLUMNS.member,
        gap: SUBMISSION_GRID_GAP,
        px: 2.5,
        py: 1.5,
        minHeight: si.rowHeightTwoLine,
        // Solid, and no shadow of its own: the rows sit inside one card now, so
        // a row that lifted on hover was a card floating out of a card.
        backgroundColor: editorial.panel,
        // Rounded and unruled: rows are told apart by space, and the one under
        // the pointer becomes a soft tinted shape rather than a striped band.
        borderRadius: `${si.radiusSm}px`,
        mx: 0.75,
        alignItems: "center",
        cursor: "pointer",
        transition: "background-color 0.15s ease",
        outline: "none",
        "&:hover": {
          backgroundColor: editorial.blueSoft,
        },
        "&:focus-visible": {
          backgroundColor: editorial.blueSoft,
          boxShadow: `inset 0 0 0 2px ${editorial.navy}`,
        },
        "@media (prefers-reduced-motion: reduce)": { transition: "none" },
      }}
    >
      {/* Submission */}
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body1" sx={{ fontWeight: 700, color: editorial.ink, mb: 0.5, textWrap: "balance" }}>
          {displayTitle}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", minWidth: 0 }}>
          <Chip icon={<NumbersIcon />} label={`Ref ${item.referenceNo || item.submissionId}`} size="small" sx={identityChipSx} />
          <Typography variant="caption" sx={{ color: editorial.muted, minWidth: 0 }}>
            Form {formReference}
          </Typography>
        </Box>
      </Box>

      {/* Submitted By */}
      {isAdmin && (
        <Typography
          variant="body2"
          sx={{
            color: editorial.muted,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {submitterDisplay}
        </Typography>
      )}

      {/* List */}
      <Box sx={{ minWidth: 0 }}>
        <ListBadge title={item.listTitle} color={meta.color} pale={meta.pale} />
        <Typography
          variant="caption"
          sx={{
            color: editorial.softMuted,
            display: "block",
            mt: 0.5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {meta.category}
        </Typography>
      </Box>

      {/* Submitted */}
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ color: editorial.ink, fontWeight: 700 }}>
          {submittedAt}
        </Typography>
        {submittedTime && (
          <Typography variant="caption" sx={{ color: editorial.muted }}>
            {submittedTime}
          </Typography>
        )}
      </Box>

      {/* Status */}
      <Box sx={{ minWidth: 0 }}>
        <StatusBadge status={item.formStatus} />
        {layerLabel && (
          <Chip icon={<LayersIcon />} label={layerLabel} size="small" sx={{ ...layerChipSx, mt: 0.75 }} />
        )}
      </Box>

      {/* Actions */}
      <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end", alignItems: "center" }}>
        {canDelete && (
          <Tooltip title="Delete submission and managed files">
            <span onClick={(event) => event.stopPropagation()}>
              <IconButton
                aria-label={`Delete submission ${displayTitle}`}
                onClick={handleDelete}
                disabled={isDeleting}
                size="small"
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  color: editorial.softMuted,
                  transition: "background-color 0.18s ease, color 0.18s ease",
                  "&:hover": {
                    backgroundColor: editorial.errorSoft,
                    color: editorial.error,
                  },
                }}
              >
                {isDeleting ? <CircularProgress size={18} color="inherit" /> : <DeleteIcon sx={{ fontSize: 18 }} />}
              </IconButton>
            </span>
          </Tooltip>
        )}
        <ChevronRightIcon
          sx={{
            color: editorial.pmwBlueDark,
            fontSize: 20,
            transition: "transform 0.2s ease",
            ".MuiBox-root:hover &": {
              transform: "translateX(4px)",
            },
          }}
        />
      </Stack>
    </Box>
  );
}
