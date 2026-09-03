/**
 * OrgConversionDialog.tsx — build the global lists from what forms already use.
 *
 * Two-step, like the CSV import and the directory scan: read everything,
 * show exactly what would be created, write only on the admin's word.
 *
 * And two separate writes, deliberately. Seeding the lists is additive and
 * safe. Repointing questions edits published profiles of forms staff are
 * submitting right now, which is a different kind of decision and gets its own
 * button.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { editorial } from "../../theme/editorial";
import {
  describeOrgConversionPlan,
  groupRepointTargets,
  planOrgConversion,
  repointBlockReason,
  type OrgConversionPlan,
  type RepointTarget,
} from "../../utils/orgConversion";
import {
  collectFormOrgUsage,
  loadCompanies,
  loadDepartments,
  repointFormQuestions,
  seedOrgLists,
} from "../../utils/orgDirectorySP";
import { loadApprovalDirectory } from "../../utils/approvalDirectory";
import { orgKey } from "../../utils/orgDirectory";

interface Props {
  open: boolean;
  token: string | null;
  onClose: () => void;
  onDone: (message: string, ok: boolean) => void;
}

type Stage = "idle" | "reading" | "ready" | "seeding" | "repointing";

export default function OrgConversionDialog({ open, token, onClose, onDone }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [plan, setPlan] = useState<OrgConversionPlan | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [seeded, setSeeded] = useState(false);
  /** Codes already listed, so a re-run shows what is genuinely new. */
  const [alreadyListed, setAlreadyListed] = useState<{ companies: Set<string>; departments: Set<string> }>(
    { companies: new Set(), departments: new Set() },
  );

  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;

    setStage("reading");
    setError("");
    setPlan(null);
    setSeeded(false);
    setProgress(null);
    setTickedProfiles(new Set());

    void (async () => {
      try {
        const [usage, directory, companies, departments] = await Promise.all([
          collectFormOrgUsage(token),
          // Harvested rows can name a department no current form still offers,
          // and routing already uses it, so it belongs in the list.
          loadApprovalDirectory(token).catch(() => ({ rows: [] })),
          loadCompanies(token).catch(() => []),
          loadDepartments(token).catch(() => []),
        ]);
        if (cancelled) return;

        setAlreadyListed({
          companies: new Set(companies.map((row) => orgKey(row.code))),
          departments: new Set(departments.filter((row) => !row.company.trim()).map((row) => orgKey(row.code))),
        });
        setPlan(planOrgConversion({
          usage,
          directoryPairs: ("rows" in directory ? directory.rows : []).map((row) => ({
            company: row.company,
            department: row.department,
          })),
        }));
        setStage("ready");
      } catch (readError) {
        if (cancelled) return;
        setError(readError instanceof Error ? readError.message : String(readError));
        setStage("ready");
      }
    })();

    return () => { cancelled = true; };
  }, [open, token]);

  const newCompanies = useMemo(
    () => (plan?.companies ?? []).filter((row) => !alreadyListed.companies.has(orgKey(row.code))),
    [plan, alreadyListed],
  );
  const newDepartments = useMemo(
    () => (plan?.departments ?? []).filter((row) => !alreadyListed.departments.has(orgKey(row.code))),
    [plan, alreadyListed],
  );

  /**
   * Which published profiles to repoint. Nothing to begin with: this edits
   * forms staff are submitting right now, one form at a time is the normal way
   * to do it, and a default of "all of them" is not a choice anybody made.
   */
  const [tickedProfiles, setTickedProfiles] = useState<Set<string>>(new Set());

  const repointGroups = useMemo(() => groupRepointTargets(plan?.repoint ?? []), [plan]);

  /** Targets the rules allow, out of the profiles that are ticked. */
  const chosenTargets = useMemo<RepointTarget[]>(() => {
    const chosen: RepointTarget[] = [];
    for (const group of repointGroups) {
      const key = `${group.formTitle}|${group.version}|${group.publishKey}`;
      if (!tickedProfiles.has(key)) continue;
      for (const target of group.targets) {
        if (!repointBlockReason(target, group)) chosen.push(target);
      }
    }
    return chosen;
  }, [repointGroups, tickedProfiles]);

  /**
   * Whether the lists have nothing in them yet.
   *
   * This, and not "the plan proposes new rows", is what makes repointing
   * premature. A plan can propose rows that should never be added — the
   * placeholder choices a freshly added question arrives with, say — while the
   * lists themselves are perfectly well populated, and refusing to repoint
   * until those were added would force junk into the list to get past a
   * button.
   */
  const listsAreEmpty = alreadyListed.companies.size === 0 && alreadyListed.departments.size === 0;

  const busy = stage === "reading" || stage === "seeding" || stage === "repointing";

  const handleSeed = async () => {
    if (!token || !plan) return;
    setStage("seeding");
    setProgress({ done: 0, total: newCompanies.length + newDepartments.length });
    try {
      const result = await seedOrgLists(
        token,
        newCompanies,
        newDepartments,
        (done, total) => setProgress({ done, total }),
      );
      setSeeded(result.failures.length === 0);
      onDone(
        result.failures.length === 0
          ? `Added ${result.created} row${result.created === 1 ? "" : "s"} to the lists.`
          : `Added ${result.created}; ${result.failures.length} failed. ${result.failures[0]}`,
        result.failures.length === 0,
      );
    } catch (seedError) {
      onDone(`Could not build the lists: ${seedError instanceof Error ? seedError.message : String(seedError)}`, false);
    } finally {
      setStage("ready");
      setProgress(null);
    }
  };

  const handleRepoint = async () => {
    if (!token || !plan) return;
    setStage("repointing");
    setProgress({ done: 0, total: chosenTargets.length });
    try {
      const result = await repointFormQuestions(
        token,
        chosenTargets,
        (done, total) => setProgress({ done, total }),
      );
      onDone(
        result.failures.length === 0
          ? `${result.changed} published profile${result.changed === 1 ? "" : "s"} now read from the lists.`
          : `${result.changed} repointed; ${result.failures.length} failed. ${result.failures[0]}`,
        result.failures.length === 0,
      );
    } catch (repointError) {
      onDone(`Could not repoint the forms: ${repointError instanceof Error ? repointError.message : String(repointError)}`, false);
    } finally {
      setStage("ready");
      setProgress(null);
    }
  };

  const seedCount = newCompanies.length + newDepartments.length;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Build from existing forms</DialogTitle>
      <DialogContent dividers>
        {stage === "reading" && (
          <Stack sx={{ gap: 1.5, py: 2 }}>
            <Typography sx={{ fontSize: "0.845rem", color: editorial.muted }}>
              Reading every published profile of every form...
            </Typography>
            <LinearProgress />
          </Stack>
        )}

        {stage !== "reading" && error && (
          <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        )}

        {stage !== "reading" && plan && (
          <Stack sx={{ gap: 2 }}>
            <Typography sx={{ fontSize: "0.875rem", color: editorial.ink }}>
              {describeOrgConversionPlan(plan)}
            </Typography>

            {plan.companyDuplicates.length + plan.departmentDuplicates.length > 0 && (
              <Alert severity="warning">
                <AlertTitle>Some of these look like one thing spelled two ways</AlertTitle>
                Both spellings are added as they are, because merging them would change what a submission
                means. Rename or switch off whichever is wrong afterwards.
                <Box component="ul" sx={{ m: "0.5rem 0 0", pl: 2.5 }}>
                  {[...plan.companyDuplicates, ...plan.departmentDuplicates].map((group) => (
                    <li key={group.key}>{group.names.join("  ·  ")}</li>
                  ))}
                </Box>
              </Alert>
            )}

            <Box>
              <Typography sx={{ fontSize: "0.9rem", fontWeight: 700, mb: 0.5 }}>
                {seedCount === 0
                  ? "Nothing new to add — every value found is already listed"
                  : `${seedCount} row${seedCount === 1 ? "" : "s"} to add`}
              </Typography>
              {seedCount > 0 && (
                <Box sx={{ overflowX: "auto", maxHeight: 300 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Kind</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Name and stored code</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Seen on</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {[
                        ...newCompanies.map((row) => ({ kind: "Company" as const, row })),
                        ...newDepartments.map((row) => ({ kind: "Department" as const, row })),
                      ].map(({ kind, row }) => (
                        <TableRow key={`${kind}|${row.code}`}>
                          <TableCell>
                            <Chip
                              size="small"
                              label={kind}
                              sx={{ height: 20, fontSize: "0.7rem", fontWeight: 700 }}
                            />
                          </TableCell>
                          <TableCell sx={{ fontSize: "0.78rem" }}>{row.name}</TableCell>
                          <TableCell sx={{ fontSize: "0.72rem", color: editorial.softMuted }}>
                            {row.seenOn.join(", ")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}
              <Typography sx={{ fontSize: "0.78rem", color: editorial.muted, mt: 1 }}>
                Every department is added as shared by all companies, because that is what today's submissions
                say — they store a department with no company attached. Make one company-specific afterwards
                whenever you need to.
              </Typography>
            </Box>

            {repointGroups.length > 0 && (
              <Box>
                <Typography sx={{ fontSize: "0.9rem", fontWeight: 700, mb: 0.5 }}>
                  Then choose which published profiles read from the lists
                </Typography>
                <Typography sx={{ fontSize: "0.78rem", color: editorial.muted, mb: 1 }}>
                  This edits profiles of forms people are submitting right now, so pick them deliberately —
                  one form at a time is a reasonable way to go about it. Only where a question's choices come
                  from changes: the questions, the publish status and the expiry are left as they are, and
                  nothing is republished.
                  {listsAreEmpty && !seeded
                    && " Add the rows above first, or a form will point at an empty list."}
                </Typography>
                {seedCount > 0 && !listsAreEmpty && (
                  <Typography sx={{ fontSize: "0.78rem", color: editorial.muted, mb: 1 }}>
                    You do not have to add the rows above to repoint. A question that has just been added
                    still carries its placeholder choices, and those show up there as values in use —
                    repointing replaces them with the list, so there is no need to let them into it.
                  </Typography>
                )}

                <Box sx={{ maxHeight: 260, overflowY: "auto" }}>
                  {repointGroups.map((group) => {
                    const key = `${group.formTitle}|${group.version}|${group.publishKey}`;
                    return (
                      <Box
                        key={key}
                        sx={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 1,
                          py: 0.75,
                          borderBottom: `1px solid ${editorial.border}`,
                        }}
                      >
                        <Checkbox
                          size="small"
                          sx={{ mt: -0.5 }}
                          checked={tickedProfiles.has(key)}
                          disabled={stage === "repointing"}
                          onChange={() => setTickedProfiles((current) => {
                            const next = new Set(current);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          })}
                          slotProps={{ input: { "aria-label": `Repoint ${group.formTitle} ${group.publishKey}` } }}
                        />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: "0.845rem", fontWeight: 700, color: editorial.ink }}>
                            {group.formTitle}
                            <Typography
                              component="span"
                              sx={{ fontSize: "0.72rem", color: editorial.softMuted, ml: 1 }}
                            >
                              v{group.version} · {group.publishKey}
                            </Typography>
                          </Typography>
                          {group.targets.map((target) => {
                            const blocked = repointBlockReason(target, group);
                            return (
                              <Typography
                                key={target.questionName}
                                sx={{ fontSize: "0.72rem", color: blocked ? editorial.error : editorial.muted }}
                              >
                                {`${target.questionTitle || target.questionName} — ${target.kind}`}
                                {blocked ? ` · skipped: ${blocked}` : ""}
                              </Typography>
                            );
                          })}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>

                <Alert severity="warning" sx={{ mt: 1.5 }}>
                  <AlertTitle>Check these are the organisation's own fields</AlertTitle>
                  A question is recognised by its label, so one asking for an outside party's company or
                  department — a contractor, a previous employer, a trainer's firm — looks identical from
                  here. Repointing one of those would replace free text with a list of PMW companies. Leave
                  those unticked.
                </Alert>
              </Box>
            )}

            {progress && (
              <Stack sx={{ gap: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={progress.total === 0 ? 0 : (progress.done / progress.total) * 100}
                />
                <Typography sx={{ fontSize: "0.78rem", color: editorial.muted }}>
                  {progress.done} of {progress.total}.
                </Typography>
              </Stack>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy} sx={{ textTransform: "none" }}>Close</Button>
        <Button
          onClick={() => void handleRepoint()}
          disabled={busy || chosenTargets.length === 0 || (listsAreEmpty && !seeded)}
          sx={{ textTransform: "none", fontWeight: 700 }}
        >
          {stage === "repointing"
            ? "Repointing..."
            : `Repoint ${tickedProfiles.size || "no"} ${tickedProfiles.size === 1 ? "profile" : "profiles"}`}
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleSeed()}
          disabled={busy || seedCount === 0}
          sx={{ textTransform: "none", fontWeight: 700 }}
        >
          {stage === "seeding" ? "Adding..." : `Add ${seedCount} row${seedCount === 1 ? "" : "s"}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
