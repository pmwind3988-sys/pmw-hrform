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
or provisioning behaviour may change; this surface owns layout and rendition only.

## Direction

The builder is a controlled document, not a dashboard: thin brand header, one
dark mode rail (Builder · Workflow · Settings · Publish), **two panes at most**,
and a WYSIWYG form sheet in the centre instead of abstract field-summary cards.

The world is now the grammar of **official form systems** — see DESIGN.md for
the type ramp, geometry and line tokens. It replaced the square blueprint
wireframe (radius 0, Barlow Condensed) that the original
`design_handoff_builder_redesign/` bundle shipped. The composition, topology and
function carried over untouched; only the material rendition changed.

- **Memorable moment:** the properties dock is *mounted only while a field is
  selected* and slides in; logic, validation and options sit folded behind one
  **Advanced** disclosure.
- Tokens live in `builderTheme.ts` (TS) and `BuilderShell.css` (`--bx-*`), all
  scoped under `.bx-root` so no other route inherits this ramp.

## Deliberate deviations from the original handoff

- **Palette hue** kept PMW blue rather than the handoff's slate `#5980a6`, per
  PRODUCT.md's logo-led brand commitment; the ramp maps role-for-role.
- **Type replaced outright.** Barlow Condensed was load-bearing on 13–17px UI
  text with uppercase and wide tracking — the least legible combination
  available, and the reason the surface was reworked. Public Sans, one family.
- **Radius 0 abandoned.** The square wireframe read as dated-industrial rather
  than modern; 6/10/14 throughout.
- **Properties dock carries four Advanced cards, not three** — the engine has
  type-specific settings, default value and layout toggles the prototype's toy
  field model had no equivalent for.
- **Tools menu carries twelve rows, not eleven** — "Form display" holds the
  SurveyJS display options the mounted-on-selection dock would otherwise strand.
- **Workflow column is 900px, not 720px.** `LayerConfigPanel` is unchanged in
  function and was built for a 300px sidebar; it needs the room.

## Boundaries

Panels reached through Tools keep their existing modal presentation — the
redesign moved their entry point, not their internals. Panels that sit *inline*
(`LayerConfigPanel`, `VersionHistory`, `AuditLog`, `PrefilledQrPanel`) are
wrapped in `.bx-legacy`, which now normalises their radii onto the 6px control
value rather than flattening them to 0.

## Unresolved

- Still not seen on the real route with real SharePoint data. The app cannot
  boot without `VITE_AZURE_CLIENT_ID` / `VITE_AZURE_TENANT_ID` / `VITE_SP_SITE_URL`,
  so verification was a static harness against the real `BuilderShell.css`
  (1440 / 1100 / 800px) plus computed-style contrast measurement — not the
  authenticated builder with real forms, long titles or populated legacy panels.
- `.bx-legacy`'s radius normalisation is unverified against the actual legacy
  panels for the same reason.
