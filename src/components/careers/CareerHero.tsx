import type { ReactNode } from "react";
import { Box, Container, Typography } from "@mui/material";
import { editorial } from "../../theme/editorial";
import { careerReduceMotionSx } from "./careerUi";
import heroImage from "../../assets/hero.png";

/**
 * Modest navy title band for the signed-out career surfaces, adapted from the Figma
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
          // One flat navy veil over the photograph: the brand colour, and
          // white text clears AA against it.
          backgroundColor: editorial.navyDeep,
          opacity: 0.88,
        },
        ...careerReduceMotionSx,
      }}
    >
      <Container
        maxWidth="lg"
        sx={{
          position: "relative",
          py: { xs: 3, sm: 3.5, md: 4.5 },
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: { xs: 0.75, md: 1 },
          textAlign: "center",
        }}
      >
        <Typography
          variant="h1"
          sx={{
            color: editorial.white,
            fontWeight: 700,
            fontSize: { xs: "1.5rem", sm: "1.85rem", md: "2.15rem" },
            lineHeight: 1.15,
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
              color: editorial.sky,
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
