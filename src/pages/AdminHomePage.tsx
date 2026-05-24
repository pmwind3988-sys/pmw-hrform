import { useEffect, useState } from "react";
import { Box } from "@mui/material";
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
      navigate(`/career-portal/${encodeURIComponent(targetValue)}/apply`);
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
    <Box sx={{ minHeight: "100vh", background: "var(--app-bg, #F6F8FB)" }}>
      <Header
        userEmail={userEmail}
        isAdmin={isAdmin}
        onLogout={onSignOut}
        onSwitch={onSwitchAccount}
        onOpenBuilder={onOpenBuilder}
      />

      <Box sx={{ maxWidth: 1440, mx: "auto", px: { xs: 1.5, sm: 3, md: 4 }, py: { xs: 2, sm: 3, md: 4 } }}>
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
