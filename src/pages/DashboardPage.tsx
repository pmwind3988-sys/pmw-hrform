import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { useDashboard } from "../contexts/DashboardContext";
import StatsRow from "../components/dashboard/StatsRow";
import ConfigWarningBanner from "../components/dashboard/ConfigWarningBanner";
import CareerPortalCarousel from "../components/careers/CareerPortalCarousel";
import { acquireCareerPortalToken, fetchCareersPortalData } from "../utils/careersService";
import type { CareerPortalCard } from "../types";
import { editorial, si, siType } from "../theme/editorial";
import { bucketSubmissions } from "../utils/submissionStatusBuckets";

/**
 * The careers carousel, fetched on its own.
 *
 * Everyone here is signed in, but the portal may be closed to the public —
 * without the identity token this carousel would 403 and render empty.
 */
function DashboardCareerCarousel() {
  const navigate = useNavigate();
  const { instance } = useMsal();
  const [cards, setCards] = useState<CareerPortalCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;
    void acquireCareerPortalToken(instance, account)
      .then((accessToken) => fetchCareersPortalData({ accessToken }))
      .then((data) => {
        if (mounted) setCards(data.portalCards);
      })
      .catch(() => {
        if (mounted) setCards([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [instance]);

  const handleCardTarget = (card: CareerPortalCard) => {
    const targetValue = card.targetValue.trim();
    if (card.targetType === "none" || !targetValue) return;

    if (card.targetType === "job") {
      navigate(`/career-portal?job=${encodeURIComponent(targetValue)}`);
      return;
    }

    if (targetValue.startsWith("/")) {
      navigate(targetValue);
    } else {
      window.open(targetValue, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Box component="section" sx={{ mb: 3 }}>
      <CareerPortalCarousel cards={cards} loading={loading} onCardTarget={handleCardTarget} />
    </Box>
  );
}

/**
 * The Dashboard section: an overview, and nothing else.
 *
 * This page used to be the whole application. It carried a hero heading, the
 * stat tiles, the form cards, a filter toolbar, and every submission the
 * account could see — one scroll, five jobs. Forms and submissions are now
 * their own sections under My Work, which is what makes each of them
 * addressable and what leaves this page room to answer one question: what
 * needs looking at.
 *
 * The hero is gone with them. A 48px "PMW Group HR Portal" title plus a
 * paragraph explaining what the portal is for is orientation an employee needs
 * exactly once, and it cost the first screenful of every visit thereafter. The
 * shell's own header says which section you are in; the stat tiles say how
 * things stand.
 *
 * ORDER: carousel, then what needs attention, then the tiles. The carousel is
 * the only block here anyone authors deliberately -- an admin picks its cards
 * and points them somewhere -- so it leads.
 */
export default function DashboardPage() {
  const { submissions, missingConfigs, visibleLists, isAdmin } = useDashboard();

  // Shared with the tiles below rather than recomputed: "Pending" and
  // "In Progress" are not values this column holds (it holds Submitted /
  // In Review / Completed / Rejected / Cancelled, plus legacy spellings), so a
  // hand-written filter here read zero on every real row.
  const { total, pending } = bucketSubmissions(submissions);

  return (
    <Box sx={{ maxWidth: 1440, mx: "auto" }}>
      {missingConfigs.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <ConfigWarningBanner missingLists={missingConfigs} />
        </Box>
      )}

      <DashboardCareerCarousel />

      <Box
        component="section"
        sx={{
          mb: 3,
          p: `${si.padTight}px`,
          borderRadius: `${si.radius}px`,
          backgroundColor: editorial.panel,
          border: `1px solid ${editorial.border}`,
          boxShadow: si.shadow,
        }}
      >
        <Typography sx={{ ...siType.micro, color: editorial.muted }}>
          Needs your attention
        </Typography>
        <Typography sx={{ ...siType.sectionTitle, mt: 0.5, color: editorial.ink }}>
          {total === 0
            ? "No submissions in view yet"
            : pending === 0
              ? "Nothing is waiting on you"
              : `${pending} submission${pending === 1 ? "" : "s"} still moving`}
        </Typography>
        <Typography sx={{ ...siType.subtext, mt: 0.5, color: editorial.muted }}>
          {total === 0
            ? "Forms you submit will appear here as they enter their approval chain."
            : pending === 0
              ? `All ${total} submission${total === 1 ? "" : "s"} in view have finished their approval chain.`
              : "Open My Work to see where each one has stopped."}
        </Typography>
      </Box>

      <Box sx={{ mb: 3 }}>
        <StatsRow submissions={submissions} />
      </Box>

      <Typography sx={{ ...siType.subtext, color: editorial.muted }}>
        {visibleLists.length} form{visibleLists.length === 1 ? "" : "s"} available to you
        {isAdmin ? " · administrator access" : ""}.
      </Typography>
    </Box>
  );
}
