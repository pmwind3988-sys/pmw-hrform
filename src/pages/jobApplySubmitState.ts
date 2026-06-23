interface SubmitDisabledState {
  submitting: boolean;
  alreadyApplied: boolean;
  adminOverrideMode: boolean;
}

export function isJobApplicationSubmitDisabled({
  submitting,
  alreadyApplied,
  adminOverrideMode,
}: SubmitDisabledState): boolean {
  return submitting || (alreadyApplied && !adminOverrideMode);
}
