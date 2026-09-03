# AGENTS.md — src/components/builder/

**Scope:** Custom drag-drop form builder (Form Builder Superuser-only). Never used SurveyJS Creator; it now emits SurveyJSON as a storage format only, and previews with the `src/native/` engine.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| Main builder UI | `FormBuilder.tsx` | Two-pane workspace: palette (2 tabs) + WYSIWYG form sheet + properties dock. Deferred tool panels open via the `toolCommand` prop raised by the shell's Tools / Preview menus. |
| Workspace chrome & tokens | `BuilderShell.css`, `builderTheme.ts` | All `--bx-*` tokens and `bx-` classes, scoped under `.bx-root`. Inter (one family, matching SI and the rest of the app), radius 8/12, `--bx-line-field` on every control edge. |
| Field-type icons | `BuilderIcons.tsx` | One thin-stroke inline SVG per type (`<Icon>` / `<FieldIcon>`), replacing the emoji values in `QUESTION_TYPES`. |
| Palette taxonomy | `paletteTaxonomy.ts` | Re-buckets the 40 engine types into Basic/Advanced × 4 sections; also declares how each type renders in the sheet. Display-only — `createQuestion` still gets the untouched engine definition. |
| Form list sidebar | `FormLibrary.tsx` | **Unused by `/admin/builder`** since the redesign — the form switcher dropdown in the brand header replaced it. Still exported from `index.ts`. |
| Version history | `VersionHistory.tsx` | Web Form Versions list, restore prior version |
| Audit log | `AuditLog.tsx` | Form Builder Log entries with diff view |
| Layer sequence editor | `LayerConfigPanel.tsx` | Full layer sequence: type toggle, auth mode, assignee, evaluation elements |
| Layer card | `LayerCard.tsx` | Single layer card with type badge, auth icon, move controls |
| Evaluation element picker | `EvalElementPicker.tsx` | Field type grid for evaluation layer form config |
| Public link display | `PublicLinkDisplay.tsx` | Copyable public URL with token regeneration |
| Evaluation summary | `EvaluationSummary.tsx` | Read-only display of completed evaluation results |
| Submission workflow overrides | `ApprovalDashboard.tsx` | Superuser-only per-item reassignment metadata in `WorkflowAssignmentData`; `L{n}_Email` remains authoritative |
| Approver input (legacy) | `ApproverRow.tsx` | User search + assignee input with static/field-reference modes |
| Response viewer | `ResponseViewer.tsx` | Route `/admin/responses/:formTitle`. Renders submissions with SurveyJS read-only, matrix data, PDF generation. ~567 lines. |
| Publish overlay | `ProvisionOverlay.tsx` | SharePoint list provisioning status spinner |
| Test run launcher | `TestRunLauncher.tsx` | Mints a signed test ticket (`mint-test-ticket` action on `submit-form.ts`), lets the tester pick the redirect address, and opens the public form with it. |
| Test run panel | `TestRunPanel.tsx` | Lists a form's `IsTest` response rows and each run's pass/fail checklist from `TestRunLog`, ending in a PDF rendered client-side (`@react-pdf/renderer` has no server equivalent). Deletion re-checks `IsTest` server-side; this panel's own filter is a display convenience, not the security boundary. Note: a **signed-in** test submission never calls `api/submit-form.ts` — the browser writes the response row directly, then calls the `stamp-test-run` action, which verifies the ticket server-side and stamps `IsTest`/`TestEmail`. Test mode is never asserted by the client. |
| Barrel exports | `index.ts` | Only barrel export in the entire app |
| Colors | `constants.ts` | `C` color object — inline styles, NOT MUI theme |

## Builder Architecture
```
AdminFormBuilder.tsx (page — route: /admin/builder, requires HR Forms Owner + superuser)
  ├── brand header (form switcher dropdown, status chips, save state)
  ├── mode rail: Builder | Workflow | Settings | Publish + Tools / Preview menus
  ├── FormBuilder.tsx (Builder mode — react-dnd drag-drop; stays mounted, hidden in other modes)
  │     ├── Palette (2 tabs × 4 sections, search)
  │     ├── FormSheet (WYSIWYG rows on a paper sheet, hover row tools)
  │     ├── PropertyPanel (.bx-propdock — mounted only while a field is selected)
  │     ├── JsonPreview (bottom drawer, opened from Tools → Survey JSON)
  │     └── LivePreviewModal (device chrome + banner)
  │           └── NativePreviewBody (src/native engine — what a published form uses)
  ├── LayerConfigPanel (Workflow mode, full width — unchanged in function)
  │     ├── LayerCard[] (per-layer config)
  │     ├── EvalElementPicker (for evaluation layers)
  │     └── PublicLinkDisplay (for public layers)
  ├── VersionHistory (side panel — Web Form Versions SP list)
  ├── AuditLog (side panel — Form Builder Log SP list)
  ├── ApproverRow[] (used within LayerConfigPanel for static assignee input)
  └── ProvisionOverlay (publish status spinner)
```

