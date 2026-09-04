import type { ReactNode } from "react";
import { Box, Container, Typography } from "@mui/material";
import { editorial } from "../../theme/editorial";
import { careerReduceMotionSx } from "./careerUi";
import heroImage from "../../assets/hero.png";

/**
 * Dark title band for the public career surfaces, adapted from the Figma
 * job-portal template (file its0mTyfN3jAVbef8BKpEr, Hero 25:6654).
 *
 * This is a separate component rather than a restyle of CareerPortalHeader on
 * purpose: that header is shared by three admin career pages, so giving it a
 * full-bleed dark treatment would drag the admin screens along with it. The nav
 * row from the template frame is also intentionally absent — CareerPortalHeader
 * already owns navigation, and duplicating it here would give the page two.
 */

interface CareerHeroProps {
  title: string;
  subtitle?: string;
  /** Rendered under the title — breadcrumb on job details, counts on the list. */
  children?: ReactNode;
}

export default function CareerHero({ title, subtitle, children }: CareerHeroProps) {
  return (
    <Box
      component="section"
      sx={{
        position: "relative",
        overflow: "hidden",
        backgroundColor: editorial.ink,
        backgroundImage: `url(${heroImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          // Template lays flat black over the photo. Angling it toward PMW blue
          // keeps the brand present without lifting text contrast off AA.
          // The navy family, and four points lighter than it was. The old
          // overlay ran near-black #101010 into an off-system #00335A at 0.84
          // and 0.88, which sat the hero photograph so far under the scrim that
          // the band read as a flat dark rectangle. White text still clears AA
          // against both stops.
          background:
            "linear-gradient(180deg, rgba(11, 47, 112, 0.8) 0%, rgba(15, 61, 145, 0.84) 100%)",
        },
        ...careerReduceMotionSx,
      }}
    >
      <Container
        maxWidth="lg"
        sx={{
          position: "relative",
          py: { xs: 4, sm: 5, md: 7 },
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: { xs: 1.25, md: 2 },
          textAlign: "center",
        }}
      >
        <Typography
          variant="h1"
          sx={{
            color: editorial.white,
            fontWeight: 700,
            // Template sets 60px; scaled down so it does not overpower the
            // portal header sitting directly above it.
            fontSize: { xs: "2rem", sm: "2.75rem", md: "3.25rem" },
            lineHeight: 1.05,
            letterSpacing: "-0.01em",
            textWrap: "balance",
          }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography
            variant="body1"
            sx={{
              color: "rgba(255, 255, 255, 0.82)",
              maxWidth: 620,
              fontSize: { xs: "0.9375rem", md: "1rem" },
              textWrap: "pretty",
            }}
          >
            {subtitle}
          </Typography>
        )}
        {children}
      </Container>
    </Box>
  );
}
