import { useEffect, useState, type ComponentType } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { CloseRounded as CloseIcon } from "@mui/icons-material";

import { editorial, si, siType } from "../../theme/editorial";
import type { ReviewQueueEntry } from "../../utils/reviewQueue";
import type { EmbeddedEvaluation } from "../../pages/EvaluationPage";

type EvaluationPageComponent = ComponentType<{ embedded?: EmbeddedEvaluation }>;

/**
 * Loaded on first open, the same way `App.tsx` loads route pages, so the list
 * page stays light and pages never import one another statically.
 */
let evaluationPagePromise: Promise<EvaluationPageComponent> | null = null;
function loadEvaluationPage(): Promise<EvaluationPageComponent> {
  evaluationPagePromise ??= import("../../pages/EvaluationPage").then((module) => module.default);
  return evaluationPagePromise;
}

/**
 * One evaluation or approval, opened in a window over Waiting for me.
 *
 * It is the same reviewer page as `/eval/...` and `/approval/...` — same
 * paper form, same confirm, same server checks — just not at its own address.
 *
 * Only the X closes it. A stray click outside, or Escape, would throw away a
 * half-filled evaluation with nothing to say so, so neither does anything; and
 * the X itself asks first while the decision is still unsent.
 */
export default function ReviewWindow({
  entry,
  onClose,
}: {
  entry: ReviewQueueEntry;
  /** `finished` is true when a decision was recorded in this window. */
  onClose: (finished: boolean) => void;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [Page, setPage] = useState<EvaluationPageComponent | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [finished, setFinished] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadEvaluationPage()
      .then((component) => { if (!cancelled) setPage(() => component); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, []);

  const requestClose = () => {
    if (finished || loadError) onClose(finished);
    else setConfirmClose(true);
  };

  const who = entry.applicantName || entry.submittedBy || `#${entry.responseItemId}`;
  const reference = entry.referenceNo ? `Ref ${entry.referenceNo}` : `#${entry.responseItemId}`;

  return (
    <Dialog
      open
      fullScreen={fullScreen}
      fullWidth
      maxWidth="lg"
      // No onClose: MUI closes a dialog on a backdrop click or Escape only by
      // calling it, so leaving it off is what makes the X the only way out.
      // The signing pad opens in a layer of its own outside this window; a
      // focus lock here would keep pulling focus away from it.
      disableEnforceFocus
      aria-labelledby="review-window-title"
      slotProps={{
        paper: {
          sx: fullScreen
            ? { backgroundColor: editorial.paper }
            : { height: "92vh", borderRadius: `${si.radiusSm}px`, overflow: "hidden", backgroundColor: editorial.paper },
        },
      }}
    >
      <DialogTitle
        id="review-window-title"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 2.5,
          py: 1.25,
          backgroundColor: editorial.panel,
          borderBottom: `1px solid ${editorial.border}`,
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography noWrap sx={{ ...siType.subsectionTitle, color: editorial.ink }}>
            {who}
          </Typography>
          <Typography noWrap sx={{ ...siType.subtext, color: editorial.muted }}>
            {entry.formTitle} · {reference} · {entry.layerType === "evaluation" ? "Evaluate" : "Approve"}
            {entry.layerTitle ? ` · ${entry.layerTitle}` : ""}
          </Typography>
        </Box>
        <IconButton aria-label="Close" onClick={requestClose} sx={{ width: 44, height: 44, color: editorial.ink }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, overflowY: "auto" }}>
        {loadError ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography sx={{ ...siType.data, color: editorial.error }}>
              This request could not be opened here. Close the window and try again.
            </Typography>
          </Box>
        ) : Page ? (
          <Page
            embedded={{
              formSlug: entry.formSlug,
              responseId: entry.responseItemId,
              layerNumber: entry.layerNumber,
              prefix: entry.layerType === "evaluation" ? "eval" : "approval",
              onFinished: () => setFinished(true),
              onClose: () => onClose(true),
            }}
          />
        ) : (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1.5, p: 6, color: editorial.muted }}>
            <CircularProgress size={20} />
            <Typography sx={siType.data}>Opening…</Typography>
          </Box>
        )}
      </DialogContent>

      <Dialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        aria-labelledby="review-window-confirm-title"
        slotProps={{ paper: { sx: { borderRadius: `${si.radiusSm}px` } } }}
      >
        <DialogTitle id="review-window-confirm-title" sx={{ ...siType.subsectionTitle, color: editorial.ink }}>
          Close without submitting?
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ ...siType.data, color: editorial.muted }}>
            Nothing has been sent yet. Anything you have filled in on this {entry.layerType === "evaluation" ? "evaluation" : "approval"} will be lost.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmClose(false)} sx={{ textTransform: "none", fontWeight: 700 }}>
            Keep working
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => { setConfirmClose(false); onClose(false); }}
            sx={{ textTransform: "none", fontWeight: 700, borderRadius: `${si.radius}px` }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
