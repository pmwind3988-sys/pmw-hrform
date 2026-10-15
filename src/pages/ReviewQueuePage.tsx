import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { Alert, Box, Button, CircularProgress, LinearProgress, Typography } from "@mui/material";
import {
  OpenInNewOutlined as OpenIcon,
  PlayArrowRounded as StartIcon,
  RefreshOutlined as RefreshIcon,
} from "@mui/icons-material";

import SapPanel, { SapPanelTitle } from "../components/sap/SapPanel";
import SapGrid, { type SapColumn } from "../components/sap/SapGrid";
import { SapToolButton, SapToolbar } from "../components/sap/SapToolbar";
import ReviewWindow from "../components/reviewer/ReviewWindow";
import { editorial, si, siType } from "../theme/editorial";
import {
  fetchReviewQueue,
  waitingLabel,
  type ReviewQueueEntry,
} from "../utils/reviewQueue";

function entryKey(entry: ReviewQueueEntry): string {
  return `${entry.formSlug}#${entry.responseItemId}#${entry.layerNumber}`;
}

/**
 * Forms → Waiting for me.
 *
 * Every evaluation and approval currently assigned to the signed-in person, in
 * one list, longest-waiting first. A row opens in a window over the list — the
 * same reviewer page as the emailed link, paper form and all — and once the
 * decision is in, closing it brings the reviewer back to a refreshed list, so
 * a manager with a whole class to evaluate never has to go back to their email.
 *
 * The list comes from the server and is built from the caller's verified
 * Microsoft sign-in. Each row opens the normal reviewer page, which checks the
 * assignment again, so nothing here widens who may act on what.
 */
