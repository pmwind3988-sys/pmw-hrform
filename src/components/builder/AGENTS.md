# AGENTS.md — src/components/builder/

**Scope:** Custom drag-drop form builder (Form Builder Superuser-only). NOT SurveyJS Creator — bespoke UI over `survey-react-ui`.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| Main builder UI | `FormBuilder.tsx` | Two-pane workspace: palette (2 tabs) + WYSIWYG form sheet + properties dock. Deferred tool panels open via the `toolCommand` prop raised by the shell's Tools / Preview menus. |
| Workspace chrome & tokens | `BuilderShell.css`, `builderTheme.ts` | All `--bx-*` tokens and `bx-` classes, scoped under `.bx-root`. Public Sans (one family), radius 6/10/14, `--bx-line-field` on every control edge. |
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
  │     └── LivePreviewModal (survey-react-ui renderer)
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

## Form Builder Features
- **Layer System**: Forms have a unified layer sequence. Each layer is either `approval` (approve/reject with signature or checkbox) or `evaluation` (custom SurveyJS fields, confirm action). Stored as `LayerConfig` JSON in Master Form.
- **SP Choice Source**: Choice fields (dropdown, radiogroup, checkbox, buttongroup) can pull values from existing SharePoint list columns via `spChoicesSource` property. Toggle "Manual" / "SharePoint List" in Options tab.
- **Matrix Column Editor**: `dynamicmatrix` fields have a per-column editor in Options tab — set cell type (text/dropdown/date/number/checkbox/boolean), manual choices, or SP choice source per column.
- **Signature Widget**: `signaturepad` uses a custom modal-based widget (`src/utils/SignaturePad.tsx`) registered via `ReactQuestionFactory`. Click to open modal → sign → save/lock. Image stored as base64, uploaded to `Signature Images` doc library on submit.
- **Logo Setter**: Banner logo URL configurable in the form meta sidebar; defaults to `/logo-128.png`.
- **Form Title Toggle**: "Show form title" toggle in Form Settings controls SurveyJS title visibility (sets `titleLocation: "hidden"`). Title is centered via CSS when visible.
- **Public Layer Tokens**: Publish flow generates UUID tokens for public layers via `crypto.randomUUID()`. Each token grants access to exactly one layer.

## Anti-Patterns
- `FormBuilder.tsx` has `eslint-disable` and `any[]` usage — fix when touching
- `useMemo`/`useCallback` used extensively — unnecessary in React 19; remove when refactoring
