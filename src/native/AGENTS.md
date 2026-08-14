# AGENTS.md — src/native/

**Scope:** A form renderer that reads published SurveyJSON and draws it without SurveyJS.

**Status: parallel, not a replacement.** `/form/:formId` (`DynamicFormPage`) still runs
SurveyJS and is still the only route that submits anything. Nothing in this folder is
imported by it. This exists to answer one question — does a purpose-built renderer read
better than a themed SurveyJS — and it is evaluated at `/native/:formId`.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| Published JSON → element model | `schema.ts` | `parseForm()`. 39 builder types → 16 SurveyJS types → 14 `NativeKind`s. Pure. |
| `visibleIf` / `enableIf` / formulas | `expression.ts` | `evaluateCondition()`, `evaluateFormula()`. Pure. Reuses `safeEvalArithmetic` from `FormBuilderEngine`. |
| Answers, visibility, validation, pages | `useNativeForm.ts` | One hook, one `values` object. Returns `NativeFormRuntime`. |
| The controls | `fields.tsx` | One component per kind. Classes only — no inline styles. |
| Layout, sections, rail, page nav | `NativeForm.tsx` | Default export `NativeFormView`. |
| The entire visual system | `native-form.css` | Tokens under `.nf`, dark under `.nf[data-theme="dark"]`. |
| Sample form for `/native/demo` | `demoForm.ts` | Not a fixture; no test asserts against it. |
| Host page | `../pages/NativeFormPreviewPage.tsx` | Route `/native/:formId`, public. Read-only. |

## Commands
```bash
npx vitest run src/native      # 50 tests across schema.test.ts + expression.test.ts
```
Visual check without a backend or a tenant:
```bash
npm run dev
```
then `/native/demo`, and `/native/demo?engine=surveyjs` for the same JSON under SurveyJS.
`?theme=dark` on either.

## Design rules the CSS enforces
Breaking one of these is what makes a form look untidy, so they are worth restating:
- **One type scale.** Labels 12.5px/600, controls 13.5px, help 11.5px. Nothing else.
- **One radius, one hairline, one shadow.** Depth carries no meaning here.
- **Rhythm belongs to the field block, not the control.** Every field occupies the same
  vertical slot whether it holds an input, a chip row or a table.
- **No component styles itself.** If a control needs a new value, it becomes a token.

## Gotchas

### The engine is a *renderer*, not a form system
It has no opinion about SharePoint, approval layers, PDFs or notifications. `collect()`
returns a value bag; what happens next is the host page's problem. Keep it that way — the
moment it knows about `L{n}_Email` it stops being swappable.

### `collect()` must keep matching SurveyJS's output shape
The SharePoint column mapping rejects a payload carrying a key it has no column for, so:
- **Hidden answers are dropped on collect, not on hide.** Same as SurveyJS's default
  `clearInvisibleValues: "onComplete"`. Switching away from a branch and back must not
  lose what was typed, but a branch hidden at submit time contributes nothing.
- **"Other" answers stay split.** The question holds the literal `"other"` and
  `{name}-Comment` holds the typed text, so `foldOtherAnswers()` works unchanged.
- **Numbers are coerced at the edge**, in `collect()`, not on each keystroke — `"12."` is a
  legal half-typed number and coercing early eats the decimal point.

### `"other"` can collide with a real choice
`showOtherItem` appends an item whose value is the string `"other"`, and published forms
exist whose own choice list already contains `other` (an "Other provider" entry, say).
`buildOptions()` in `fields.tsx` de-duplicates, and the author's choice wins. Do not go
back to pushing the pseudo-option unconditionally — it produced duplicate React keys and
two rows that were indistinguishable once selected.

### Unparsed conditions show the field
`evaluateCondition()` returns `undefined` — not `false` — for anything outside the
supported subset, and every caller treats that as "no rule". A rule nobody can parse must
never hide a question the respondent was meant to answer.

### Formulas are derived, never stored
They are recomputed from `values` on every render and folded in by `collect()`. The
SurveyJS path wrote results back on a `setTimeout`, which meant a submission in the same
tick could carry a stale total. Two evaluation passes, so "subtotal → grand total" chains
resolve; deeper chains do not appear in any published form and an unbounded fixpoint loop
would risk a cycle.

### `startWithNewLine` is the layout model
Published forms carry no column count. `toRows()` in `NativeForm.tsx` groups consecutive
elements with `startWithNewLine: false` into one row; tables, repeaters and nested panels
always take a row alone regardless, because an author sets the flag on the field *before*
the one it affects and cannot see what follows.

### CSP blocks `new Function()`
Same constraint as the rest of the app. `expression.ts` reuses `safeEvalArithmetic` rather
than growing a second evaluator — do not reach for `eval` or `Function` here.

## What is not implemented
Deliberate omissions, all of which the SurveyJS path handles and the preview route does not:
- **Submission.** The preview validates and prints the payload it would have sent.
- **SharePoint choice enrichment** for signed-in users — the preview reads
  `/api/form-config`, which resolves choices server-side, so `spChoicesSource` fields work
  on the public path only.
- **Prefilled QR links, the company selector, and version pinning beyond `?v=`.**
- **Cross-field validations and `logicRules`** — `validators` and `visibleIf`/`enableIf`
  are read; the builder's richer rule objects are not.

Promoting this past a preview means wiring `NativeFormView` into `DynamicFormPage` behind a
flag, not reimplementing the submit path here.
