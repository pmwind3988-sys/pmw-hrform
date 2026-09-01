/**
 * BuilderIcons.tsx — the builder's own icon grammar.
 *
 * One thin-stroke glyph per field type, plus the chrome glyphs the shell needs.
 * All 24×24, `fill:none`, `stroke:currentColor`, stroke-width 1.5, round caps —
 * so a glyph inherits colour from whatever it sits in and never fights the
 * square, hairline character of the workspace.
 *
 * These replace the emoji `icon` values carried by `QUESTION_TYPES`; the engine
 * metadata is untouched, only what the builder draws changes.
 */
import type { ReactElement } from "react";

const PATHS: Record<string, ReactElement> = {
  // ── field types ─────────────────────────────────────────────────────────
  text: <path d="M4 7V5h16v2M12 5v14M9 19h6" />,
  para: <path d="M4 6h16M4 11h16M4 16h10" />,
  lock: (
    <>
      <rect x="4" y="11" width="16" height="9" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  idcard: (
    <>
      <rect x="2" y="5" width="20" height="14" />
      <circle cx="8" cy="11" r="2.4" />
      <path d="M14 10h5M14 14h5" />
    </>
  ),
  chevbox: (
    <>
      <rect x="3" y="5" width="18" height="14" />
      <path d="m8 11 4 4 4-4" />
    </>
  ),
  radio: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
    </>
  ),
  check: (
    <>
      <rect x="3" y="3" width="18" height="18" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  toggle: (
    <>
      <rect x="2" y="7" width="20" height="10" rx="5" />
      <circle cx="8" cy="12" r="3" />
    </>
  ),
  filecheck: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5m-8 6 1.8 1.8L16 13" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  timer: (
    <>
      <path d="M10 2h4M12 9v4l3 2" />
      <circle cx="12" cy="13" r="8" />
    </>
  ),
  hash: <path d="M5 9h14M5 15h14M10 4 8 20M17 4l-2 16" />,
  money: <path d="M12 3v18M8 7h6a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h7" />,
  plusminus: <path d="M4 9h8M8 5v8M4 17h8M15 8l3 3 3-3" />,
  slider: (
    <>
      <path d="M4 8h16M4 16h16" />
      <circle cx="9" cy="8" r="2.5" />
      <circle cx="15" cy="16" r="2.5" />
    </>
  ),
  star: <path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.7 6.7 19.6l1.1-6L3.4 9.4l6-.8z" />,
  fx: <path d="M8 20V8a3 3 0 0 1 3-3h1M6 12h7M15 12l5 8M20 12l-5 8" />,
  upload: <path d="M12 16V4m-4 4 4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />,
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" />
      <circle cx="8.5" cy="9.5" r="1.8" />
      <path d="m4 18 5-5 4 4 3-3 4 4" />
    </>
  ),
  pen: <path d="M3 20h4L18 9a2.8 2.8 0 0 0-4-4L3 16z" />,
  ordered: <path d="M4 6h1v4M4 10h2M9 7h11M9 12h11M9 17h11M4 14h2l-2 3h2" />,
  tree: <path d="M6 4v12a2 2 0 0 0 2 2h3M6 4h5M13 10h6M13 18h6" />,
  braces: <path d="M8 4a3 3 0 0 0-3 3v3l-2 2 2 2v3a3 3 0 0 0 3 3M16 4a3 3 0 0 1 3 3v3l2 2-2 2v3a3 3 0 0 1-3 3" />,
  grid: (
    <>
      <rect x="3" y="4" width="18" height="16" />
      <path d="M3 10h18M9 10v10" />
    </>
  ),
  table: (
    <>
      <rect x="3" y="4" width="18" height="16" />
      <path d="M3 10h18M3 15h18M12 10v10" />
    </>
  ),
  section: (
    <>
      <rect x="3" y="4" width="18" height="16" />
      <path d="M3 9h18" />
    </>
  ),
  columns: (
    <>
      <rect x="3" y="4" width="18" height="16" />
      <path d="M12 4v16" />
    </>
  ),
  repeat: <path d="m17 2 4 4-4 4M21 6H8a4 4 0 0 0-4 4v1M7 22l-4-4 4-4M3 18h13a4 4 0 0 0 4-4v-1" />,
  spacer: <path d="M12 4v16M8 7l4-3 4 3M8 17l4 3 4-3" />,
  minus: <path d="M4 12h16" />,
  pagebreak: <path d="M6 3h12v6H6zM6 15h12v6H6zM3 12h18" />,
  code: <path d="m9 8-5 4 5 4m6-8 5 4-5 4" />,
  alert: <path d="M12 4l9 16H3zM12 10v4M12 17h.01" />,
  video: (
    <>
      <rect x="3" y="6" width="13" height="12" />
      <path d="m16 10 5-3v10l-5-3" />
    </>
  ),
  hourglass: <path d="M7 3h10M7 21h10M17 3c0 4-5 6-5 9s5 5 5 9M7 3c0 4 5 6 5 9s-5 5-5 9" />,
  gauge: <path d="M4 18a8 8 0 1 1 16 0M12 12l4-3" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M2 20h20" />,

  // ── chrome ──────────────────────────────────────────────────────────────
  doc: <path d="M5 3h14v18H5zM9 8h6M9 12h6M9 16h3" />,
  home: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />,
  blocks: <path d="M4 4h16v6H4zM4 14h9v6H4zM17 14h3v6h-3z" />,
  flow: <path d="M9 5h11M9 12h11M9 19h11M4 5h1M4 12h1M4 19h1" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M18.7 8.2a7.5 7.5 0 0 1 .9 2.2h1.9v3.2h-1.9a7.5 7.5 0 0 1-.9 2.2l1.3 1.3-2.3 2.3-1.3-1.3a7.5 7.5 0 0 1-2.2.9v1.9h-3.2v-1.9a7.5 7.5 0 0 1-2.2-.9l-1.3 1.3-2.3-2.3 1.3-1.3a7.5 7.5 0 0 1-.9-2.2H2.5v-3.2h1.9a7.5 7.5 0 0 1 .9-2.2L4 6.9l2.3-2.3 1.3 1.3a7.5 7.5 0 0 1 2.2-.9V3.1h3.2V5a7.5 7.5 0 0 1 2.2.9l1.3-1.3L20 6.9z" />
    </>
  ),
  rocket: <path d="M4.5 16.5 3 21l4.5-1.5M12 15l-3-3m10.5-7.5c1 4-1.5 8-6 11l-3-3c3-4.5 7-7 9-8Z" />,
  wrench: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />,
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  chevdown: <path d="m6 9 6 6 6-6" />,
  chevup: <path d="m18 15-6-6-6 6" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </>
  ),
  trash: <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />,
  trashall: <path d="M3 6h12M8 6V4h6v2M15 6l-1 14H5L4 6M18 9l4 4M22 9l-4 4" />,
  plusbox: (
    <>
      <rect x="3" y="3" width="18" height="18" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  tick: <path d="m5 12 5 5 9-11" />,
  warning: <path d="M12 4l9 16H3zM12 10v4M12 17h.01" />,
  undo: <path d="M4 8h11a5 5 0 0 1 0 10H8M4 8l4-4M4 8l4 4" />,
  redo: <path d="M20 8H9a5 5 0 0 0 0 10h7M20 8l-4-4M20 8l-4 4" />,
  layers: <path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5" />,
  history: <path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 7v5l4 2" />,
  save: (
    <>
      <path d="M4 4h12l4 4v12H4z" />
      <path d="M8 4v6h7M8 20v-6h8v6" />
    </>
  ),
  qr: (
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <path d="M14 14h3v3h-3zM20 14v3M14 20h7" />
    </>
  ),
  drag: <path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" />,
};

