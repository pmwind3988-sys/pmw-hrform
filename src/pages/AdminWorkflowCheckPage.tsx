/**
 * AdminWorkflowCheckPage.tsx — "would every step of every form work today?"
 * Route: /admin/workflow-check (Form Builder Superuser only)
 *
 * One button. It runs every step of every form against today's directories and
 * lists, per form and per step, what is fine and what is not.
 *
 * Reads only: nothing is submitted, approved, evaluated or emailed. The checks
 * live in src/utils/workflowPreflight.ts; the reads in workflowPreflightLoad.ts.
 */
import { useEffect, useState } from "react";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Container,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { acquireAccessTokenSilentOrRedirect } from "../utils/authRecovery";
import { acquirePeopleToken } from "../utils/peopleSearch";
import { createSpClient } from "../utils/sharepointClient";
import { SP_STATIC } from "../utils/spConfig";
import { editorial, si } from "../theme/editorial";
import {
  tallyChecks,
  type CheckFinding,
  type CheckLevel,
  type FormCheck,
  type ScenarioGroup,
  type StepCheck,
  type Verdict,
} from "../utils/workflowPreflight";
import { runWorkflowPreflight, type PreflightRun } from "../utils/workflowPreflightLoad";

const VERDICT_STYLE: Record<Verdict, { label: string; color: string; soft: string }> = {
  pass: { label: "OK", color: editorial.success, soft: editorial.successSoft },
  warn: { label: "Needs attention", color: editorial.warning, soft: editorial.warningSoft },
  fail: { label: "Broken", color: editorial.error, soft: editorial.errorSoft },
};

const OUTCOME_LABEL: Record<ScenarioGroup["outcome"], string> = {
  routed: "Goes to",
  paper: "Handled on paper",
  parked: "Waits for an admin (Needs Routing)",
  error: "Submission refused",
  later: "Later",
};

function VerdictIcon({ verdict }: { verdict: Verdict }) {
  const sx = { fontSize: 20, color: VERDICT_STYLE[verdict].color };
  if (verdict === "fail") return <ErrorIcon sx={sx} />;
  if (verdict === "warn") return <WarningAmberIcon sx={sx} />;
  return <CheckCircleIcon sx={sx} />;
}

function CheckLine({ level, text }: { level: CheckLevel | "ok"; text: string }) {
  const icon = level === "ok"
    ? <CheckCircleIcon sx={{ fontSize: 18, color: editorial.success }} />
    : level === "info"
      ? <InfoOutlinedIcon sx={{ fontSize: 18, color: editorial.muted }} />
      : <VerdictIcon verdict={level} />;
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
      <Box sx={{ pt: "2px", display: "flex" }}>{icon}</Box>
      <Typography sx={{ fontSize: 14, color: level === "info" ? editorial.muted : editorial.ink }}>{text}</Typography>
    </Stack>
  );
}

function Badge({ verdict }: { verdict: Verdict }) {
  const style = VERDICT_STYLE[verdict];
  return <Chip size="small" label={style.label} sx={{ bgcolor: style.soft, color: style.color, fontWeight: 700 }} />;
}

/** Problems first, then what passed, then notes. */
function Checklist({ passes, findings }: { passes: string[]; findings: CheckFinding[] }) {
  const rank: Record<CheckLevel, number> = { fail: 0, warn: 1, info: 3 };
  const problems = findings.filter((f) => f.level !== "info").sort((a, b) => rank[a.level] - rank[b.level]);
  const notes = findings.filter((f) => f.level === "info");
  return (
    <Stack spacing={0.75}>
      {problems.map((f, i) => <CheckLine key={`p${i}`} level={f.level} text={f.message} />)}
      {passes.map((text, i) => <CheckLine key={`o${i}`} level="ok" text={text} />)}
      {notes.map((f, i) => <CheckLine key={`n${i}`} level="info" text={f.message} />)}
    </Stack>
  );
}

