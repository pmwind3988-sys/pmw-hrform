import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Chip,
  Container,
  InputAdornment,
  Link,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  HomeRounded,
  LibraryBooksOutlined,
  LogoutOutlined,
  Refresh,
  SchoolOutlined,
  SearchOutlined,
  SettingsOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";
import LearningHeader from "../components/learning/LearningHeader";
import MaterialCard from "../components/learning/MaterialCard";
import MaterialViewerDialog from "../components/learning/MaterialViewerDialog";
import TopicCard from "../components/learning/TopicCard";
import {
  LearningEmptyState,
  LearningSectionLabel,
  learningButtonSx,
  learningContentSx,
  learningInlineSurfaceSx,
  learningPageSx,
  learningPanelSx,
} from "../components/learning/learningUi";
import {
  acquireLearningIdentityToken,
  fetchLearningLibrary,
  isLearningSignInRequiredError,
} from "../utils/learningService";
import { useHrFormsOwner } from "../hooks/useHrFormsOwner";
import { usePortalSession } from "../auth/usePortalSession";
import { mergeViewCounts, useLearningViewCounts } from "../hooks/useLearningViewCounts";
import { editorial, editorialHairline } from "../theme/editorial";
import type {
  LearningMaterial,
  LearningMaterialKind,
  LearningTopic,
  LearningViewCounts,
} from "../types";

type KindFilter = "all" | LearningMaterialKind;

const KIND_FILTERS: Array<{ value: KindFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "video", label: "Videos" },
  { value: "document", label: "Documents" },
  { value: "pdf", label: "PDFs" },
  { value: "image", label: "Images" },
];

function matchesSearch(material: LearningMaterial, term: string): boolean {
  if (!term) return true;
  const haystack = [material.title, material.description, material.fileName, material.folderPath]
    .join(" ")
    .toLowerCase();
  return haystack.includes(term);
}

