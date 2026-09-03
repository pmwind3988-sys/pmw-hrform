/**
 * DirectoryScanDialog.tsx — backfill the directory from evaluations already
 * submitted.
 *
 * Same two-step shape as the CSV import, and for the same reason: a scan of a
 * year of appraisals can propose a hundred people at once. The admin sees
 * every proposed row, unticks anything wrong, and only then is a row written.
 *
 * Every value shown here is a guess. The ones that are guesses about *people*
 * rather than about a form's answers — the address and the approver — are
 * marked, because those are the two that misroute somebody's appraisal.
 */
import { useMemo, useState } from "react";
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
import { directoryEmailKey } from "../../utils/approvalDirectorySchema";
import { describeScanPlan, type DirectoryScanPlan, type ScanProposal } from "../../utils/directoryScan";

/** Shared empty set, so a plan with nothing unticked keeps a stable identity. */
const EMPTY_KEYS: ReadonlySet<string> = new Set<string>();

export interface DirectoryScanProgress {
  done: number;
  total: number;
  failures: string[];
}

interface Props {
  open: boolean;
  /** Null while the scan is still reading. */
  plan: DirectoryScanPlan | null;
  scanning: boolean;
  applying: boolean;
  progress: DirectoryScanProgress | null;
  /** What the scan is reading right now, for the progress line. */
  scanningLabel?: string;
  onClose: () => void;
  onApply: (proposals: ScanProposal[]) => void;
}

