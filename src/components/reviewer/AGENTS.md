# AGENTS.md — src/components/reviewer/

**Scope:** Presentational pieces for the approver / evaluator page (`src/pages/EvaluationPage.tsx`, routes `/eval/*` and `/approval/*`). No data fetching, no API calls: the page owns all behaviour and passes props in.

| File | Role |
|------|------|
| `reviewerTokens.ts` | The one place for the reviewer palette and font stack, copied from the approved prototype. **Not** `theme/editorial` — this is a deliberately separate look. Never inline a hex elsewhere. |
| `reviewerTheme.ts` | Shared button styles, `CARD_SHADOW` and `REVIEWER_CSS` (focus ring, spinner, overlay, mobile rules). Re-exports `R`. |
| `ReviewerStyles.tsx` | Mounts `REVIEWER_CSS`; every reviewer screen renders it once. Root elements carry `className="rv-page"`. |
| `ReviewerHeader.tsx` | Logo + "HR Form" + reference. |
| `StepCards.tsx` | One filled box per layer: done / current (navy) / upcoming / rejected (red tint). |
| `CollapsiblePanel.tsx` | Navy `panel` and light `group` collapsible blocks (`aria-expanded`). |
| `DecisionCard.tsx` | Navy-titled card the reviewer acts in. |
| `SignatureField.tsx` | Tap-to-sign box → `SignatureModal` (`src/utils/signatureCapture.tsx`, now takes `title` / `saveLabel`); shows a Locked tag and "Unlock & redraw". |
| `SignOffBlock.tsx` | "Approved by / Evaluated by", right-aligned above the buttons. The signature line is drawn **only** when a signature exists. |
| `StatusScreens.tsx` | Loading, dead-end cards (load error, wrong account), sign-in required, success, and the blocking submitting overlay. |

## Rules
- Keep these components behaviour-free. Decision logic, validation, access checks and API calls stay in `EvaluationPage.tsx`.
- Inter is already loaded app-wide (`src/index.css`) and the font hosts are allowed in both CSPs (`vercel.json` and `index.html`); adding another font family means editing both.
- "Note to file" from the prototype is not built: the decision API has no note field.
