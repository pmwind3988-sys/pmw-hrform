import { describe, expect, it } from "vitest";
import { canvasInkFor, DEFAULT_DASHBOARD_BACKGROUND_SETTING } from "./dashboardBackgrounds";
import { meetsAA } from "../theme/contrast";

function setting(over: Partial<typeof DEFAULT_DASHBOARD_BACKGROUND_SETTING> = {}) {
  return { ...DEFAULT_DASHBOARD_BACKGROUND_SETTING, ...over };
}

describe("canvasInkFor", () => {
  /**
   * The case that prompted this: a photographic background turned up to where
   * the picture, not the wash, is what text sits on. Grey there is invisible.
   */
  it("uses white with a shadow when the photograph shows through", () => {
    const result = canvasInkFor(setting({ backgroundId: "workspace", imageOpacity: 0.9 }));
    expect(result.ink).toBe("#FFFFFF");
    expect(result.shadow).not.toBe("none");
  });

  /** A thick wash IS the surface, and it is light, so dark ink is right. */
  it("uses dark ink when the wash covers the photograph", () => {
    const result = canvasInkFor(setting({ backgroundId: "workspace", imageOpacity: 0.05 }));
    expect(result.ink).toBe("#101828");
    expect(result.shadow).toBe("none");
  });

  /** A gradient is knowable, so it is decided by its own stops. */
  it("reads a gradient's stops rather than guessing", () => {
    const result = canvasInkFor(setting({ backgroundId: "clarity" }));
    expect(result.ink).toBe("#101828");
  });

  /** A custom image with no URL is not an image background at all. */
  it("treats an empty custom image as a plain canvas", () => {
    const result = canvasInkFor(setting({ backgroundId: "custom", customImageUrl: "", imageOpacity: 0.9 }));
    expect(result.ink).toBe("#101828");
  });

  it("treats a real custom image like any other photograph", () => {
    const result = canvasInkFor(
      setting({ backgroundId: "custom", customImageUrl: "https://example.com/a.jpg", imageOpacity: 0.9 }),
    );
    expect(result.ink).toBe("#FFFFFF");
  });

  /**
   * The muted variant is the one that failed before, so it has to stay legible
   * rather than quietly reverting to grey.
   */
  it("keeps the muted variant on the same side as the ink", () => {
    const photo = canvasInkFor(setting({ backgroundId: "workspace", imageOpacity: 0.9 }));
    expect(photo.muted.startsWith("rgba(255,255,255")).toBe(true);

    const flat = canvasInkFor(setting({ backgroundId: "clarity" }));
    expect(meetsAA(flat.muted, "#F6F8FB")).toBe(true);
  });
});
