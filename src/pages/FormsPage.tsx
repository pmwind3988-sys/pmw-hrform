import { Box, Typography } from "@mui/material";
import { useDashboard } from "../contexts/DashboardContext";
import ListSummaryCards from "../components/dashboard/ListSummaryCards";
import { editorial, si, siType } from "../theme/editorial";

/**
 * My Work → Forms: the forms this account can fill in.
 *
 * These cards were the third block down the old dashboard, below the hero and
 * the stat tiles, which is a strange place for the thing most employees came to
 * do. Given a section of their own they are the first thing on the screen.
 */
export default function FormsPage() {
  const { visibleLists, submissions, listMetaMap, isAdmin, canUseFormBuilder, onEditForm } =
    useDashboard();

  return (
    <Box sx={{ maxWidth: 1440, mx: "auto" }}>
      <Typography sx={{ ...siType.subtext, color: editorial.muted, mb: 2 }}>
        {visibleLists.length === 0
          ? "No forms are available to this account."
          : `${visibleLists.length} form${visibleLists.length === 1 ? "" : "s"} available to you.`}
      </Typography>

      {visibleLists.length > 0 ? (
        <ListSummaryCards
          submissions={submissions}
          visibleLists={visibleLists}
          listMetaMap={listMetaMap}
          isAdmin={isAdmin}
          canUseFormBuilder={canUseFormBuilder}
          onEditForm={onEditForm}
        />
      ) : (
        /**
         * Not the shared `EmptyState`: that one says "No submissions yet" and
         * offers to clear filters, and neither sentence is true here. An
         * account seeing this has no form libraries granted to it -- a
         * permissions question, and not one they can fix on this page, so the
         * copy points at who can.
         */
        <Box
          sx={{
            p: `${si.padLoose}px`,
            textAlign: "center",
            borderRadius: `${si.radius}px`,
            backgroundColor: editorial.panel,
            border: `1px solid ${editorial.border}`,
            boxShadow: si.shadow,
          }}
        >
          <Typography sx={{ ...siType.subsectionTitle, color: editorial.ink }}>
            No forms available yet
          </Typography>
          <Typography sx={{ ...siType.body, color: editorial.muted, mt: 0.75 }}>
            This account has not been granted access to any form libraries. Ask an HR Forms
            administrator to add you to the group for the forms you need.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
