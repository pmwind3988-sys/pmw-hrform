import { Box } from "@mui/material";
import { SUBMISSION_STATE_LABELS, type SubmissionState } from "../../utils/formSubmissionSummary";
import { SUBMISSION_STATE_COLORS } from "./sapTheme";

/** A small coloured square and the state's name — the label carries the meaning, the colour only helps scanning. */
export default function SapStatus({ state }: { state: SubmissionState }) {
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, whiteSpace: "nowrap" }}>
      <Box
        component="span"
        aria-hidden
        sx={{ width: 9, height: 9, borderRadius: "2px", backgroundColor: SUBMISSION_STATE_COLORS[state].fill, flexShrink: 0 }}
      />
      {SUBMISSION_STATE_LABELS[state]}
    </Box>
  );
}
