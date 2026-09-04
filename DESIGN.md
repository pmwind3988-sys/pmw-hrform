# Design

Durable visual decisions for PMW HR Forms. PRODUCT.md owns product truth; this
file owns the system. Route-specific strategy lives in `.impeccable/surfaces/`.

**One system, since the SI-CMMS overhaul.** This file used to describe two
visual worlds -- MUI-and-PMW-blue product surfaces, and a separate form-builder
world -- and a Public Sans decision the code had already moved away from. Both
are gone. Every surface, including the public careers portal and the form
builder, now draws from the SI design language, so PMW HR Forms and SI-CMMS read
as one family.

The builder keeps its own LAYOUT thesis (below), because that answers a
different problem: an authoring screen that was too crowded. It no longer keeps
its own palette or type.

## Palette

`src/theme/editorial.ts` is the source. `--pmw-*` in `src/index.css` mirrors it
for plain CSS, and `--bx-*` in `BuilderShell.css` mirrors `builderTheme.ts` for
the builder's inline call sites. **Each mirrored pair changes together.**

| Role | Value |
|---|---|
| Navy -- actions, links, focus, active nav | `#0F3D91` |
| Navy deep | `#0B2F70` |
| Navy mid -- the active-nav fill | `#1E4FA0` |
| Canvas | `#F6F8FB` |
| Ink / secondary / tertiary text | `#101828` / `#5A6880` / `#636F88` |
| Border | `#E5E9F0` |
| Amber accent -- fill / text / tint | `#F59E0B` / `#855405` / `#FDE7C4` |
| Success -- text / fill / tint | `#137536` / `#22C55E` / `#DCFCE7` |
| Error -- text / fill / tint | `#C1291F` / `#EF4444` / `#FEE2E2` |

PMW blue, PMW purple and the attention yellow are retired. The token NAMES
survive (`pmwBlue`, `pmwPurple`, `yellow`) because ~48 files import them, but
they resolve to navy, navy-mid and amber; each carries a comment saying so.

### The rule that matters: bare name is readable, `*Fill` is the bright chip

SI names its semantics after the fill and hangs the readable value off `.text`.
This codebase inverts that, deliberately, and `editorial.ts` explains why at
length: `editorial.success` was already a dark green used as TEXT at most of its
call sites, so adopting SI's polarity would have dropped every one of them to
2.28:1 under a diff that looked like a palette swap.

So: **bare name for words, `*Fill` for fills, dots, borders and icons.**

`palette.error.main` is the one place a fill is deliberately the readable value
rather than the bright one -- MUI paints contained buttons with `main` and writes
`contrastText` on top, and white on the bright red is 3.76:1. That would have
shipped on "Delete permanently".

### Contrast is tested, not asserted

`src/theme/paletteContrast.test.ts` measures every pair a real screen renders --
including each semantic colour inside its own tinted badge, which is the third
surface both past regressions hid in. It also pins two negative facts: white on
the bright red does NOT pass, and `navyDim` is not usable on white.

### Where literal colours are still allowed

Four places, each for a stated reason. Everywhere else a literal hex is a bug.

- `editorial.ts` and `builderTheme.ts` -- the token sources themselves.
- `dashboardBackgrounds.ts` -- a gallery of gradients is a list of literals.
- `META_PALETTES` in `spConfig.ts` -- eight distinguishable hues for colour-coding
  form categories. The one place carrying more than the semantic four, because
  here colour means only "not the same as its neighbour".
- The Microsoft logo squares, and `DynamicFormPage`'s dark palette.

## Shape, type and motion

12px on containers you act inside; 8px on nested controls; 5px on badges,
because a tag is not a box. ONE card elevation everywhere -- hierarchy comes
from size and position, never from a heavier shadow, which is why
`editorialShadowHover` is no longer heavier than `editorialShadow`. Focus is a
2px navy ring at 2px offset on every interactive element, with no exception for
quiet controls.

