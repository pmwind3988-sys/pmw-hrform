import { useEffect, useMemo, useState } from "react";
import { Box, Typography } from "@mui/material";
import { useMsal } from "@azure/msal-react";
import { useDashboard } from "../contexts/DashboardContext";
import FormList, { type FormListEntry } from "../components/dashboard/FormList";
import ConfirmDialog from "../components/common/ConfirmDialog";
import { acquireAccessTokenSilentOrRedirect } from "../utils/authRecovery";
import { sharePointManageScope } from "../utils/sharePointScope";
import { getAllFormConfigs } from "../utils/formBuilderSP";
import { editorial, onCanvasMuted, siType } from "../theme/editorial";
import Card from "../components/common/Card";

/**
 * Forms → Available forms: the forms this account can open and fill in.
 *
 * WHERE THE SLUGS COME FROM. `visibleLists` is the set of SharePoint response
 * LISTS this account can see, and a list carries no slug — only a title. The
 * fill route is `/form/:slug`, so the page joins those lists to their `Master
 * Form` rows, which is where `Slug` and `IsPublished` live. Joining rather than
 * listing Master Form outright keeps the existing visibility rule: you see a
 * form because you can see its response list, exactly as before.
 *
 * A form whose join finds no published slug is still listed, and still says
 * what it is — it simply cannot be opened. Dropping it would leave someone
 * looking for a form that exists, and offering a button would land them on a
 * "form not found" page.
 */
export default function FormsPage() {
  const { visibleLists, listMetaMap, canUseFormBuilder, onEditForm } = useDashboard();
  const { instance, accounts } = useMsal();

  const [slugByTitle, setSlugByTitle] = useState<Record<string, string>>({});
  const [loadingSlugs, setLoadingSlugs] = useState(true);
  const [pendingOpen, setPendingOpen] = useState<FormListEntry | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoadingSlugs(true);
      try {
        const token = await acquireAccessTokenSilentOrRedirect(instance, {
          // No argument: the helper falls back to VITE_SP_SITE_URL, the home
          // site -- which is the site getAllFormConfigs queries anyway.
          scopes: [sharePointManageScope()],
          account: accounts[0],
        });
        const configs = await getAllFormConfigs(token);
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const config of configs) {
          // An unpublished form has no working route, so its slug is withheld
          // rather than offered and then failing.
          if (config.Title && config.Slug && config.IsPublished) map[config.Title] = config.Slug;
        }
        setSlugByTitle(map);
      } catch {
        // The list still renders; every form simply reads as unavailable, which
        // is the truth from this page's point of view.
        if (!cancelled) setSlugByTitle({});
      } finally {
        if (!cancelled) setLoadingSlugs(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [instance, accounts]);

  const forms = useMemo<FormListEntry[]>(
    () =>
      visibleLists.map((list) => ({
        title: list.title,
        slug: slugByTitle[list.title] ?? "",
        category: listMetaMap[list.title]?.category ?? "General",
      })),
    [visibleLists, slugByTitle, listMetaMap],
  );

  /**
   * Opens in a NEW TAB, deliberately.
   *
   * Filling a form is a long, losable piece of work, and this page is a list
   * people come back to. Navigating away in place would put an unsaved form one
   * stray Back press from gone.
   *
   * `noopener` is not optional on a `_blank` open: without it the new tab gets
   * a live `window.opener` handle to this one.
   */
  const openForm = (form: FormListEntry) => {
    window.open(`/form/${encodeURIComponent(form.slug)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <Box sx={{ maxWidth: 1000, mx: "auto" }}>
      <Typography sx={{ ...siType.subtext, ...onCanvasMuted, mb: 2 }}>
        {visibleLists.length === 0
          ? "No forms are available to this account."
          : `${visibleLists.length} form${visibleLists.length === 1 ? "" : "s"} available to you.${
              loadingSlugs ? " Checking which are published…" : ""
            }`}
      </Typography>

      {visibleLists.length > 0 ? (
        <FormList
          forms={forms}
          listMetaMap={listMetaMap}
          canUseFormBuilder={canUseFormBuilder}
          onOpenForm={setPendingOpen}
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
        <Card sx={{ textAlign: "center" }}>
          <Typography sx={{ ...siType.subsectionTitle, color: editorial.ink }}>
            No forms available yet
          </Typography>
          <Typography sx={{ ...siType.body, color: editorial.muted, mt: 0.75 }}>
            This account has not been granted access to any form libraries. Ask an HR Forms
            administrator to add you to the group for the forms you need.
          </Typography>
        </Card>
      )}

      <ConfirmDialog
        open={pendingOpen !== null}
        title={`Open ${pendingOpen?.title ?? "this form"}?`}
        body="It opens in a new tab so this list stays where it is. You can fill it in and submit there."
        confirmLabel="Open form"
        onConfirm={() => {
          const target = pendingOpen;
          setPendingOpen(null);
          if (target) openForm(target);
        }}
        onClose={() => setPendingOpen(null)}
      />
    </Box>
  );
}
