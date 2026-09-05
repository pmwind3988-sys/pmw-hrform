import { relativeLuminance } from "../theme/contrast";
export interface DashboardBackgroundDef {
  id: string;
  label: string;
  category: string;
  css: string;
  preview: string;
  imageUrl?: string;
  previewUrl?: string;
  source?: string;
  sourceUrl?: string;
}

export interface DashboardBackgroundSetting {
  backgroundId: string;
  customImageUrl: string;
  customImageSource: string;
  imageOpacity: number;
  updatedBy?: string;
  updatedAt?: string;
}

const CSS_VAR = "--app-bg";
const FALLBACK_CSS_VAR = "--app-bg-fallback";
/**
 * The flat SI canvas, matching `editorial.paper` and `--app-bg-fallback` in
 * index.css. It was the old sky-to-cream gradient, and because
 * `applyDashboardBackground` writes this into `--app-bg-fallback` at runtime,
 * that stale value overrode the canvas set in the stylesheet on every load.
 */
const DEFAULT_FALLBACK = "#F6F8FB";
export const DEFAULT_IMAGE_OPACITY = 0.22;

function clampImageOpacity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_IMAGE_OPACITY;
  return Math.min(1, Math.max(0, value));
}

export function normalizeImageOpacity(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return clampImageOpacity(parsed);
}

function overlayAlpha(imageOpacity: number, scale: number): string {
  return (1 - normalizeImageOpacity(imageOpacity) * scale).toFixed(3);
}

/**
 * The scrim over a photographic background.
 *
 * Retuned to the navy family: it was the old sky #DCECF8 into cream #F7F5EF,
 * which put a warm wash under cool white SI cards and read as two products
 * layered on each other. Now the SI wash #D7E1F3 into the canvas #F6F8FB.
 *
 * The gradient CHOICES in DASHBOARD_BACKGROUNDS below stay as they are -- they
 * are the options the picker exists to offer, not chrome. This scrim is chrome:
 * it sits over whichever option is chosen, so it has to belong to the system.
 */
function photo(url: string, imageOpacity = DEFAULT_IMAGE_OPACITY): string {
  return `linear-gradient(180deg, rgba(215,225,243,${overlayAlpha(imageOpacity, 0.55)}) 0%, rgba(246,248,251,${overlayAlpha(imageOpacity, 1)}) 42%, rgba(215,225,243,${overlayAlpha(imageOpacity, 0.45)}) 100%), url("${url}") center/cover no-repeat`;
}

export const DASHBOARD_BACKGROUNDS: DashboardBackgroundDef[] = [
  {
    id: "clarity",
    label: "Editorial Sky",
    category: "Quiet",
    css: "linear-gradient(180deg, #BFDDF4 0%, #DCECF8 45%, #F7F5EF 100%)",
    preview: "linear-gradient(180deg, #BFDDF4 0%, #DCECF8 45%, #F7F5EF 100%)",
  },
  {
    id: "paper-grid",
    label: "Paper Grid",
    category: "Quiet",
    css: "linear-gradient(180deg, rgba(251,250,245,0.96) 0%, rgba(234,245,252,0.96) 100%), repeating-linear-gradient(0deg, transparent 0, transparent 27px, rgba(16,16,16,0.04) 28px), repeating-linear-gradient(90deg, transparent 0, transparent 27px, rgba(16,16,16,0.035) 28px)",
    preview: "linear-gradient(135deg, #FBFAF5 0%, #EAF5FC 100%)",
  },
  {
    id: "workspace",
    label: "Workspace",
    category: "Online",
    imageUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=2400&q=80",
    previewUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=70",
    css: photo("https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=2400&q=80"),
    preview: photo("https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=70"),
    source: "Unsplash",
    sourceUrl: "https://unsplash.com/license",
  },
  {
    id: "studio",
    label: "Studio",
    category: "Online",
    imageUrl: "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=2400&q=80",
    previewUrl: "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=800&q=70",
    css: photo("https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=2400&q=80"),
    preview: photo("https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=800&q=70"),
    source: "Unsplash",
    sourceUrl: "https://unsplash.com/license",
  },
  {
    id: "city-glass",
    label: "City Glass",
    category: "Online",
    imageUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=2400&q=80",
    previewUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=70",
    css: photo("https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=2400&q=80"),
    preview: photo("https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=70"),
    source: "Unsplash",
    sourceUrl: "https://unsplash.com/license",
  },
  {
    id: "horizon",
    label: "Horizon",
    category: "Online",
    imageUrl: "https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=2400&q=80",
    previewUrl: "https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=800&q=70",
    css: photo("https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=2400&q=80"),
    preview: photo("https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=800&q=70"),
    source: "Unsplash",
    sourceUrl: "https://unsplash.com/license",
  },
  {
    id: "courtyard",
    label: "Courtyard",
    category: "Online",
    imageUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2400&q=80",
    previewUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=70",
    css: photo("https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2400&q=80"),
    preview: photo("https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=70"),
    source: "Unsplash",
    sourceUrl: "https://unsplash.com/license",
  },
  {
    id: "prism",
    label: "Prism",
    category: "Online",
    imageUrl: "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=2400&q=80",
    previewUrl: "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=800&q=70",
    css: photo("https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=2400&q=80"),
    preview: photo("https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=800&q=70"),
    source: "Unsplash",
    sourceUrl: "https://unsplash.com/license",
  },
];

export const DEFAULT_DASHBOARD_BACKGROUND_SETTING: DashboardBackgroundSetting = {
  backgroundId: "clarity",
  customImageUrl: "",
  customImageSource: "",
  imageOpacity: DEFAULT_IMAGE_OPACITY,
};

