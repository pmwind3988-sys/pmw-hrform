import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slider,
  Skeleton,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  Add,
  AutoAwesome,
  Delete,
  Edit,
  Link as LinkIcon,
  Refresh,
  Search as SearchIcon,
  Work,
} from "@mui/icons-material";
import {
  createCareerPortalCard,
  deleteCareerPortalCard,
  fetchAdminJobs,
  fetchCareerPortalCards,
  updateCareerPortalCard,
} from "../utils/careersService";
import { acquireAccessTokenSilentOrRedirect } from "../utils/authRecovery";
import { ensureCareerPortalCardList } from "../utils/formBuilderSP";
import CareerPortalHeader from "../components/careers/CareerPortalHeader";
import type { CareerPortalCard, JobListing } from "../types";

type PortalCardForm = Omit<CareerPortalCard, "id" | "created">;
type SnackbarState = { message: string; severity: "success" | "error" } | null;

const DEFAULT_CARD_COLORS = {
  start: "#0078D4",
  end: "#6264A7",
  accent: "#16A34A",
};
const DEFAULT_IMAGE_OPACITY = 0.72;

const EMPTY_PORTAL_CARD: PortalCardForm = {
  title: "",
  description: "",
  imageUrl: "",
  imageSource: "",
  imageOpacity: DEFAULT_IMAGE_OPACITY,
  sortOrder: 0,
  status: "Active",
  targetType: "none",
  targetValue: "",
  colorStart: DEFAULT_CARD_COLORS.start,
  colorEnd: DEFAULT_CARD_COLORS.end,
  colorAccent: DEFAULT_CARD_COLORS.accent,
};

const reduceMotionSx = {
  "@media (prefers-reduced-motion: reduce)": {
    transition: "none",
    transform: "none",
    "&:hover": {
      transform: "none",
    },
    "&:active": {
      transform: "none",
    },
  },
};

function safeColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function cardGradient(card: Pick<CareerPortalCard, "colorStart" | "colorEnd" | "colorAccent">): string {
  return `linear-gradient(135deg, ${safeColor(card.colorStart, DEFAULT_CARD_COLORS.start)} 0%, ${safeColor(card.colorEnd, DEFAULT_CARD_COLORS.end)} 58%, ${safeColor(card.colorAccent, DEFAULT_CARD_COLORS.accent)} 100%)`;
}

function safeImageOpacity(value: number | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_IMAGE_OPACITY;
  return Math.min(1, Math.max(0, parsed));
}

function cardFormFromInitial(initial: CareerPortalCard | null): PortalCardForm {
  if (!initial) return { ...EMPTY_PORTAL_CARD };
  return {
    title: initial.title,
    description: initial.description,
    imageUrl: initial.imageUrl,
    imageSource: initial.imageSource || "",
    imageOpacity: safeImageOpacity(initial.imageOpacity),
    sortOrder: initial.sortOrder,
    status: initial.status,
    targetType: initial.targetType,
    targetValue: initial.targetValue,
    colorStart: initial.colorStart || DEFAULT_CARD_COLORS.start,
    colorEnd: initial.colorEnd || DEFAULT_CARD_COLORS.end,
    colorAccent: initial.colorAccent || DEFAULT_CARD_COLORS.accent,
    isSystemDefault: initial.isSystemDefault,
    locked: initial.locked,
    source: initial.source,
  };
}

function targetSummary(card: CareerPortalCard, jobs: JobListing[]): string {
  if (card.targetType === "job") {
    const job = jobs.find((item) => item.id === card.targetValue);
    return `Job: ${job ? [job.title, job.company].filter(Boolean).join(" - ") : card.targetValue || "Not selected"}`;
  }
  if (card.targetType === "link") return card.targetValue || "Link not set";
  return "No click target";
}

function targetIcon(card: CareerPortalCard) {
  if (card.targetType === "job") return <Work sx={{ fontSize: 14 }} />;
  if (card.targetType === "link") return <LinkIcon sx={{ fontSize: 14 }} />;
  return <AutoAwesome sx={{ fontSize: 14 }} />;
}

function isPortalCardStorageError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("access denied") || (message.includes("career portal cards") && message.includes("not ready"));
}

function sharePointScope(): string {
  const spSiteUrl = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
  return `${new URL(spSiteUrl).origin}/AllSites.Manage`;
}

