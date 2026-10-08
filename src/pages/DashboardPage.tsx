import { useEffect, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { ArrowForwardRounded, HourglassTopRounded, TaskAltRounded } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { useDashboard } from "../contexts/DashboardContext";
import StatsRow, { type StatusBucketKey } from "../components/dashboard/StatsRow";
import ConfigWarningBanner from "../components/dashboard/ConfigWarningBanner";
import CareerPortalCarousel from "../components/careers/CareerPortalCarousel";
import { acquireCareerPortalToken, fetchCareersPortalData } from "../utils/careersService";
import type { CareerPortalCard } from "../types";
import { editorial, onCanvas, onCanvasMuted, si, siType } from "../theme/editorial";
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
    <Box component="section">
      <CareerPortalCarousel cards={cards} loading={loading} onCardTarget={handleCardTarget} />
    </Box>
  );
}

/**
 * The name to greet someone by: their given names, without the patronymic.
 *
 * "Muhammad Ashraf Bin Azahari" is greeted as "Muhammad Ashraf". Taking only
 * the first word would greet half the company as "Muhammad", and the full name
 * reads like a form field rather than a hello.
 */
function greetingName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const cut = words.findIndex((word) => /^(bin|binti|bt|a\/l|a\/p|s\/o|d\/o)$/i.test(word));
  const given = cut > 0 ? words.slice(0, cut) : words.slice(0, 2);
  return given.join(" ");
}

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * The Dashboard section: an overview, and nothing else.
 *
 * ORDER, AND WHY IT CHANGED. This page used to open on the careers carousel, so
 * the first screen of an HR tool was an advert for the careers page one tab
 * away, and the one useful sentence ("N submissions still moving") told you
 * where to click instead of being something you could click. Now:
 *
 *   1. A greeting and one sentence saying how things stand, on the canvas.
 *   2. That status as a button, which opens the list it describes.
 *   3. Three rings showing the split, each opening its own slice.
 *   4. The careers highlights, last: authored content, but not the job here.
 */
export default function DashboardPage() {
  const navigate = useNavigate();
  const { submissions, missingConfigs, visibleLists, isAdmin, canUseFormBuilder, userName, filters, setFilters } =
    useDashboard();

  // Shared with the rings below rather than recomputed: "Pending" and
  // "In Progress" are not values this column holds (it holds Submitted /
  // In Review / Completed / Rejected / Cancelled, plus legacy spellings), so a
  // hand-written filter here read zero on every real row.
  const { total, pending } = bucketSubmissions(submissions);

  // An admin's counts cover everyone's submissions, so their list is the
  // all-submissions workspace when they can open it; everyone else's is their own.
  const listPath = isAdmin && canUseFormBuilder ? "/admin/submissions" : "/submissions";

  const openBucket = (bucket: StatusBucketKey) => {
    if (listPath === "/submissions") {
      // The shared filter model's stages are finer than the three buckets.
      // Approved and Sent back map onto one stage each; "In progress" spans
      // four, so it opens the whole list rather than a misleading quarter.
      const stage = bucket === "approved" ? "completed" : bucket === "rejected" ? "rejected" : "all";
      setFilters({ ...filters, stage });
    }
    navigate(listPath);
  };

  const name = greetingName(userName);
  const formsCount = visibleLists.length;

  return (
    <Box sx={{ maxWidth: 1120, mx: "auto", display: "grid", gap: 3 }}>
      {missingConfigs.length > 0 && <ConfigWarningBanner missingLists={missingConfigs} />}

      <Box component="header">
        <Typography
          component="h2"
          sx={{ ...siType.display, fontSize: { xs: "1.6rem", sm: "2rem" }, lineHeight: 1.15, ...onCanvas }}
        >
          {greeting(new Date())}
          {name ? `, ${name}` : ""}
        </Typography>
        <Typography sx={{ ...siType.body, fontSize: "0.95rem", mt: 0.75, ...onCanvasMuted }}>
          {total === 0
            ? "Nothing submitted yet. Forms you send will show up here as they move through approval."
            : pending === 0
              ? `All ${total} submission${total === 1 ? "" : "s"} in view have finished their approval chain.`
              : `${pending} of ${total} submission${total === 1 ? "" : "s"} are still moving through approval.`}
        </Typography>
      </Box>

      {total > 0 && (
        <Box
          component="button"
          type="button"
          onClick={() => navigate(listPath)}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.75,
            width: "100%",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            p: 1,
            pr: 2,
            borderRadius: `${si.radiusPill}px`,
            backgroundColor: pending > 0 ? editorial.accentSoft : editorial.successSoft,
            color: editorial.ink,
            transition: "filter 0.15s ease",
            "&:hover": { filter: "brightness(0.97)" },
            "&:hover .go": { transform: "translateX(3px)" },
          }}
        >
          <Box
            aria-hidden
            sx={{
              width: 44,
              height: 44,
              flexShrink: 0,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: editorial.panel,
              color: pending > 0 ? editorial.accentText : editorial.success,
            }}
          >
            {pending > 0 ? <HourglassTopRounded /> : <TaskAltRounded />}
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ ...siType.cardTitle }}>
              {pending > 0 ? "See where each one has stopped" : "Everything has been decided"}
            </Typography>
            <Typography sx={{ ...siType.subtext, color: pending > 0 ? editorial.accentText : editorial.success }}>
              {listPath === "/admin/submissions" ? "All submissions" : "My submissions"}
            </Typography>
          </Box>
          <ArrowForwardRounded className="go" sx={{ transition: "transform 0.15s ease" }} />
        </Box>
      )}

      <StatsRow submissions={submissions} onOpen={total > 0 ? openBucket : undefined} />

      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <Typography sx={{ ...siType.subtext, ...onCanvasMuted }}>
          {formsCount} form{formsCount === 1 ? "" : "s"} available to you
        </Typography>
        <Button
          variant="text"
          onClick={() => navigate("/forms")}
          endIcon={<ArrowForwardRounded />}
          sx={{ backgroundColor: editorial.panel, color: editorial.navy, boxShadow: si.shadow, "&:hover": { backgroundColor: editorial.blueSoft } }}
        >
          Browse forms
        </Button>
      </Box>

      <DashboardCareerCarousel />
    </Box>
  );
}
