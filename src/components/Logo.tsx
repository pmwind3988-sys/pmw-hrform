import { Box, type SxProps, type Theme } from "@mui/material";
import logo32 from "../assets/logo-32.png";
import logo48 from "../assets/logo-48.png";
import logo64 from "../assets/logo-64.png";
import logo88 from "../assets/logo-88.png";
import logo128 from "../assets/logo-128.png";

interface LogoProps {
  size?: number;
  alt?: string;
  sx?: SxProps<Theme>;
}

const SIZE_MAP = [
  { src: logo32, width: 32 },
  { src: logo48, width: 48 },
  { src: logo64, width: 64 },
  { src: logo88, width: 88 },
  { src: logo128, width: 128 },
];

function pickSrc(size: number): string {
  // Pick the smallest source that is >= target size, or the largest if none
  for (const entry of SIZE_MAP) {
    if (entry.width >= size) return entry.src;
  }
  return SIZE_MAP[SIZE_MAP.length - 1].src;
}

export default function Logo({ size = 64, alt = "PMW Logo", sx }: LogoProps) {
  const src = pickSrc(size);
  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      sx={{
        width: size,
        height: size,
        objectFit: "contain",
        display: "block",
        // Crisp rendering stack
        imageRendering: "-webkit-optimize-contrast",
        // Force GPU layer for smoother compositing at small sizes
        transform: "translateZ(0)",
        willChange: "transform",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        ...((sx as Record<string, unknown>) || {}),
      }}
    />
  );
}