export default function LearningMaterialsPage() {
  const navigate = useNavigate();
  const { instance } = useMsal();
  const isAdmin = useHrFormsOwner();
  const { session: portalSession, signOut: signOutPortal } = usePortalSession();
  const [searchParams, setSearchParams] = useSearchParams();

  const [accessToken, setAccessToken] = useState("");
  const [topics, setTopics] = useState<LearningTopic[]>([]);
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);
  const [libraryReady, setLibraryReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [openMaterial, setOpenMaterial] = useState<LearningMaterial | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // The folder being browsed lives in the URL, so a topic can be linked to and
  // the back button walks back up the tree instead of leaving the hub.
  const currentPath = searchParams.get("topic") ?? "";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      setNeedsSignIn(false);

      const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;
      const token = await acquireLearningIdentityToken(instance, account);
      if (cancelled) return;
      setAccessToken(token);

      try {
        const data = await fetchLearningLibrary(token);
        if (cancelled) return;
        setTopics(data.topics);
        setMaterials(data.materials);
        setLibraryReady(data.libraryReady);
      } catch (err) {
        if (cancelled) return;
        if (isLearningSignInRequiredError(err)) {
          setNeedsSignIn(true);
        } else {
          setError(err instanceof Error ? err.message : "Learning materials could not be loaded.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [instance, reloadKey]);

  const term = search.trim().toLowerCase();
  const searching = term.length > 0;

  const childTopics = topics.filter((topic) => topic.parentPath === currentPath);
  const visibleMaterials = materials
    .filter((material) => (searching ? true : material.folderPath === currentPath))
    .filter((material) => kindFilter === "all" || material.kind === kindFilter)
    .filter((material) => matchesSearch(material, term));

  const totalViews = materials.reduce((sum, material) => sum + material.viewCount, 0);
  const breadcrumbSegments = currentPath ? currentPath.split("/") : [];

  const goToPath = (path: string) => {
    const next = new URLSearchParams(searchParams);
    if (path) next.set("topic", path);
    else next.delete("topic");
    setSearchParams(next);
  };

  /**
   * Images in the same folder, this one first — the card's hover slideshow.
   * SharePoint's own thumbnail comes first by preference: the full-size original
   * would have a card quietly pulling megapixels for a 16:9 tile.
   */
  const slideshowFor = (material: LearningMaterial): string[] => {
    if (material.kind !== "image") return [];
    const own = material.thumbnailUrl || material.mediaUrl || "";
    const siblings = materials
      .filter((item) => item.kind === "image" && item.folderPath === material.folderPath && item.id !== material.id)
      .map((item) => item.thumbnailUrl || item.mediaUrl || "")
      .filter(Boolean);
    return [own, ...siblings].filter(Boolean);
  };

  const viewerSiblings =
    openMaterial?.kind === "image"
      ? materials.filter((item) => item.kind === "image" && item.folderPath === openMaterial.folderPath)
      : [];

  const applyViewCount = (materialId: string, viewCount: number) => {
    setMaterials((current) =>
      current.map((item) =>
        item.id === materialId ? { ...item, viewCount, viewedByMe: true } : item,
      ),
    );
    setOpenMaterial((current) =>
      current && current.id === materialId ? { ...current, viewCount, viewedByMe: true } : current,
    );
  };

  /**
   * Someone else's view, arriving while this page is open. Only the numbers
   * change — the material list itself is left as it is, so a poll never
   * interrupts a video playing in the dialog behind it.
   */
  const applyLiveCounts = useCallback((data: LearningViewCounts) => {
    setMaterials((current) => mergeViewCounts(current, data));
    setOpenMaterial((current) => (current ? mergeViewCounts([current], data)[0] : current));
  }, []);

  useLearningViewCounts(accessToken, Boolean(accessToken) && !loading && libraryReady, applyLiveCounts);

  return (
    <Box sx={learningPageSx}>
      <LearningHeader
        title="Learning Materials"
        subtitle={
          portalSession
            ? `Signed in as ${portalSession.fullName}`
            : "Training videos, guides, and reference documents for PMW Group staff."
        }
        backPath={isAdmin ? "/admin/dashboard" : "/user/dashboard"}
        backLabel="Back to dashboard"
        showBack={!portalSession}
        actions={
          <>
            <Button
              size="small"
              startIcon={<Refresh />}
              onClick={() => setReloadKey((key) => key + 1)}
              sx={{ ...learningButtonSx, color: editorial.pmwBlueDark }}
            >
              Refresh
            </Button>
            {portalSession && (
              <Button
                size="small"
                startIcon={<LogoutOutlined />}
                onClick={signOutPortal}
                sx={{ ...learningButtonSx, color: editorial.pmwBlueDark }}
              >
                Sign out
              </Button>
            )}
            {isAdmin && (
              <Button
                size="small"
                variant="contained"
                startIcon={<SettingsOutlined />}
                onClick={() => navigate("/admin/learning")}
                sx={learningButtonSx}
              >
                Manage content
              </Button>
            )}
          </>
        }
      />

      <Container maxWidth="xl" disableGutters>
        <Box sx={learningContentSx}>
          {/* On a photo background the hero is the one block with nothing behind
              it, so it carries its own surface rather than trusting the picture
              to stay light where the words are. */}
          <Paper sx={{ ...learningPanelSx, p: { xs: 2, md: 3 }, mb: { xs: 2.5, md: 3.5 } }}>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1, mb: 1.5 }}>
              <Chip
                icon={<SchoolOutlined />}
                size="small"
                label="Learning hub"
                sx={{
                  backgroundColor: editorial.purpleWash,
                  color: editorial.pmwPurpleDark,
                  border: `1px solid ${editorial.pmwPurpleSoft}`,
                  fontWeight: 800,
                  "& .MuiChip-icon": { color: editorial.pmwPurpleDark },
                }}
              />
              <Chip
                size="small"
                label={`${materials.length} material${materials.length === 1 ? "" : "s"}`}
                sx={{
                  backgroundColor: editorial.paperSoft,
                  color: editorial.muted,
                  border: editorialHairline,
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                }}
              />
              <Chip
                size="small"
                icon={<VisibilityOutlined />}
                label={`${totalViews} total view${totalViews === 1 ? "" : "s"}`}
                sx={{
                  backgroundColor: editorial.paperSoft,
                  color: editorial.muted,
                  border: editorialHairline,
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                  "& .MuiChip-icon": { color: editorial.softMuted },
                }}
              />
            </Stack>

            <Typography
              variant="h1"
              sx={{
                color: editorial.ink,
                fontSize: { xs: "1.9rem", sm: "2.4rem", md: "2.8rem" },
                lineHeight: 1.05,
                textWrap: "balance",
              }}
            >
              Learn at your own pace
            </Typography>
            <Typography
              variant="h6"
              sx={{ color: editorial.muted, fontWeight: 700, mt: 1, maxWidth: 760, textWrap: "pretty" }}
            >
              Browse by topic, open a material in place, and pick up where the team left off. View counts are people,
              not plays: one per colleague, however often they come back.
            </Typography>
          </Paper>

          <Paper sx={{ ...learningPanelSx, p: { xs: 1.5, md: 2 }, mb: { xs: 2.5, md: 3 } }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ alignItems: { md: "center" } }}>
              <TextField
                size="small"
                fullWidth
                placeholder="Search materials, topics, or file names"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchOutlined sx={{ fontSize: 18, color: editorial.softMuted }} />
                      </InputAdornment>
                    ),
                  },
                }}
                sx={{
                  flex: 1,
                  "& .MuiOutlinedInput-root": { borderRadius: "10px", backgroundColor: editorial.white },
                }}
              />
              <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", gap: 0.75 }}>
                {KIND_FILTERS.map((filter) => {
                  const selected = kindFilter === filter.value;
                  return (
                    <Chip
                      key={filter.value}
                      label={filter.label}
                      onClick={() => setKindFilter(filter.value)}
                      sx={{
                        fontWeight: 800,
                        borderRadius: "8px",
                        backgroundColor: selected ? editorial.pmwBlueDark : editorial.white,
                        color: selected ? editorial.white : editorial.muted,
                        border: `1px solid ${selected ? editorial.pmwBlueDark : editorial.border}`,
                        "&:hover": {
                          backgroundColor: selected ? editorial.pmwBlue : editorial.blueWash,
                        },
                      }}
                    />
                  );
                })}
              </Stack>
            </Stack>
          </Paper>

          {!searching && (
            <Breadcrumbs
              sx={{
                ...learningInlineSurfaceSx,
                mb: 2,
                "& .MuiBreadcrumbs-separator": { color: editorial.softMuted },
              }}
            >
              <Link
                component="button"
                type="button"
                underline="hover"
                onClick={() => goToPath("")}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  fontWeight: 800,
                  color: currentPath ? editorial.pmwBlueDark : editorial.ink,
                }}
              >
                <HomeRounded sx={{ fontSize: 17 }} />
                All topics
              </Link>
              {breadcrumbSegments.map((segment, index) => {
                const path = breadcrumbSegments.slice(0, index + 1).join("/");
                const isLast = index === breadcrumbSegments.length - 1;
                return isLast ? (
                  <Typography key={path} sx={{ fontWeight: 800, color: editorial.ink }}>
                    {segment}
                  </Typography>
                ) : (
                  <Link
                    key={path}
                    component="button"
                    type="button"
                    underline="hover"
                    onClick={() => goToPath(path)}
                    sx={{ fontWeight: 800, color: editorial.pmwBlueDark }}
                  >
                    {segment}
                  </Link>
                );
              })}
            </Breadcrumbs>
          )}

          {needsSignIn && (
            <Alert severity="warning" sx={{ mb: 2, borderRadius: "10px", fontWeight: 700 }}>
              Your Microsoft 365 session could not be confirmed. Refresh the page or sign in again to open learning
              materials.
            </Alert>
          )}

          {error && (
            <Alert
              severity="error"
              sx={{ mb: 2, borderRadius: "10px", fontWeight: 700 }}
              action={
                <Button size="small" onClick={() => setReloadKey((key) => key + 1)} sx={learningButtonSx}>
                  Retry
                </Button>
              }
            >
              {error}
            </Alert>
          )}

          {loading ? (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)", lg: "repeat(4, 1fr)" },
                gap: { xs: 1.5, md: 2 },
              }}
            >
              {[0, 1, 2, 3, 4, 5, 6, 7].map((key) => (
                <Skeleton key={key} variant="rounded" height={248} sx={{ borderRadius: "12px" }} />
              ))}
            </Box>
          ) : !libraryReady ? (
            <LearningEmptyState
              icon={<LibraryBooksOutlined />}
              title="The learning library is not set up yet"
              description={
                isAdmin
                  ? "Open Manage content to create the SharePoint library and upload your first topic."
                  : "An HR Forms Owner needs to set up the learning library before materials appear here."
              }
              action={
                isAdmin ? (
                  <Button
                    variant="contained"
                    startIcon={<SettingsOutlined />}
                    onClick={() => navigate("/admin/learning")}
                    sx={learningButtonSx}
                  >
                    Manage content
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              {!searching && childTopics.length > 0 && (
                <Box sx={{ mb: { xs: 3, md: 4 } }}>
                  <LearningSectionLabel>{currentPath ? "Subtopics" : "Topics"}</LearningSectionLabel>
                  <Box
                    sx={{
                      mt: 1,
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(2, 1fr)",
                        md: "repeat(3, 1fr)",
                        lg: "repeat(4, 1fr)",
                      },
                      gap: { xs: 1.5, md: 2 },
                    }}
                  >
                    {childTopics.map((topic) => (
                      <TopicCard key={topic.path} topic={topic} onOpen={(next) => goToPath(next.path)} />
                    ))}
                  </Box>
                </Box>
              )}

              {visibleMaterials.length > 0 ? (
                <Box>
                  <LearningSectionLabel>
                    {searching
                      ? `${visibleMaterials.length} result${visibleMaterials.length === 1 ? "" : "s"}`
                      : "Materials"}
                  </LearningSectionLabel>
                  <Box
                    sx={{
                      mt: 1,
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(2, 1fr)",
                        md: "repeat(3, 1fr)",
                        lg: "repeat(4, 1fr)",
                      },
                      gap: { xs: 1.5, md: 2 },
                    }}
                  >
                    {visibleMaterials.map((material) => (
                      <MaterialCard
                        key={material.id}
                        material={material}
                        slideshowUrls={slideshowFor(material)}
                        showFolderPath={searching}
                        onOpen={setOpenMaterial}
                      />
                    ))}
                  </Box>
                </Box>
              ) : (
                childTopics.length === 0 && (
                  <LearningEmptyState
                    icon={<LibraryBooksOutlined />}
                    title={searching ? "No materials match that search" : "Nothing here yet"}
                    description={
                      searching
                        ? "Try a different word, or clear the filters to see everything available."
                        : "This topic has no materials yet. Check back after the next training upload."
                    }
                    action={
                      searching ? (
                        <Button
                          variant="outlined"
                          onClick={() => {
                            setSearch("");
                            setKindFilter("all");
                          }}
                          sx={learningButtonSx}
                        >
                          Clear search
                        </Button>
                      ) : undefined
                    }
                  />
                )
              )}
            </>
          )}
        </Box>
      </Container>

      <MaterialViewerDialog
        material={openMaterial}
        siblings={viewerSiblings}
        accessToken={accessToken}
        onClose={() => setOpenMaterial(null)}
        onNavigate={setOpenMaterial}
        onViewRecorded={applyViewCount}
      />
    </Box>
  );
}