export default function DirectoryScanDialog({
  open,
  plan,
  scanning,
  applying,
  progress,
  scanningLabel,
  onClose,
  onApply,
}: Props) {
  /**
   * Which proposals the admin has unticked, and which plan they unticked them
   * on. Tied to the plan rather than reset in an effect: a fresh scan must
   * start from a clean slate, and carrying the old exclusions over would
   * silently drop people nobody ever looked at.
   */
  const [excludedState, setExcludedState] = useState<{
    plan: DirectoryScanPlan | null;
    keys: Set<string>;
  }>({ plan: null, keys: new Set() });

  const excluded = excludedState.plan === plan ? excludedState.keys : EMPTY_KEYS;

  const proposals = useMemo(() => plan?.proposals ?? [], [plan]);
  const chosen = useMemo(
    () => proposals.filter((proposal) => !excluded.has(directoryEmailKey(proposal.candidate.personEmail))),
    [proposals, excluded],
  );

  const toggle = (email: string): void => {
    const key = directoryEmailKey(email);
    const keys = new Set(excluded);
    if (keys.has(key)) keys.delete(key);
    else keys.add(key);
    setExcludedState({ plan, keys });
  };

  const busy = scanning || applying;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Scan evaluation submissions</DialogTitle>
      <DialogContent dividers>
        {scanning && (
          <Stack sx={{ gap: 1.5, py: 2 }}>
            <Typography sx={{ fontSize: "0.845rem", color: editorial.muted }}>
              {scanningLabel ? `Reading "${scanningLabel}"...` : "Looking for forms set to add their submitters..."}
            </Typography>
            <LinearProgress />
          </Stack>
        )}

        {!scanning && plan && (
          <Stack sx={{ gap: 2 }}>
            <Typography sx={{ fontSize: "0.875rem", color: editorial.ink }}>
              {describeScanPlan(plan)}
            </Typography>

            {plan.formsFailed.length > 0 && (
              <Alert severity="warning">
                <AlertTitle>
                  {plan.formsFailed.length === 1
                    ? "One form could not be read"
                    : `${plan.formsFailed.length} forms could not be read`}
                </AlertTitle>
                Everything else was still scanned.
                <Box component="ul" sx={{ m: "0.5rem 0 0", pl: 2.5 }}>
                  {plan.formsFailed.map((failure) => (
                    <li key={failure.formTitle}>
                      <strong>{failure.formTitle}</strong> — {failure.reason}
                    </li>
                  ))}
                </Box>
              </Alert>
            )}

            {plan.unkeyable > 0 && (
              <Alert severity="info">
                {plan.unkeyable === 1
                  ? "One submission named nobody this could identify"
                  : `${plan.unkeyable} submissions named nobody this could identify`}
                {" — no email address, and no name to build one from. Check the form's field mapping "}
                {"under Approval routing in the form builder."}
              </Alert>
            )}

            {proposals.length > 0 && (
              <>
                <Box sx={{ overflowX: "auto" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox" />
                        <TableCell sx={{ fontWeight: 700 }}>Person</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Department</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Approved by</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>From</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {proposals.map((proposal) => {
                        const key = directoryEmailKey(proposal.candidate.personEmail);
                        return (
                          <TableRow key={key} hover>
                            <TableCell padding="checkbox">
                              <Checkbox
                                size="small"
                                checked={!excluded.has(key)}
                                onChange={() => toggle(proposal.candidate.personEmail)}
                                disabled={applying}
                                slotProps={{ input: { "aria-label": `Add ${proposal.candidate.personEmail}` } }}
                              />
                            </TableCell>
                            <TableCell>
                              <Typography sx={{ fontSize: "0.845rem", fontWeight: 700, color: editorial.ink }}>
                                {proposal.candidate.personName || proposal.candidate.personEmail}
                              </Typography>
                              {proposal.candidate.position && (
                                <Typography sx={{ fontSize: "0.72rem", color: editorial.muted }}>
                                  {proposal.candidate.position}
                                </Typography>
                              )}
                              <Stack direction="row" sx={{ alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                                <Typography sx={{ fontSize: "0.72rem", color: editorial.softMuted }}>
                                  {proposal.candidate.personEmail}
                                  {proposal.candidate.employeeId ? ` - ${proposal.candidate.employeeId}` : ""}
                                </Typography>
                                {proposal.candidate.emailWasGuessed && (
                                  <Chip
                                    size="small"
                                    label="address guessed"
                                    sx={{
                                      height: 18,
                                      fontSize: "0.66rem",
                                      fontWeight: 700,
                                      color: editorial.error,
                                      backgroundColor: "#FBE9E9",
                                    }}
                                  />
                                )}
                              </Stack>
                            </TableCell>
                            <TableCell sx={{ fontSize: "0.78rem" }}>
                              {proposal.candidate.department || "-"}
                              {proposal.candidate.company && (
                                <Typography sx={{ fontSize: "0.72rem", color: editorial.softMuted }}>
                                  {proposal.candidate.company}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell sx={{ fontSize: "0.78rem" }}>
                              {proposal.approverEmail || (
                                <em style={{ color: editorial.softMuted }}>no HOD listed</em>
                              )}
                            </TableCell>
                            <TableCell sx={{ fontSize: "0.72rem", color: editorial.softMuted }}>
                              {proposal.formTitle}
                              {proposal.seenCount > 1 ? ` (${proposal.seenCount} submissions)` : ""}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Box>

                <Typography sx={{ fontSize: "0.78rem", color: editorial.muted }}>
                  Everyone added arrives <strong>unconfirmed</strong>, so nothing routes on these guesses until
                  you have checked the row.
                </Typography>
              </>
            )}

            {applying && progress && (
              <Stack sx={{ gap: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={progress.total === 0 ? 0 : (progress.done / progress.total) * 100}
                />
                <Typography sx={{ fontSize: "0.78rem", color: editorial.muted }}>
                  Added {progress.done} of {progress.total}.
                </Typography>
              </Stack>
            )}

            {progress && progress.failures.length > 0 && (
              <Alert severity="error">
                <AlertTitle>
                  {progress.failures.length === 1 ? "One row failed" : `${progress.failures.length} rows failed`}
                </AlertTitle>
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {progress.failures.map((failure) => <li key={failure}>{failure}</li>)}
                </Box>
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy} sx={{ textTransform: "none" }}>Close</Button>
        <Button
          variant="contained"
          onClick={() => onApply(chosen)}
          disabled={busy || chosen.length === 0}
          sx={{ textTransform: "none", fontWeight: 700 }}
        >
          {applying
            ? "Adding..."
            : `Add ${chosen.length} ${chosen.length === 1 ? "person" : "people"}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
