# Handoff: PMW-HRForm admin/builder layout redesign

## Overview

A re-layout of the **Form Builder superuser screen** (`/admin/builder`, rendered by
`src/pages/AdminFormBuilder.tsx` + `src/components/builder/FormBuilder.tsx`).

Goal, in the user's words: *organized, user-friendly, not overcrowded, reactive, simple enough
not showing too much at once, easy to navigate — **without changing any function***.

Every capability of today's builder is preserved. Nothing was removed; things were **moved,
grouped, or deferred behind disclosure**. The redesign replaces the current five-simultaneous-column
workspace (Forms library · palette · canvas · property panel · settings sidebar, plus an
11-button horizontally-scrolling toolbar and a JSON drawer) with:

1. a thin brand header,
2. one dark **mode nav bar** (Builder · Workflow · Settings · Publish),
3. **two panes maximum** at a time, and
4. a **WYSIWYG form sheet** in the centre instead of abstract field-summary cards.

## About the design files

`Builder Redesign.dc.html` in this bundle is a **design reference written as HTML** — a working
prototype of the intended layout, structure and interaction. It is **not production code to
copy**. The task is to recreate it inside the existing pmw-hrform environment (React 19 +
TypeScript + Vite, inline styles via the `C` object in
`src/components/builder/constants.ts`, plus `FormBuilder.css`) using that codebase's established
patterns — MUI icons where the repo already uses them, `useState` local state, no new
dependencies.

Open the prototype in a browser to try it: mode switching, palette → add field, field selection,
properties panel, disclosures, Tools menu, form switcher, preview modal all work.

## Fidelity

**High-fidelity.** Final colours, typography, spacing, and interaction states. Recreate
pixel-closely, but map the tokens to whatever the app finally standardises on (see
"Design tokens", and the note about the existing `C` palette).

---

## Screens / views

The screen is one page with four modes. Chrome (header + nav) is constant; only the work area changes.

### Constant chrome

**Brand header** — height `56px`, background `--color-neutral-100` (`#f5f5f8`),
`border-bottom: 1px solid --color-divider`, padding `0 20px`, `display:flex; align-items:center; gap:14px`.

| Element | Spec |
|---|---|
| App mark | 30×30 square, solid `--color-accent-800` (`#2c455d`), 17px white document glyph inside |
| Product name | "PMW Forms", `--font-heading` (Barlow Condensed) 600, 22px |
| Divider | 1×24px `--color-divider` |
| Form switcher | button h36, `1.5px solid --color-divider`, hover border `--color-accent-800`; label = current form title in Barlow Condensed 600 / 20px, `white-space:nowrap; max-width:250px; overflow:hidden; text-overflow:ellipsis`; 13px chevron at 60% opacity. Click opens a 330px dropdown (see below) |
| Status chips | `Admin` (`.tag-outline`), `v{version}` (`.tag-neutral`), `Draft` (`.tag-accent`) — 11px, `flex:none`, `white-space:nowrap`. The v/Draft chips carry class `chip-sec`, hidden under 1180px |
| Spacer | `flex:1; min-width:0` |
| Save state | 8px dot + text, 13.5px, `flex:none; white-space:nowrap`. `"All changes saved"` with dot `--color-accent`; `"Saving…"` with dot `--color-neutral-500`. Set on every mutation, clears after 900ms |