## Conventions
- **Styling**: Inline styles via `C` object — no MUI components, no CSS modules
- **State**: Local `useState` only — no context or external store
- **Barrel exports**: `index.ts` re-exports all builder components; import from `components/builder`

## Live preview
- Draws with the **native engine** (`src/native/`) by default; the header toggle switches to
  SurveyJS. Keep the toggle: published forms are still served by SurveyJS, so an author
  needs to be able to see what respondents will actually get. See `src/native/AGENTS.md`.
- Both bodies share one `dataRef` of typed answers, so switching engines — and switching
  device — keeps the filled-in state. Closing the modal discards it, as it always has.
- Device widths are 1180 / 500 / 340. The engine's layout is driven by `@container`
  queries, so those widths produce the real desktop / tablet / phone layouts regardless of
  the author's monitor. Changing them changes what "desktop" means — 760 was too narrow and
  showed the stacked layout.

## Form Builder Features
- **Layer System**: Forms have a unified layer sequence. Each layer is either `approval` (approve/reject with signature or checkbox) or `evaluation` (custom SurveyJS fields, confirm action). Stored as `LayerConfig` JSON in Master Form.
- **Layer assignee modes** (`renderAssigneeEditor` in `LayerConfigPanel.tsx`): Fixed user · Several people · Distribution list · Form field email · Department HOD. "Several people" and "Distribution list" both mean **any one of them completes the layer**. `MultiUserAssigneeEditor` and the notify field share `EmailChipInput`.
- **Notify also** (`NotificationRecipientsEditor`): mailboxes that receive the layer email but cannot act. The "send only to these mailboxes" checkbox sets `notifyRecipientMode: "notify-only"` — the shared-mailbox case, where the decision still belongs to the assignee. Clearing the last mailbox resets the mode so the notification can never be routed nowhere.
- See the "Layer Assignees" section in the root `AGENTS.md` for the response columns and the `Group.Read.All` requirement.
- **SP Choice Source**: Choice fields (dropdown, radiogroup, checkbox, buttongroup) can pull values from existing SharePoint list columns via `spChoicesSource` property. Toggle "Manual" / "SharePoint List" in Options tab.
- **"Other" (own answer)**: Choice fields have a "Let people enter their own answer" toggle in Options → `hasOther`, with an optional `otherText` label. Works with manual and SP-sourced choices. Publishing sets `FillInChoice` on the SharePoint column (and repairs it on columns that already exist), and `foldOtherAnswers` in `src/utils/surveyOtherAnswers.ts` collapses SurveyJS's `"other"` + `{name}-Comment` pair into the typed answer on submit — without it the `-Comment` key fails column resolution and the whole submission is rejected.
- **Matrix Column Editor**: `dynamicmatrix` fields have a per-column editor in Options tab — set cell type (text/dropdown/date/number/checkbox/boolean), manual choices, or SP choice source per column.
- **Signature field**: `signaturepad` is drawn by the native engine's own signature control. Click to open a dialog → sign → save. Image stored as base64, uploaded to the `Signature Images` doc library on submit.
- **Logo Setter**: Banner logo URL configurable in the form meta sidebar; defaults to `/logo-128.png`.
- **Form Title Toggle**: "Show form title" toggle in Form Settings controls SurveyJS title visibility (sets `titleLocation: "hidden"`). Title is centered via CSS when visible.
- **Public Layer Tokens**: Publish flow generates UUID tokens for public layers via `crypto.randomUUID()`. Each token grants access to exactly one layer.

## Anti-Patterns
- `FormBuilder.tsx` has `eslint-disable` and `any[]` usage — fix when touching
- `useMemo`/`useCallback` used extensively — unnecessary in React 19; remove when refactoring
