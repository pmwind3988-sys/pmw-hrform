import { useState } from "react";
import { Box, Button, Checkbox, Chip, FormControl, InputLabel, MenuItem, Select, Typography } from "@mui/material";
import { SendOutlined as SendIcon } from "@mui/icons-material";

import SapPanel, { SapPanelTitle } from "../sap/SapPanel";
import SapGrid, { type SapColumn } from "../sap/SapGrid";
import { editorial, si, siType } from "../../theme/editorial";
import {
  emailScheduleLabel,
  isUpcoming,
  nextDigestRunAt,
  type EmailScheduleEntry,
  type EmailScheduleState,
} from "../../utils/emailScheduleOverview";

type ViewFilter = "upcoming" | "attention" | "next" | "later" | "sent" | "all";

const VIEW_MATCHES: Record<ViewFilter, (entry: EmailScheduleEntry) => boolean> = {
  upcoming: (entry) => isUpcoming(entry),
  attention: (entry) => entry.state === "failed" || entry.state === "stopped",
  next: (entry) => entry.state === "next-summary" || entry.state === "next-alone",
  later: (entry) => entry.state === "later" && !isUpcoming(entry),
  sent: (entry) => entry.state === "sent-summary" || entry.state === "sent-alone",
  all: () => true,
};

const VIEW_LABELS: Record<ViewFilter, string> = {
  upcoming: "Next 3 months",
  attention: "Needs attention",
  next: "Next run only",
  later: "After 3 months",
  sent: "Already sent",
  all: "Everything",
};

const STATE_TONE: Record<EmailScheduleState, { bg: string; fg: string }> = {
  failed: { bg: editorial.errorSoft, fg: editorial.error },
  stopped: { bg: editorial.errorSoft, fg: editorial.error },
  "next-summary": { bg: editorial.sky, fg: editorial.navyDeep },
  "next-alone": { bg: editorial.accentSoft, fg: editorial.accentText },
  later: { bg: editorial.blueWash, fg: editorial.muted },
  "sent-summary": { bg: editorial.successSoft, fg: editorial.success },
  "sent-alone": { bg: editorial.successSoft, fg: editorial.success },
};

