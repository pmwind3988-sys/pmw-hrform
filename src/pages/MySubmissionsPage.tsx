import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import {
  DeleteForeverOutlined as DeleteForeverIcon,
  FileDownloadOutlined as FileDownloadIcon,
  TableChartOutlined as TableChartIcon,
  WarningAmberOutlined as WarningIcon,
} from "@mui/icons-material";
import { useDashboard } from "../contexts/DashboardContext";
import Toolbar from "../components/dashboard/Toolbar";
import ListHeader from "../components/dashboard/ListHeader";
import SubmissionRow from "../components/dashboard/SubmissionRow";
import EmptyState from "../components/dashboard/EmptyState";
import DetailModal from "../components/dashboard/DetailModal";
import {
  collectFieldCatalog,
  collectFormTypes,
  collectFormVersions,
  collectPublishProfiles,
} from "../utils/submissionFilters";
import { buildSubmissionCsv } from "../utils/submissionCsv";
import { downloadCsv } from "../utils/csv";
import type { HardDeleteSubmissionResult, Submission } from "../types";
import { editorial, si, siType } from "../theme/editorial";
import { bucketSubmissions } from "../utils/submissionStatusBuckets";

/**
 * My Work → My Submissions.
 *
 * The filter toolbar, the row list, the detail modal, and the export and
 * permanent-delete flows — all of which used to sit at the bottom of the
 * dashboard, below the hero, the tiles, the form cards and the carousel.
 *
 * WHOSE ROWS THESE ARE. The section is called My Submissions and shows this
 * account's own rows. The everybody-else view still exists for superusers as
 * "All Submissions" (`/admin/submissions`), which is the pre-existing approval
 * dashboard; the two are separate tabs so it is always clear which one is on
 * screen. Before this split there was one list whose contents silently depended
 * on your permissions, so two people looking at "the dashboard" could see
 * different things and have no way to tell.
 */