function WhoItGoesTo({ groups }: { groups: ScenarioGroup[] }) {
  const [open, setOpen] = useState(false);
  if (groups.length === 0) return null;
  return (
    <Box sx={{ mt: 1 }}>
      <Button
        size="small"
        onClick={() => setOpen(!open)}
        endIcon={<ExpandMoreIcon sx={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />}
        aria-expanded={open}
        sx={{ px: 1, ml: -1 }}
      >
        {open ? "Hide who it goes to" : "Show who it goes to"}
      </Button>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ mt: 0.5, border: `1px solid ${editorial.border}`, borderRadius: `${si.radiusSm}px`, overflow: "hidden" }}>
          {groups.map((group, index) => (
            <Stack
              key={index}
              direction={{ xs: "column", sm: "row" }}
              spacing={{ xs: 0.25, sm: 2 }}
              sx={{ px: 1.5, py: 1, borderTop: index ? `1px solid ${editorial.border}` : "none" }}
            >
              <Typography sx={{ flex: 1, minWidth: 0, fontSize: 13, color: editorial.muted }}>
                {group.cases.length > 8 ? `${group.cases.slice(0, 8).join(", ")} and ${group.cases.length - 8} more` : group.cases.join(", ")}
              </Typography>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{
                  fontSize: 13,
                  fontWeight: 700,
                  wordBreak: "break-word",
                  color: group.outcome === "routed" ? editorial.success
                    : group.outcome === "paper" ? editorial.ink
                      : group.outcome === "parked" ? editorial.warning : editorial.error,
                }}>
                  {OUTCOME_LABEL[group.outcome]}{group.to.length > 0 ? `: ${group.to.join("; ")}` : ""}
                </Typography>
                {group.outcome !== "routed" && group.detail && (
                  <Typography sx={{ fontSize: 12, color: editorial.muted }}>{group.detail}</Typography>
                )}
              </Box>
            </Stack>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

function StepRow({ step, total, tag }: { step: StepCheck; total: number; tag: string }) {
  return (
    <Box sx={{ py: 1.75, borderTop: `1px solid ${editorial.border}` }}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5, mb: 1 }}>
        <VerdictIcon verdict={step.verdict} />
        <Typography sx={{ fontSize: 15, fontWeight: 700, color: editorial.ink }}>
          Step {step.layerNumber} of {total} · {step.title}
        </Typography>
        <Typography sx={{ fontSize: 13, color: editorial.muted }}>
          {step.type === "evaluation" ? "Evaluation" : "Approval"} · {step.routingLabel}
        </Typography>
        {tag && <Chip size="small" label={tag} sx={{ height: 22 }} />}
      </Stack>
      <Box sx={{ pl: { xs: 0, sm: 4 } }}>
        <Checklist passes={step.passes} findings={step.findings} />
        <WhoItGoesTo groups={step.groups} />
      </Box>
    </Box>
  );
}

function FormCard({ form }: { form: FormCheck }) {
  return (
    <Box
      component="section"
      aria-label={form.title}
      sx={{ bgcolor: editorial.panel, border: `1px solid ${editorial.border}`, borderRadius: `${si.radius}px`, boxShadow: si.shadow, px: { xs: 2, md: 3 }, pt: 2, pb: 1 }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5, mb: 1.5 }}>
        <Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, color: editorial.ink }}>
          {form.title}{form.testOnly ? " (test form)" : ""}
        </Typography>
        <Badge verdict={form.verdict} />
      </Stack>

      {(form.findings.length > 0 || form.passes.length > 0) && (
        <Box sx={{ mb: 1.5 }}><Checklist passes={form.passes} findings={form.findings} /></Box>
      )}

      {form.profiles.map((profile) => {
        const many = form.profiles.length > 1;
        const steps = profile.workflows.flatMap((workflow) => workflow.steps.map((step) => ({ workflow, step })));
        return (
          <Box key={profile.key} sx={{ mb: 1 }}>
            {many && (
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 1, mb: 0.5 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: editorial.navy }}>Profile: {profile.label}</Typography>
                {!profile.live && <Chip size="small" label="Not live" sx={{ height: 20 }} />}
              </Stack>
            )}
            {profile.findings.length > 0 && (
              <Box sx={{ mb: 1 }}><Checklist passes={[]} findings={profile.findings} /></Box>
            )}
            {steps.length === 0 && profile.findings.length === 0 && (
              <Box sx={{ mb: 1 }}><CheckLine level="ok" text="Nothing to route." /></Box>
            )}
            {steps.map(({ workflow, step }) => (
              <StepRow
                key={`${workflow.branch}|${step.layerNumber}`}
                step={step}
                total={workflow.steps.length}
                tag={workflow.branchLabel ? `${workflow.branchLabel} branch` : ""}
              />
            ))}
          </Box>
        );
      })}
    </Box>
  );
}