export type BuilderIconName = keyof typeof PATHS | string;

export function Icon({
  name,
  size = 18,
  strokeWidth = 1.5,
  style,
  className,
}: {
  name: BuilderIconName;
  size?: number;
  strokeWidth?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  const body = PATHS[name] ?? PATHS.text;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
    >
      {body}
    </svg>
  );
}

/** field type → glyph id. Falls back to the generic text glyph. */
export const TYPE_GLYPH: Record<string, string> = {
  text: "text",
  comment: "para",
  password: "lock",
  nric: "idcard",
  dropdown: "chevbox",
  radiogroup: "radio",
  checkbox: "check",
  boolean: "toggle",
  consent: "filecheck",
  date: "calendar",
  datetime: "clock",
  duration: "timer",
  number: "hash",
  currency: "money",
  counter: "plusminus",
  slider: "slider",
  rating: "star",
  formula: "fx",
  file: "upload",
  imageupload: "image",
  signaturepad: "pen",
  jsoneditor: "braces",
  dynamicmatrix: "grid",
  tableinput: "table",
  datatable: "table",
  panel: "section",
  columns: "columns",
  repeater: "repeat",
  spacer: "spacer",
  divider: "minus",
  pagebreak: "pagebreak",
  html: "code",
  image: "image",
  alert: "alert",
  videoembed: "video",
  countdown: "hourglass",
  scorecard: "gauge",
  chartdisplay: "chart",
  // engine aliases that can appear on loaded forms
  email: "text",
  url: "text",
  tel: "text",
};

export function FieldIcon({ type, size = 17, style }: { type: string; size?: number; style?: React.CSSProperties }) {
  return <Icon name={TYPE_GLYPH[type] || "text"} size={size} style={style} />;
}
