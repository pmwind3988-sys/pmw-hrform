# PDF template editor

Status: approved design, not yet implemented
Date: 2026-09-14

## The problem

The PDF produced after a submission is not a document anyone can change. It is
drawn from scratch on every submission by `FormPdfDocument.tsx`, following one
fixed house layout: document-control header, title, submission details, answers
table, approval chain, signatures, footer.

What an admin can influence is a short list of switches on `PdfConfig`
(`src/types/index.ts`): title, header logo, footer text, primary and secondary
colour, density, per-field display labels, and whether the submission date,
approver chain, evaluation details, signatures and status badge appear.

Nothing else. No font, no size, no margins, no section order, no free text, no
company-specific wording, no extra clauses. Forms that need a different document
— a different preamble, a declaration paragraph, a rearranged page — cannot have
one without a code change.

## What a template is

An ordered list of **blocks**. Each block has a type, its own settings, and its
own style (font, size, weight, colour, alignment, spacing, background, borders).

A template belongs to one form and lives in `FormBuilderMeta` beside
`pdfConfig`. That placement is deliberate: form meta is snapshotted into every
published version, so a template is version-pinned for free, and reprinting an
old submission reproduces the document as it stood when that submission was
made. No new storage, no new SharePoint list, no migration.

A form with no template keeps today's PDF unchanged.

## Block types

**Smart blocks** draw themselves from the submission. They are the six pieces of
today's layout:

| Block | Draws |
|---|---|
| `documentHeader` | Document-control header (number, issue, effective date, revision) |
| `title` | Document title and description |
| `submissionMeta` | Submitted by, submitted at, reference number, status badge |
| `answers` | The answers table, one row per form field |
| `approvals` | The approval/evaluation chain, one entry per layer |
| `signatures` | Signature images and signed-at stamps |

**Content blocks** are authored by the admin: `text` (rich text with inline
variables), `table` (static rows and columns, cells may contain variables),
`image`, `divider`, `spacer`, `pageBreak`.

Every block can be reordered, deleted, and restyled. Smart blocks additionally
carry their own settings (for example, which columns the answers table shows).

## Decisions taken

| Question | Decision |
|---|---|
| Default content | The editor opens pre-filled with today's layout as the six smart blocks in today's order |
| Fidelity of that default | Guaranteed by construction: smart blocks call the same section renderers the current PDF uses |
| Editing granularity | Smart blocks are configured, not typed into — until unlocked |
| Editor surface | Custom block editor with a formatting toolbar. No new rich-text library |
| Formatting offered | Only formatting the PDF engine can genuinely reproduce |
| Rendering engine | The existing `@react-pdf/renderer`. No HTML, no headless browser |
| Variable identity | Fields are referenced by internal name, not label |
| Versioning | Inherited from form meta snapshots |
| Forms without a template | Byte-for-byte unchanged |

## Unlocking a smart block

An admin who needs control that a smart block's settings do not offer can unlock
it.
The block is replaced by content blocks carrying the structure it had at that
moment — the labels and rows of the form as it then stood, with variables
preserved where a cell maps to a field.

It stops following the form. If a question is added later, an unlocked answers
table will not show it. The UI states this before unlocking and marks the
resulting blocks as hand-maintained. Unlocking is one-way; re-adding the smart
block is how you go back.

## Variables

A variable is a reference to a value, written into text and table cells. In the
editor it renders as a labelled chip (`[Employee Name]`); in the PDF it becomes
the value.

The catalogue offered to the admin covers:

- every field on the form, listed by its current label
- submitter name and email, submission date and time
- reference number, submission status, form title, form version
- company, ISO standards
- per approval layer: approver name, email, decision, signed-at, rejection reason

Resolution rules:

- A variable whose field no longer exists resolves to empty, or to the
  admin's per-variable fallback text if one was set.
- Values are formatted through the existing `pdfFieldFormatting` helpers, so a
  date or a choice list looks the same inside a paragraph as it does in the
  answers table.
- The editor shows a warnings list naming every variable that no longer resolves,
  so breakage is found at edit time rather than on a submission.

## Rendering

`FormPdfDocument` gains one branch at the top: a form with a template renders
its blocks in order; a form without one renders exactly as today.

To make the two paths share code rather than mirror it, the section renderers
currently inline in `FormPdfDocument.tsx` (770 lines) are extracted into
per-section components. Each smart block is then a thin wrapper over the same
component the legacy path uses. This is the mechanism that keeps the pre-filled
default honest — there is no second implementation to drift.

This is the only refactor in scope. The file is well past a comfortable size and
the split is required by the feature, not adjacent to it.

## Failure handling

| Case | Behaviour |
|---|---|
| A template throws while rendering | Fall back to the built-in layout, record the reason. A broken template must never cost a submission its PDF |
| Unrecognised block type | Skipped, rest of the document renders |
| Variable resolves to nothing | Empty string, or the block's fallback text |
| Image URL unreachable | Block renders empty, document continues |
| Template absent or malformed JSON | Treated as no template |

## Module layout

New, each with one purpose:

- `src/utils/pdfTemplate/types.ts` — block and template types
- `src/utils/pdfTemplate/defaultTemplate.ts` — builds the six-block default
- `src/utils/pdfTemplate/variables.ts` — catalogue and resolution
- `src/utils/pdfTemplate/renderBlocks.tsx` — blocks to `@react-pdf` primitives
- `src/utils/pdfTemplate/unlock.ts` — smart block to content blocks
- `src/utils/pdfSections/*.tsx` — the extracted section renderers
- `src/components/builder/pdfEditor/` — editor shell, block list, block settings
  rail, formatting toolbar, variable picker, live preview

Changed: `FormPdfDocument.tsx` (branch plus extraction), `src/types/index.ts`
(template type on `FormBuilderMeta`), `AdminFormBuilder.tsx` (an **Edit
document** button in the existing PDF layout panel).

## Testing

- **Equivalence.** A form carrying the default template produces the same
  document as a form carrying no template. This is the guard on the whole
  design; it fails the moment the two paths diverge.
- Variable resolution: present, missing, renamed, fallback text, each value type.
- Default template builder: correct blocks, correct order, `pdfConfig` switches
  honoured.
- Each block type renders without throwing, for empty and populated data.
- Unlock produces content blocks matching the smart block's current structure.
- Failure paths: throwing block, unknown block type, malformed template.

Following the existing patterns in `src/utils/generateFormPdf.test.ts`.

## Out of scope

Deliberately excluded, each a later feature if wanted:

- Sharing one template across several forms
- Conditional blocks ("hide unless rejected")
- Per-page running headers and footers beyond today's
- Importing or exporting a template as a file
