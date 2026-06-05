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
  return (
    <Box sx={{ minHeight: "100vh", background: "var(--app-bg, linear-gradient(180deg, #EAF5FC 0%, #F7FAFD 48%, #FFFFFF 100%))" }}>
      <Header
        userEmail={userEmail}
        isAdmin={isAdmin}
        onLogout={onSignOut}
        onSwitch={onSwitchAccount}
        onOpenBuilder={onOpenBuilder}
      />

      <Box sx={{ maxWidth: 1440, mx: "auto", px: { xs: 1.5, sm: 3, md: 4 }, py: { xs: 2, sm: 3, md: 4 } }}>
        <Box
          component="section"
          sx={{
            mb: { xs: 2.5, md: 4 },
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) auto" },
            gap: 2,
            alignItems: "center",
          }}
        >
          <Box>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", mb: 1.25 }}>
              <Chip
                icon={<DashboardIcon />}
                label={isAdmin ? "Admin workspace" : "Employee workspace"}
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
            </Stack>
            <Typography
              variant="h1"
              sx={{
                color: editorial.ink,
                fontSize: { xs: "2.1rem", sm: "2.7rem", md: "3.2rem" },
                lineHeight: 1.02,
              }}
            >
              {isAdmin ? "PMW Group HR Portal" : "PMW Group HR Portal"}
            </Typography>
            <Typography
              variant="h6"
              sx={{
                color: editorial.ink,
                fontWeight: 800,
                mt: 1,
                maxWidth: 760,
              }}
            >
              {isAdmin
                ? "Manage HR forms, review submissions, monitor approval workflows, and maintain form configurations."
                : "Submit HR forms, track approval status, and access your submission history."}
            </Typography>
          </Box>
          <Typography
            variant="body2"
            sx={{
              justifySelf: { xs: "start", md: "end" },
              display: "inline-flex",
              alignItems: "center",
              gap: 0.75,
              maxWidth: "100%",
              px: 1.25,
              py: 0.75,
              borderRadius: "10px",
              color: editorial.muted,
              backgroundColor: "rgba(255, 255, 255, 0.72)",
              border: `1px solid ${editorial.border}`,
            }}
          >
            {isAdmin ? <AdminIcon sx={{ fontSize: 18, color: editorial.pmwPurpleDark }} /> : <PersonIcon sx={{ fontSize: 18, color: editorial.pmwBlueDark }} />}
            {userEmail}
          </Typography>
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

      <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />
    </Box>
  );
}
