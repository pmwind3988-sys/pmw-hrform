import { Box, Dialog } from "@mui/material";
import Header from "../components/dashboard/Header";
import StatsRow from "../components/dashboard/StatsRow";
import ListSummaryCards from "../components/dashboard/ListSummaryCards";
import Toolbar from "../components/dashboard/Toolbar";
import ListHeader from "../components/dashboard/ListHeader";
import SubmissionRow from "../components/dashboard/SubmissionRow";
import EmptyState from "../components/dashboard/EmptyState";
import ConfigWarningBanner from "../components/dashboard/ConfigWarningBanner";
import DetailModal from "../components/dashboard/DetailModal";
import FormBuilder from "../components/builder/FormBuilder";
import type { Submission, DiscoveredList, ListMetaEntry } from "../types";

interface AdminDashboardProps {
  userEmail: string;
  isAdmin: boolean;
  submissions: Submission[];
  visibleLists: DiscoveredList[];
  listMetaMap: Record<string, ListMetaEntry>;
  missingConfigs: string[];
  hasFilters: boolean;
  detailItem: Submission | null;
  setDetailItem: (item: Submission | null) => void;
  search: string;
  setSearch: (s: string) => void;
  listFilter: string;
  setListFilter: (s: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  sortBy: string;
  setSortBy: (s: string) => void;
  submitterFilter: string;
  setSubmitterFilter: (s: string) => void;
  sortedSubmissions: Submission[];
  onSignOut: () => void;
  onSwitchAccount: () => void;
  onOpenBuilder: () => void;
  onEditForm: (listTitle: string) => void;
  builderOpen: boolean;
  setBuilderOpen: (open: boolean) => void;
  editingFormId: string | undefined;
  setEditingFormId: (id: string | undefined) => void;
}

export default function AdminDashboard({
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
  builderOpen,
  setBuilderOpen,
  editingFormId,
  setEditingFormId,
}: AdminDashboardProps) {
  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "#F8F9FC" }}>
      <Header
        userEmail={userEmail}
        isAdmin={isAdmin}
        onLogout={onSignOut}
        onSwitch={onSwitchAccount}
        onOpenBuilder={onOpenBuilder}
      />

      <Box sx={{ maxWidth: 1280, mx: "auto", px: { xs: 2, sm: 3, md: 4 }, py: 4 }}>
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

      <Dialog
        open={builderOpen}
        onClose={() => { setBuilderOpen(false); setEditingFormId(undefined); }}
        fullScreen
        slotProps={{
          paper: {
            sx: { backgroundColor: "#F8F9FC" },
          },
        }}
      >
        <FormBuilder
          formId={editingFormId}
          isAdmin={isAdmin}
          onClose={() => { setBuilderOpen(false); setEditingFormId(undefined); }}
        />
      </Dialog>
    </Box>
  );
}
