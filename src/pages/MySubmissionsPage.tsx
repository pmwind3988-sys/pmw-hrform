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
  VisibilityOutlined as VisibilityIcon,
  WarningAmberOutlined as WarningIcon,
} from "@mui/icons-material";
import { useDashboard } from "../contexts/DashboardContext";
import Toolbar from "../components/dashboard/Toolbar";
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
import {
  approvalTrail,
  submissionState,
  waitingAt,
  type TrailStep,
  type TrailTone,
} from "../utils/formSubmissionSummary";
import { formatDashboardDateTime } from "../utils/submissionDisplay";
import SapPanel, { SapPanelTitle } from "../components/sap/SapPanel";
import SapGrid, { type SapColumn } from "../components/sap/SapGrid";
import SapStatus from "../components/sap/SapStatus";
import { SapToolButton, SapToolbar, SapToolSeparator } from "../components/sap/SapToolbar";
import { sap } from "../components/sap/sapTheme";

/** The colour of a step's square in the progress bar and the trail. */
const TRAIL_TONE_FILL: Record<TrailTone, string> = {
  done: editorial.successFill,
  rejected: editorial.errorFill,
  current: editorial.warningFill,
  waiting: "#D0D7E2",
  skipped: "#D0D7E2",
};

/**
 * Forms → My Submissions.
 *
 * The filter toolbar, then this account's own rows as a dense grid. Picking a
 * row shows its approval trail underneath — who decided each step, when, and
 * why if they turned it down — which is the question people come here to
 * answer. Double-click (or Enter) opens the full record.
 *
 * WHOSE ROWS THESE ARE. The section is called My Submissions and shows this
 * account's own rows. The everybody-else view still exists for superusers as
 * "All Submissions" (`/admin/submissions`); the two are separate tabs so it is
 * always clear which one is on screen.
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
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

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
      return submitted === mine || created === mine || !!item.linkedToMe;
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
   * One line of counts, scoped to what is actually on screen. The dashboard's
   * tiles already state the same figures in a heavier weight; repeating them
   * here would say the number twice.
   */
  const counts = bucketSubmissions(ownSubmissions);

  // Until someone picks, the newest row's trail is shown: an empty trail panel
  // explains nothing.
  const selected =
    ownSubmissions.find((item) => submissionKey(item) === selectedKey) ?? ownSubmissions[0] ?? null;
  const trail = selected ? approvalTrail(selected) : [];

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

  const columns: SapColumn<Submission>[] = [
    { key: "status", header: "Status", render: (item) => <SapStatus state={submissionState(item)} /> },
    {
      key: "reference",
      header: "Reference",
      nowrap: true,
      render: (item) => <Box component="span" sx={{ fontWeight: 600, color: editorial.navy }}>{item.referenceNo || item.submissionId || item.id}</Box>,
    },
    { key: "form", header: "Form", nowrap: true, render: (item) => item.listTitle },
    { key: "when", header: "Submitted", nowrap: true, render: (item) => formatDashboardDateTime(item.submittedAt, "—") },
    { key: "progress", header: "Progress", nowrap: true, render: (item) => <ProgressSquares steps={approvalTrail(item)} /> },
    { key: "waiting", header: "Waiting at", maxWidth: 260, hideOnNarrow: true, render: (item) => waitingAt(item) || "—" },
  ];

  const trailColumns: SapColumn<TrailStep>[] = [
    { key: "step", header: "Step", align: "right", width: 48, render: (step) => step.step },
    { key: "role", header: "Role", render: (step) => step.role },
    { key: "by", header: "Decided by", render: (step) => step.decidedBy || "—" },
    {
      key: "decision",
      header: "Decision",
      nowrap: true,
      render: (step) => (
        <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
          <Box component="span" aria-hidden sx={{ width: 9, height: 9, borderRadius: "2px", backgroundColor: TRAIL_TONE_FILL[step.tone] }} />
          {step.decision}
        </Box>
      ),
    },
    { key: "date", header: "Date", nowrap: true, render: (step) => (step.signedAt ? formatDashboardDateTime(step.signedAt, "—") : "—") },
    { key: "remarks", header: "Remarks", render: (step) => <Box component="span" sx={{ color: editorial.muted }}>{step.remarks}</Box> },
  ];

  return (
    <Box sx={{ maxWidth: 1440, mx: "auto" }}>
      <Box sx={{ mb: 2 }}>
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

      {ownSubmissions.length > 0 ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <SapPanel
            label="My submissions"
            header={
              <>
                <SapPanelTitle>My submissions</SapPanelTitle>
                <Box component="span" sx={{ color: editorial.muted }}>
                  {`${counts.total} · ${counts.approved} approved · ${counts.pending} open · ${counts.rejected} rejected`}
                </Box>
                <Box sx={{ ml: "auto" }}>
                  <SapToolbar label="Submission actions">
                    <SapToolButton icon={<VisibilityIcon />} disabled={!selected} onClick={() => selected && setDetailItem(selected)}>
                      Open
                    </SapToolButton>
                    {canExportSubmissions && (
                      <SapToolButton icon={<FileDownloadIcon />} onClick={() => setExportOpen(true)}>
                        Export
                      </SapToolButton>
                    )}
                    {canHardDeleteSubmission && (
                      <>
                        <SapToolSeparator />
                        <SapToolButton
                          icon={<DeleteForeverIcon />}
                          tone="danger"
                          disabled={!selected || deleteStatus === "deleting"}
                          onClick={() => selected && openDeleteDialog(selected)}
                        >
                          Delete
                        </SapToolButton>
                      </>
                    )}
                  </SapToolbar>
                </Box>
              </>
            }
            status={<span>Pick a row to see its approval trail · double-click, or press Enter, to open it</span>}
          >
            <SapGrid
              label="My submissions"
              columns={columns}
              rows={ownSubmissions}
              getKey={submissionKey}
              selectedKey={selected ? submissionKey(selected) : null}
              onSelect={(item) => setSelectedKey(submissionKey(item))}
              onOpen={setDetailItem}
              minWidth={820}
              pageSize={10}
            />
          </SapPanel>

          {selected && (
            <SapPanel
              label="Approval trail"
              header={
                <SapPanelTitle>
                  Approval trail · {selected.referenceNo || selected.submissionId || selected.id} · {selected.listTitle}
                </SapPanelTitle>
              }
              status={
                selected.linkedToMe ? (
                  <span>Sent from a public link and matched to you through your staff number.</span>
                ) : undefined
              }
            >
              <SapGrid
                label="Approval trail"
                columns={trailColumns}
                rows={trail}
                getKey={(step) => String(step.step)}
                emptyText="This form has no approval steps — it is recorded as soon as it is sent."
                minWidth={720}
              />
            </SapPanel>
          )}
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

/** One small bar per approval step, coloured by how that step went, plus "2 of 3". */
function ProgressSquares({ steps }: { steps: TrailStep[] }) {
  if (steps.length === 0) return <Box component="span" sx={{ color: editorial.muted }}>No steps</Box>;
  const done = steps.filter((step) => step.tone === "done").length;
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
      <Box component="span" role="img" aria-label={`${done} of ${steps.length} steps complete`} sx={{ display: "inline-flex", gap: "2px" }}>
        {steps.map((step) => (
          <Box
            component="span"
            key={step.step}
            sx={{ width: 16, height: 8, borderRadius: "1px", backgroundColor: TRAIL_TONE_FILL[step.tone], border: `1px solid ${sap.cellLine}` }}
          />
        ))}
      </Box>
      <Box component="span" sx={{ color: editorial.muted }}>{`${done} of ${steps.length}`}</Box>
    </Box>
  );
}

function submissionKey(item: Submission): string {
  return `${item.listTitle}::${item.id}`;
}