function escapeCssUrl(url: string): string {
  return url.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function normalizeImageUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 2048) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function buildCustomBackgroundCss(imageUrl: string, imageOpacity = DEFAULT_IMAGE_OPACITY): string {
  const normalized = normalizeImageUrl(imageUrl);
  if (!normalized) return DEFAULT_FALLBACK;
  return photo(escapeCssUrl(normalized), imageOpacity);
}

export function findDashboardBackground(id: string): DashboardBackgroundDef {
  return DASHBOARD_BACKGROUNDS.find((background) => background.id === id) ?? DASHBOARD_BACKGROUNDS[0];
}

export function buildDashboardBackgroundDefCss(
  background: DashboardBackgroundDef,
  imageOpacity = DEFAULT_IMAGE_OPACITY,
  preview = false,
): string {
  const url = preview ? background.previewUrl || background.imageUrl : background.imageUrl;
  if (!url) return preview ? background.preview : background.css;
  return photo(escapeCssUrl(url), imageOpacity);
}

export function buildDashboardBackgroundCss(setting: DashboardBackgroundSetting): string {
  const imageOpacity = normalizeImageOpacity(setting.imageOpacity);
  if (setting.backgroundId === "custom") {
    return buildCustomBackgroundCss(setting.customImageUrl, imageOpacity);
  }
  return buildDashboardBackgroundDefCss(findDashboardBackground(setting.backgroundId), imageOpacity);
}

/**
 * Text sitting on the canvas itself — no card, no panel, nothing painted behind
 * it — has to survive whichever background an admin picked. The dashboard's
 * "N forms available to you" line was the case that proved it: grey on a dark
 * photograph, technically present and effectively invisible.
 *
 * These three variables are the answer, published whenever the background is
 * applied. A call site uses `var(--app-bg-ink)` instead of a fixed colour and
 * stops caring what is behind it.
 */
const INK_VAR = "--app-bg-ink";
const INK_MUTED_VAR = "--app-bg-ink-muted";
const INK_SHADOW_VAR = "--app-bg-text-shadow";

/** Every hex or rgb() colour written into a background's CSS, in order. */
function backgroundStops(css: string): string[] {
  return css.match(/#[0-9a-fA-F]{3,6}|rgba?\([^)]*\)/g) ?? [];
}

/**
 * How much of the scrim survives at its thinnest point.
 *
 * `photo()` lays a near-white wash over the image at three stops, and the
 * middle one is the weakest: `1 - imageOpacity`. That single number says how
 * much of the picture shows through at its strongest, which is the only part
 * that matters for whether text can be read.
 */
function weakestScrimAlpha(imageOpacity: number): number {
  return 1 - normalizeImageOpacity(imageOpacity);
}

/**
 * Below this, the photograph rather than the wash decides what is behind the
 * text — and a photograph's brightness is not knowable from here. White with a
 * shadow is the honest answer to an unknown background: it stays legible on a
 * dark picture and, because of the shadow, on a light one too.
 */
const SCRIM_DOMINATES = 0.7;

export interface CanvasInk {
  ink: string;
  muted: string;
  shadow: string;
}

const DARK_CANVAS_INK: CanvasInk = {
  ink: "#101828",
  muted: "#5A6880",
  shadow: "none",
};

const LIGHT_CANVAS_INK: CanvasInk = {
  ink: "#FFFFFF",
  // Still white, only quieter. Dropping to grey on an unknown photograph would
  // reintroduce exactly the problem this solves.
  muted: "rgba(255,255,255,0.88)",
  // Carries the contrast when the picture underneath happens to be pale.
  shadow: "0 1px 3px rgba(0,0,0,0.55), 0 0 10px rgba(0,0,0,0.35)",
};

/**
 * The ink this background needs.
 *
 * A gradient is knowable: its stops are written down, so their average
 * luminance decides. A photograph is not, so the scrim's strength decides
 * instead — thick wash, treat it as the light surface it is; thin wash, assume
 * nothing and use white with a shadow.
 */
export function canvasInkFor(setting: DashboardBackgroundSetting): CanvasInk {
  const imageOpacity = normalizeImageOpacity(setting.imageOpacity);
  const hasImage =
    setting.backgroundId === "custom"
      ? normalizeImageUrl(setting.customImageUrl) !== null
      : Boolean(findDashboardBackground(setting.backgroundId).imageUrl);

  if (hasImage) {
    return weakestScrimAlpha(imageOpacity) >= SCRIM_DOMINATES
      ? DARK_CANVAS_INK
      : LIGHT_CANVAS_INK;
  }

  const stops = backgroundStops(buildDashboardBackgroundCss(setting));
  const luminances = stops
    .map((stop) => relativeLuminance(stop))
    .filter((value): value is number => value !== null);

  // No readable stop means no basis for a decision, and dark ink is the safer
  // default on a palette whose surfaces are light.
  if (luminances.length === 0) return DARK_CANVAS_INK;

  const average = luminances.reduce((sum, value) => sum + value, 0) / luminances.length;
  return average < 0.4 ? LIGHT_CANVAS_INK : DARK_CANVAS_INK;
}

export function applyDashboardBackground(setting: DashboardBackgroundSetting): void {
  const root = document.documentElement.style;
  root.setProperty(CSS_VAR, buildDashboardBackgroundCss(setting));
  root.setProperty(FALLBACK_CSS_VAR, DEFAULT_FALLBACK);

  const { ink, muted, shadow } = canvasInkFor(setting);
  root.setProperty(INK_VAR, ink);
  root.setProperty(INK_MUTED_VAR, muted);
  root.setProperty(INK_SHADOW_VAR, shadow);
}
