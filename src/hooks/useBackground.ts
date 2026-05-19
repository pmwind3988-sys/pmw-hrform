import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "pmw_hr_background";
const CSS_VAR = "--app-bg";

export interface BackgroundDef {
  id: string;
  label: string;
  /** Full CSS background value (color, gradient, or SVG url) */
  css: string;
  /** Inline CSS background for the preview thumbnail */
  preview: string;
}

export const PREDEFINED_BACKGROUNDS: BackgroundDef[] = [
  {
    id: "clean",
    label: "Clean Light",
    css: "var(--app-bg-fallback, rgba(248,249,252,0.88))",
    preview: "#F8F9FC",
  },
  {
    id: "gradient-soft",
    label: "Soft Gradient",
    css: "linear-gradient(145deg, #eef0f7 0%, rgba(248,249,252,0.88) 40%, #f4f0f8 100%)",
    preview: "linear-gradient(145deg, #eef0f7 0%, #f8f9fc 40%, #f4f0f8 100%)",
  },
  {
    id: "gradient-warm",
    label: "Warm Glow",
    css: "linear-gradient(135deg, #fef6ee 0%, rgba(248,249,252,0.88) 50%, #f5f0fa 100%)",
    preview: "linear-gradient(135deg, #fef6ee 0%, #f8f9fc 50%, #f5f0fa 100%)",
  },
  {
    id: "abstract-waves",
    label: "Abstract Waves",
    css: 'linear-gradient(145deg, rgba(248,249,252,0.88) 0%, rgba(248,249,252,0.88) 100%), url("data:image/svg+xml,%3Csvg viewBox=\'0 0 1200 800\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3ClinearGradient id=\'a\' x1=\'0%25\' y1=\'0%25\' x2=\'100%25\' y2=\'100%25\'%3E%3Cstop offset=\'0%25\' stop-color=\'%236264A7\' stop-opacity=\'0.08\'/%3E%3Cstop offset=\'100%25\' stop-color=\'%230078D4\' stop-opacity=\'0.04\'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d=\'M0 400 Q150 300 300 400 T600 400 T900 400 T1200 400 L1200 800 L0 800 Z\' fill=\'url(%23a)\'/%3E%3Cpath d=\'M0 500 Q200 380 400 500 T800 500 T1200 500 L1200 800 L0 800 Z\' fill=\'url(%23a)\' opacity=\'0.6\'/%3E%3C/svg%3E") center/cover no-repeat',
    preview: "#F8F9FC",
  },
  {
    id: "geometric",
    label: "Geometric Mesh",
    css: 'linear-gradient(145deg, rgba(248,249,252,0.88) 0%, rgba(248,249,252,0.88) 100%), url("data:image/svg+xml,%3Csvg viewBox=\'0 0 1200 800\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3ClinearGradient id=\'a\' x1=\'0%25\' y1=\'0%25\' x2=\'100%25\' y2=\'100%25\'%3E%3Cstop offset=\'0%25\' stop-color=\'%236264A7\' stop-opacity=\'0.07\'/%3E%3Cstop offset=\'100%25\' stop-color=\'%230078D4\' stop-opacity=\'0.03\'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpolygon points=\'0,0 200,0 100,150\' fill=\'url(%23a)\'/%3E%3Cpolygon points=\'300,0 500,0 400,150\' fill=\'url(%23a)\'/%3E%3Cpolygon points=\'600,0 800,0 700,150\' fill=\'url(%23a)\' opacity=\'0.7\'/%3E%3Cpolygon points=\'900,0 1200,0 1050,200\' fill=\'url(%23a)\' opacity=\'0.5\'/%3E%3Cpolygon points=\'100,200 300,200 200,350\' fill=\'url(%23a)\'/%3E%3Cpolygon points=\'400,200 600,200 500,350\' fill=\'url(%23a)\' opacity=\'0.6\'/%3E%3Cpolygon points=\'700,200 900,200 800,350\' fill=\'url(%23a)\'/%3E%3Cpolygon points=\'0,400 200,400 100,550\' fill=\'url(%23a)\' opacity=\'0.5\'/%3E%3Cpolygon points=\'300,400 500,400 400,550\' fill=\'url(%23a)\'/%3E%3Cpolygon points=\'600,400 800,400 700,550\' fill=\'url(%23a)\' opacity=\'0.7\'/%3E%3Cpolygon points=\'900,400 1200,400 1050,600\' fill=\'url(%23a)\'/%3E%3C/svg%3E") center/cover no-repeat',
    preview: "#F8F9FC",
  },
  {
    id: "floating-circles",
    label: "Floating Orbs",
    css: 'linear-gradient(145deg, rgba(248,249,252,0.88) 0%, rgba(248,249,252,0.88) 100%), url("data:image/svg+xml,%3Csvg viewBox=\'0 0 1200 800\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Ccircle cx=\'200\' cy=\'200\' r=\'150\' fill=\'%236264A7\' opacity=\'0.04\'/%3E%3Ccircle cx=\'800\' cy=\'150\' r=\'120\' fill=\'%230078D4\' opacity=\'0.03\'/%3E%3Ccircle cx=\'600\' cy=\'500\' r=\'200\' fill=\'%236264A7\' opacity=\'0.03\'/%3E%3Ccircle cx=\'1000\' cy=\'600\' r=\'100\' fill=\'%230078D4\' opacity=\'0.04\'/%3E%3Ccircle cx=\'100\' cy=\'650\' r=\'80\' fill=\'%236264A7\' opacity=\'0.05\'/%3E%3Ccircle cx=\'400\' cy=\'300\' r=\'60\' fill=\'%230078D4\' opacity=\'0.04\'/%3E%3C/svg%3E") center/cover no-repeat',
    preview: "#F8F9FC",
  },
  {
    id: "diagonal-flow",
    label: "Diagonal Flow",
    css: 'linear-gradient(145deg, rgba(248,249,252,0.88) 0%, rgba(248,249,252,0.88) 100%), url("data:image/svg+xml,%3Csvg viewBox=\'0 0 1200 800\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3ClinearGradient id=\'s\' x1=\'0%25\' y1=\'0%25\' x2=\'100%25\' y2=\'100%25\'%3E%3Cstop offset=\'0%25\' stop-color=\'%236264A7\' stop-opacity=\'0.06\'/%3E%3Cstop offset=\'100%25\' stop-color=\'%230078D4\' stop-opacity=\'0.02\'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d=\'M-100 100 L1100 700\' stroke=\'url(%23s)\' stroke-width=\'40\' fill=\'none\'/%3E%3Cpath d=\'M-100 250 L1100 850\' stroke=\'url(%23s)\' stroke-width=\'30\' fill=\'none\' opacity=\'0.6\'/%3E%3Cpath d=\'M-100 -50 L1100 550\' stroke=\'url(%23s)\' stroke-width=\'50\' fill=\'none\' opacity=\'0.4\'/%3E%3C/svg%3E") center/cover no-repeat',
    preview: "#F8F9FC",
  },
  {
    id: "particles",
    label: "Particle Dust",
    css: 'linear-gradient(145deg, rgba(248,249,252,0.88) 0%, rgba(248,249,252,0.88) 100%), url("data:image/svg+xml,%3Csvg viewBox=\'0 0 1200 800\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%236264A7\' opacity=\'0.06\'%3E%3Ccircle cx=\'150\' cy=\'120\' r=\'3\'/%3E%3Ccircle cx=\'350\' cy=\'280\' r=\'2\'/%3E%3Ccircle cx=\'550\' cy=\'60\' r=\'4\'/%3E%3Ccircle cx=\'750\' cy=\'350\' r=\'2\'/%3E%3Ccircle cx=\'950\' cy=\'150\' r=\'3\'/%3E%3Ccircle cx=\'200\' cy=\'450\' r=\'2\'/%3E%3Ccircle cx=\'400\' cy=\'600\' r=\'4\'/%3E%3Ccircle cx=\'600\' cy=\'700\' r=\'3\'/%3E%3Ccircle cx=\'800\' cy=\'550\' r=\'2\'/%3E%3Ccircle cx=\'1050\' cy=\'650\' r=\'4\'/%3E%3Ccircle cx=\'50\' cy=\'700\' r=\'2\'/%3E%3Ccircle cx=\'1100\' cy=\'400\' r=\'3\'/%3E%3C/g%3E%3Cg fill=\'%230078D4\' opacity=\'0.04\'%3E%3Ccircle cx=\'100\' cy=\'300\' r=\'5\'/%3E%3Ccircle cx=\'300\' cy=\'100\' r=\'3\'/%3E%3Ccircle cx=\'500\' cy=\'400\' r=\'2\'/%3E%3Ccircle cx=\'700\' cy=\'200\' r=\'4\'/%3E%3Ccircle cx=\'900\' cy=\'500\' r=\'3\'/%3E%3Ccircle cx=\'250\' cy=\'700\' r=\'5\'/%3E%3Ccircle cx=\'1000\' cy=\'250\' r=\'2\'/%3E%3C/g%3E%3C/svg%3E") center/cover no-repeat',
    preview: "#F8F9FC",
  },
];

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* localStorage may be full */
  }
}

function applyCSSVar(css: string, fallback: string): void {
  document.documentElement.style.setProperty(CSS_VAR, css);
  document.documentElement.style.setProperty("--app-bg-fallback", fallback);
}

const DEFAULT_FALLBACK = "rgba(248,249,252,0.88)";

export function useBackground() {
  const storedId = readStored();
  // Validate stored ID still exists in predefined list
  const initialBg = PREDEFINED_BACKGROUNDS.find((b) => b.id === storedId) || PREDEFINED_BACKGROUNDS[0];
  const [currentId, setCurrentId] = useState<string>(initialBg.id);

  useEffect(() => {
    const bg = PREDEFINED_BACKGROUNDS.find((b) => b.id === currentId) || PREDEFINED_BACKGROUNDS[0];
    applyCSSVar(bg.css, DEFAULT_FALLBACK);
  }, [currentId]);

  const selectById = useCallback((id: string) => {
    writeStored(id);
    setCurrentId(id);
  }, []);

  return { currentId, selectById, predefined: PREDEFINED_BACKGROUNDS };
}
