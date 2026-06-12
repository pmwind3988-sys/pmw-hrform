import { useEffect, useState } from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import {
  AdminPanelSettingsOutlined as AdminIcon,
  PersonOutlined as PersonIcon,
  SpaceDashboardOutlined as DashboardIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useDashboard } from "../contexts/DashboardContext";
import Header from "../components/dashboard/Header";
import StatsRow from "../components/dashboard/StatsRow";
import ListSummaryCards from "../components/dashboard/ListSummaryCards";
import Toolbar from "../components/dashboard/Toolbar";
import ListHeader from "../components/dashboard/ListHeader";
import SubmissionRow from "../components/dashboard/SubmissionRow";
import EmptyState from "../components/dashboard/EmptyState";
import ConfigWarningBanner from "../components/dashboard/ConfigWarningBanner";
import DetailModal from "../components/dashboard/DetailModal";
import CareerPortalCarousel from "../components/careers/CareerPortalCarousel";
import { fetchCareersPortalData } from "../utils/careersService";
import type { CareerPortalCard } from "../types";
import { editorial } from "../theme/editorial";

function DashboardCareerCarousel() {
  const navigate = useNavigate();
  const [careerPortalCards, setCareerPortalCards] = useState<CareerPortalCard[]>([]);
  const [careerPortalCardsLoading, setCareerPortalCardsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void fetchCareersPortalData()
      .then((data) => {
        if (mounted) setCareerPortalCards(data.portalCards);
      })
      .catch(() => {
        if (mounted) setCareerPortalCards([]);
      })
      .finally(() => {
        if (mounted) setCareerPortalCardsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleCareerCardTarget = (card: CareerPortalCard) => {
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
    <Box component="section" sx={{ mb: { xs: 3, md: 4 } }}>
      <CareerPortalCarousel cards={careerPortalCards} loading={careerPortalCardsLoading} onCardTarget={handleCareerCardTarget} />
    </Box>
  );
}

export default function AdminHomePage() {
  const {
    userEmail,
    isAdmin,
    canUseFormBuilder,
    submissions,
    visibleLists,
    listMetaMap,
    missingConfigs,
    hasFilters,
    detailItem,
    setDetailItem,
    search,
    setSearch,
    listFilter,
    setListFilter,
    statusFilter,
    setStatusFilter,
    sortBy,
    setSortBy,
    submitterFilter,
    setSubmitterFilter,
    sortedSubmissions,
    onSignOut,
    onSwitchAccount,
    onOpenBuilder,
    onEditForm,
  } = useDashboard();
  const workspaceLabel = isAdmin ? "Admin workspace" : "Employee workspace";
  const dashboardSubtitle = isAdmin
    ? canUseFormBuilder
      ? "Manage HR forms, review submissions, monitor approval workflows, and maintain form configurations."
      : "Review submissions, monitor approval workflows, and manage HR portal operations."
    : "Submit HR forms, track approval status, and access your submission history.";

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background:
          "var(--app-bg, linear-gradient(180deg, #F4FAFE 0%, #F9FBFE 42%, #FFFFFF 100%))",
        color: editorial.ink,
        WebkitFontSmoothing: "antialiased",
        position: "relative",
        "&::before": {
          content: '""',
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          background:
            "linear-gradient(90deg, rgba(0, 120, 212, 0.07) 0%, rgba(255,255,255,0) 34%, rgba(98, 100, 167, 0.06) 100%)",
        },
      }}
    >
      <Header
        userEmail={userEmail}
        isAdmin={isAdmin}
        canUseFormBuilder={canUseFormBuilder}
        onLogout={onSignOut}
        onSwitch={onSwitchAccount}
        onOpenBuilder={onOpenBuilder}
      />

      <Box
        sx={{
          maxWidth: 1440,
          mx: "auto",
          px: { xs: 1.5, sm: 3, md: 4 },
          py: { xs: 2, sm: 3, md: 4 },
          position: "relative",
          zIndex: 1,
        }}
      >
        <Box
          component="section"
          sx={{
            mb: { xs: 2.5, md: 3.5 },
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(280px, auto)" },
            gap: { xs: 2, md: 3 },
            alignItems: "end",
          }}
        >
          <Box>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", mb: 1.5 }}>
              <Chip
                icon={<DashboardIcon />}
                label={workspaceLabel}
                size="small"
                sx={{
                  backgroundColor: isAdmin ? editorial.purpleWash : editorial.blueWash,
                  color: isAdmin ? editorial.pmwPurpleDark : editorial.pmwBlueDark,
                  border: `1px solid ${isAdmin ? editorial.pmwPurpleSoft : editorial.pmwBlueSoft}`,
                  fontWeight: 800,
                  "& .MuiChip-icon": {
                    color: isAdmin ? editorial.pmwPurpleDark : editorial.pmwBlueDark,
                  },
                }}
              />
              <Chip
                label={`${visibleLists.length} visible form${visibleLists.length === 1 ? "" : "s"}`}
                size="small"
                sx={{
                  backgroundColor: "rgba(255, 255, 255, 0.82)",
                  color: editorial.muted,
                  border: `1px solid ${editorial.border}`,
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                }}
              />
            </Stack>
            <Typography
              variant="h1"
              sx={{
                color: editorial.ink,
                fontSize: { xs: "2rem", sm: "2.55rem", md: "3rem" },
                lineHeight: 1,
                textWrap: "balance",
              }}
            >
              PMW Group HR Portal
            </Typography>
            <Typography
              variant="h6"
              sx={{
                color: editorial.muted,
                fontWeight: 700,
                mt: 1,
                maxWidth: 820,
                textWrap: "pretty",
              }}
            >
              {dashboardSubtitle}
            </Typography>
          </Box>
          <Box
            sx={{
              justifySelf: { xs: "start", md: "end" },
              display: "grid",
              gridTemplateColumns: "40px minmax(0, 1fr)",
              gap: 1.25,
              alignItems: "center",
              maxWidth: "100%",
              px: 1.5,
              py: 1.25,
              borderRadius: "8px",
              color: editorial.muted,
              backgroundColor: "rgba(255, 255, 255, 0.78)",
              border: `1px solid ${editorial.border}`,
              boxShadow: "0 10px 28px rgba(0, 90, 158, 0.08)",
            }}
          >
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isAdmin ? editorial.purpleWash : editorial.blueWash,
                color: isAdmin ? editorial.pmwPurpleDark : editorial.pmwBlueDark,
              }}
            >
              {isAdmin ? <AdminIcon sx={{ fontSize: 20 }} /> : <PersonIcon sx={{ fontSize: 20 }} />}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" sx={{ color: editorial.softMuted, fontWeight: 800 }}>
                Signed in as
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: editorial.ink,
                  fontWeight: 800,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {userEmail}
              </Typography>
            </Box>
          </Box>
        </Box>

        <DashboardCareerCarousel />

        {missingConfigs.length > 0 && (
          <Box sx={{ mb: 4 }}>
            <ConfigWarningBanner missingLists={missingConfigs} />
          </Box>
        )}

        <Box sx={{ mb: 4 }}>
          <StatsRow submissions={submissions} />
        </Box>

        {visibleLists.length > 0 && (
          <Box sx={{ mb: 4 }}>
            <ListSummaryCards
              submissions={submissions}
              visibleLists={visibleLists}
              listMetaMap={listMetaMap}
              isAdmin={isAdmin}
              canUseFormBuilder={canUseFormBuilder}
              onEditForm={onEditForm}
            />
          </Box>
        )}

        <Box sx={{ mb: 4 }}>
          <Toolbar
            search={search}
            setSearch={setSearch}
            listFilter={listFilter}
            setListFilter={setListFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            sortBy={sortBy}
            setSortBy={setSortBy}
            submitterFilter={submitterFilter}
            setSubmitterFilter={setSubmitterFilter}
            isAdmin={isAdmin}
            visibleLists={visibleLists}
            total={submissions.length}
            filtered={sortedSubmissions.length}
          />
        </Box>

        {sortedSubmissions.length > 0 ? (
          <>
            <ListHeader isAdmin={isAdmin} />
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {sortedSubmissions.map((item) => (
                <SubmissionRow
                  key={`${item.listTitle}-${item.id}`}
                  item={item}
                  onView={setDetailItem}
                  isAdmin={isAdmin}
                  listMetaMap={listMetaMap}
                />
              ))}
            </Box>
          </>
        ) : (
          <EmptyState hasFilters={hasFilters} />
        )}
      </Box>

      <DetailModal item={detailItem} isAdmin={isAdmin} onClose={() => setDetailItem(null)} />
    </Box>
  );
}
