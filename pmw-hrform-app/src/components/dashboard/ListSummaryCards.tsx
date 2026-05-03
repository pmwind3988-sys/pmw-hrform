import { Box, Grid, Typography, useMediaQuery, useTheme } from "@mui/material";
import { Description as DescriptionIcon, CheckCircle as CheckCircleIcon, AccessTime as AccessTimeIcon, Cancel as CancelIcon } from "@mui/icons-material";
import type { Submission, DiscoveredList, ListMetaEntry } from "../../types";

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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isTablet = useMediaQuery(theme.breakpoints.down("md"));
  const columns = isMobile ? 1 : isTablet ? 2 : 4;

  return (
    <Grid container spacing={2}>
      {visibleLists.map((list) => {
        const meta = listMetaMap[list.title] ?? {
          icon: "📋",
          color: "#6264A7",
          pale: "rgba(98,100,167,0.1)",
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
          <Grid size={{ xs: 12, sm: 6, md: 12 / columns }} key={list.id}>
            <Box
              sx={{
                backgroundColor: "#ffffff",
                borderRadius: "16px",
                border: "1px solid rgba(0,0,0,0.06)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                p: 2.5,
                transition: "all 0.2s ease",
                "&:hover": {
                  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                  transform: "translateY(-1px)",
                },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    backgroundColor: meta.pale,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <DescriptionIcon sx={{ fontSize: 18, color: meta.color }} />
                </Box>
                <Box>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 600, color: "#1a1a2e", lineHeight: 1.2 }}
                  >
                    {list.title}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "rgba(0,0,0,0.4)" }}>
                    {meta.category}
                  </Typography>
                </Box>
              </Box>

              <Typography
                variant="h3"
                sx={{
                  fontWeight: 300,
                  color: meta.color,
                  letterSpacing: "-0.02em",
                  mb: 1.5,
                }}
              >
                {count}
              </Typography>

              {count > 0 ? (
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: isAdmin ? 2 : 0 }}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                      fontSize: "0.7rem",
                      color: "#16a34a",
                    }}
                  >
                    <CheckCircleIcon sx={{ fontSize: 14 }} />
                    {listApproved}
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                      fontSize: "0.7rem",
                      color: "#d97706",
                    }}
                  >
                    <AccessTimeIcon sx={{ fontSize: 14 }} />
                    {listPending}
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                      fontSize: "0.7rem",
                      color: "#dc2626",
                    }}
                  >
                    <CancelIcon sx={{ fontSize: 14 }} />
                    {listRejected}
                  </Box>
                </Box>
              ) : (
                <Typography
                  variant="body2"
                  sx={{ color: "rgba(0,0,0,0.3)", fontStyle: "italic", mb: isAdmin ? 2 : 0 }}
                >
                  No submissions
                </Typography>
              )}

              {isAdmin && (
                <Box
                  component="button"
                  onClick={() => onEditForm(list.title)}
                  sx={{
                    width: "100%",
                    py: 0.75,
                    px: 2,
                    borderRadius: "10px",
                    border: "1px solid rgba(98,100,167,0.3)",
                    backgroundColor: "transparent",
                    color: "#6264A7",
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    "&:hover": {
                      borderColor: "#6264A7",
                      backgroundColor: "rgba(98,100,167,0.04)",
                    },
                  }}
                >
                  Edit Form
                </Box>
              )}
            </Box>
          </Grid>
        );
      })}
    </Grid>
  );
}
