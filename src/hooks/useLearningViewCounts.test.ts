import { describe, expect, it } from "vitest";
import { mergeViewCounts } from "./useLearningViewCounts";

interface TestMaterial {
  id: string;
  viewCount: number;
  viewedByMe: boolean;
  mediaUrl: string;
}

function material(id: string, viewCount: number, viewedByMe = false): TestMaterial {
  return { id, viewCount, viewedByMe, mediaUrl: `https://sharepoint.example/${id}` };
}

describe("mergeViewCounts", () => {
  it("takes someone else's view without touching anything else on the card", () => {
    const before = [material("a", 2), material("b", 7)];
    const after = mergeViewCounts(before, { counts: { a: 3, b: 7 }, viewedByMe: [] });

    expect(after[0].viewCount).toBe(3);
    expect(after[1]).toBe(before[1]);
    // The playing video's source must survive a poll unchanged.
    expect(after[0].mediaUrl).toBe(before[0].mediaUrl);
  });

  it("returns the same array when no number moved, so React re-renders nothing", () => {
    const before = [material("a", 2), material("b", 7)];
    expect(mergeViewCounts(before, { counts: { a: 2, b: 7 }, viewedByMe: [] })).toBe(before);
  });

  it("marks a material this account has viewed on another device", () => {
    const after = mergeViewCounts([material("a", 4)], { counts: { a: 4 }, viewedByMe: ["a"] });
    expect(after[0].viewedByMe).toBe(true);
  });

  it("never walks a count backwards while SharePoint indexes a fresh row", () => {
    // A view recorded seconds ago: the row is written, the list query has not
    // caught up. It must not blink out of the total and back in.
    const justViewed = [material("a", 5, true)];
    const after = mergeViewCounts(justViewed, { counts: { a: 4 }, viewedByMe: [] });

    expect(after[0].viewCount).toBe(5);
    expect(after[0].viewedByMe).toBe(true);
    expect(after).toBe(justViewed);
  });

  it("reads a material with no rows yet as zero, not as missing", () => {
    const after = mergeViewCounts([material("new", 0)], { counts: {}, viewedByMe: [] });
    expect(after[0].viewCount).toBe(0);
  });
});
