/**
 * PublicLinkRescanDialog.tsx — one-off: tie earlier public-link submissions to
 * the people in the directory.
 *
 * New public submissions are linked as they arrive. This covers the ones made
 * before that existed. It only ever fills in submissions nobody was linked to,
 * so it is safe to run again, and it never touches who submitted, who approves,
 * or what was emailed.
 */
import { useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Typography } from "@mui/material";
import { relinkPublicSubmissions, type RelinkSummary } from "../../utils/publicSubmissionLinkService";

interface Props {
  open: boolean;
  token: string | null;
  onClose: () => void;
}

export default function PublicLinkRescanDialog({ open, token, onClose }: Props) {
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<RelinkSummary | null>(null);
  const [error, setError] = useState("");

  const run = async () => {
    if (!token) return;
    setRunning(true);
    setError("");
    try {
      setSummary(await relinkPublicSubmissions(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The re-scan failed.");
    } finally {
      setRunning(false);
    }
  };

  const close = () => {
    if (running) return;
    setSummary(null);
    setError("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>Link earlier public submissions to people</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: "0.875rem", mb: 1.5 }}>
          Submissions made through a public link are saved without a person attached. This reads each one's staff
          number, name and email and links it to the matching person here, so they see it under My Submissions when
          they sign in. A person with no email is linked only when their staff number and name both match.
        </Typography>
        <Typography sx={{ fontSize: "0.875rem", mb: 1.5 }}>
          It does not change who submitted, who approves, or any email. Submissions it cannot name confidently are
          left alone, and running it again only looks at ones not linked yet.
        </Typography>
        {running && <LinearProgress sx={{ my: 2 }} />}
        {error && <Alert severity="error">{error}</Alert>}
        {summary && (
          <Alert severity={summary.incomplete || summary.skippedForms.length > 0 ? "warning" : "success"}>
            Checked {summary.submissionsChecked} public {summary.submissionsChecked === 1 ? "submission" : "submissions"}
            {" "}across {summary.formsScanned} {summary.formsScanned === 1 ? "form" : "forms"}: linked {summary.linked},
            left {summary.unmatched} unlinked.
            {summary.incomplete && " It ran out of time before reaching every form — run it again to continue."}
            {summary.skippedForms.length > 0 && ` Could not read or prepare: ${summary.skippedForms.join(", ")}.`}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={running} sx={{ textTransform: "none" }}>Close</Button>
        <Button onClick={run} disabled={running || !token} variant="contained" sx={{ textTransform: "none", fontWeight: 700 }}>
          {summary ? "Run again" : "Re-scan now"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
