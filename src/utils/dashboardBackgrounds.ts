export interface DashboardBackgroundDef {
  id: string;
  label: string;
  category: string;
  css: string;
  preview: string;
  source?: string;
}

export interface DashboardBackgroundSetting {
  backgroundId: string;
  customImageUrl: string;
  updatedBy?: string;
  updatedAt?: string;
}

const CSS_VAR = "--app-bg";
const FALLBACK_CSS_VAR = "--app-bg-fallback";
const DEFAULT_FALLBACK = "#F6F8FB";

function photo(url: string): string {
  return `linear-gradient(180deg, rgba(246,248,251,0.88) 0%, rgba(246,248,251,0.78) 42%, rgba(246,248,251,0.9) 100%), url("${url}") center/cover no-repeat`;
}

export const DASHBOARD_BACKGROUNDS: DashboardBackgroundDef[] = [
  {
    id: "clarity",
    label: "Clarity",
    category: "Quiet",
    css: "linear-gradient(180deg, #F6F8FB 0%, #EEF5FB 52%, #F8FAFC 100%)",
    preview: "linear-gradient(180deg, #F6F8FB 0%, #EEF5FB 52%, #F8FAFC 100%)",
  },
  {
    id: "paper-grid",
    label: "Paper Grid",
    category: "Quiet",
    css: "linear-gradient(180deg, rgba(248,250,252,0.98) 0%, rgba(246,248,251,0.98) 100%), repeating-linear-gradient(0deg, transparent 0, transparent 27px, rgba(0,120,212,0.05) 28px), repeating-linear-gradient(90deg, transparent 0, transparent 27px, rgba(17,24,39,0.04) 28px)",
    preview: "linear-gradient(135deg, #F8FAFC 0%, #EAF2FA 100%)",
  },
  {
    id: "workspace",
    label: "Workspace",
    category: "Online",
    css: photo("https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=2400&q=80"),
    preview: photo("https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=70"),
    source: "Unsplash",
  },
  {
    id: "studio",
    label: "Studio",
    category: "Online",
    css: photo("https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=2400&q=80"),
    preview: photo("https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=800&q=70"),
    source: "Unsplash",
  },
  {
    id: "city-glass",
    label: "City Glass",
    category: "Online",
    css: photo("https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=2400&q=80"),
    preview: photo("https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=70"),
    source: "Unsplash",
  },
  {
    id: "horizon",
    label: "Horizon",
    category: "Online",
    css: photo("https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=2400&q=80"),
    preview: photo("https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=800&q=70"),
    source: "Unsplash",
  },
  {
    id: "courtyard",
    label: "Courtyard",
    category: "Online",
    css: photo("https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2400&q=80"),
    preview: photo("https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=70"),
    source: "Unsplash",
  },
  {
    id: "prism",
    label: "Prism",
    category: "Online",
    css: photo("https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=2400&q=80"),
    preview: photo("https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=800&q=70"),
    source: "Unsplash",
  },
];

export const DEFAULT_DASHBOARD_BACKGROUND_SETTING: DashboardBackgroundSetting = {
  backgroundId: "clarity",
  customImageUrl: "",
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

export function buildCustomBackgroundCss(imageUrl: string): string {
  const normalized = normalizeImageUrl(imageUrl);
  if (!normalized) return DEFAULT_FALLBACK;
  return photo(escapeCssUrl(normalized));
}

export function findDashboardBackground(id: string): DashboardBackgroundDef {
  return DASHBOARD_BACKGROUNDS.find((background) => background.id === id) ?? DASHBOARD_BACKGROUNDS[0];
}

export function buildDashboardBackgroundCss(setting: DashboardBackgroundSetting): string {
  if (setting.backgroundId === "custom") {
    return buildCustomBackgroundCss(setting.customImageUrl);
  }
  return findDashboardBackground(setting.backgroundId).css;
}

export function applyDashboardBackground(setting: DashboardBackgroundSetting): void {
  document.documentElement.style.setProperty(CSS_VAR, buildDashboardBackgroundCss(setting));
  document.documentElement.style.setProperty(FALLBACK_CSS_VAR, DEFAULT_FALLBACK);
}
