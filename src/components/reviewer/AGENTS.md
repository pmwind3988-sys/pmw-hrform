# AGENTS.md — src/components/reviewer/

**Scope:** Presentational pieces for the approver / evaluator page (`src/pages/EvaluationPage.tsx`, routes `/eval/*` and `/approval/*`). No data fetching, no API calls: the page owns all behaviour and passes props in.

| File | Role |
|------|------|
| `reviewerTokens.ts` | The one place for the reviewer palette and font stack, copied from the approved prototype. **Not** `theme/editorial` — this is a deliberately separate look. Never inline a hex elsewhere. |
| `reviewerTheme.ts` | Shared button styles, `CARD_SHADOW` and `REVIEWER_CSS` (focus ring, spinner, overlay, mobile rules). Re-exports `R`. |
| `ReviewerStyles.tsx` | Mounts `REVIEWER_CSS`; every reviewer screen renders it once. Root elements carry `className="rv-page"`. |
| `ReviewerHeader.tsx` | Logo + "HR Form" + reference. |
| `StepCards.tsx` | One filled box per layer: done / current (navy) / upcoming / rejected (red tint). |
| `CollapsiblePanel.tsx` | Navy `panel` and light `group` collapsible blocks (`aria-expanded`, chevron rotates 180deg when open). `meta` is the dimmed count after the title ("· 19 answers"). |
| `DecisionCard.tsx` | `variant="bar"` (evaluations: navy bar, "n of N answered" on its right, questions flat on the page) or `"card"` (approvals: white card with a plain title). |
| `SignatureField.tsx` | Tap-to-sign box → `SignatureModal` (`src/utils/signatureCapture.tsx`, now takes `title` / `saveLabel`); shows a Locked tag and "Unlock & redraw". |
| `SignOffBlock.tsx` | "Approved by / Evaluated by", right-aligned above the buttons. The signature line is drawn **only** when a signature exists. |
| `StatusScreens.tsx` | Loading, dead-end cards (load error, wrong account), sign-in required, success, and the blocking submitting overlay. |

## Opt-in looks used by this page
- `ReadOnlySubmissionPreview variant="reviewer"` (`components/builder/`): answers as collapsible groups of `240px 1fr` label / value rows, ratings as "3 of 4 · Agree", dates as "22 Jun 2026, 18:00", pictures as thumbnails.
- `NativeFormView variant="reviewer"` + `legend` (`src/native/`): the evaluator's questions as quiet rows, no progress rail. Both are scoped, so DetailModal, ResponseViewer and the public form are unchanged.

## Rules
- Keep these components behaviour-free. Decision logic, validation, access checks and API calls stay in `EvaluationPage.tsx`.
- Inter is already loaded app-wide (`src/index.css`) and the font hosts are allowed in both CSPs (`vercel.json` and `index.html`); adding another font family means editing both.
- "Note to file" from the prototype is not built: the decision API has no note field.

## Paper approval sign-off (Training Needs Analysis, Training Requisition)
- On a form where `hasPaperApproval(title)` (`src/utils/paperPdf/paperForms.ts`), an approval step is signed as the Word form signs it: `src/components/paper/PaperApprovalSignOff.tsx` replaces the "I approve" checkbox and the sign-off block. The approver signs on the Signature line (required, whatever the step's `confirmationType`), under the caption the paper form gives that step (`paperApprovalLabels`: Requisition "Recommend by:" / "Recommend/Approve by:" / "Approve by:" by position in the branch; Needs Analysis "Approved by GHRH:").
- Name and position come locked from the directory; "Edit name and position" unlocks them and they are sent as `signOff`, which `api/evaluate.ts` stamps as `L{n}_ActedByName/Position`. The date is not editable: an approval keeps no written date of its own (only evaluations store `EvaluationData.signOff.date`).
- The submission above shows as its paper form with the steps signed before this one (`previousPaperLayers`; names and dates, no signature images), and after approving the finished paper form is shown under the success card.