export default function MySubmissionsPage() {
  const {
    userEmail,
    isAdmin,
    canUseFormBuilder,
    submissions,
    visibleLists,
    listMetaMap,
    hasFilters,
    detailItem,
    setDetailItem,
    filters,
    setFilters,
    sortBy,
    setSortBy,
    sortedSubmissions,
    onHardDeleteSubmission,
  } = useDashboard();

  const [deleteTarget, setDeleteTarget] = useState<Submission | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<"idle" | "deleting">("idle");
  const [deleteError, setDeleteError] = useState("");
  const [deleteResult, setDeleteResult] = useState<HardDeleteSubmissionResult | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<"current" | "all">("current");

  const canHardDeleteSubmission = isAdmin || canUseFormBuilder;
  const canExportSubmissions = isAdmin || canUseFormBuilder;

  /**
   * Own rows, matched on either identity field.
   *
   * `submittedByEmail` is what the form writes and `createdByEmail` is what
   * SharePoint records, and they disagree in two real cases: a form submitted
   * on someone's behalf, and a row created before the app wrote the former at
   * all. Matching either avoids a submission a person definitely made
   * disappearing from the page named after them.
   */
  const ownSubmissions = useMemo(() => {
    const mine = userEmail.trim().toLowerCase();
    if (!mine) return sortedSubmissions;
    return sortedSubmissions.filter((item) => {
      const submitted = (item.submittedByEmail ?? "").trim().toLowerCase();
      const created = (item.createdByEmail ?? "").trim().toLowerCase();
      return submitted === mine || created === mine;
    });
  }, [sortedSubmissions, userEmail]);

  const formTypeOptions = collectFormTypes(
    submissions,
    visibleLists.map((list) => list.title),
  );
  const publishProfileOptions = collectPublishProfiles(submissions, filters.formType);
  const formVersionOptions = collectFormVersions(submissions, filters.formType, filters.publishProfile);
  const fieldCatalog = collectFieldCatalog(submissions, filters.formType, {
    publishProfile: filters.publishProfile,
    formVersion: filters.formVersion,
  });

  const exportRows = exportScope === "all" ? submissions : ownSubmissions;

  /**
   * The counts that used to sit on each form card, now beside the rows they
   * describe and scoped to what is actually on screen.
   *
   * One line, not the dashboard's four tiles: those already state the same
   * figures, and repeating them here in a heavier weight would say the number
   * twice and leave a reader wondering which was authoritative.
   */
  const counts = bucketSubmissions(ownSubmissions);

  const openDeleteDialog = (item: Submission) => {
    setDeleteTarget(item);
    setDeleteError("");
    setDeleteResult(null);
  };

  const closeDeleteDialog = () => {
    if (deleteStatus === "deleting") return;
    setDeleteTarget(null);
    setDeleteError("");
  };

  const confirmHardDelete = async () => {
    if (!deleteTarget) return;

    setDeleteStatus("deleting");
    setDeleteError("");
    try {
      const result = await onHardDeleteSubmission(deleteTarget);
      setDeleteResult(result);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete submission.");
    } finally {
      setDeleteStatus("idle");
    }
  };

  const handleExportCsv = () => {
    const csv = buildSubmissionCsv(exportRows, listMetaMap);
    const datePart = new Date().toISOString().slice(0, 10);
    const scopePart = exportScope === "all" ? "all" : "filtered";
    downloadCsv(csv, `pmw-hr-submissions-${scopePart}-${datePart}.csv`);
    setExportOpen(false);
  };

  const dialogPaperSx = {
    borderRadius: `${si.radius}px`,
    boxShadow: si.shadowRaised,
    overflow: "hidden",
  };

  const dialogButtonSx = {
    borderRadius: `${si.radius}px`,
    minHeight: 40,
    px: 2,
    textTransform: "none" as const,
    fontWeight: 700,
  };

  return (
    <Box sx={{ maxWidth: 1440, mx: "auto" }}>
      <Box sx={{ mb: 3 }}>
        <Toolbar
          filters={filters}
          setFilters={setFilters}
          sortBy={sortBy}
          setSortBy={setSortBy}
          formTypeOptions={formTypeOptions}
          publishProfileOptions={publishProfileOptions}
          formVersionOptions={formVersionOptions}
          fieldCatalog={fieldCatalog}
          isAdmin={isAdmin}
          canExportSubmissions={canExportSubmissions}
          onOpenExport={() => setExportOpen(true)}
          total={submissions.length}
          filtered={ownSubmissions.length}
        />
      </Box>

      {deleteResult && (
        <Alert
          severity={deleteResult.warnings.length > 0 ? "warning" : "success"}
          icon={<DeleteForeverIcon />}
          onClose={() => setDeleteResult(null)}
          sx={{ mb: 2, borderRadius: `${si.radius}px` }}
        >
          <Typography sx={{ ...siType.data, color: editorial.ink, fontWeight: 700 }}>
            Submission deleted. Removed {deleteResult.deletedFiles} managed file
            {deleteResult.deletedFiles === 1 ? "" : "s"} and {deleteResult.deletedMatrixRows} matrix
            row{deleteResult.deletedMatrixRows === 1 ? "" : "s"}.
          </Typography>
          {deleteResult.warnings.length > 0 && (
            <Typography sx={{ ...siType.subtext, display: "block", mt: 0.5, color: editorial.warning }}>
              Cleanup warnings: {deleteResult.warnings.slice(0, 2).join(" ")}
            </Typography>
          )}
        </Alert>
      )}

      <Typography sx={{ ...siType.subtext, color: editorial.muted, mb: 1.5 }}>
        {counts.total === 0
          ? "Nothing to show yet."
          : `${counts.total} submission${counts.total === 1 ? "" : "s"} · ${counts.approved} approved · ${counts.pending} pending · ${counts.rejected} rejected`}
      </Typography>

      {ownSubmissions.length > 0 ? (
        <Box
          sx={{
            // The card exists only where the table does. Below md the rows are
            // already self-contained cards, and wrapping those in another card
            // put a card inside a card -- the very thing the desktop rows drop
            // their own shadow to avoid.
            borderRadius: { md: `${si.radius}px` },
            border: { md: `1px solid ${editorial.border}` },
            boxShadow: { md: si.shadow },
            // Clips the header band's corners and the last row's border to the
            // card's radius, so the table reads as one object.
            overflow: { md: "hidden" },
          }}
        >
          <ListHeader isAdmin={isAdmin} />
          <Box sx={{ display: "flex", flexDirection: "column" }}>
            {ownSubmissions.map((item) => (
              <SubmissionRow
                key={`${item.listTitle}-${item.id}`}
                item={item}
                onView={setDetailItem}
                onDelete={openDeleteDialog}
                isAdmin={isAdmin}
                canDelete={canHardDeleteSubmission}
                isDeleting={
                  deleteStatus === "deleting" &&
                  deleteTarget?.listTitle === item.listTitle &&
                  deleteTarget.id === item.id
                }
                listMetaMap={listMetaMap}
              />
            ))}
          </Box>
        </Box>
      ) : (
        <EmptyState hasFilters={hasFilters} />
      )}

      <DetailModal item={detailItem} isAdmin={isAdmin} onClose={() => setDetailItem(null)} />

      <Dialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        fullWidth
        maxWidth="md"
        slotProps={{ paper: { sx: dialogPaperSx } }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            gap: 1.5,
            alignItems: "center",
            px: 3,
            py: 2.5,
            backgroundColor: editorial.paperSoft,
          }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: `${si.radiusSm}px`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: editorial.blueWash,
              color: editorial.navyDeep,
              flexShrink: 0,
            }}
          >
            <TableChartIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ ...siType.subsectionTitle, color: editorial.ink }}>
              Export submissions
            </Typography>
            <Typography sx={{ ...siType.subtext, color: editorial.muted }}>
              CSV opens in Excel and includes submitted form fields.
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 2.5 }}>
          <FormControl size="small" fullWidth>
            <InputLabel>Scope</InputLabel>
            <Select
              value={exportScope}
              label="Scope"
              onChange={(event) => setExportScope(event.target.value as "current" | "all")}
              sx={{ borderRadius: `${si.radius}px`, backgroundColor: editorial.appSurface }}
            >
              <MenuItem value="current">Current view (filters applied)</MenuItem>
              <MenuItem value="all">All submissions</MenuItem>
            </Select>
          </FormControl>

          <Alert
            severity={exportRows.length > 0 ? "info" : "warning"}
            sx={{ mt: 2, borderRadius: `${si.radius}px` }}
          >
            {exportRows.length} submission{exportRows.length === 1 ? "" : "s"} will be exported.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1, backgroundColor: editorial.paperSoft }}>
          <Button onClick={() => setExportOpen(false)} sx={dialogButtonSx}>
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={<FileDownloadIcon />}
            onClick={handleExportCsv}
            disabled={exportRows.length === 0}
            sx={dialogButtonSx}
          >
            Export CSV
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={closeDeleteDialog}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: dialogPaperSx } }}
      >
        <DialogTitle sx={{ display: "flex", gap: 1.5, alignItems: "center", pb: 1 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: `${si.radiusSm}px`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: editorial.errorSoft,
              color: editorial.error,
              flexShrink: 0,
            }}
          >
            <WarningIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ ...siType.subsectionTitle, color: editorial.ink }}>
              Permanently delete submission?
            </Typography>
            <Typography sx={{ ...siType.subtext, color: editorial.muted }}>
              {deleteTarget?.listTitle} · Reference {deleteTarget?.submissionId}
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Alert severity="error" sx={{ borderRadius: `${si.radius}px`, mb: 2, fontWeight: 700 }}>
            This removes the SharePoint item, generated PDFs, signature images, uploaded files
            stored in app-managed libraries, and matrix child rows. This action cannot be undone.
          </Alert>
          {deleteError && (
            <Alert severity="error" sx={{ borderRadius: `${si.radius}px`, fontWeight: 700 }}>
              {deleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button onClick={closeDeleteDialog} disabled={deleteStatus === "deleting"} sx={dialogButtonSx}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            startIcon={
              deleteStatus === "deleting" ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <DeleteForeverIcon />
              )
            }
            onClick={confirmHardDelete}
            disabled={deleteStatus === "deleting"}
            sx={dialogButtonSx}
          >
            Delete permanently
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
