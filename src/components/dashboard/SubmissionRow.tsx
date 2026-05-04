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
          borderRadius: "12px",
          border: "1px solid rgba(0,0,0,0.06)",
          p: 2,
          mb: 1.5,
          cursor: "pointer",
          transition: "all 0.2s ease",
          "&:hover": {
            borderColor: "rgba(98,100,167,0.3)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          },
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1.5 }}>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, color: "#1a1a2e", mb: 0.5 }}>
              {item.title}
            </Typography>
            <Typography variant="caption" sx={{ fontFamily: "monospace", color: "rgba(0,0,0,0.4)" }}>
              {item.formId} · ID: {item.submissionId}
            </Typography>
          </Box>
          <ChevronRightIcon sx={{ color: "rgba(0,0,0,0.2)", fontSize: 20 }} />
        </Box>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
          <ListBadge title={item.listTitle} icon={meta.icon} color={meta.color} pale={meta.pale} />
          <StatusBadge status={item.formStatus} />
        </Box>
        <Typography variant="caption" sx={{ color: "rgba(0,0,0,0.35)", mt: 1, display: "block" }}>
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
        px: 3,
        py: 2,
        backgroundColor: "#ffffff",
        borderRadius: "0 0 12px 12px",
        borderBottom: "1px solid rgba(0,0,0,0.04)",
        alignItems: "center",
        cursor: "pointer",
        transition: "all 0.2s ease",
        "&:hover": {
          backgroundColor: "rgba(98,100,167,0.02)",
          borderColor: "rgba(98,100,167,0.15)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        },
      }}
    >
      {/* Submission */}
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, color: "#1a1a2e", mb: 0.25 }}>
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
              borderRadius: "4px",
              fontSize: "0.65rem",
            }}
          >
            {item.formId}
          </Typography>
          <Typography variant="caption" sx={{ color: "rgba(0,0,0,0.35)" }}>
            {submittedAt}
          </Typography>
        </Box>
      </Box>

      {/* Submitted By */}
      {isAdmin && (
        <Typography
          variant="body2"
          sx={{
            color: "rgba(0,0,0,0.55)",
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
      <Typography variant="body2" sx={{ color: "rgba(0,0,0,0.55)" }}>
        {meta.category}
      </Typography>

      {/* Status */}
      <StatusBadge status={item.formStatus} />

      {/* Chevron */}
      <ChevronRightIcon sx={{ color: "rgba(0,0,0,0.2)", fontSize: 20 }} />
    </Box>
  );
}