**Form-library dropdown** (replaces today's permanent 215px `FormLibrary` rail) —
absolute, `top:40px; left:0; width:330px`, `1.5px solid --color-accent-800`, `--shadow-lg`,
`animation: fadeUp .12s`. Header strip: `--color-accent-100` background,
`2px solid --color-accent-800` bottom border, eyebrow "FORM LIBRARY" + primary "New form" button
(h30). Rows: 11px/14px padding, hover `--color-accent-100`, title Barlow Condensed 600 17px,
meta row = FormID (12.5px tabular) · v{version} · state tag; two trailing icon buttons —
**delete** (keeps submissions) and **delete-all** (irreversible), same two actions as
`FormLibrary.tsx` today.

**Mode nav bar** — height `52px`, background `--color-accent-900` (`#1d2d3d`),
text `--color-accent-100`, `display:flex; align-items:stretch`.

| Item | Spec |
|---|---|
| Home | 56px square button, background `color-mix(in srgb,#f2f2f3 10%,transparent)`, 19px home glyph → dashboard |
| `Builder` / `Workflow` / `Settings` / `Publish` | class `.navitem`: full height, padding `0 22px`, Barlow Condensed 600 17px, `letter-spacing:.04em`, `color:--color-accent-200`, `white-space:nowrap`; 17px icon + label. Hover: bg `color-mix(#f2f2f3 12%)`, colour `#fff`. Active (`.on`): bg `--color-accent`, colour `--color-bg`. Transition `background .14s, color .14s` |
| Spacer | `flex:1` |
| Mode hint | 13.5px `--color-accent-300`, class `nav-hint` — display set **by CSS class, not inline** so `@media (max-width:1080px){.nav-hint{display:none!important}}` can hide it. Copy per mode: `Fields, labels and layout` / `Who approves or evaluates, and in what order` / `Identity, route and access` / `Review, then make it live` |
| `Tools` | h36, transparent, `1.5px solid color-mix(#f2f2f3 32%)`, opens the tools menu |
| `Preview` | same outline style |
| `Access form ↗` | h36, solid `--color-accent`, text `--color-bg`, hover `--color-accent-600` |

All three right-hand buttons: `flex:none; white-space:nowrap` (they wrap and clip otherwise).

**Tools menu** — this is where the **11 toolbar toggles** from `FormBuilder.tsx` go
(they currently sit in a horizontally-scrolling strip with chevron arrows). Absolute,
`top:46px; right:8px; width:310px`, `1.5px solid --color-accent-800`, `--shadow-lg`, three
labelled groups, rows 14.5px with a 12.5px right-aligned hint, hover `--color-accent-100`:

- **Content** — Field templates · Translations (i18n) · Field comments · Theme editor
- **Data** — Data sources · Integrations · Export · Provisioning preview · Survey JSON
- **Governance** — Field permissions · Submission settings

Each row opens the panel that button opens today. `Live Preview` and the device-preview
segmented control move to the nav's `Preview` button; the JSON drawer becomes the
"Survey JSON" row.

---

### 1. Builder (default)

Layout: `position:relative; flex:1; display:flex` — palette | form sheet | (properties overlay).

**Palette** (`.palette`, width `300px`, ≤1240px → `250px`), background `--color-neutral-100`,
`border-right:1px solid --color-divider`, column flex:

- **Two tabs**, height 52px: `Basic Fields` | `Advanced`, Barlow Condensed 600 17px,
  active = `border-bottom:3px solid --color-accent-800` + colour `--color-accent-800`;
  inactive colour `--color-neutral-700`. A 1px vertical divider (inset 12px) between them.
- **Search input** `.input` h36, 12px/14px padding box. Typing flattens both tabs into one
  "Results" group; no matches → `No field types match that search.`
- **Grouped grid**, scrollable, padding `14px 14px 30px`. Each group: eyebrow label
  (Barlow Condensed 600, 11.5px, `letter-spacing:.16em`, uppercase, `--color-accent-800`)
  followed by a 1px rule that fills the remaining width, then the grid, `margin-bottom:18px`.
  - Grid class `.palette-grid`: `grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px`;
    `@media (max-width:1240px)` → single column (at 250px two columns truncate labels).
  - Buttons: `min-width:0`, `display:flex; gap:9px; padding:9px 10px`, background `--color-bg`,
    `1.5px solid --color-divider`, `cursor:grab`, label 14px with
    `min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis`,
    18px icon at `stroke-width:1.5`, `stroke:--color-accent-700`.
    Hover: border `--color-accent-800`, background `--color-accent-100`.
  - Groups: **Basic** = Text (Single Line, Multi Line, Password, NRIC / IC) · Choice (Dropdown,
    Radio, Checkbox, Yes / No, Consent) · Date & time (Date, Date-Time, Duration) ·
    Numeric (Number, Currency, Counter, Slider, Rating, Formula).
    **Advanced** = Rich input (File Upload, Image Upload, Signature, Ranking, Hierarchy,
    JSON Editor) · Tables (Dynamic Matrix, Table Input, Data Table) · Structure (Section,
    Columns, Repeater, Spacer, Divider, Page Break) · Display (HTML Block, Image, Alert,
    Video, Countdown, Scorecard, Chart).
    These are the same 40 `QUESTION_TYPES` as `src/utils/FormBuilderEngine.ts`, just
    re-bucketed from its nine `TYPE_GROUPS` into 4 + 4 so one tab is never longer than a screen.

**Form sheet** (centre) — scroller with background `--color-surface` (`#e9e9ea`),
padding `28px 28px 60px`, `overflow-x:hidden`. Sheet: `max-width:840px; margin:0 auto`,
background `--color-neutral-100`, `1px solid --color-divider`, `--shadow-sm`.

- **Sheet header**: padding `26px 34px`, bottom hairline. Optional ISO line (12px,
  `letter-spacing:.16em`, uppercase, `--color-neutral-600`) when the banner toggle is on;
  the form **title is an inline borderless input** (Barlow Condensed 600, 34px) — editing the
  title happens here, not in a sidebar; below it a 13.5px meta line
  `{FormID or "No form ID"} · v{version} · /form/{slug}`.
- **Field rows** (`.fieldrow`): padding `20px 34px`, bottom hairline,
  `border-left:5px solid transparent`, `cursor:pointer`. Selected row →
  left border `--color-accent-800`, background `--color-accent-100`.
  - Label line: 17px type icon (`stroke:--color-accent-700`) + label 16px/600 (+ ` *` when
    required), `padding-right:150px` to clear the tools.
  - **Row tools** absolute `top:12px; right:16px`, `opacity:0`, `.fieldrow:hover` → `1`,
    `transition:opacity .12s`: move up · move down · duplicate · delete, each a `.ghost`
    button (30×30, `--color-bg`, `1.5px solid --color-divider`; hover border+colour
    `--color-accent-800`).
  - **The control renders WYSIWYG** (`.wys`: full width, `min-height:40px`,
    `1.5px solid --color-divider`, background `--color-bg`, `8px 12px`, 15px,
    `--color-neutral-600`):
    text-ish → single box; `comment`/`jsoneditor`/`html` → `min-height:92px`;
    choice types → stacked rows with a 17px box (`border-radius:50%` for dropdown/radio/hierarchy,
    square for checkbox/consent/ranking) + option text; `boolean` → two 7px/20px outlined
    Yes / No chips; block types (signature, file, image upload, matrices, table, chart, video,
    repeater, panel, columns) → dashed `min-height:110px` placeholder labelled `{type} area`;
    `divider`/`spacer`/`pagebreak` → a 2px `--color-neutral-400` rule.
- **Empty state**: `2px dashed --color-accent-400` on `color-mix(--color-accent 5%)`,
  padding `56px 24px`, 38px plus-in-square glyph, `h3` 30px "Drag a field here", 16px/400
  explanation, and four quick-add secondary buttons (first four Basic types).
- **Footer** (once fields exist): `display:flex; justify-content:space-between; flex-wrap:wrap`
  — a primary `Submit` button (h44, 17px) and `{n} fields · drop a field anywhere to insert`.

**Properties panel** (`.propdock`, `width:330px`) — **mounted only while a field is selected**,
`animation: slideIn .16s`. Header bar: h52, `--color-accent-100`,
`border-bottom:2px solid --color-accent-800`, eyebrow "FIELD PROPERTIES" + `.ghost` close.
Body scrolls, padding `18px 16px 36px`:

- Type badge card: 32px solid `--color-accent-800` square with the white type icon, type label
  (Barlow Condensed 600 18px) and field name (12.5px tabular `--color-accent-800`), on
  `--color-accent-100` with a `1.5px --color-accent-300` border.
- Fields: Question label · Field name · Placeholder / hint (`.input` h38), then a `Required field`
  checkbox row (15px, `accent-color:--color-accent`) above a hairline.
- **`Advanced` disclosure** (Barlow Condensed 600 17px + rotating chevron) containing three
  cards — **Conditional logic**, **Validation**, **Options & data source** — each with a 17px
  title, 13.5px/400 description and a secondary action button. These map to today's
  `PropertyPanel` tabs `logic`, `validation`, `options`; they are collapsed by default, which is
  the single biggest de-crowding win in the whole redesign.
- `@media (max-width:1240px)` the panel becomes an **overlay**:
  `position:absolute; right:0; top:0; bottom:0; z-index:40; box-shadow:var(--shadow-lg)` — so the
  form sheet never gets squeezed on a laptop.

### 2. Workflow

Single centred column (`max-width:720px`) on `--color-surface`, padding `34px 28px 60px`:
eyebrow "WORKFLOW", `h2` 40px "Approval & evaluation layers", 16px/400 lede.

- Empty state: dashed accent box, `h3` 26px "No layers yet" + explanation that submissions file
  straight to SharePoint.
- **Layer rows**: `--color-neutral-100`, `1.5px solid --color-divider`,
  `border-left:6px solid --color-neutral-400` (selected → `--color-accent-800` for both),
  padding `17px 19px`, `margin-bottom:12px`. Contents: 44px solid `--color-accent-800` number
  plate (Barlow Condensed 600 23px, `--color-bg`), title (Barlow Condensed 600 20px) + type tag
  (`.tag-accent`, 11px uppercase), a 13.5px detail line
  `{Microsoft 365|Public link} · {assignee|"no assignee"} · {signature|checkbox}`, then
  `.ghost` up / down / delete.
- `+ Approval layer` / `+ Evaluation layer` secondary buttons (h40).
- Selected layer opens the same `.propdock` panel: Layer title · Layer type (`.seg` Approval /
  Evaluation) · Authentication (`.seg` Microsoft 365 / Public link) · Assignee · Confirmation
  (`.seg` Signature / Checkbox) · "Require a reason on rejection" checkbox · and, for evaluation
  layers only, an "Evaluation fields" card with a `Choose fields` button
  (today's `EvalElementPicker`).

This is `LayerConfigPanel` + `LayerCard` + `ApproverRow` unchanged in function — just given the
full width instead of a 300px sidebar.

### 3. Settings

Centred `max-width:720px` column, eyebrow "SETTINGS", `h2` 40px "Form setup".

- **Always-visible card** (`--color-neutral-100`, 1px border, padding `22px 24px`):
  Form title * · Form ID / Doc no. * + Version (`grid-template-columns:1fr 120px`) ·
  Route slug (`.input` h40) with a 13.5px note —
  `Public route: /form/{slug} — locked after first publish` in `--color-accent-700`, or
  `Filled from the title; edit before publishing` in `--color-neutral-600`. Slug is auto-derived
  from the title (`slugify`) until the user edits it, exactly as today.
- **Three disclosures**, each a bordered card with a 16px/22px header row
  (Barlow Condensed 600 20px + a 13.5px right-aligned summary + rotating chevron):
  - **Branding & banner** (summary `Banner on|off`) — ISO standards, Companies (one per line),
    Logo URL, plus toggles "Show header banner" and "Required company selector".
  - **Document control header** (summary = doc no. or Form ID or `Defaults`) — Document number,
    Issue number, Effective date, Revision number, Revision date.
  - **Access** (summary `Public|Private`) — "Public — any Microsoft 365 user" toggle.

### 4. Publish

Centred `max-width:720px`, eyebrow "PUBLISH", `h2` 40px "Make it live".

- **Readiness card** — eyebrow "READINESS" then five rows (10px vertical padding, hairline
  between): Form title · Form ID / document no. · Route slug · Fields on the form ·
  Workflow layers. Each row: 22px square status box — `✓` with `1.5px` border and colour
  `--color-accent-700` when satisfied, `–` in `--color-neutral-500` when not — label 15px,
  value 13.5px tabular.
- **One primary action**: `Publish to /form/{slug}` (h50, 18px, `.btn-primary`) beside a
  `Save draft` secondary (h50, 16px), then a 13.5px caveat: *Makes this version the default
  public route. Nothing else on this screen changes what is live.*
- **Five disclosures** (same card pattern, with a 13.5px sub-line under each title), each row
  inside being `{label / hint} … {value} [action button]`:
  - **Publish profile** — "Same version, separate workflow — advanced": Profile label (Rename),
    Publish key (Edit), Save profile only (Save), Publish new profile (Create).
  - **PDF layout** — Custom PDF layout (Configure), Sections (Edit), Sample PDF (Generate).
  - **Versions & profiles** — Published profiles (Open) → today's `VersionHistory`.
  - **Audit log** — Log entries (Open) → today's `AuditLog`.
  - **Prefilled QR codes** — Prefilled link (Build) → today's `PrefilledQrPanel`.

Rationale: today all four publish paths (Save Draft, Publish New Profile, Save Profile Only,
Actual Publish) are four adjacent full-width buttons, which is the reported source of confusion.
Only the live publish stays primary; the other three move under "Publish profile".

---

## Interactions & behaviour

- **Mode switching** — `mode: "build" | "flow" | "settings" | "publish"`; work area fades in
  (`fadeIn .16s`). Adding a field from the palette also forces `mode:"build"`.
- **Add field** — click (or drag) a palette button → append `{id, type, typeLabel, code(icon),
  label: "{Type} {n}", name: "{type}_{n}", hint:"", required:false}`, select it, open the
  properties panel.
- **Select / deselect** — click a field row selects; the panel's close button clears; deleting the
  selected field clears the selection.
- **Reorder / duplicate / delete** — per-row tools; duplicate appends `{name}_copy` / `{label} copy`.
- **Save indicator** — any mutation sets `saved:false` and schedules `saved:true` after 900ms
  (stand-in for the real save call).
- **Toast** — bottom-right, `--color-accent-900` background, 8px accent dot + 14.5px text,
  `fadeUp .16s`, auto-dismiss 2600ms. Used for stubbed actions in the prototype; wire to the
  existing `showToast`.
- **Escape** closes the tools menu, the form switcher and the preview modal.
- **Preview modal** — `.dialog-backdrop` + `.dialog` (`width:min(760px,100%)`, `max-height:84vh`),
  renders the sheet read-only.
- **Responsive** — `≤1240px`: palette 250px + single-column grid, properties panel becomes an
  overlay. `≤1180px`: secondary header chips hide. `≤1080px`: mode hint hides. Everything
  keeps `flex:none` + `white-space:nowrap` on chrome so nothing clips; hint text hides rather
  than ellipsising to a fragment.
- **Transitions** — `fadeUp .12–.16s`, `fadeIn .16s`, `slideIn .16s` (panel), `.14s` colour/border
  on hover, `.12s` opacity on row tools. Respect `prefers-reduced-motion` as
  `AdminFormBuilder.tsx` already does.

## State management

Local `useState` only (matches the existing convention — no context, no store):

```ts
mode: "build" | "flow" | "settings" | "publish"
paletteTab: "basic" | "advanced"
search: string
fields: BuilderField[]            // existing FormBuilder field model
sel: number | null                // selected field id
layers: LayerConfigItem[]         // existing LayerConfig model
layerSel: number | null
open: Record<DisclosureKey, boolean>   // branding, doc, access, profile, pdf, versions, log, qr
advOpen: boolean                  // field Advanced disclosure
toolsOpen / switcherOpen / previewOpen: boolean
meta: { title, formId, version, slug, iso, companies, logoUrl, banner, companyChoice,
        access, publishKey, publishLabel, docNo, issueNo, effDate, revNo, revDate }
saved: boolean
toast: string | null
```

No data-fetching changes: keep `getAllFormConfigs`, `getFormVersion`, `upsertFormConfig`,
`saveFormVersion`, `provisionFormList`, `logEvent`, `getFormLog`, `getFormVersionHistory` and
the MSAL/SharePoint token flow exactly as they are. This is a layout change only.

## Design tokens

From `industry-tokens.css` in this bundle (the design system the redesign was built on).
The current builder uses `C` in `src/components/builder/constants.ts` (Microsoft-blue
`#0078D4` on `#F6F9FC`); if you'd rather keep that palette, map role-for-role and keep the
**structure** — the layout, not the hue, is the deliverable.

| Role | Value | `C` equivalent today |
|---|---|---|
| Ground | `--color-bg` `#f2f2f3` | `offWhite #F6F9FC` |
| Sunken ground (sheet desk) | `--color-surface` `#e9e9ea` | — |
| Panel / card | `--color-neutral-100` `#f5f5f8` | `white #ffffff` |
| Ink | `--color-text` `#1d1f20` | `textPrimary #1A1F2B` |
| Accent | `--color-accent` `#5980a6` | `purple #0078D4` |
| Accent ramp | `100 #eef6ff` · `200 #d6ebff` · `300 #b5d9fd` · `400 #94bce3` · `600 #597ea3` · `700 #416180` · `800 #2c455d` · `900 #1d2d3d` | `purplePale/Mid/Light/Dark` |
| Neutral ramp | `100 #f5f5f8` · `300 #d4d4d7` · `400 #b7b7ba` · `500 #98989b` · `600 #7a7a7d` · `700 #5d5d60` · `800 #424244` · `900 #2b2b2d` | `border/borderLight/textSecond/textMuted` |
| Divider | `color-mix(in srgb, #1d1f20 16%, transparent)` | `border #D6DCE5` |
| Radius | **0 everywhere** (square, wireframe) | 6–10px today |
| Shadows | `sm 0 1px 2px`, `md 0 3px 10px`, `lg 0 12px 32px` of `#2b2b2d` at 14/16/22% | `C.shadow`, `C.shadowMd` |
| Spacing | `3.4 / 6.8 / 10.2 / 13.6 / 20.4 / 27.2px` | ad-hoc |

**Typography** — headings `Barlow Condensed` 600, body `Barlow` 400/500/600.
Base body 15px / 1.55 / weight 500. Scale in use: 40px `h2` page titles · 34px sheet title ·
30px empty-state · 20–23px card and section titles · 17px nav items and palette labels ·
16px field labels · 15px body and inputs · 13.5px hints and meta · 13px uppercase field labels
(600, `letter-spacing:.02em`) · 11.5–13px eyebrows (600, `letter-spacing:.16em`, uppercase).
Focus ring everywhere: `2px solid var(--color-accent)`, `outline-offset:2px`.

## Assets

- **Icons**: 40 field-type icons + chrome icons are hand-authored inline SVG symbols in one
  sprite at the top of the prototype (`#ic-text`, `#ic-para`, `#ic-lock`, `#ic-idcard`,
  `#ic-chevbox`, `#ic-radio`, `#ic-check`, `#ic-toggle`, `#ic-filecheck`, `#ic-calendar`,
  `#ic-clock`, `#ic-timer`, `#ic-hash`, `#ic-money`, `#ic-plusminus`, `#ic-slider`, `#ic-star`,
  `#ic-fx`, `#ic-upload`, `#ic-image`, `#ic-pen`, `#ic-ordered`, `#ic-tree`, `#ic-braces`,
  `#ic-grid`, `#ic-table`, `#ic-section`, `#ic-columns`, `#ic-repeat`, `#ic-spacer`, `#ic-minus`,
  `#ic-pagebreak`, `#ic-code`, `#ic-alert`, `#ic-video`, `#ic-hourglass`, `#ic-gauge`,
  `#ic-chart`), all 24×24, `fill:none`, `stroke:currentColor`, `stroke-width:1.5`,
  round caps/joins. They follow the Lucide idiom — in the app, substitute the real
  [Lucide](https://lucide.dev) icons at stroke-width 1.5, or keep the MUI icon set already
  imported in `AdminFormBuilder.tsx` (`Description`, `Layers`, `History`, `ReceiptLong`,
  `RocketLaunch`, `Save`, …) sized 17–18px. The important part is **one icon per field type,
  thin stroke, in the accent colour** — replacing today's emoji `icon` values in
  `QUESTION_TYPES`.
- **Logo**: the prototype draws a placeholder mark; use `/logo-128.png` / `public/logo-*.png`.
- No images or fonts beyond Barlow / Barlow Condensed (Google Fonts, loaded by
  `industry-tokens.css`).

## Where the current functionality lands

| Today | After |
|---|---|
| `FormLibrary` 215px left rail | Form-switcher dropdown in the header (same new / delete / delete-all) |
| `FormBuilder` `fb-palette-panel` + search + 10 group chips | Palette with **2 tabs** and 4 grouped sections per tab |
| `fb-canvas-panel` field cards | **WYSIWYG form sheet** (real controls, hover row tools) |
| `fb-property-panel-side` (3rd column, sideways scroll arrows) | `.propdock` panel, mounted on selection; Logic / Validation / Options behind **Advanced** |
| 11-button scrolling toolbar + JSON drawer | **Tools** menu (Content / Data / Governance) + Preview button |
| `sidebarTab: "meta"` | **Settings** mode |
| `sidebarTab: "layers"` (`LayerConfigPanel`) | **Workflow** mode, full width |
| `sidebarTab: "pdf"` | Publish → "PDF layout" disclosure |
| `sidebarTab: "version"` (`VersionHistory`) | Publish → "Versions & profiles" disclosure |
| `sidebarTab: "log"` (`AuditLog`) | Publish → "Audit log" disclosure |
| `sidebarTab: "publish"` + 4 stacked buttons + `PrefilledQrPanel` | **Publish** mode: readiness checklist, one primary action, profile/QR disclosures |
| Header Save Draft / Actual Publish | `Save draft` in Publish; `Access form ↗` + `Publish` primary in the nav |

Nothing in `src/utils/` changes. `ProvisionOverlay`, `ResponseViewer`, `ApprovalDashboard`,
`DepartmentDirectoryPanel`, `EvaluationSummary`, `ReadOnlySubmissionPreview` are untouched.

## Files

- `Builder Redesign.dc.html` — the design reference (open in a browser; it is interactive).
- `industry-tokens.css` — the token + component stylesheet it is built on (`--color-*`,
  `--font-*`, `--space-*`, `--shadow-*`, `.btn`, `.input`, `.field`, `.seg`, `.tag`, `.card`,
  `.dialog`, `.blueprint`).

Source files in the repo this redesign covers:
`src/pages/AdminFormBuilder.tsx`, `src/components/builder/FormBuilder.tsx`,
`src/components/builder/FormBuilder.css`, `src/components/builder/FormLibrary.tsx`,
`src/components/builder/LayerConfigPanel.tsx`, `src/components/builder/LayerCard.tsx`,
`src/components/builder/VersionHistory.tsx`, `src/components/builder/AuditLog.tsx`,
`src/components/builder/PrefilledQrPanel.tsx`, `src/components/builder/constants.ts`,
`src/utils/FormBuilderEngine.ts` (field-type metadata / icons only).
