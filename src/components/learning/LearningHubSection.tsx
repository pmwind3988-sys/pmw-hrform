import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { Box, Button, Chip, Skeleton, Stack, Typography } from "@mui/material";
import {
  ArrowForwardRounded,
  PlayCircleOutlined,
  SchoolOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";
import { editorial, editorialHairline, editorialShadow, editorialShadowHover } from "../../theme/editorial";
import { acquireLearningIdentityToken, fetchLearningLibrary } from "../../utils/learningService";
import { kindStyle, learningButtonSx, learningReduceMotionSx } from "./learningUi";
import type { LearningMaterial } from "../../types";

const HIGHLIGHT_COUNT = 4;

/**
 * The dashboard's doorway to the learning hub, sitting alongside the career
 * carousel. It shows what colleagues are actually opening rather than a static
 * banner, so the section earns the space it takes on the page.
 */
export default function LearningHubSection() {
  const navigate = useNavigate();
  const { instance } = useMsal();
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);
  const [topicCount, setTopicCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;
    void acquireLearningIdentityToken(instance, account)
      .then((token) => fetchLearningLibrary(token))
      .then((data) => {
        if (!mounted) return;
        setTopicCount(data.topics.length);
        setMaterials(
          [...data.materials]
            .sort((a, b) => b.viewCount - a.viewCount || b.modifiedAt.localeCompare(a.modifiedAt))
            .slice(0, HIGHLIGHT_COUNT),
        );
      })
      .catch(() => {
        // The hub itself reports why. The dashboard just shows the doorway.
        if (mounted) setMaterials([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [instance]);

  const totalViews = materials.reduce((sum, material) => sum + material.viewCount, 0);

  return (
    <Box
      component="section"
      sx={{
        mb: { xs: 3, md: 4 },
        p: { xs: 2, md: 2.5 },
        borderRadius: "12px",
        border: editorialHairline,
        backgroundColor: "rgba(255, 255, 255, 0.92)",
        boxShadow: editorialShadow,
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        sx={{ alignItems: { sm: "center" }, justifyContent: "space-between", mb: 2 }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: editorial.purpleWash,
              color: editorial.pmwPurpleDark,
              flexShrink: 0,
            }}
          >
            <SchoolOutlined />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 900, color: editorial.ink, lineHeight: 1.2 }}>
              Learning Materials
            </Typography>
            <Typography variant="body2" sx={{ color: editorial.muted, fontWeight: 700 }}>
              {topicCount > 0
                ? `${topicCount} topic${topicCount === 1 ? "" : "s"} of training videos, guides, and reference documents.`
                : "Training videos, guides, and reference documents for the team."}
            </Typography>
          </Box>
        </Stack>

        <Button
          variant="contained"
          endIcon={<ArrowForwardRounded />}
          onClick={() => navigate("/learning")}
          sx={{ ...learningButtonSx, flexShrink: 0, ...learningReduceMotionSx }}
        >
          Open learning hub
        </Button>
      </Stack>

      {loading ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" },
            gap: 1.5,
          }}
        >
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} variant="rounded" height={92} sx={{ borderRadius: "10px" }} />
          ))}
        </Box>
      ) : materials.length === 0 ? (
        <Typography variant="body2" sx={{ color: editorial.softMuted, fontWeight: 700 }}>
          No materials published yet.
        </Typography>
      ) : (
        <>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" },
              gap: 1.5,
            }}
          >
            {materials.map((material) => {
              const style = kindStyle(material.kind);
              return (
                <Box
                  key={material.id}
                  component="button"
                  type="button"
                  onClick={() =>
                    navigate(
                      material.folderPath
                        ? `/learning?topic=${encodeURIComponent(material.folderPath)}`
                        : "/learning",
                    )
                  }
                  aria-label={`Open ${material.title} in the learning hub`}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.25,
                    p: 1,
                    width: "100%",
                    textAlign: "left",
                    cursor: "pointer",
                    borderRadius: "10px",
                    border: editorialHairline,
                    backgroundColor: editorial.white,
                    transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
                    "&:hover": {
                      transform: "translateY(-2px)",
                      boxShadow: editorialShadowHover,
                      borderColor: editorial.pmwPurpleSoft,
                    },
                    "&:focus-visible": { outline: `3px solid ${editorial.pmwBlueSoft}`, outlineOffset: 2 },
                    ...learningReduceMotionSx,
                  }}
                >
                  <Box
                    sx={{
                      width: 64,
                      height: 44,
                      flexShrink: 0,
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: style.color,
                      backgroundColor: style.wash,
                      backgroundImage: material.thumbnailUrl ? `url(${material.thumbnailUrl})` : "none",
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  >
                    {!material.thumbnailUrl &&
                      (material.kind === "video" ? <PlayCircleOutlined /> : style.icon)}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 800,
                        color: editorial.ink,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {material.title}
                    </Typography>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", color: editorial.softMuted }}>
                      <VisibilityOutlined sx={{ fontSize: 13 }} />
                      <Typography variant="caption" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                        {material.viewCount}
                      </Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        · {style.label}
                      </Typography>
                    </Stack>
                  </Box>
                </Box>
              );
            })}
          </Box>

          {totalViews > 0 && (
            <Chip
              size="small"
              icon={<VisibilityOutlined />}
              label={`${totalViews} colleague view${totalViews === 1 ? "" : "s"} across these materials`}
              sx={{
                mt: 1.5,
                fontWeight: 800,
                color: editorial.muted,
                backgroundColor: editorial.paperSoft,
                border: editorialHairline,
                "& .MuiChip-icon": { color: editorial.softMuted },
              }}
            />
          )}
        </>
      )}
    </Box>
  );
}