function CardsLoadingSkeleton() {
  return (
    <>
      <Paper
        sx={{
          p: { xs: 2, md: 2.5 },
          mb: 3,
          borderRadius: "8px",
          border: "1px solid rgba(17, 24, 39, 0.08)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        }}
      >
        <Skeleton variant="rounded" width="100%" height={40} sx={{ maxWidth: 420, borderRadius: "8px" }} />
      </Paper>
      <Grid container spacing={2}>
        {[1, 2, 3, 4, 5, 6].map((item) => (
          <Grid key={item} size={{ xs: 12, md: 6, lg: 4 }}>
            <Card
              sx={{
                height: "100%",
                borderRadius: "8px",
                border: "1px solid rgba(17, 24, 39, 0.08)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                overflow: "hidden",
              }}
            >
              <Skeleton variant="rounded" height={150} sx={{ borderRadius: 0 }} />
              <CardContent sx={{ p: 2 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mb: 1 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Skeleton variant="text" width="72%" height={26} />
                    <Skeleton variant="text" width={76} height={18} />
                  </Box>
                  <Skeleton variant="rounded" width={74} height={22} sx={{ borderRadius: "8px" }} />
                </Box>
                <Skeleton variant="text" width="100%" height={20} />
                <Skeleton variant="text" width="82%" height={20} sx={{ mb: 1.25 }} />
                <Skeleton variant="rounded" width="70%" height={26} sx={{ borderRadius: "8px" }} />
                <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 0.5, mt: 1.5 }}>
                  <Skeleton variant="rounded" width={30} height={30} sx={{ borderRadius: "8px" }} />
                  <Skeleton variant="rounded" width={30} height={30} sx={{ borderRadius: "8px" }} />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </>
  );
}

function PortalCardDialog({
  open,
  initial,
  jobs,
  saving,
  mustStayActive,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: CareerPortalCard | null;
  jobs: JobListing[];
  saving: boolean;
  mustStayActive: boolean;
  onClose: () => void;
  onSave: (card: PortalCardForm) => void;
}) {
  const [form, setForm] = useState<PortalCardForm>(() => cardFormFromInitial(initial));
  const isSystemDefault = Boolean(initial?.isSystemDefault);

  const updateField = <K extends keyof PortalCardForm>(key: K, value: PortalCardForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const normalizedTargetValue = form.targetType === "none" ? "" : form.targetValue.trim();
  const hasCustomImage = !isSystemDefault && Boolean(form.imageUrl.trim());
  const saveDisabled = !form.title.trim() || saving || (form.targetType !== "none" && !normalizedTargetValue) || (hasCustomImage && !form.imageSource.trim());

  return (
    <Dialog
      open={open}
      onClose={saving ? () => {} : onClose}
      maxWidth="md"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: "8px" } } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Typography variant="h6" component="div" sx={{ fontWeight: 800, color: "#111827" }}>
            {initial ? "Edit Card" : "Add Card"}
          </Typography>
          {isSystemDefault && (
            <Chip
              label="System Default"
              size="small"
              sx={{ borderRadius: "8px", backgroundColor: "#EEF2FF", color: "#4F46E5", fontWeight: 800 }}
            />
          )}
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Stack spacing={2}>
              <TextField
                label="Title"
                value={form.title}
                onChange={(e) => updateField("title", e.target.value)}
                fullWidth
                required
                size="small"
                slotProps={{ input: { sx: { borderRadius: "8px" } } }}
              />
              <TextField
                label="Description"
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                fullWidth
                multiline
                rows={4}
                size="small"
                slotProps={{ input: { sx: { borderRadius: "8px" } } }}
              />
              {!isSystemDefault && (
                <>
                  <TextField
                    label="Picture URL"
                    value={form.imageUrl}
                    onChange={(e) => updateField("imageUrl", e.target.value)}
                    fullWidth
                    size="small"
                    placeholder="https://..."
                    slotProps={{ input: { sx: { borderRadius: "8px" } } }}
                  />
                  <TextField
                    label="Image source / credit"
                    value={form.imageSource}
                    onChange={(e) => updateField("imageSource", e.target.value)}
                    fullWidth
                    required={hasCustomImage}
                    size="small"
                    placeholder="PMW owned asset, photographer, license, or source URL"
                    slotProps={{ input: { sx: { borderRadius: "8px" } } }}
                  />
                  <Box>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 0.25 }}>
                      <Typography variant="caption" sx={{ color: "#374151", fontWeight: 700 }}>
                        Image Opacity
                      </Typography>
                      <Typography variant="caption" sx={{ color: "#6B7280", fontWeight: 700 }}>
                        {Math.round(safeImageOpacity(form.imageOpacity) * 100)}%
                      </Typography>
                    </Box>
                    <Slider
                      value={Math.round(safeImageOpacity(form.imageOpacity) * 100)}
                      min={0}
                      max={100}
                      step={1}
                      onChange={(_, value) => {
                        const nextValue = Array.isArray(value) ? value[0] : value;
                        updateField("imageOpacity", safeImageOpacity(nextValue / 100));
                      }}
                      aria-label="Image opacity"
                      sx={{ color: "#0078D4" }}
                    />
                  </Box>
                </>
              )}
              {isSystemDefault && (
                <Grid container spacing={1.25}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      label="Start color"
                      type="color"
                      value={safeColor(form.colorStart, DEFAULT_CARD_COLORS.start)}
                      onChange={(e) => updateField("colorStart", e.target.value)}
                      fullWidth
                      size="small"
                      slotProps={{ inputLabel: { shrink: true }, input: { sx: { borderRadius: "8px" } } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      label="End color"
                      type="color"
                      value={safeColor(form.colorEnd, DEFAULT_CARD_COLORS.end)}
                      onChange={(e) => updateField("colorEnd", e.target.value)}
                      fullWidth
                      size="small"
                      slotProps={{ inputLabel: { shrink: true }, input: { sx: { borderRadius: "8px" } } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      label="Accent color"
                      type="color"
                      value={safeColor(form.colorAccent, DEFAULT_CARD_COLORS.accent)}
                      onChange={(e) => updateField("colorAccent", e.target.value)}
                      fullWidth
                      size="small"
                      slotProps={{ inputLabel: { shrink: true }, input: { sx: { borderRadius: "8px" } } }}
                    />
                  </Grid>
                </Grid>
              )}
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Sort Order"
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => updateField("sortOrder", Number(e.target.value))}
                    fullWidth
                    size="small"
                    slotProps={{ input: { sx: { borderRadius: "8px" } } }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Status</InputLabel>
                    <Select
                      value={form.status}
                      label="Status"
                      onChange={(e) => updateField("status", e.target.value as CareerPortalCard["status"])}
                      sx={{ borderRadius: "8px" }}
                    >
                      <MenuItem value="Active">Active</MenuItem>
                      <MenuItem value="Hidden" disabled={mustStayActive}>Hidden</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
              {mustStayActive && (
                <Alert severity="info" sx={{ borderRadius: "8px" }}>
                  At least one carousel card must stay active.
                </Alert>
              )}
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 5 }}>
            <Stack spacing={2}>
              <Box
                sx={{
                  borderRadius: "8px",
                  overflow: "hidden",
                  border: "1px solid #E5E7EB",
                  minHeight: 190,
                  backgroundColor: "#F3F4F6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {!isSystemDefault && form.imageUrl ? (
                  <Box sx={{ width: "100%", height: 190, position: "relative", backgroundColor: "#111827" }}>
                    <Box
                      component="img"
                      src={form.imageUrl}
                      alt=""
                      sx={{ width: "100%", height: "100%", objectFit: "cover", opacity: safeImageOpacity(form.imageOpacity) }}
                    />
                    <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(17,24,39,0.05), rgba(17,24,39,0.44))" }} />
                    {form.imageSource.trim() && (
                      <Typography
                        variant="caption"
                        sx={{ position: "absolute", right: 10, bottom: 8, color: "rgba(255,255,255,0.76)", maxWidth: "70%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.62rem" }}
                      >
                        {form.imageSource.trim()}
                      </Typography>
                    )}
                  </Box>
                ) : (
                  <Box
                    sx={{
                      width: "100%",
                      height: 190,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: cardGradient(form),
                      color: "#ffffff",
                    }}
                  >
                    <AutoAwesome />
                  </Box>
                )}
              </Box>

              <FormControl fullWidth size="small">
                <InputLabel>Click Target</InputLabel>
                <Select
                  value={form.targetType}
                  label="Click Target"
                  onChange={(e) => {
                    const targetType = e.target.value as CareerPortalCard["targetType"];
                    setForm((prev) => ({ ...prev, targetType, targetValue: "" }));
                  }}
                  sx={{ borderRadius: "8px" }}
                >
                  <MenuItem value="none">No target</MenuItem>
                  <MenuItem value="job">Job item</MenuItem>
                  <MenuItem value="link">Custom link</MenuItem>
                </Select>
              </FormControl>

              {form.targetType === "job" && (
                <FormControl fullWidth size="small" required>
                  <InputLabel>Target Job</InputLabel>
                  <Select
                    value={form.targetValue}
                    label="Target Job"
                    onChange={(e) => updateField("targetValue", e.target.value)}
                    sx={{ borderRadius: "8px" }}
                  >
                    {jobs.map((job) => (
                      <MenuItem key={job.id} value={job.id}>
                        {[job.title, job.company].filter(Boolean).join(" - ")}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {form.targetType === "link" && (
                <TextField
                  label="Target Link"
                  value={form.targetValue}
                  onChange={(e) => updateField("targetValue", e.target.value)}
                  fullWidth
                  required
                  size="small"
                  placeholder="https://... or /career-portal"
                  slotProps={{ input: { sx: { borderRadius: "8px" } } }}
                />
              )}
            </Stack>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={saving} sx={{ borderRadius: "8px", textTransform: "none", color: "#6B7280" }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={saveDisabled}
          onClick={() => onSave({
            ...form,
            title: form.title.trim(),
            description: form.description.trim(),
            imageUrl: isSystemDefault ? "" : form.imageUrl.trim(),
            imageSource: isSystemDefault ? "" : form.imageSource.trim(),
            imageOpacity: isSystemDefault ? DEFAULT_IMAGE_OPACITY : safeImageOpacity(form.imageOpacity),
            targetValue: normalizedTargetValue,
            colorStart: safeColor(form.colorStart, DEFAULT_CARD_COLORS.start),
            colorEnd: safeColor(form.colorEnd, DEFAULT_CARD_COLORS.end),
            colorAccent: safeColor(form.colorAccent, DEFAULT_CARD_COLORS.accent),
          })}
          sx={{ borderRadius: "8px", textTransform: "none", backgroundColor: "#0078D4", fontWeight: 700 }}
        >
          {saving ? "Saving..." : initial ? "Update Card" : "Add Card"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function AdminCareerPortalCardsPage() {
  const { instance, accounts } = useMsal();
  const [cards, setCards] = useState<CareerPortalCard[]>([]);
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCard, setEditCard] = useState<CareerPortalCard | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<CareerPortalCard | null>(null);
  const [snackbar, setSnackbar] = useState<SnackbarState>(null);

  const getAdminAccessToken = async (): Promise<string> => {
    const account = instance.getActiveAccount() ?? accounts[0];
    if (!account) {
      throw new Error("No signed-in account found.");
    }
    return acquireAccessTokenSilentOrRedirect(instance, {
      scopes: [sharePointScope()],
      account,
    });
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const accessToken = await getAdminAccessToken();
      const [cardData, jobData] = await Promise.all([
        fetchCareerPortalCards({ accessToken }),
        fetchAdminJobs({ accessToken }),
      ]);
      setCards(cardData);
      setJobs(jobData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cards");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const filteredCards = cards.filter((card) => {
    const q = searchText.trim().toLowerCase();
    if (!q) return true;
    const targetText = targetSummary(card, jobs);
    return [
      card.title,
      card.description,
      card.imageUrl,
      card.imageSource,
      card.status,
      card.isSystemDefault ? "system default" : "",
      card.targetType,
      card.targetValue,
      targetText,
    ].join(" ").toLowerCase().includes(q);
  });

  const handleCreate = () => {
    setEditCard(null);
    setDialogOpen(true);
  };

  const handleEdit = (card: CareerPortalCard) => {
    setEditCard(card);
    setDialogOpen(true);
  };

  const ensurePortalCardStorage = async () => {
    const token = await getAdminAccessToken();
    await ensureCareerPortalCardList(token);
  };

  const handleSave = async (card: PortalCardForm) => {
    setSaving(true);
    try {
      const accessToken = await getAdminAccessToken();
      const saveCard = async () => {
        if (editCard) {
          await updateCareerPortalCard(editCard.id, card, { accessToken });
          return "Card updated";
        }
        await createCareerPortalCard(card, { accessToken });
        return "Card added";
      };

      let successMessage: string;
      try {
        successMessage = await saveCard();
      } catch (err) {
        if (!isPortalCardStorageError(err)) throw err;
        await ensurePortalCardStorage();
        successMessage = await saveCard();
      }
      setSnackbar({ message: successMessage, severity: "success" });
      setDialogOpen(false);
      setEditCard(null);
      await load();
    } catch (err) {
      setSnackbar({ message: err instanceof Error ? err.message : "Failed to save card", severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.isSystemDefault) {
      setSnackbar({ message: "System default cards cannot be deleted", severity: "error" });
      setDeleteConfirm(null);
      return;
    }
    setDeletingId(deleteConfirm.id);
    try {
      const accessToken = await getAdminAccessToken();
      await deleteCareerPortalCard(deleteConfirm.id, { accessToken });
      setSnackbar({ message: "Card deleted", severity: "success" });
      setDeleteConfirm(null);
      await load();
    } catch (err) {
      setSnackbar({ message: err instanceof Error ? err.message : "Failed to delete card", severity: "error" });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", background: "var(--app-bg, linear-gradient(180deg, #BFDDF4 0%, #DCECF8 45%, #F7F5EF 100%))" }}>
      <CareerPortalHeader
        title="Manage Cards"
        subtitle="Control the carousel shown on the careers portal welcome card."
        activeSection="cards"
        isAdmin
        backPath="/career-portal"
        backLabel="Back to career portal"
        maxWidth="xl"
        actions={(
          <>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={() => void load()}
              disabled={loading}
              sx={{ backgroundColor: "#ffffff", borderColor: "#D1D5DB", color: "#374151" }}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={handleCreate}
              sx={{ backgroundColor: "#0078D4", color: "#ffffff" }}
            >
              Add Card
            </Button>
          </>
        )}
      />

      <Box sx={{ maxWidth: 1320, mx: "auto", px: { xs: 2, sm: 3 }, py: 4 }}>
        {!loading && (
        <Paper
          sx={{
            p: { xs: 2, md: 2.5 },
            mb: 3,
            borderRadius: "8px",
            border: "1px solid rgba(17, 24, 39, 0.08)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        >
          <TextField
            placeholder="Search cards, targets, links..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            size="small"
            sx={{
              width: { xs: "100%", md: 420 },
              "& .MuiOutlinedInput-root": { borderRadius: "8px", backgroundColor: "#F8F9FC" },
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: "#6B7280", fontSize: 20 }} />
                  </InputAdornment>
                ),
              },
            }}
          />
        </Paper>
        )}

        {!loading && error && (
          <Alert
            severity="error"
            sx={{ borderRadius: "8px", mb: 3, fontWeight: 600, backgroundColor: "#FEF2F2", color: "#991B1B" }}
            action={<Button size="small" onClick={() => void load()} sx={{ textTransform: "none" }}>Retry</Button>}
          >
            {error}
          </Alert>
        )}

        {loading ? (
          <CardsLoadingSkeleton />
        ) : !error && cards.length === 0 ? (
          <Paper sx={{ textAlign: "center", py: 8, borderRadius: "8px", border: "1px dashed #D1D5DB" }}>
            <AutoAwesome sx={{ fontSize: 44, color: "#9CA3AF", mb: 1 }} />
            <Typography variant="h6" sx={{ color: "#374151", fontWeight: 800, mb: 0.5 }}>
              No Cards
            </Typography>
            <Typography variant="body2" sx={{ color: "#6B7280", mb: 2 }}>
              Add the first carousel item for the careers page.
            </Typography>
            <Button variant="contained" startIcon={<Add />} onClick={handleCreate} sx={{ borderRadius: "8px", backgroundColor: "#0078D4" }}>
              Add Card
            </Button>
          </Paper>
        ) : !error && filteredCards.length === 0 ? (
          <Paper sx={{ textAlign: "center", py: 8, borderRadius: "8px", border: "1px solid rgba(17, 24, 39, 0.08)" }}>
            <SearchIcon sx={{ fontSize: 44, color: "#CBD5E1", mb: 1 }} />
            <Typography variant="h6" sx={{ color: "#374151", fontWeight: 800 }}>
              No Matching Cards
            </Typography>
            <Typography variant="body2" sx={{ color: "#6B7280" }}>
              Try a different title, target, or link.
            </Typography>
          </Paper>
        ) : (
          <Grid container spacing={2}>
            {filteredCards.map((card) => (
              <Grid key={card.id} size={{ xs: 12, md: 6, lg: 4 }}>
                <Card
                  sx={{
                    height: "100%",
                    borderRadius: "8px",
                    border: "1px solid rgba(17, 24, 39, 0.08)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                    overflow: "hidden",
                    transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
                    "&:hover": {
                      transform: "translateY(-3px)",
                      borderColor: "rgba(0, 120, 212, 0.18)",
                      boxShadow: "0 12px 28px rgba(17, 24, 39, 0.10)",
                    },
                    ...reduceMotionSx,
                  }}
                >
                  <Box
                    sx={{
                      height: 150,
                      position: "relative",
                      overflow: "hidden",
                      background: card.imageUrl ? "#111827" : cardGradient(card),
                    }}
                  >
                    {card.imageUrl && (
                      <>
                        <Box
                          component="img"
                          src={card.imageUrl}
                          alt=""
                          sx={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            opacity: safeImageOpacity(card.imageOpacity),
                          }}
                        />
                        <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(17,24,39,0.04), rgba(17,24,39,0.34))" }} />
                        {card.imageSource && (
                          <Typography
                            variant="caption"
                            sx={{
                              position: "absolute",
                              right: 10,
                              bottom: 8,
                              color: "rgba(255,255,255,0.78)",
                              maxWidth: "72%",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              fontSize: "0.62rem",
                            }}
                          >
                            {card.imageSource}
                          </Typography>
                        )}
                      </>
                    )}
                  </Box>
                  <CardContent sx={{ p: 2 }}>
                    <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, color: "#111827", lineHeight: 1.25 }}>
                          {card.title}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "#9CA3AF", fontWeight: 700 }}>
                          Order {card.sortOrder}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {card.isSystemDefault && (
                          <Chip
                            label="System Default"
                            size="small"
                            sx={{
                              borderRadius: "8px",
                              fontSize: "0.68rem",
                              fontWeight: 800,
                              backgroundColor: "#EEF2FF",
                              color: "#4F46E5",
                            }}
                          />
                        )}
                        <Chip
                          label={card.status}
                          size="small"
                          sx={{
                            borderRadius: "8px",
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            backgroundColor: card.status === "Active" ? "#E6F4EA" : "#F3F4F6",
                            color: card.status === "Active" ? "#2E7D32" : "#6B7280",
                          }}
                        />
                      </Stack>
                    </Stack>
                    <Typography
                      variant="body2"
                      sx={{
                        color: "#4B5563",
                        minHeight: 44,
                        mb: 1.25,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {card.description || "No description"}
                    </Typography>
                    <Chip
                      icon={targetIcon(card)}
                      label={targetSummary(card, jobs)}
                      size="small"
                      sx={{
                        maxWidth: "100%",
                        borderRadius: "8px",
                        backgroundColor: card.targetType === "none" ? "#F3F4F6" : "#F0F7FF",
                        color: card.targetType === "none" ? "#6B7280" : "#005A9E",
                        fontWeight: 700,
                        "& .MuiChip-label": {
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        },
                      }}
                    />
                    <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 0.5, mt: 1.5 }}>
                      <IconButton aria-label={`Edit ${card.title}`} size="small" onClick={() => handleEdit(card)} sx={{ color: "#6B7280" }}>
                        <Edit sx={{ fontSize: 18 }} />
                      </IconButton>
                      {!card.isSystemDefault && (
                        <IconButton
                          aria-label={`Delete ${card.title}`}
                          size="small"
                          disabled={deletingId === card.id}
                          onClick={() => setDeleteConfirm(card)}
                          sx={{ color: deletingId === card.id ? "#9CA3AF" : "#DC2626" }}
                        >
                          {deletingId === card.id ? <CircularProgress size={18} sx={{ color: "#DC2626" }} /> : <Delete sx={{ fontSize: 18 }} />}
                        </IconButton>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>

      {dialogOpen && (
        <PortalCardDialog
          open
          initial={editCard}
          jobs={jobs}
          saving={saving}
          mustStayActive={Boolean(editCard?.status === "Active" && cards.filter((card) => card.status === "Active").length <= 1)}
          onClose={() => {
            setDialogOpen(false);
            setEditCard(null);
          }}
          onSave={handleSave}
        />
      )}

      <Dialog
        open={Boolean(deleteConfirm)}
        onClose={() => deletingId ? undefined : setDeleteConfirm(null)}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: "8px" } } }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>Delete card?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: "#4B5563" }}>
            This removes "{deleteConfirm?.title}" from the careers page carousel.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteConfirm(null)} disabled={Boolean(deletingId)} sx={{ borderRadius: "8px", textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => void handleDelete()}
            disabled={Boolean(deletingId)}
            sx={{ borderRadius: "8px", textTransform: "none" }}
          >
            {deletingId ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(snackbar)}
        autoHideDuration={3500}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={snackbar?.severity || "success"}
          onClose={() => setSnackbar(null)}
          sx={{ borderRadius: "8px", boxShadow: "0 8px 24px rgba(17,24,39,0.16)" }}
        >
          {snackbar?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
