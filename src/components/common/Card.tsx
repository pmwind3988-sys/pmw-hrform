import { Box, type BoxProps } from "@mui/material";
import { editorial, si } from "../../theme/editorial";

export interface CardProps extends BoxProps {
  /**
   * Padding preset. `none` is for a card whose children own their own padding —
   * a table with a header band, a list of rows with their own separators.
   */
  pad?: "tight" | "loose" | "none";
  /**
   * Clips children to the radius. Needed by any card whose first or last child
   * paints to the edge: a header band, a run of rows, an image.
   */
  clip?: boolean;
}

/**
 * The one card surface.
 *
 * SI gets hierarchy from size and position, never from depth, so there is a
 * single elevation here and no hover lift. Everything on the page sits at the
 * same height; a card that rose when the pointer crossed it would be claiming
 * an importance the system does not grant, and half the cards it was applied to
 * were not even clickable.
 *
 * The recipe was being retyped at roughly fifty call sites — white fill, 12px
 * radius, a hairline, `si.shadow` — and it had already drifted: some cards used
 * `rgba(255,255,255,0.92)` and let the page background bleed through, some had
 * a border and some did not, and `editorialShadowHover` deepened a dozen of
 * them on hover. One component means one answer, and a change to the card is a
 * change in one file rather than fifty.
 *
 * `Box` props pass through, so a call site still adds its own layout — `sx`,
 * `component`, handlers — without needing a variant for every shape.
 */
export default function Card({ pad = "loose", clip = false, sx, ...rest }: CardProps) {
  const padding = pad === "none" ? 0 : pad === "tight" ? `${si.padTight}px` : `${si.padLoose}px`;

  return (
    <Box
      sx={{
        backgroundColor: editorial.panel,
        borderRadius: `${si.radius}px`,
        border: `1px solid ${editorial.border}`,
        boxShadow: si.shadow,
        p: padding,
        ...(clip ? { overflow: "hidden" } : null),
        ...sx,
      }}
      {...rest}
    />
  );
}
