import {
  Box,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { ChevronRight as ChevronRightIcon } from "@mui/icons-material";
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

  if (isMobile) {
    return (
      <Box
        onClick={() => onView(item)}
        sx={{
          backgroundColor: "#ffffff",
          borderRadius: "14px",
          border: `1px solid ${editorial.border}`,
          p: 2,
          mb: 2,
          cursor: "pointer",
          transition: "box-shadow 0.2s ease, border-color 0.2s ease",
          boxShadow: "none",
          "&:hover": {
            borderColor: editorial.ink,
            boxShadow: editorialShadow,
          },
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body1" sx={{ fontWeight: 800, color: editorial.ink, mb: 0.5 }}>
              {item.title}
            </Typography>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Typography
                variant="caption"
                sx={{
                  fontFamily: "monospace",
                  backgroundColor: editorial.yellow,
                  color: editorial.ink,
                  px: 1,
                  py: 0.25,
                  borderRadius: "6px",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                }}
              >
                {item.formId}
              </Typography>
              <Typography variant="caption" sx={{ color: editorial.muted }}>
                ID: {item.submissionId}
              </Typography>
            </Box>
          </Box>
          <ChevronRightIcon sx={{ color: editorial.muted, fontSize: 20, transition: "transform 0.2s ease" }} />
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
          <ListBadge title={item.listTitle} icon={meta.icon} color={meta.color} pale={meta.pale} />
          <StatusBadge status={item.formStatus} />
          {item.totalLayers > 1 && item.currentLayer !== undefined && (
            <Typography
              variant="caption"
              sx={{
                fontFamily: "monospace",
                backgroundColor: editorial.yellow,
                color: editorial.ink,
                px: 1,
                py: 0.25,
                borderRadius: "6px",
                fontSize: "0.7rem",
                fontWeight: 600,
                ml: 1,
              }}
            >
              {item.currentLayer > 0 ? `Layer ${item.currentLayer}/${item.totalLayers}` : `${item.totalLayers} layers`}
            </Typography>
          )}
        </Box>
        <Typography variant="caption" sx={{ color: editorial.muted, display: "block" }}>
          {submittedAt} · {item.submittedByEmail}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      onClick={() => onView(item)}
      sx={{
        display: "grid",
        gridTemplateColumns: isAdmin ? "2fr 1.5fr 1fr 1fr 1fr 40px" : "2fr 1fr 1fr 1fr 40px",
        gap: 2,
        px: 2.5,
        py: 2,
        backgroundColor: "#ffffff",
        borderRadius: 0,
        borderBottom: `1px solid ${editorial.border}`,
        alignItems: "center",
        cursor: "pointer",
        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        borderLeft: "3px solid transparent",
        "&:hover": {
          backgroundColor: editorial.blueWash,
          borderLeft: `3px solid ${editorial.ink}`,
          boxShadow: "none",
        },
      }}
    >
      {/* Submission */}
      <Box>
        <Typography variant="body1" sx={{ fontWeight: 800, color: editorial.ink, mb: 0.5 }}>
          {item.title}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <Typography
            variant="caption"
            sx={{
              fontFamily: "monospace",
              backgroundColor: editorial.yellow,
              color: editorial.ink,
              px: 1,
              py: 0.25,
              borderRadius: "6px",
              fontSize: "0.7rem",
              fontWeight: 600,
            }}
          >
            {item.formId}
          </Typography>
          <Typography variant="caption" sx={{ color: editorial.muted }}>
            {submittedAt}
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
          {item.submittedByEmail}
        </Typography>
      )}

      {/* List */}
      <ListBadge title={item.listTitle} icon={meta.icon} color={meta.color} pale={meta.pale} />

      {/* Category */}
      <Typography variant="body2" sx={{ color: editorial.muted }}>
        {meta.category}
      </Typography>

      {/* Status */}
      <Box>
        <StatusBadge status={item.formStatus} />
        {item.totalLayers > 1 && item.currentLayer !== undefined && (
          <Typography
            variant="caption"
            sx={{
              fontFamily: "monospace",
              backgroundColor: editorial.yellow,
              color: editorial.ink,
              px: 1,
              py: 0.25,
              borderRadius: "6px",
              fontSize: "0.7rem",
              fontWeight: 600,
              display: "inline-block",
              mt: 0.5,
            }}
          >
            {item.currentLayer > 0 ? `Layer ${item.currentLayer}/${item.totalLayers}` : `${item.totalLayers} layers`}
          </Typography>
        )}
      </Box>

      {/* Chevron */}
      <ChevronRightIcon
        sx={{
          color: editorial.muted,
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
