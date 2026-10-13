import { useEffect, useState, type ChangeEvent, type MouseEvent } from "react";
import { Box, Typography, useMediaQuery, useTheme } from "@mui/material";
import { Link } from "react-router-dom";
import {
  ContentCopyOutlined,
  EditOutlined,
  FileDownloadOutlined,
  OpenInNewOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";
import { useMsal } from "@azure/msal-react";
import { useDashboard } from "../contexts/DashboardContext";
import ConfirmDialog from "../components/common/ConfirmDialog";
import DetailModal from "../components/dashboard/DetailModal";
import { acquireAccessTokenSilentOrRedirect } from "../utils/authRecovery";
import { sharePointManageScope } from "../utils/sharePointScope";
import { getAllFormConfigs } from "../utils/formBuilderSP";
import { editorial, onCanvasMuted, siType } from "../theme/editorial";
import Card from "../components/common/Card";
import SapPanel, { SapPanelTitle } from "../components/sap/SapPanel";
import SapGrid, { type SapColumn } from "../components/sap/SapGrid";
import SapStatus from "../components/sap/SapStatus";
import SapTabs from "../components/sap/SapTabs";
import SapViewSwitch from "../components/sap/SapViewSwitch";
import { SapToolButton, SapToolbar, SapToolSeparator } from "../components/sap/SapToolbar";
import { sap } from "../components/sap/sapTheme";
import {
  SUBMISSION_STATES,
  SUBMISSION_STATE_LABELS,
  approvalRouteText,
  daysOpen,
  emptyFormSummary,
  submissionState,
  summariseByForm,
  waitingAt,
  type FormSubmissionSummary,
  type SubmissionState,
} from "../utils/formSubmissionSummary";
import { formatDashboardDateTime, getSubmitterDisplayName } from "../utils/submissionDisplay";
import { buildSubmissionCsv } from "../utils/submissionCsv";
import { downloadCsv } from "../utils/csv";
import type { Submission } from "../types";

interface FormRow {
  /** The SharePoint response list title, and the form's display name. */
  title: string;
  /** Published slug, or "" when the form has never been published. */
  slug: string;
  category: string;
  route: string;
  summary: FormSubmissionSummary;
}

type StateTab = "all" | SubmissionState;

/** Open requests this old are drawn in red: they have waited long enough for someone to chase. */
const OVERDUE_DAYS = 7;

/**
 * Forms → Available forms: every form this account can open, with its
 * submissions underneath.
 *
 * The top grid lists the forms and how many of each one's submissions are
 * pending, in review, approved and rejected. Picking a form fills the bottom
 * grid with that form's submissions. The counts cover what this account can
 * see — its own rows for most people, every row for an admin — so the number
 * on a form always matches the rows that open beneath it.
 *
 * Admins who can open All Submissions get a "By form | All submissions" switch;
 * the combined list stays where it was.
 *
 * WHERE THE SLUGS COME FROM. `visibleLists` is the set of SharePoint response
 * LISTS this account can see, and a list carries no slug — only a title. The
 * fill route is `/form/:slug`, so the page joins those lists to their `Master
 * Form` rows, which is where `Slug`, `IsPublished` and the approval route live.
 * A form whose join finds no published slug is still listed and still counted;
 * it simply cannot be filled in.
 */
export default function FormsPage() {
  const {
    visibleLists,
    listMetaMap,
    canUseFormBuilder,
    isAdmin,
    onEditForm,
    submissions,
    detailItem,
    setDetailItem,
  } = useDashboard();
  const { instance, accounts } = useMsal();
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down("md"));

  const [slugByTitle, setSlugByTitle] = useState<Record<string, string>>({});
  const [routeByTitle, setRouteByTitle] = useState<Record<string, string>>({});
  const [loadingSlugs, setLoadingSlugs] = useState(true);
  const [pendingOpen, setPendingOpen] = useState<FormRow | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [stateTab, setStateTab] = useState<StateTab>("all");
  const [selectedSubmissionKey, setSelectedSubmissionKey] = useState<string | null>(null);
  const [findText, setFindText] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoadingSlugs(true);
      try {
        const token = await acquireAccessTokenSilentOrRedirect(instance, {
          // No argument: the helper falls back to VITE_SP_SITE_URL, the home
          // site -- which is the site getAllFormConfigs queries anyway.
          scopes: [sharePointManageScope()],
          account: accounts[0],
        });
        const configs = await getAllFormConfigs(token);
        if (cancelled) return;
        const slugs: Record<string, string> = {};
        const routes: Record<string, string> = {};
        for (const config of configs) {
          if (!config.Title) continue;
          routes[config.Title] = approvalRouteText(config.LayerConfig);
          // An unpublished form has no working route, so its slug is withheld
          // rather than offered and then failing.
          if (config.Slug && config.IsPublished) slugs[config.Title] = config.Slug;
        }
        setSlugByTitle(slugs);
        setRouteByTitle(routes);
      } catch {
        // The grid still renders; every form simply reads as unavailable, which
        // is the truth from this page's point of view.
        if (!cancelled) {
          setSlugByTitle({});
          setRouteByTitle({});
        }
      } finally {
        if (!cancelled) setLoadingSlugs(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [instance, accounts]);

  const summaries = summariseByForm(submissions);

  const forms: FormRow[] = visibleLists.map((list) => ({
    title: list.title,
    slug: slugByTitle[list.title] ?? "",
    category: listMetaMap[list.title]?.category ?? "General",
    route: routeByTitle[list.title] ?? (loadingSlugs ? "…" : "—"),
    summary: summaries.get(list.title) ?? emptyFormSummary(),
  }));

  const needle = findText.trim().toLowerCase();
  const shownForms = needle
    ? forms.filter((form) => form.title.toLowerCase().includes(needle) || form.category.toLowerCase().includes(needle))
    : forms;

  // Until someone picks, start on the first form that has anything to show.
  const selectedForm =
    forms.find((form) => form.title === selectedTitle) ??
    forms.find((form) => form.summary.total > 0) ??
    forms[0] ??
    null;

  const formSubmissions = selectedForm
    ? submissions
        .filter((item) => item.listTitle === selectedForm.title && !item.isTest)
        .sort((a, b) => timeOf(b.submittedAt) - timeOf(a.submittedAt))
    : [];
  const shownSubmissions =
    stateTab === "all" ? formSubmissions : formSubmissions.filter((item) => submissionState(item) === stateTab);
  const selectedSubmission =
    shownSubmissions.find((item) => submissionKey(item) === selectedSubmissionKey) ?? null;

  const canExport = isAdmin || canUseFormBuilder;

  const pickForm = (form: FormRow) => {
    setSelectedTitle(form.title);
    setStateTab("all");
    setSelectedSubmissionKey(null);
  };

  /**
   * Opens in a NEW TAB, deliberately.
   *
   * Filling a form is a long, losable piece of work, and this page is a list
   * people come back to. Navigating away in place would put an unsaved form one
   * stray Back press from gone.
   *
   * `noopener` is not optional on a `_blank` open: without it the new tab gets
   * a live `window.opener` handle to this one.
   */
  const openForm = (form: FormRow) => {
    window.open(`/form/${encodeURIComponent(form.slug)}`, "_blank", "noopener,noreferrer");
  };

  const copyLink = async (form: FormRow) => {
    const url = `${window.location.origin}/form/${encodeURIComponent(form.slug)}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice(`Link to ${form.title} copied.`);
    } catch {
      setNotice(`Could not copy automatically. The link is ${url}`);
    }
  };

  const exportShown = () => {
    if (!selectedForm) return;
    const csv = buildSubmissionCsv(shownSubmissions, listMetaMap);
    const datePart = new Date().toISOString().slice(0, 10);
    const namePart = selectedForm.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "form";
    downloadCsv(csv, `pmw-hr-${namePart}-${datePart}.csv`);
  };

  if (visibleLists.length === 0) {
    return (
      <Box sx={{ maxWidth: 1000, mx: "auto" }}>
        {/*
          Not the shared `EmptyState`: that one says "No submissions yet" and
          offers to clear filters, and neither sentence is true here. An account
          seeing this has no form libraries granted to it -- a permissions
          question, and not one they can fix on this page, so the copy points at
          who can.
        */}
        <Card sx={{ textAlign: "center" }}>
          <Typography sx={{ ...siType.subsectionTitle, color: editorial.ink }}>No forms available yet</Typography>
          <Typography sx={{ ...siType.body, color: editorial.muted, mt: 0.75 }}>
            This account has not been granted access to any form libraries. Ask an HR Forms administrator to add you
            to the group for the forms you need.
          </Typography>
        </Card>
      </Box>
    );
  }

  const countCell = (value: number, state?: SubmissionState) => (
    // A zero is printed, faintly, rather than left blank: a grid of holes reads
    // as missing data, a column of quiet zeros reads as "none".
    <Box
      component="span"
      sx={
        value === 0
          ? { color: editorial.softMuted }
          : state === "pending"
            ? { color: editorial.warning, fontWeight: 600 }
            : undefined
      }
    >
      {value}
    </Box>
  );

  const formColumns: SapColumn<FormRow>[] = [
    {
      key: "title",
      header: "Form",
      nowrap: true,
      render: (form) => (
        <Box component="span" sx={{ fontWeight: 600 }}>
          {form.title}
          {!form.slug && !loadingSlugs && (
            <Box component="span" sx={{ fontWeight: 400, color: editorial.muted }}> · not published</Box>
          )}
        </Box>
      ),
    },
    { key: "category", header: "Category", nowrap: true, hideOnNarrow: true, render: (form) => form.category },
    {
      key: "route",
      header: "Approval route",
      maxWidth: 240,
      hideOnNarrow: true,
      render: (form) => <Box component="span" title={form.route} sx={{ color: editorial.muted }}>{form.route}</Box>,
    },
    ...SUBMISSION_STATES.map<SapColumn<FormRow>>((state) => ({
      key: state,
      header: SUBMISSION_STATE_LABELS[state],
      align: "right",
      width: 76,
      render: (form) => countCell(form.summary[state], state),
    })),
    { key: "total", header: "Total", align: "right", width: 60, render: (form) => form.summary.total === 0 ? countCell(0) : <Box component="span" sx={{ fontWeight: 600 }}>{form.summary.total}</Box> },
    {
      key: "last",
      header: "Last submitted",
      nowrap: true,
      hideOnNarrow: true,
      render: (form) => (form.summary.lastSubmittedAt ? formatDashboardDateTime(form.summary.lastSubmittedAt, "—") : "—"),
    },
    {
      key: "fill",
      header: <Box component="span" sx={visuallyHidden}>Fill in</Box>,
      render: (form) => (
        <Box
          component="button"
          type="button"
          disabled={!form.slug}
          onClick={(event: MouseEvent) => {
            event.stopPropagation();
            setPendingOpen(form);
          }}
          aria-label={`Fill in ${form.title} in a new tab`}
          sx={{
            font: "inherit",
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            px: 1,
            height: 24,
            border: `1px solid ${sap.line}`,
            borderRadius: `${sap.radius}px`,
            backgroundColor: sap.zebra,
            color: editorial.navy,
            cursor: "pointer",
            whiteSpace: "nowrap",
            "&:disabled": { color: editorial.softMuted, cursor: "not-allowed" },
            "& svg": { fontSize: 14 },
          }}
        >
          {/* Icon only on a narrow screen; the aria-label still names it. */}
          {narrow ? null : "Fill in "}
          <OpenInNewOutlined />
        </Box>
      ),
    },
  ];

  const submissionColumns: SapColumn<Submission>[] = [
    { key: "status", header: "Status", render: (item) => <SapStatus state={submissionState(item)} /> },
    {
      key: "reference",
      header: "Reference",
      nowrap: true,
      render: (item) => <Box component="span" sx={{ fontWeight: 600, color: editorial.navy }}>{item.referenceNo || item.submissionId || item.id}</Box>,
    },
    { key: "by", header: "Submitted by", maxWidth: narrow ? 170 : 260, render: (item) => getSubmitterDisplayName(item) },
    { key: "when", header: "Submitted", nowrap: true, render: (item) => formatDashboardDateTime(item.submittedAt, "—") },
    { key: "waiting", header: "Waiting at", maxWidth: 260, hideOnNarrow: true, render: (item) => waitingAt(item) || "—" },
    {
      key: "days",
      header: "Days open",
      align: "right",
      render: (item) => {
        const days = daysOpen(item);
        if (days === null) return "";
        return (
          <Box component="span" sx={days >= OVERDUE_DAYS ? { color: editorial.error, fontWeight: 600 } : undefined}>
            {days}
          </Box>
        );
      },
    },
  ];

  const counts = selectedForm?.summary ?? emptyFormSummary();

  return (
    <Box sx={{ maxWidth: 1440, mx: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 1.5 }}>
        <Typography sx={{ ...siType.subtext, ...onCanvasMuted }}>
          {`${visibleLists.length} form${visibleLists.length === 1 ? "" : "s"} available to you. Pick one to see its submissions underneath.`}
          {loadingSlugs ? " Checking which are published…" : ""}
        </Typography>
        {canUseFormBuilder && <SapViewSwitch current="by-form" />}
      </Box>

      {notice && (
        <Box role="status" sx={{ fontSize: sap.fontSize, color: editorial.success, backgroundColor: editorial.successSoft, border: `1px solid ${sap.lineSoft}`, px: 1, py: 0.5 }}>
          {notice}
        </Box>
      )}

      <SapPanel
        label="Forms"
        header={
          <>
            <SapPanelTitle>Forms</SapPanelTitle>
            <SapToolbar label="Form actions">
              <SapToolButton icon={<OpenInNewOutlined />} disabled={!selectedForm?.slug} onClick={() => selectedForm && setPendingOpen(selectedForm)}>
                Fill in
              </SapToolButton>
              <SapToolButton icon={<ContentCopyOutlined />} disabled={!selectedForm?.slug} onClick={() => selectedForm && void copyLink(selectedForm)}>
                Copy link
              </SapToolButton>
              {canUseFormBuilder && (
                <SapToolButton icon={<EditOutlined />} disabled={!selectedForm} onClick={() => selectedForm && onEditForm(selectedForm.title)}>
                  Edit in builder
                </SapToolButton>
              )}
            </SapToolbar>
            <Box component="label" sx={{ ml: "auto", flex: "0 1 220px", minWidth: 150, display: "flex", alignItems: "center", gap: 0.75, color: editorial.muted, fontSize: sap.fontSize }}>
              Find
              <Box
                component="input"
                type="search"
                value={findText}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setFindText(event.target.value)}
                placeholder="Form or category"
                sx={{ font: "inherit", fontSize: sap.fontSize, flex: 1, minWidth: 0, height: 24, border: `1px solid ${sap.line}`, borderRadius: `${sap.radius}px`, px: 0.75, backgroundColor: editorial.panel }}
              />
            </Box>
          </>
        }
      >
        <SapGrid
          label="Forms"
          columns={formColumns}
          rows={shownForms}
          getKey={(form) => form.title}
          selectedKey={selectedForm?.title ?? null}
          onSelect={pickForm}
          emptyText="No form matches that search."
          minWidth={900}
        />
      </SapPanel>

      {selectedForm && (
        <SapPanel
          label={`Submissions for ${selectedForm.title}`}
          header={
            <>
              <SapPanelTitle>Submissions · {selectedForm.title}</SapPanelTitle>
              <SapTabs<StateTab>
                label="Filter by status"
                value={stateTab}
                onChange={(value) => {
                  setStateTab(value);
                  setSelectedSubmissionKey(null);
                }}
                tabs={[
                  { value: "all", label: "All", count: counts.total },
                  ...SUBMISSION_STATES.map((state) => ({ value: state, label: SUBMISSION_STATE_LABELS[state], count: counts[state] })),
                ]}
              />
              <Box sx={{ ml: "auto" }}>
                <SapToolbar label="Submission actions">
                  <SapToolButton icon={<VisibilityOutlined />} disabled={!selectedSubmission} onClick={() => selectedSubmission && setDetailItem(selectedSubmission)}>
                    Open
                  </SapToolButton>
                  {canExport && (
                    <>
                      <SapToolSeparator />
                      <SapToolButton icon={<FileDownloadOutlined />} disabled={shownSubmissions.length === 0} onClick={exportShown}>
                        Export
                      </SapToolButton>
                    </>
                  )}
                </SapToolbar>
              </Box>
            </>
          }
          status={
            <>
              <span>
                Double-click a row, or select it and press Enter, to open it
              </span>
              {canUseFormBuilder && (
                <Box
                  component={Link}
                  to={`/admin/submissions?form=${encodeURIComponent(selectedForm.title)}`}
                  sx={{ ml: "auto", color: editorial.navy }}
                >
                  Open in All submissions
                </Box>
              )}
            </>
          }
        >
          <SapGrid
            label={`Submissions for ${selectedForm.title}`}
            columns={submissionColumns}
            rows={shownSubmissions}
            getKey={submissionKey}
            selectedKey={selectedSubmission ? submissionKey(selectedSubmission) : null}
            onSelect={(item) => setSelectedSubmissionKey(submissionKey(item))}
            onOpen={setDetailItem}
            pageSize={25}
            emptyText={
              counts.total === 0
                ? isAdmin
                  ? "Nobody has submitted this form yet."
                  : "You have not submitted this form yet."
                : "No submissions in this state."
            }
            minWidth={760}
          />
        </SapPanel>
      )}

      <DetailModal item={detailItem} isAdmin={isAdmin} onClose={() => setDetailItem(null)} />

      <ConfirmDialog
        open={pendingOpen !== null}
        title={`Open ${pendingOpen?.title ?? "this form"}?`}
        body="It opens in a new tab so this list stays where it is. You can fill it in and submit there."
        confirmLabel="Open form"
        onConfirm={() => {
          const target = pendingOpen;
          setPendingOpen(null);
          if (target) openForm(target);
        }}
        onClose={() => setPendingOpen(null)}
      />
    </Box>
  );
}

function submissionKey(item: Submission): string {
  return `${item.listTitle}::${item.id}`;
}

function timeOf(value: string | null): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

const visuallyHidden = {
  position: "absolute",
  // Strings, not numbers: in `sx` a bare 1 means 100%, which made this
  // "hidden" label as wide as its column and pushed the grid into scrolling.
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
} as const;