export default function AdminWorkflowCheckPage() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const [token, setToken] = useState<string | null>(null);
  const [accessError, setAccessError] = useState("");
  const [run, setRun] = useState<PreflightRun | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [runError, setRunError] = useState("");

  useEffect(() => { document.title = "Workflow check - PMW HR Form"; }, []);

  // Access check, backing up the route guard: Form Builder users only.
  useEffect(() => {
    if (inProgress !== InteractionStatus.None || !isAuthenticated) return;
    const origin = new URL(import.meta.env.VITE_SP_SITE_URL || "https://placeholder.sharepoint.com").origin;
    createSpClient(instance, accounts)
      .isGroupMember(SP_STATIC.formBuilderSuperuserGroup)
      .then((superuser) => {
        if (!superuser) {
          setAccessError("Only Form Builder users can run the workflow check.");
          return null;
        }
        return acquireAccessTokenSilentOrRedirect(instance, { scopes: [`${origin}/AllSites.Manage`], account: accounts[0] });
      })
      .then((acquired) => { if (acquired) setToken(acquired); })
      .catch(() => setAccessError("Could not sign in to SharePoint. Reload the page, or sign out and back in."));
  }, [isAuthenticated, inProgress, instance, accounts]);

  /** `askConsent`: the author pressed "Allow", so Microsoft may show its consent prompt. */
  const startRun = (askConsent = false) => {
    if (!token) return;
    setRunning(true);
    setRunError("");
    const account = accounts[0];
    runWorkflowPreflight(token, {
      onProgress: setProgress,
      // The people picker's own grant: read names and addresses, nothing else.
      getPeopleToken: () => acquirePeopleToken(instance, account, askConsent),
      companyDomains: [account?.username.split("@")[1] ?? ""].filter(Boolean),
    })
      .then(setRun)
      .catch((error: unknown) => setRunError(error instanceof Error ? error.message : "The check could not finish."))
      .finally(() => { setRunning(false); setProgress(""); });
  };

  if (accessError) {
    return <Container maxWidth="sm" sx={{ py: 8 }}><Alert severity="error">{accessError}</Alert></Container>;
  }

  const tally = run ? tallyChecks(run.forms) : null;
  // Problem forms first; otherwise keep the order the form list has.
  const rank: Record<Verdict, number> = { fail: 0, warn: 1, pass: 2 };
  const forms = [...(run?.forms ?? [])].sort((a, b) => rank[a.verdict] - rank[b.verdict]);

  return (
    <Box sx={{ maxWidth: 1040, mx: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ bgcolor: editorial.panel, border: `1px solid ${editorial.border}`, borderRadius: `${si.radius}px`, boxShadow: si.shadow, p: { xs: 2, md: 3 } }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" } }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography component="h1" sx={{ fontSize: 24, fontWeight: 700, color: editorial.ink }}>Workflow check</Typography>
            <Typography sx={{ fontSize: 14, color: editorial.muted, mt: 0.5 }}>
              Checks every step of every form against today's directories, without submitting or emailing anyone.
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="large"
            onClick={() => startRun()}
            disabled={!token || running}
            startIcon={running ? <CircularProgress size={18} color="inherit" /> : <PlayArrowRoundedIcon />}
            sx={{ flexShrink: 0, minHeight: si.touchTarget }}
          >
            {running ? "Checking…" : run ? "Run check again" : "Run check"}
          </Button>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
          <Chip size="small" icon={<LockOutlinedIcon />} label="Read only" sx={{ bgcolor: editorial.blueSoft }} />
          {tally && run && (
            <Typography sx={{ fontSize: 14, color: editorial.ink }}>
              {tally.forms} forms · {tally.steps} steps ·{" "}
              <Box component="span" sx={{ color: editorial.success, fontWeight: 700 }}>{tally.pass} OK</Box> ·{" "}
              <Box component="span" sx={{ color: editorial.warning, fontWeight: 700 }}>{tally.warn} need attention</Box> ·{" "}
              <Box component="span" sx={{ color: editorial.error, fontWeight: 700 }}>{tally.fail} broken</Box>
              <Box component="span" sx={{ color: editorial.muted }}> · checked {run.ranAt.toLocaleString()}</Box>
            </Typography>
          )}
          {!token && !run && <Typography sx={{ fontSize: 13, color: editorial.muted }}>Signing in to SharePoint…</Typography>}
        </Stack>

        {running && (
          <Box sx={{ mt: 2 }}>
            <LinearProgress />
            <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.75 }} aria-live="polite">{progress}</Typography>
          </Box>
        )}
      </Box>

      {runError && <Alert severity="error">{runError}</Alert>}

      {run?.directoryLookup === "needs-consent" && !running && (
        <Alert
          severity="info"
          action={<Button color="inherit" size="small" onClick={() => startRun(true)}>Allow and re-check</Button>}
        >
          Whether each email address is a real account, and whether each reviewer can sign in, was not checked:
          reading the company directory needs your one-time permission.
        </Alert>
      )}

      {forms.map((form) => <FormCard key={form.title} form={form} />)}
    </Box>
  );
}
