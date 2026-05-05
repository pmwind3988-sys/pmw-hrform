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
    color: "#6264A7",
    pale: "rgba(98,100,167,0.1)",
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
          borderRadius: "16px",
          border: "1px solid rgba(0,0,0,0.04)",
          p: 2.5,
          mb: 2,
          cursor: "pointer",
          transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)",
          "&:hover": {
            borderColor: "rgba(0, 120, 212, 0.2)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            transform: "translateY(-1px)",
          },
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body1" sx={{ fontWeight: 600, color: "#111827", mb: 0.5 }}>
              {item.title}
            </Typography>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Typography
                variant="caption"
                sx={{
                  fontFamily: "monospace",
                  backgroundColor: "rgba(98,100,167,0.08)",
                  color: "#6264A7",
                  px: 1,
                  py: 0.25,
                  borderRadius: "6px",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                }}
              >
                {item.formId}
              </Typography>
              <Typography variant="caption" sx={{ color: "#6B7280" }}>
                ID: {item.submissionId}
              </Typography>
            </Box>
          </Box>
          <ChevronRightIcon sx={{ color: "#6B7280", fontSize: 20, transition: "transform 0.2s ease" }} />
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
          <ListBadge title={item.listTitle} icon={meta.icon} color={meta.color} pale={meta.pale} />
          <StatusBadge status={item.formStatus} />
        </Box>
        <Typography variant="caption" sx={{ color: "#6B7280", display: "block" }}>
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
        borderRadius: "0 0 16px 16px",
        borderBottom: "1px solid rgba(0,0,0,0.04)",
        alignItems: "center",
        cursor: "pointer",
        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        borderLeft: "3px solid transparent",
        "&:hover": {
          backgroundColor: "#F8F9FC",
          borderLeft: "3px solid #0078D4",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        },
      }}
    >
      {/* Submission */}
      <Box>
        <Typography variant="body1" sx={{ fontWeight: 600, color: "#111827", mb: 0.5 }}>
          {item.title}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <Typography
            variant="caption"
            sx={{
              fontFamily: "monospace",
              backgroundColor: "rgba(98,100,167,0.08)",
              color: "#6264A7",
              px: 1,
              py: 0.25,
              borderRadius: "6px",
              fontSize: "0.7rem",
              fontWeight: 600,
            }}
          >
            {item.formId}
          </Typography>
          <Typography variant="caption" sx={{ color: "#6B7280" }}>
            {submittedAt}
          </Typography>
        </Box>
      </Box>

      {/* Submitted By */}
      {isAdmin && (
        <Typography
          variant="body2"
          sx={{
            color: "#6B7280",
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
      <Typography variant="body2" sx={{ color: "#6B7280" }}>
        {meta.category}
      </Typography>

      {/* Status */}
      <StatusBadge status={item.formStatus} />

      {/* Chevron */}
      <ChevronRightIcon
        sx={{
          color: "#6B7280",
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