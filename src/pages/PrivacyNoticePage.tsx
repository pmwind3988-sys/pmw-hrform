import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Link,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useInShell } from "../components/shell/ShellContext";
import ShieldIcon from "@mui/icons-material/Shield";
import { editorial, si, siType } from "../theme/editorial";
import { usePdpaLocale } from "../hooks/usePdpaLocale";
import Card from "../components/common/Card";
import {
  getPdpaContent,
  getPdpaNoticeVersion,
  PDPA_CONTACT,
  PDPA_CONTROLLER_NAME,
  PDPA_LOCALES,
  type PdpaListItem,
  type PdpaListMarker,
  type PdpaNoticeBlock,
  type PdpaNoticeContent,
  type PdpaNoticeSection,
} from "../utils/pdpa";

const LIST_STYLE: Record<PdpaListMarker, string> = {
  alpha: "lower-alpha",
  roman: "lower-roman",
  decimal: "decimal",
};

const bodyTextSx = { color: editorial.muted, lineHeight: 1.75, fontSize: "0.9375rem" } as const;

/** Comfortable reading measure for the legal text. */
const MEASURE = "68ch";

/** Plain-words summary, written from sections B, C and J of the notice. Not legal text. */
const SUMMARY: Record<string, { heading: string; text: string; note: string }> = {
  en: {
    heading: "In short",
    text: "We collect the details you give us in forms and on our portals, and use them for the purposes set out in section B. They may be shared within the Group and with the service providers, authorities and other parties listed in section C. You can ask in writing to see or correct your data, or to withdraw your consent. Section J says where to send your request.",
    note: "This summary does not replace the full notice below.",
  },
  ms: {
    heading: "Ringkasnya",
    text: "Kami mengumpul maklumat yang anda berikan dalam borang dan portal kami, dan menggunakannya bagi tujuan yang dinyatakan dalam bahagian B. Maklumat ini mungkin dikongsi dalam Kumpulan dan dengan pembekal perkhidmatan, pihak berkuasa serta pihak lain yang disenaraikan dalam bahagian C. Anda boleh meminta secara bertulis untuk melihat atau membetulkan data anda, atau menarik balik persetujuan anda. Bahagian J menyatakan ke mana permintaan itu dihantar.",
    note: "Ringkasan ini tidak menggantikan notis penuh di bawah.",
  },
};

const BACK_LABEL: Record<string, string> = { en: "Back to HR portal", ms: "Kembali ke portal HR" };

