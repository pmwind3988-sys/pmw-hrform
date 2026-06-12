import {
  Box,
  Chip,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  ChevronRight as ChevronRightIcon,
  LayersOutlined as LayersIcon,
  NumbersOutlined as NumbersIcon,
  VisibilityOutlined as ViewIcon,
} from "@mui/icons-material";
import type { KeyboardEvent } from "react";
import type { Submission, ListMetaEntry } from "../../types";
import ListBadge from "./ListBadge";
import StatusBadge from "./StatusBadge";
import { editorial, editorialShadow } from "../../theme/editorial";

interface SubmissionRowProps {
  item: Submission;
  onView: (item: Submission) => void;
  isAdmin: boolean;
  listMetaMap: Record<string, ListMetaEntry>;
}

export default function SubmissionRow({
  item,
  onView,
  isAdmin,
  listMetaMap,
}: SubmissionRowProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const meta = listMetaMap[item.listTitle] ?? {
    icon: "📋",
    color: editorial.ink,
    pale: editorial.blueWash,
    category: "General",
  };

  const submittedAt = item.submittedAt
    ? new Date(item.submittedAt).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "N/A";
  const submittedTime = item.submittedAt
    ? new Date(item.submittedAt).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const layerLabel =
    item.totalLayers > 1 && item.currentLayer !== undefined
      ? item.currentLayer > 0
        ? `Layer ${item.currentLayer}/${item.totalLayers}`
        : `${item.totalLayers} layers`
      : null;
  const handleOpen = () => onView(item);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpen();
    }
  };
  const identityChipSx = {
    borderRadius: "8px",
    backgroundColor: editorial.blueWash,
    color: editorial.pmwBlueDark,
    border: `1px solid ${editorial.pmwBlueSoft}`,
    fontWeight: 800,
    fontSize: "0.7rem",
    height: 24,
    "& .MuiChip-icon": {
      color: editorial.pmwBlueDark,
    },
  } as const;
  const layerChipSx = {
    borderRadius: "8px",
    backgroundColor: editorial.purpleWash,
    color: editorial.pmwPurpleDark,
    border: `1px solid ${editorial.pmwPurpleSoft}`,
    fontWeight: 800,
    fontSize: "0.7rem",
    height: 24,
    "& .MuiChip-icon": {
      color: editorial.pmwPurpleDark,
    },
  } as const;

  if (isMobile) {
    return (
      <Box
        role="button"
        tabIndex={0}
        aria-label={`View submission ${item.title}`}
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        sx={{
          backgroundColor: "rgba(255, 255, 255, 0.92)",
          borderRadius: "8px",
          border: `1px solid ${editorial.border}`,
          p: 2,
          mb: 2,
          cursor: "pointer",
          transition: "box-shadow 0.2s ease, transform 0.2s ease",
          boxShadow: "0 10px 28px rgba(0, 90, 158, 0.06)",
          "&:hover": {
            boxShadow: editorialShadow,
            transform: "translateY(-1px)",
          },
          "&:active": {
            transform: "scale(0.995)",
          },
          "&:focus-visible": {
            outline: `3px solid ${editorial.pmwBlueSoft}`,
            outlineOffset: 2,
          },
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body1" sx={{ fontWeight: 800, color: editorial.ink, mb: 0.5 }}>
              {item.title}
            </Typography>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Chip icon={<NumbersIcon />} label={`Ref ${item.submissionId}`} size="small" sx={identityChipSx} />
              <Typography variant="caption" sx={{ color: editorial.muted }}>
                {submittedAt}
              </Typography>
            </Box>
          </Box>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "10px",
              border: `1px solid ${editorial.pmwBlueSoft}`,
              backgroundColor: editorial.blueWash,
              color: editorial.pmwBlueDark,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ViewIcon sx={{ fontSize: 18 }} />
          </Box>
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
          <ListBadge title={item.listTitle} color={meta.color} pale={meta.pale} />
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
              Submitted by {item.submittedByEmail || "Unknown submitter"}
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
      aria-label={`View submission ${item.title}`}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      sx={{
        display: "grid",
        gridTemplateColumns: isAdmin
          ? "minmax(240px, 2fr) minmax(180px, 1.35fr) minmax(170px, 1.15fr) minmax(132px, 0.85fr) minmax(150px, 1fr) 40px"
          : "minmax(260px, 2.2fr) minmax(180px, 1.25fr) minmax(132px, 0.85fr) minmax(150px, 1fr) 40px",
        gap: 2,
        px: 2.5,
        py: 2,
        backgroundColor: "rgba(255, 255, 255, 0.92)",
        borderRadius: 0,
        borderBottom: `1px solid ${editorial.border}`,
        alignItems: "center",
        cursor: "pointer",
        transition: "background-color 0.2s ease, box-shadow 0.2s ease",
        outline: "none",
        "&:hover": {
          backgroundColor: editorial.blueSoft,
          boxShadow: "inset 3px 0 0 rgba(0, 120, 212, 0.55)",
        },
        "&:focus-visible": {
          backgroundColor: editorial.blueSoft,
          boxShadow: `inset 0 0 0 3px ${editorial.pmwBlueSoft}`,
        },
      }}
    >
      {/* Submission */}
      <Box>
        <Typography variant="body1" sx={{ fontWeight: 800, color: editorial.ink, mb: 0.5, textWrap: "balance" }}>
          {item.title}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <Chip icon={<NumbersIcon />} label={`Ref ${item.submissionId}`} size="small" sx={identityChipSx} />
          <Typography variant="caption" sx={{ color: editorial.muted }}>
            Form {item.formId || "N/A"}
          </Typography>
        </Box>
      </Box>

      {/* Submitted By */}
      {isAdmin && (
        <Typography
          variant="body2"
          sx={{
            color: editorial.muted,
            maxWidth: 180,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.submittedByEmail || "Unknown submitter"}
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
      <Box>
        <Typography variant="body2" sx={{ color: editorial.ink, fontWeight: 800 }}>
          {submittedAt}
        </Typography>
        {submittedTime && (
          <Typography variant="caption" sx={{ color: editorial.muted }}>
            {submittedTime}
          </Typography>
        )}
      </Box>

      {/* Status */}
      <Box>
        <StatusBadge status={item.formStatus} />
        {layerLabel && (
          <Chip icon={<LayersIcon />} label={layerLabel} size="small" sx={{ ...layerChipSx, mt: 0.75 }} />
        )}
      </Box>

      {/* Chevron */}
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
    </Box>
  );
}
