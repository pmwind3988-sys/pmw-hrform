import { Box, Grid, Typography, IconButton, useMediaQuery, useTheme } from "@mui/material";
import { Description as DescriptionIcon, Edit as EditIcon, ArrowForward as ArrowForwardIcon } from "@mui/icons-material";
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
  const isDesktop = useMediaQuery(theme.breakpoints.up("lg"));
  const columns = isMobile ? 1 : isTablet ? 2 : isDesktop ? 4 : 3;

  return (
    <Grid container spacing={2.5}>
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
                borderRadius: "20px",
                border: "1px solid rgba(0,0,0,0.04)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)",
                p: 3,
                pt: isAdmin ? 3.5 : 3,
                position: "relative",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                "&:hover": {
                  boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                  transform: "translateY(-2px)",
                },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2.5 }}>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    backgroundColor: `${meta.color}12`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: `1px solid ${meta.color}20`,
                  }}
                >
                  <DescriptionIcon sx={{ fontSize: 22, color: meta.color }} />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography
                    variant="h6"
                    sx={{ fontWeight: 600, color: "#111827", lineHeight: 1.2, mb: 0.25 }}
                  >
                    {list.title}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "#6B7280", fontWeight: 500 }}>
                    {meta.category}
                  </Typography>
                </Box>
                {isAdmin && (
                  <IconButton
                    onClick={() => onEditForm(list.title)}
                    size="small"
                    sx={{
                      position: "absolute",
                      top: 12,
                      right: 12,
                      borderRadius: "10px",
                      backgroundColor: "rgba(98, 100, 167, 0.08)",
                      color: "#6264A7",
                      opacity: 0,
                      transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                      "&:hover": {
                        backgroundColor: "rgba(98, 100, 167, 0.15)",
                        color: "#4A4C80",
                      },
                      ".MuiBox-root:hover &": {
                        opacity: 1,
                      },
                    }}
                  >
                    <EditIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                )}
              </Box>

              <Typography
                variant="h2"
                sx={{
                  fontWeight: 700,
                  color: "#111827",
                  letterSpacing: "-0.03em",
                  textAlign: "center",
                  fontSize: "2.5rem",
                  mb: 1,
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
                      color: "#16A34A",
                      fontWeight: 500,
                    }}
                  >
                    <Box sx={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#16A34A" }} />
                    {listApproved} approved
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.75,
                      fontSize: "0.75rem",
                      color: "#D97706",
                      fontWeight: 500,
                    }}
                  >
                    <Box sx={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#D97706" }} />
                    {listPending} pending
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.75,
                      fontSize: "0.75rem",
                      color: "#DC2626",
                      fontWeight: 500,
                    }}
                  >
                    <Box sx={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#DC2626" }} />
                    {listRejected} rejected
                  </Box>
                </Box>
              ) : (
                <Typography
                  variant="body2"
                  sx={{ color: "#6B7280", fontStyle: "italic", mb: isAdmin ? 2 : 0, textAlign: "center" }}
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
                    color: "#6B7280",
                    fontSize: "0.75rem",
                    fontWeight: 500,
                    opacity: 0,
                    transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                    ".MuiBox-root:hover &": {
                      opacity: 1,
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