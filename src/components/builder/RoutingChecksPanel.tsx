import { useState } from "react";
import { Box, Button, Chip, FormControl, InputLabel, MenuItem, Select, TextField } from "@mui/material";

import SapPanel, { SapPanelTitle } from "../sap/SapPanel";
import SapGrid, { type SapColumn } from "../sap/SapGrid";
import { editorial, siType } from "../../theme/editorial";
import {
  ROUTING_CHECK_PERIOD_LABELS,
  ROUTING_CHECK_VIEW_LABELS,
  matchesRoutingCheckSearch,
  matchesRoutingCheckView,
  withinRoutingCheckPeriod,
  type RoutingCheckLine,
  type RoutingCheckPeriod,
  type RoutingCheckView,
} from "../../utils/routingCheckOverview";
import { routingCheckOutcomeLabel, routingCheckTriggerLabel } from "../../utils/routingCheckLabels";
import type { RoutingCheckOutcome } from "../../utils/workflowAssignmentData";

const OUTCOME_TONE: Record<RoutingCheckOutcome, { bg: string; fg: string }> = {
  match: { bg: editorial.successSoft, fg: editorial.success },
  corrected: { bg: editorial.accentSoft, fg: editorial.accentText },
  "left-alone": { bg: editorial.sky, fg: editorial.navyDeep },
  "not-checkable": { bg: editorial.blueWash, fg: editorial.muted },
  "held-no-routing": { bg: editorial.errorSoft, fg: editorial.error },
  "held-check-failed": { bg: editorial.errorSoft, fg: editorial.error },
};

function formatWhen(iso: string | undefined): string {
  const time = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(time)) return "—";
  return new Date(time).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function people(emails: readonly string[]): string {
  return emails.length ? emails.join(", ") : "nobody";
}

/**
 * All Submissions → Routing checks.
 *
 * Every automatic routing check the loaded submissions have logged, in one
 * list: what was corrected, what is on hold and why, what matched. Each
 * submission's own log sits under "Check routing" on that submission; "Open"
 * goes there. Reads only, nothing here changes a submission.
 */
export default function RoutingChecksPanel({
  lines,
  onOpen,
}: {
  lines: RoutingCheckLine[];
  onOpen: (line: RoutingCheckLine) => void;
}) {
  const [view, setView] = useState<RoutingCheckView>("all");
  const [period, setPeriod] = useState<RoutingCheckPeriod>("30");
  const [search, setSearch] = useState("");

  const now = new Date();
  const inPeriod = lines.filter((line) => withinRoutingCheckPeriod(line, period, now) && matchesRoutingCheckSearch(line, search));
  const rows = inPeriod.filter((line) => matchesRoutingCheckView(line, view));
  const count = (filter: RoutingCheckView) => inPeriod.filter((line) => matchesRoutingCheckView(line, filter)).length;

  const columns: SapColumn<RoutingCheckLine>[] = [
    { key: "when", header: "When", nowrap: true, render: (line) => formatWhen(line.at) },
    {
      key: "result",
      header: "Result",
      nowrap: true,
      render: (line) => (
        <Chip
          size="small"
          label={routingCheckOutcomeLabel(line.outcome)}
          sx={{ height: 22, ...siType.subtext, fontWeight: 600, backgroundColor: OUTCOME_TONE[line.outcome].bg, color: OUTCOME_TONE[line.outcome].fg }}
        />
      ),
    },
    {
      key: "what",
      header: "Submission",
      maxWidth: 260,
      render: (line) => (
        <Box component="span">
          <Box component="span" sx={{ fontWeight: 600, color: editorial.navy }}>{line.formTitle} #{line.itemId}</Box>
          <Box component="span" sx={{ color: editorial.muted }}> · step {line.layer}</Box>
        </Box>
      ),
    },
    {
      key: "people",
      header: "Who",
      maxWidth: 320,
      render: (line) => line.outcome === "corrected"
        ? `Was ${people(line.saved)} · now ${people(line.routed)}`
        : people(line.saved),
    },
    {
      key: "why",
      header: "Details",
      maxWidth: 360,
      render: (line) => (
        <Box component="span">
          <Box component="span" sx={{ color: editorial.muted }}>
            {routingCheckTriggerLabel(line.trigger)}
            {line.count && line.count > 1 ? ` · checked ${line.count} times, first ${formatWhen(line.firstAt)}` : ""}
          </Box>
          {line.note || line.how ? <Box component="span">{` · ${line.note || line.how}`}</Box> : null}
        </Box>
      ),
    },
    {
      key: "open",
      header: "",
      nowrap: true,
      render: (line) => (
        <Button size="small" onClick={(event) => { event.stopPropagation(); onOpen(line); }} sx={{ textTransform: "none", fontWeight: 700, minWidth: 0 }}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <SapPanel
      label="Routing checks"
      sx={{ minHeight: 0, flex: 1 }}
      header={
        <>
          <SapPanelTitle>Routing checks</SapPanelTitle>
          <Box component="span" sx={{ color: editorial.muted }}>
            {count("all")} check{count("all") === 1 ? "" : "s"} · {count("corrected")} corrected · {count("held")} on hold
          </Box>
          <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <TextField
              size="small"
              label="Search"
              placeholder="Person, form or #number"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              sx={{ minWidth: 200 }}
            />
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel id="routing-checks-period">Period</InputLabel>
              <Select
                labelId="routing-checks-period"
                label="Period"
                value={period}
                onChange={(event) => setPeriod(event.target.value as RoutingCheckPeriod)}
              >
                {(Object.keys(ROUTING_CHECK_PERIOD_LABELS) as RoutingCheckPeriod[]).map((key) => (
                  <MenuItem key={key} value={key}>{ROUTING_CHECK_PERIOD_LABELS[key]}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="routing-checks-view">Show</InputLabel>
              <Select
                labelId="routing-checks-view"
                label="Show"
                value={view}
                onChange={(event) => setView(event.target.value as RoutingCheckView)}
              >
                {(Object.keys(ROUTING_CHECK_VIEW_LABELS) as RoutingCheckView[]).map((key) => (
                  <MenuItem key={key} value={key}>{ROUTING_CHECK_VIEW_LABELS[key]} ({count(key)})</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </>
      }
      status={
        <span>
          Checks made before a request email on the loaded submissions. A check repeated with the same result is one line with a count. To release a hold, open the submission and use Reconfigure this submission.
        </span>
      }
    >
      <Box sx={{ overflow: "auto", flex: 1, minHeight: 0 }}>
        <SapGrid
          label="Routing checks"
          columns={columns}
          rows={rows}
          getKey={(line) => line.key}
          onOpen={onOpen}
          emptyText={lines.length === 0
            ? "No automatic checks have been logged on the loaded submissions yet."
            : "No checks match. Try a longer period or a different filter."}
          minWidth={1000}
          pageSize={25}
        />
      </Box>
    </SapPanel>
  );
}
