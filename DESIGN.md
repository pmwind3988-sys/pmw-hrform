# Design

Durable visual decisions for PMW HR Forms. PRODUCT.md owns product truth; this
file owns the system. Route-specific strategy lives in `.impeccable/surfaces/`.

The app has two visual worlds, deliberately:

- **The product surfaces** (career portal, job detail, application form, admin
  career screens) — MUI components, Inter, the `--pmw-*` tokens in
  `src/index.css`, rounded corners. Employee-facing.
- **The form builder** (`/admin/builder`) — its own world, scoped under
  `.bx-root`, described below. Superuser-facing tooling, not a product surface.

Everything below the first section is the builder world.

## Brand palette (both worlds)

From the PMW logo, per PRODUCT.md. Blue carries actions, links, focus and
active navigation; purple is a secondary/admin accent; yellow is a rare
attention accent, never the main signal.

| Role | Value |
|---|---|
| PMW blue | `#0078D4` |
| PMW blue dark | `#005A9E` |
| PMW purple | `#6264A7` |
| PMW sky / wash | `#BFDDF4` / `#EAF5FC` |
| Ink | `#101010` (product) · `#1A1F2B` (builder) |

## Builder world

**Thesis.** The builder authors controlled documents — forms with document
numbers, issue numbers, revisions and approval chains. So it is built from the
grammar of official form systems, not from dashboard cards, and not from the
square blueprint wireframe it replaced.

**Composition.** Brand header (56px) over a navy mode rail (52px). Below, two
panes at most: palette left, the real form sheet centred on a sunken desk,
properties docked right *only while a field is selected*. That mounted-on-
selection dock is the de-crowding move the whole layout exists for.

### Type

One family. Hierarchy is size, weight, colour and space — never width.

**Public Sans**, 400 / 600 / 700, scoped to `.bx-root`. Chosen because it is
the type system of the US Web Design System, engineered for dense government
forms — the same artifact this tool produces. It is a workhorse UI face with
open apertures and true tabular figures, which is what makes it legible at the
12–15px sizes this interface actually runs at.

Request only those three weights; 500 is not drawn anywhere.

| Role | Size / weight |
|---|---|
| Page title (`.bx-h2`) | 30 / 700 · `-0.02em` |
| Sheet title | 27 / 700 · `-0.021em` |
| Empty state, dialog title | 24 / 20 · 700 |
| Card & disclosure titles | 16.5 / 600 |
| Wordmark, switcher | 18 / 16 · 600–700 |
| Field label (sheet row) | 16 / 600 |
| Body, inputs | 15 / 400 |
| Nav items, palette tabs, buttons | 14–14.5 / 600 |
| Meta, hints, sub-lines | 13 / 400 |
| Eyebrows, tags | 10.5–11.5 / 600–700 uppercase |

Negative tracking on everything ≥15px; Public Sans sets loose by default.
Light-on-dark (the navy rail, the toast) takes slightly more leading and
positive tracking.

**Uppercase is for eyebrows and tags only.** Field labels are sentence case —
uppercase strips word shape, which is what lets a label be recognised without
being read, and this surface has a lot of labels.

### Geometry

Radius `6 / 10 / 14` + pill. Controls 6, cards and menus 10, sheet and dialogs
14. Tags and Yes/No chips are pills. Nothing is square.

`.bx-legacy` normalises the older panels' assorted radii onto the 6px control
value so they sit inside the system without a seam.

### Colour & line

`--bx-*` tokens in `BuilderShell.css`, mirrored in `builderTheme.ts` for inline
call sites — **change both together**.

Ground `#F2F4F7` · sunken desk `#E7EBF0` · panels and sheet `#F7F9FB` · control
fills white. Blue ramp `#EAF4FD → #0A3050`, accent `#0078D4`.

Two line weights, and they are not interchangeable:

- `--bx-divider` / `--bx-hairline` — separators. May be faint (0.11 / 0.06).
- `--bx-line-field` `#7f8794` — **every interactive control edge**. Clears
  WCAG 1.4.11's 3:1 on all four grounds it appears against (3.29–3.62:1). The
  old world used the divider token here and read 1.45:1.

### Depth

Shadows carry an offset and a soft blur, never a zero-offset halo. Two layers
each: a tight contact shadow plus a wide ambient one. `sm` on hover affordances,
`md` on the sheet, `lg` on menus, dropdowns, dialogs and the overlaid dock.

### Motion

`bx-fade-up` / `bx-fade-in` / `bx-slide-in` at 0.12–0.16s; 0.14s on colour and
border hover; 0.12s on row-tool opacity. `prefers-reduced-motion` collapses all
of it to 1ms. No scattered per-element effects beyond these.

### Accessibility

WCAG AA is the floor, verified on the render, not asserted:

- All text ≥4.5:1 (measured range 4.69–10.61:1).
- Control boundaries ≥3:1 via `--bx-line-field`.
- Focus ring `2px solid var(--bx-accent)`, offset 2px; it goes light
  (`--bx-a100`) on the navy rail and the toast, where blue only reaches 3:1.
- Selection state is fill **plus** a 3px bar — never colour alone.
- Icon-only controls carry `aria-label` **and** `title`. A label that hides at a
  breakpoint must have its name moved to `aria-label` first.

### Icon-only controls

Labels come off only where the icon is unambiguous to a non-technical user and
the control is a utility, not a destination:

- **Yes** — row tools (move, duplicate, delete), dialog close, the Tools wrench
  and Preview eye in the rail.
- **No** — the four mode tabs (Builder / Workflow / Settings / Publish); they
  are primary navigation on an Operate surface and keep icon + label.
- **No** — `Access form`, the rail's primary action. Two icon utilities beside
  one labelled button is what makes the labelled one read as primary.