function sectionAnchor(section: PdpaNoticeSection): string {
  return `notice-section-${section.id || section.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function NoticeList({ marker, items }: { marker: PdpaListMarker; items: readonly PdpaListItem[] }) {
  return (
    <Box
      component="ol"
      sx={{
        listStyleType: LIST_STYLE[marker],
        pl: 3,
        m: 0,
        mt: 1,
        "& > li": { mb: 1, pl: 0.5 },
        "& > li:last-of-type": { mb: 0 },
      }}
    >
      {items.map((item) => (
        <Box component="li" key={item.text} sx={bodyTextSx}>
          <Typography variant="body2" component="span" sx={bodyTextSx}>
            {item.text}
          </Typography>
          {item.items && item.items.length > 0 && (
            <NoticeList marker={item.items[0].marker ?? "roman"} items={item.items} />
          )}
        </Box>
      ))}
    </Box>
  );
}

function ContactBlock({ content }: { content: PdpaNoticeContent }) {
  const { ui } = content;
  return (
    <Box
      sx={{
        mt: 1.5,
        p: 2,
        borderRadius: `${si.radiusSm}px`,
        backgroundColor: editorial.blueSoft,
      }}
    >
      <Typography variant="body2" sx={{ color: editorial.ink, fontWeight: 700, mb: 0.75 }}>
        {content.contactEntity}
      </Typography>
      <Typography variant="body2" sx={bodyTextSx}>
        {ui.addressLabel}:{" "}
        {PDPA_CONTACT.addressLines.map((line, index) => (
          <Box component="span" key={line} sx={{ display: "block", pl: index === 0 ? 0 : 0 }}>
            {line}
          </Box>
        ))}
      </Typography>
      <Typography variant="body2" sx={{ ...bodyTextSx, mt: 1 }}>
        {ui.personInChargeLabel}: {content.personInCharge}
        <br />
        {ui.emailLabel}:{" "}
        <Link href={`mailto:${PDPA_CONTACT.email}`} sx={{ fontWeight: 700 }}>
          {PDPA_CONTACT.email}
        </Link>
        <br />
        {ui.telLabel}:{" "}
        <Link href={`tel:${PDPA_CONTACT.tel.replace(/[^\d+]/g, "")}`}>{PDPA_CONTACT.tel}</Link>
      </Typography>
    </Box>
  );
}

function NoticeBlock({ block, content }: { block: PdpaNoticeBlock; content: PdpaNoticeContent }) {
  if (block.kind === "contact") return <ContactBlock content={content} />;
  if (block.kind === "list") return <NoticeList marker={block.marker} items={block.items} />;
  return (
    <Typography variant="body2" sx={{ ...bodyTextSx, mt: 1 }}>
      {block.text}
    </Typography>
  );
}

function NoticeSection({ section, content }: { section: PdpaNoticeSection; content: PdpaNoticeContent }) {
  return (
    <Box id={sectionAnchor(section)} sx={{ scrollMarginTop: 24, maxWidth: MEASURE }}>
      <Typography component="h2" sx={{ ...siType.subsectionTitle, color: editorial.ink }}>
        {section.id ? `${section.id}. ` : ""}
        {section.title}
      </Typography>
      {section.blocks.map((block, index) => (
        <NoticeBlock key={index} block={block} content={content} />
      ))}
    </Box>
  );
}

export default function PrivacyNoticePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { locale, setLocale, content } = usePdpaLocale();
  const inShell = useInShell();
  const { ui } = content;

  return (
    <Box sx={{ minHeight: "100vh", background: "var(--app-bg, var(--app-bg-fallback))", py: { xs: 3, md: 5 } }}>
      <Container maxWidth="md">
        {/* Hidden inside the shell: this returns to a page the tab strip and bottom bar already reach. Public and guest renders get no shell, so they keep it. */}
        {!inShell && (
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => {
              // A page opened in a new tab has no history to step back through.
              if (location.key === "default") navigate("/");
              else navigate(-1);
            }}
            sx={{ mb: 2, color: editorial.navy }}
          >
            {BACK_LABEL[locale] ?? ui.back}
          </Button>
        )}

        <Card pad="none" clip>
          <Box sx={{ p: { xs: 3, md: 4 }, backgroundColor: editorial.white, color: editorial.ink }}>
            <Box
              sx={{
                mb: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2,
                flexWrap: "wrap",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <ShieldIcon aria-hidden />
                <Typography variant="overline" sx={{ ...siType.micro, color: editorial.muted }}>
                  {ui.eyebrow}
                </Typography>
              </Box>

              <ToggleButtonGroup
                exclusive
                value={locale}
                onChange={(_, next) => next && setLocale(next)}
                aria-label="Notice language / Bahasa notis"
                sx={{
                  backgroundColor: editorial.skySoft,
                  borderRadius: `${si.radiusPill}px`,
                  p: "3px",
                  gap: "2px",
                  "& .MuiToggleButtonGroup-grouped": { border: 0, borderRadius: `${si.radiusPill}px !important` },
                  "& .MuiToggleButton-root": {
                    textTransform: "none",
                    fontWeight: 600,
                    fontSize: "0.8125rem",
                    color: editorial.muted,
                    minHeight: 36,
                    px: 2,
                  },
                  "& .MuiToggleButton-root.Mui-selected": {
                    backgroundColor: editorial.navy,
                    color: editorial.white,
                    "&:hover": { backgroundColor: editorial.navyDeep },
                  },
                }}
              >
                {PDPA_LOCALES.map((option) => (
                  <ToggleButton key={option} value={option} lang={option} aria-pressed={option === locale}>
                    {getPdpaContent(option).ui.languageName}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>

            <Typography component="h1" sx={{ ...siType.pageTitle, color: editorial.ink }}>
              {ui.documentTitle}
            </Typography>
            <Typography sx={{ ...siType.body, mt: 1, color: editorial.muted }}>
              {PDPA_CONTROLLER_NAME} | {ui.versionLabel(getPdpaNoticeVersion(locale))}
            </Typography>
          </Box>

          <Box sx={{ p: { xs: 3, md: 4 } }} lang={locale}>
            <Box sx={{ mb: 3, p: 2.5, borderRadius: `${si.radius}px`, backgroundColor: editorial.sky, maxWidth: MEASURE }}>
              <Typography component="h2" sx={{ ...siType.cardTitle, color: editorial.navyDeep, mb: 0.5 }}>
                {(SUMMARY[locale] ?? SUMMARY.en).heading}
              </Typography>
              <Typography sx={{ fontSize: "0.9375rem", lineHeight: 1.7, color: editorial.ink }}>
                {(SUMMARY[locale] ?? SUMMARY.en).text}
              </Typography>
              <Typography sx={{ ...siType.subtext, color: editorial.muted, mt: 1 }}>
                {(SUMMARY[locale] ?? SUMMARY.en).note}
              </Typography>
            </Box>

            <Box component="nav" aria-label={locale === "ms" ? "Bahagian notis" : "Notice sections"} sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 3 }}>
              {[...content.sections, ...content.additionalTerms].map((section) => (
                <Chip
                  key={sectionAnchor(section)}
                  component="a"
                  href={`#${sectionAnchor(section)}`}
                  clickable
                  label={`${section.id ? `${section.id} · ` : ""}${section.title}`}
                  sx={{ backgroundColor: editorial.skySoft, color: editorial.ink, fontWeight: 500 }}
                />
              ))}
            </Box>

            <Typography sx={{ ...bodyTextSx, color: editorial.ink, maxWidth: MEASURE }}>
              {content.preamble}
            </Typography>

            <Divider sx={{ my: 3 }} />

            <Stack spacing={3}>
              {content.sections.map((section) => (
                <NoticeSection key={section.title} section={section} content={content} />
              ))}
            </Stack>

            <Divider sx={{ my: 3 }} />

            <Typography sx={{ ...bodyTextSx, color: editorial.ink, fontWeight: 700, mb: 2, maxWidth: MEASURE }}>
              {content.additionalTermsIntro}
            </Typography>

            <Stack spacing={3}>
              {content.additionalTerms.map((section) => (
                <NoticeSection key={section.title} section={section} content={content} />
              ))}
            </Stack>

            <Divider sx={{ my: 3 }} />

            <Typography sx={{ ...bodyTextSx, maxWidth: MEASURE }}>
              {ui.footer}
            </Typography>

            <Button
              component={RouterLink}
              to="/"
              variant="outlined"
              sx={{ mt: 3 }}
            >
              {ui.returnHome}
            </Button>
          </Box>
        </Card>
      </Container>
    </Box>
  );
}
