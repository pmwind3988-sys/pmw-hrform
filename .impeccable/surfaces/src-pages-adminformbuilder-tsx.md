---
version: 1
slug: "src-pages-adminformbuilder-tsx"
primary_target: "src/pages/AdminFormBuilder.tsx"
related_targets: ["src/components/builder/FormBuilder.tsx"]
---

# Surface brief — /admin/builder

## Scope

`src/pages/AdminFormBuilder.tsx` and the builder workspace it hosts
(`src/components/builder/FormBuilder.tsx`). Visitor mode: **Operate**.

## Audience & task

Form Builder Superusers — a handful of HR/QA admins — building and republishing
SharePoint-backed forms. They return to the same form repeatedly, so density and
recall matter more than onboarding. Nothing about the SharePoint, MSAL, publish
or provisioning behaviour may change; this surface owns layout only.

## Direction

Implemented from `design_handoff_builder_redesign/`. The builder is a controlled
document, not a dashboard: a thin brand header, one dark mode rail
(Builder · Workflow · Settings · Publish), **two panes at most**, and a WYSIWYG
form sheet in the centre instead of abstract field-summary cards.

- **Own world:** radius 0 everywhere, hairline dividers, Barlow Condensed 600
  headings on Barlow body, paper-grey desk (`--bx-surface`) under a
  `--bx-panel` sheet, PMW blue reserved for state and action, navy rail.
- **Memorable moment:** the properties dock is *mounted only while a field is
  selected* and slides in; logic, validation and options sit folded behind one
  **Advanced** disclosure. That is the de-crowding win the redesign exists for.
- Tokens live in `builderTheme.ts` (TS) and `BuilderShell.css` (`--bx-*`), all
  scoped under `.bx-root` so no other route inherits the condensed type.

## Deliberate deviations from the handoff

- **Palette hue** kept PMW blue rather than the handoff's slate `#5980a6`, per
  PRODUCT.md's logo-led brand commitment; the ramp maps role-for-role.
- **Neutral text** darkened one step from the handoff (`#667181` / `#4E5866`)
  so meta and placeholder copy clears 4.5:1 — the handoff's `#7a7a7d` does not.
- **Properties dock carries four Advanced cards, not three.** The engine has
  type-specific settings, default value and layout toggles that the prototype's
  toy field model has no equivalent for; they became a "Field settings" card.
- **Tools menu carries twelve rows, not eleven.** "Form display" holds the
  SurveyJS display options that used to be the property column's empty state,
  which the mounted-on-selection dock would otherwise strand.
- **Workflow column is 900px, not 720px.** `LayerConfigPanel` is unchanged in
  function per the handoff and was built for a 300px sidebar; it needs the room.

## Boundaries

Panels reached through Tools keep their existing modal presentation — the
redesign moved their entry point, not their internals. Panels that sit *inline*
on the new surfaces (`LayerConfigPanel`, `VersionHistory`, `AuditLog`,
`PrefilledQrPanel`) are wrapped in `.bx-legacy`, which strips their rounded
corners so they do not seam against the square world.

## Unresolved

Not yet seen on the real route with real SharePoint data — verification was
DOM/computed-style only, against an unauthenticated local render.