function formatWhen(iso: string | undefined): string {
  if (!iso) return "—";
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "—";
  return new Date(time).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * All Submissions → Email schedule.
 *
 * Every workflow email the loaded submissions carry, compiled: what goes in
 * the next morning's summary and with whom, what is due over the next three
 * months (the default view — a Training Evaluation is asked three months
 * after the course, so "tomorrow" alone hid nearly all of it), what
 * has already gone (on its own or inside a summary), and what failed.
 *
 * Picking rows and pressing "Send selected now" sends just those, grouped the
 * way the morning run would group them. Sending one alone, resending, or moving
 * its date stays on the submission itself — "Open" goes there.
 */
export default function EmailSchedulePanel({
  entries,
  onOpen,
  onSendSelected,
}: {
  entries: EmailScheduleEntry[];
  onOpen: (entry: EmailScheduleEntry) => void;
  onSendSelected: (entries: EmailScheduleEntry[]) => Promise<void>;
}) {
  const [view, setView] = useState<ViewFilter>("upcoming");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const matching = entries.filter(VIEW_MATCHES[view]);
  // Upcoming reads as a calendar: the next run first, then each later date in turn.
  const rows = view === "upcoming"
    ? [...matching].sort((a, b) => Number(a.state === "later") - Number(b.state === "later")
      || (a.state === "later" ? String(a.dueAt).localeCompare(String(b.dueAt)) : 0))
    : matching;
  const pickedEntries = entries.filter((entry) => picked.has(entry.key) && entry.selectable);
  const counts = (filter: ViewFilter) => entries.filter(VIEW_MATCHES[filter]).length;
  const summaryPeople = new Set(entries.filter((e) => e.state === "next-summary").map((e) => e.recipientKey)).size;

  const toggle = (entry: EmailScheduleEntry) => setPicked((previous) => {
    const next = new Set(previous);
    if (next.has(entry.key)) next.delete(entry.key);
    else next.add(entry.key);
    return next;
  });

  const send = async () => {
    setSending(true);
    try {
      await onSendSelected(pickedEntries);
      setPicked(new Set());
    } finally {
      setSending(false);
      setConfirming(false);
    }
  };

  const columns: SapColumn<EmailScheduleEntry>[] = [
    {
      key: "pick",
      header: <span style={{ position: "absolute", left: -9999 }}>Select</span>,
      width: 44,
      render: (entry) => (
        <Checkbox
          size="small"
          checked={picked.has(entry.key)}
          disabled={!entry.selectable || sending}
          onChange={() => toggle(entry)}
          onClick={(event) => event.stopPropagation()}
          slotProps={{ input: { "aria-label": `Select ${entry.formTitle} #${entry.itemId}` } }}
          sx={{ p: 0.5 }}
        />
      ),
    },
    {
      key: "state",
      header: "Status",
      nowrap: true,
      render: (entry) => (
        <Chip
          size="small"
          label={emailScheduleLabel(entry)}
          sx={{ height: 22, ...siType.subtext, fontWeight: 600, backgroundColor: STATE_TONE[entry.state].bg, color: STATE_TONE[entry.state].fg }}
        />
      ),
    },
    { key: "to", header: "To", maxWidth: 240, render: (entry) => entry.recipient || "—" },
    {
      key: "what",
      header: "Submission",
      maxWidth: 260,
      render: (entry) => (
        <Box component="span">
          <Box component="span" sx={{ fontWeight: 600, color: editorial.navy }}>{entry.formTitle} #{entry.itemId}</Box>
          <Box component="span" sx={{ color: editorial.muted }}> · step {entry.layer}</Box>
        </Box>
      ),
    },
    {
      key: "when",
      header: "When",
      nowrap: true,
      render: (entry) => entry.state.startsWith("sent")
        ? `Sent ${formatWhen(entry.sentAt)}`
        : entry.state === "later" ? formatWhen(entry.dueAt)
          : entry.state === "stopped" ? `${entry.attempts} attempts`
            : `Next run · ${formatWhen(nextDigestRunAt().toISOString())}`,
    },
    {
      key: "open",
      header: "",
      nowrap: true,
      render: (entry) => (
        <Button size="small" onClick={(event) => { event.stopPropagation(); onOpen(entry); }} sx={{ textTransform: "none", fontWeight: 700, minWidth: 0 }}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <SapPanel
      label="Email schedule"
      sx={{ minHeight: 0, flex: 1 }}
      header={
        <>
          <SapPanelTitle>Email schedule</SapPanelTitle>
          <Box component="span" sx={{ color: editorial.muted }}>
            Next run {formatWhen(nextDigestRunAt().toISOString())} · {counts("next")} email{counts("next") === 1 ? "" : "s"}
            {summaryPeople ? ` · ${summaryPeople} summar${summaryPeople === 1 ? "y" : "ies"}` : ""}
            {` · ${counts("upcoming")} in the next 3 months`}
          </Box>
          <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <FormControl size="small" sx={{ minWidth: 190 }}>
              <InputLabel id="email-schedule-view">Show</InputLabel>
              <Select
                labelId="email-schedule-view"
                label="Show"
                value={view}
                onChange={(event) => setView(event.target.value as ViewFilter)}
              >
                {(Object.keys(VIEW_LABELS) as ViewFilter[]).map((key) => (
                  <MenuItem key={key} value={key}>{VIEW_LABELS[key]} ({counts(key)})</MenuItem>
                ))}
              </Select>
            </FormControl>
            {confirming ? (
              <>
                <Typography sx={{ ...siType.subtext, color: editorial.ink }}>
                  Send {pickedEntries.length} now?
                </Typography>
                <Button size="small" disabled={sending} onClick={() => setConfirming(false)} sx={{ textTransform: "none", fontWeight: 700 }}>
                  Cancel
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  disabled={sending}
                  onClick={() => void send()}
                  sx={{ textTransform: "none", fontWeight: 700, borderRadius: `${si.radius}px` }}
                >
                  {sending ? "Sending…" : "Yes, send"}
                </Button>
              </>
            ) : (
              <Button
                size="small"
                variant="contained"
                startIcon={<SendIcon />}
                disabled={pickedEntries.length === 0}
                onClick={() => setConfirming(true)}
                sx={{ textTransform: "none", fontWeight: 700, borderRadius: `${si.radius}px` }}
              >
                Send selected now{pickedEntries.length ? ` (${pickedEntries.length})` : ""}
              </Button>
            )}
          </Box>
        </>
      }
      status={
        <span>
          Picked emails for the same person go as one summary; the rest go on their own. To send one alone, resend, or move its date, open the submission.
        </span>
      }
    >
      <Box sx={{ overflow: "auto", flex: 1, minHeight: 0 }}>
        <SapGrid
          label="Email schedule"
          columns={columns}
          rows={rows}
          getKey={(entry) => entry.key}
          onOpen={onOpen}
          emptyText={view === "attention" ? "Nothing has failed." : "Nothing here among the loaded submissions."}
          minWidth={900}
          pageSize={25}
        />
      </Box>
    </SapPanel>
  );
}
