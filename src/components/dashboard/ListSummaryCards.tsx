import { Box, Grid, Typography, IconButton, Tooltip } from "@mui/material";
import {
  AccessTime as AccessTimeIcon,
  ArrowForward as ArrowForwardIcon,
  Cancel as CancelIcon,
  CheckCircle as CheckCircleIcon,
  Description as DescriptionIcon,
  Edit as EditIcon,
} from "@mui/icons-material";
import type { Submission, DiscoveredList, ListMetaEntry } from "../../types";
import { editorial, editorialShadow } from "../../theme/editorial";

interface ListSummaryCardsProps {
  submissions: Submission[];
  visibleLists: DiscoveredList[];
  listMetaMap: Record<string, ListMetaEntry>;
  isAdmin: boolean;
  onEditForm: (listTitle: string) => void;
}

export default function ListSummaryCards({
  submissions,
  visibleLists,
  listMetaMap,
  isAdmin,
  onEditForm,
}: ListSummaryCardsProps) {
  return (
    <Grid container spacing={2.5}>
      {visibleLists.map((list) => {
        const meta = listMetaMap[list.title] ?? {
          icon: "📋",
          color: editorial.ink,
          pale: editorial.blueWash,
          category: "General",
        };
        const count = submissions.filter((s) => s.listTitle === list.title).length;
        const listApproved = submissions.filter(
          (s) =>
            s.listTitle === list.title &&
            ["fullyapproved", "approved"].includes(
              (s.formStatus ?? "").toLowerCase().replace(/[\s_-]/g, "")
            )
        ).length;
        const listPending = submissions.filter(
          (s) =>
            s.listTitle === list.title &&
            !["fullyapproved", "approved", "rejected"].includes(
              (s.formStatus ?? "").toLowerCase().replace(/[\s_-]/g, "")
            )
        ).length;
        const listRejected = submissions.filter(
          (s) =>
            s.listTitle === list.title &&
            (s.formStatus ?? "").toLowerCase().replace(/[\s_-]/g, "").includes("reject")
        ).length;

        return (
          <Grid size={{ xs: 12, sm: 6, lg: 3 }} key={list.id}>
            <Box
              sx={{
                backgroundColor: "rgba(255, 255, 255, 0.92)",
                borderRadius: "12px",
                border: `1px solid ${editorial.border}`,
                boxShadow: "none",
                p: { xs: 2, sm: 2.5 },
                pt: isAdmin ? { xs: 2.5, sm: 3 } : { xs: 2, sm: 2.5 },
                position: "relative",
                transition: "box-shadow 0.2s ease, border-color 0.2s ease",
                "&:hover": {
                  boxShadow: editorialShadow,
                  borderColor: editorial.pmwBlueSoft,
                },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2.5 }}>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: "12px",
                    backgroundColor: editorial.blueWash,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: `1px solid ${editorial.border}`,
                  }}
                >
                  <DescriptionIcon sx={{ fontSize: 22, color: meta.color }} />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography
                    variant="h6"
                    sx={{ fontWeight: 800, color: editorial.ink, lineHeight: 1.2, mb: 0.25 }}
                  >
                    {list.title}
                  </Typography>
                  <Typography variant="caption" sx={{ color: editorial.muted, fontWeight: 700 }}>
                    {meta.category}
                  </Typography>
                </Box>
                {isAdmin && (
                  <Tooltip title={`Edit ${list.title}`}>
                    <IconButton
                      aria-label={`Edit ${list.title}`}
                      onClick={() => onEditForm(list.title)}
                      size="small"
                      sx={{
                        position: "absolute",
                        top: 12,
                        right: 12,
                        borderRadius: "10px",
                        backgroundColor: editorial.purpleWash,
                        color: editorial.pmwPurpleDark,
                        border: `1px solid ${editorial.pmwPurpleSoft}`,
                        transition: "background-color 0.2s ease, transform 0.2s ease, border-color 0.2s ease",
                        "&:hover": {
                          backgroundColor: editorial.pmwPurpleSoft,
                          borderColor: editorial.pmwPurple,
                        },
                        "&:active": {
                          transform: "scale(0.96)",
                        },
                        "&:focus-visible": {
                          outline: `3px solid ${editorial.pmwPurpleSoft}`,
                          outlineOffset: 2,
                        },
                      }}
                    >
                      <EditIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>

              <Typography
                variant="h2"
                sx={{
                  fontWeight: 700,
                  color: editorial.ink,
                  letterSpacing: 0,
                  textAlign: "center",
                  fontSize: "2.25rem",
                  mb: 1,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {count}
              </Typography>

              {count > 0 ? (
                <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center", mb: isAdmin ? 2 : 0 }}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.75,
                      fontSize: "0.75rem",
                      color: editorial.success,
                      fontWeight: 700,
                    }}
                  >
                    <CheckCircleIcon sx={{ fontSize: 14 }} />
                    {listApproved} approved
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.75,
                      fontSize: "0.75rem",
                      color: editorial.warning,
                      fontWeight: 700,
                    }}
                  >
                    <AccessTimeIcon sx={{ fontSize: 14 }} />
                    {listPending} pending
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.75,
                      fontSize: "0.75rem",
                      color: editorial.error,
                      fontWeight: 700,
                    }}
                  >
                    <CancelIcon sx={{ fontSize: 14 }} />
                    {listRejected} rejected
                  </Box>
                </Box>
              ) : (
                <Typography
                  variant="body2"
                  sx={{ color: editorial.muted, fontStyle: "italic", mb: isAdmin ? 2 : 0, textAlign: "center" }}
                >
                  No submissions
                </Typography>
              )}

              {!isAdmin && count > 0 && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 0.5,
                    color: editorial.pmwBlueDark,
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    transition: "transform 0.2s ease",
                    ".MuiBox-root:hover &": {
                      transform: "translateX(2px)",
                    },
                  }}
                >
                  View submissions
                  <ArrowForwardIcon sx={{ fontSize: 14 }} />
                </Box>
              )}
            </Box>
          </Grid>
        );
      })}
    </Grid>
  );
}