export default function ReviewQueuePage() {
  const { instance, accounts } = useMsal();
  const [loadedEntries, setEntries] = useState<ReviewQueueEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  /** A reload over a list already on screen: the rows stay, dimmed, under a bar. */
  const [refreshing, setRefreshing] = useState(false);
  const [openEntry, setOpenEntry] = useState<ReviewQueueEntry | null>(null);
  /**
   * Steps decided in a window this visit. Filtered out of every reload too, in
   * case SharePoint has not caught up with the decision a moment ago and still
   * reports the step as waiting.
   */
  const [finishedKeys, setFinishedKeys] = useState<Set<string>>(() => new Set());
  const account = accounts[0];

  useEffect(() => {
    let cancelled = false;
    fetchReviewQueue(instance, account)
      .then((items) => {
        if (cancelled) return;
        setEntries(items);
        setStatus("ready");
        setRefreshing(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load your waiting requests.");
        setStatus("error");
        setRefreshing(false);
      });
    return () => { cancelled = true; };
  }, [instance, account, reloadCount]);

  const open = (entry: ReviewQueueEntry) => setOpenEntry(entry);
  const reload = () => {
    setStatus("loading");
    setReloadCount((n) => n + 1);
  };
  const closeWindow = (finished: boolean) => {
    const closed = openEntry;
    setOpenEntry(null);
    if (!finished || !closed) return;
    setFinishedKeys((prev) => new Set(prev).add(entryKey(closed)));
    setRefreshing(true);
    setReloadCount((n) => n + 1);
  };
  const entries = loadedEntries.filter((entry) => !finishedKeys.has(entryKey(entry)));
  const selected = entries.find((entry) => entryKey(entry) === selectedKey) ?? entries[0] ?? null;
  const evaluations = entries.filter((entry) => entry.layerType === "evaluation").length;
  const formCount = new Set(entries.map((entry) => entry.formTitle)).size;

  const columns: SapColumn<ReviewQueueEntry>[] = [
    {
      key: "reference",
      header: "Reference",
      nowrap: true,
      render: (entry) => (
        <Box component="span" sx={{ fontWeight: 600, color: editorial.navy }}>
          {entry.referenceNo || `#${entry.responseItemId}`}
        </Box>
      ),
    },
    {
      key: "about",
      header: "About",
      maxWidth: 260,
      render: (entry) => entry.applicantName || entry.submittedBy || "—",
    },
    { key: "form", header: "Form", nowrap: true, render: (entry) => entry.formTitle },
    {
      key: "step",
      header: "Your step",
      maxWidth: 240,
      hideOnNarrow: true,
      render: (entry) => `${entry.layerType === "evaluation" ? "Evaluate" : "Approve"} · ${entry.layerTitle || `Step ${entry.layerNumber}`}`,
    },
    { key: "waiting", header: "Waiting since", nowrap: true, render: (entry) => waitingLabel(entry.waitingSince) },
  ];

  const summary = entries.length === 0
    ? "Nothing is waiting for you."
    : `${entries.length} waiting · ${evaluations} evaluation${evaluations === 1 ? "" : "s"} · ${entries.length - evaluations} approval${entries.length - evaluations === 1 ? "" : "s"} · ${formCount} form${formCount === 1 ? "" : "s"}`;

  return (
    <Box sx={{ maxWidth: 1440, mx: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h1" sx={{ ...siType.sectionTitle, color: editorial.ink }}>
            Waiting for me
          </Typography>
          <Typography sx={{ ...siType.subtext, color: editorial.muted }}>
            Evaluations and approvals assigned to you, longest-waiting first. Submit one and the next opens.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<StartIcon />}
          disabled={status !== "ready" || entries.length === 0}
          onClick={() => entries[0] && open(entries[0])}
          sx={{ borderRadius: `${si.radius}px`, minHeight: 44, px: 2.5, textTransform: "none", fontWeight: 700 }}
        >
          {entries.length > 0 ? `Start reviewing (${entries.length})` : "Start reviewing"}
        </Button>
      </Box>

      {status === "error" && (
        <Alert
          severity="error"
          sx={{ borderRadius: `${si.radius}px` }}
          action={<Button color="inherit" size="small" onClick={reload}>Try again</Button>}
        >
          {error}
        </Alert>
      )}

      <SapPanel
        label="Waiting for me"
        header={
          <>
            <SapPanelTitle>Waiting for me</SapPanelTitle>
            <Box component="span" sx={{ color: editorial.muted }}>{status === "ready" ? summary : ""}</Box>
            <Box sx={{ ml: "auto" }}>
              <SapToolbar label="Queue actions">
                <SapToolButton icon={<OpenIcon />} disabled={!selected} onClick={() => selected && open(selected)}>
                  Open
                </SapToolButton>
                <SapToolButton icon={<RefreshIcon />} disabled={status === "loading"} onClick={reload}>
                  Refresh
                </SapToolButton>
              </SapToolbar>
            </Box>
          </>
        }
        status={
          <span role="status" aria-live="polite">
            {refreshing
              ? "Updating the list…"
              : "Only requests assigned to your account are listed · double-click, or press Enter, to open one"}
          </span>
        }
      >
        {refreshing && <LinearProgress aria-label="Updating the list" sx={{ height: 3 }} />}
        {status === "loading" ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 3, color: editorial.muted }}>
            <CircularProgress size={18} />
            <Typography sx={siType.data}>Looking through every form for requests assigned to you…</Typography>
          </Box>
        ) : (
          <Box aria-busy={refreshing} sx={{ opacity: refreshing ? 0.5 : 1, pointerEvents: refreshing ? "none" : "auto", transition: "opacity 150ms" }}>
          <SapGrid
            label="Waiting for me"
            columns={columns}
            rows={entries}
            getKey={entryKey}
            selectedKey={selected ? entryKey(selected) : null}
            onSelect={(entry) => setSelectedKey(entryKey(entry))}
            onOpen={open}
            emptyText="You are all caught up. Anything assigned to you will appear here."
            minWidth={760}
            pageSize={25}
          />
          </Box>
        )}
      </SapPanel>

      {openEntry && <ReviewWindow key={entryKey(openEntry)} entry={openEntry} onClose={closeWindow} />}
    </Box>
  );
}
