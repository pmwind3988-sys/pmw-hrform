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
  planOrgConversion,
  type OrgConversionPlan,
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
    setProgress({ done: 0, total: plan.repoint.length });
    try {
      const result = await repointFormQuestions(
        token,
        plan.repoint,
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

            {plan.repoint.length > 0 && (
              <Alert severity={seeded || seedCount === 0 ? "info" : "warning"}>
                <AlertTitle>
                  Then {plan.repoint.length} question{plan.repoint.length === 1 ? "" : "s"} can be repointed at
                  the lists
                </AlertTitle>
                This edits published profiles of forms people are submitting right now. It changes only where
                each question's choices come from — the questions, the publish status and the expiry are left
                as they are, and nothing is republished.
                {!seeded && seedCount > 0 && " Add the rows first, or the forms will point at an empty list."}
              </Alert>
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
          disabled={busy || !plan || plan.repoint.length === 0 || (!seeded && seedCount > 0)}
          sx={{ textTransform: "none", fontWeight: 700 }}
        >
          {stage === "repointing" ? "Repointing..." : "Repoint the forms"}
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