Inter, one family. `siType` in `editorial.ts` names the roles (21px page title
down to 11.5px uppercase micro) so a call site says what the text IS rather than
picking a number. Roles are spread inline (`sx={{ ...siType.cardTitle }}`)
because ~2000 call sites set fontSize inline and inline `sx` outranks the theme.

`.rise` is the entrance, 0.4s. `.si-navy` is the brand surface -- a 160deg navy
gradient under two slow-drifting amber and pale-blue highlights, shared by the
sidebar, the phone bottom bar and the builder's mode rail so those three cannot
drift into three different navies. All of it collapses under
`prefers-reduced-motion`.

## Navigation

Two levels, defined once in `src/config/navigation.ts`: five sidebar categories
(Dashboard, My Work, Internal Portal, Admin, Profile), each opening a strip of
tabs. `AppShell` draws it -- a sticky 224px navy column at >=1024px, a fixed
navy bottom bar below that, switched in CSS so there is no flash of the wrong
layout on first paint.

Two things about it are load-bearing:

- **Categories and tabs are derived FROM the path.** No route moved. Approval
  emails link to `/approval/:token` and printed QR codes point at
  `/form/:formId`; re-slugging a route to tidy the menu would break links in
  people's inboxes and on paper.
- **`visibleTo` mirrors the `AdminGuard` on each route.** A tab drawn for an
  account that cannot open it is a link that bounces to a restricted-access
  screen. Admin and Form-Builder-superuser are two independent SharePoint
  groups, not a hierarchy; the Admin category's visibility comes from whether
  any of its tabs survive filtering.

Screens WITHOUT the shell: the form-fill pages, the approval and evaluation
links, and the careers portal when the visitor is not signed in. They have no
sections to move between. `/career-portal` is the one route in both worlds and
resolves by auth state.

**The form builder is full bleed**, and is the only signed-in screen outside the
shell. It is a three-pane authoring surface, and inside the shell the pane that
surrendered the sidebar's 224px was the form sheet — the thing being authored.
It can afford to leave because it brings its own header, mode rail and home
button; no other screen does. Its rail carries the same `.si-navy` gradient as
the sidebar, so leaving the shell does not mean leaving the design.

## Builder world

**Thesis.** The builder authors controlled documents — forms with document
numbers, issue numbers, revisions and approval chains. So its LAYOUT is built
from the grammar of official form systems, not from dashboard cards, and not
from the square blueprint wireframe it replaced. Its palette and type are the
shared system's; only the composition below is its own.

**Composition.** Brand header (56px) over a navy mode rail (52px). Below, two
panes at most: palette left, the real form sheet centred on a sunken desk,
properties docked right *only while a field is selected*. That mounted-on-
selection dock is the de-crowding move the whole layout exists for.

### Type

One family. Hierarchy is size, weight, colour and space — never width.

**Inter**, the face the whole app shares, via `--pmw-font-main`. This section
used to specify Public Sans; the code had already moved to Inter before the
overhaul, and a design doc disagreeing with the code is worse than no design
doc, because the next reader trusts it.

The size table below is the builder's own, and it still runs denser than
`siType`: an authoring surface shows more at once than a dashboard does.

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

Ground `#F1F4F9` · sunken desk `#E4E9F1` · panels and sheet `#F8FAFC` · control
fills white. Navy ramp `#EAEFF9 → #071C45`, accent `#0F3D91`. The mode rail
carries `.si-navy`'s gradient rather than a flat fill, so the rail and the app
sidebar it now sits beside do not meet at a corner as two different navies.

Two line weights, and they are not interchangeable:

- `--bx-divider` / `--bx-hairline` — separators. May be faint (0.11 / 0.06).
- `--bx-line-field` `#7c8698` — **every interactive control edge**. Clears
  WCAG 1.4.11's 3:1 on the grounds it appears against (3.51:1 on the panel).
  The old world used the divider token here and read 1.45:1.

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
  (`--bx-a100`) on the navy rail and the toast, where navy has no contrast.
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
