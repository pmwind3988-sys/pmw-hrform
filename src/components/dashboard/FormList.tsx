import { Box, Button, IconButton, Tooltip, Typography } from "@mui/material";
import { DescriptionOutlined, EditOutlined, OpenInNewOutlined } from "@mui/icons-material";
import type { ListMetaEntry } from "../../types";
import { editorial, si, siType } from "../../theme/editorial";
import Card from "../common/Card";

export interface FormListEntry {
  /** The SharePoint response list title, and the form's display name. */
  title: string;
  /** Published slug, or "" when the form has never been published. */
  slug: string;
  category: string;
}

interface FormListProps {
  forms: FormListEntry[];
  listMetaMap: Record<string, ListMetaEntry>;
  canUseFormBuilder: boolean;
  onOpenForm: (form: FormListEntry) => void;
  onEditForm: (listTitle: string) => void;
}

/**
 * The forms someone can open and fill in.
 *
 * DELIBERATELY NOT A DASHBOARD. This replaced a grid of cards that each showed
 * a submission count and an approved/pending/rejected breakdown with a progress
 * bar. That is a report, and it was the first thing an employee met when they
 * came here to do the one thing this page is for: pick a form and fill it in.
 * Those numbers now live on My Submissions, where the rows they describe are.
 *
 * So a row carries a name, a category and a way in. Nothing is aggregated, and
 * nothing here changes as submissions come and go.
 *
 * A form with no published slug cannot be opened at all — `/form/:slug` has
 * nothing to resolve. It stays in the list, greyed, saying so, rather than
 * offering a button that would land on a "form not found" screen.
 */
export default function FormList({
  forms,
  listMetaMap,
  canUseFormBuilder,
  onOpenForm,
  onEditForm,
}: FormListProps) {
  return (
    <Card pad="none" clip>
      {forms.map((form, index) => {
        const meta = listMetaMap[form.title];
        const openable = Boolean(form.slug);

        return (
          <Box
            key={form.title}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: { xs: 1.5, sm: 2 },
              py: 1.25,
              minHeight: si.rowHeightTwoLine,
              // Separators between rows only — a line above the first row would
              // double the card's own border.
              borderTop: index === 0 ? "none" : `1px solid ${editorial.border}`,
            }}
          >
            {/* `meta.icon` is a Material icon NAME from `ICON_POOL`
                ("FactCheck", "Approval", ...), not a glyph — rendering it puts
                the word on screen. The card this replaced never used it
                either: it drew one fixed icon and let `meta.color` do the
                distinguishing, which is what happens here. */}
            <Box
              aria-hidden
              sx={{
                width: 34,
                height: 34,
                flexShrink: 0,
                borderRadius: `${si.radiusSm}px`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: meta?.pale || editorial.blueWash,
                color: meta?.color || editorial.navy,
              }}
            >
              <DescriptionOutlined sx={{ fontSize: 19 }} />
            </Box>

            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography noWrap sx={{ ...siType.cardTitle, color: editorial.ink }}>
                {form.title}
              </Typography>
              <Typography noWrap sx={{ ...siType.subtext, color: editorial.muted }}>
                {openable ? form.category : `${form.category} · not published yet`}
              </Typography>
            </Box>

            {canUseFormBuilder && (
              <Tooltip title="Edit in the form builder">
                <IconButton
                  size="small"
                  onClick={() => onEditForm(form.title)}
                  // No `title` here: this IconButton is the Tooltip's direct
                  // child, and MUI errors when a child carries its own title.
                  // `aria-label` still names the control for a screen reader.
                  aria-label={`Edit ${form.title} in the form builder`}
                  sx={{ color: editorial.muted }}
                >
                  <EditOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            )}

            <Button
              variant="contained"
              disabled={!openable}
              onClick={() => onOpenForm(form)}
              endIcon={<OpenInNewOutlined />}
              aria-label={`Open ${form.title}`}
              sx={{
                flexShrink: 0,
                borderRadius: `${si.radius}px`,
                minHeight: 36,
                px: 2,
                textTransform: "none",
                fontWeight: 700,
              }}
            >
              Open
            </Button>
          </Box>
        );
      })}
    </Card>
  );
}
