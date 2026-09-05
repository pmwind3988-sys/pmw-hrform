import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
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
import { editorial, siType } from "../theme/editorial";
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

const bodyTextSx = { color: editorial.muted, lineHeight: 1.8 } as const;

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
        border: `1px solid ${editorial.border}`,
        borderRadius: "12px",
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
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 700, color: editorial.ink }}>
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
            onClick={() => navigate(-1)}
            sx={{ mb: 2, textTransform: "none", color: editorial.pmwBlueDark, fontWeight: 600 }}
          >
            {ui.back}
          </Button>
        )}

        <Card pad="none" clip>
          <Box sx={{ p: { xs: 3, md: 4 }, backgroundColor: editorial.white, color: editorial.ink, borderBottom: `1px solid ${editorial.border}` }}>
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
                <ShieldIcon />
                <Typography variant="overline" sx={{ ...siType.micro, color: editorial.muted }}>
                  {ui.eyebrow}
                </Typography>
              </Box>

              <ToggleButtonGroup
                exclusive
                size="small"
                value={locale}
                onChange={(_, next) => next && setLocale(next)}
                aria-label="Notice language / Bahasa notis"
                sx={{
                  backgroundColor: editorial.appSurface,
                  borderRadius: "12px",
                  "& .MuiToggleButton-root": {
                    textTransform: "none",
                    fontWeight: 600,
                    fontSize: "0.78rem",
                    color: editorial.muted,
                    borderColor: editorial.border,
                    borderRadius: "12px",
                    px: 1.5,
                  },
                  "& .MuiToggleButton-root.Mui-selected": {
                    backgroundColor: editorial.pmwBlue,
                    color: editorial.white,
                    borderColor: editorial.pmwBlue,
                    "&:hover": { backgroundColor: editorial.pmwBlueDark },
                  },
                }}
              >
                {PDPA_LOCALES.map((option) => (
                  <ToggleButton key={option} value={option} lang={option}>
                    {getPdpaContent(option).ui.languageName}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>

            <Typography variant="h1" sx={{ ...siType.pageTitle }}>
              {ui.documentTitle}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
              {PDPA_CONTROLLER_NAME} | {ui.versionLabel(getPdpaNoticeVersion(locale))}
            </Typography>
          </Box>

          <Box sx={{ p: { xs: 3, md: 4 } }} lang={locale}>
            <Typography variant="body1" sx={{ color: editorial.ink, lineHeight: 1.8 }}>
              {content.preamble}
            </Typography>

            <Divider sx={{ my: 3 }} />

            <Stack spacing={3}>
              {content.sections.map((section) => (
                <NoticeSection key={section.title} section={section} content={content} />
              ))}
            </Stack>

            <Divider sx={{ my: 3 }} />

            <Typography variant="body1" sx={{ color: editorial.ink, fontWeight: 700, mb: 2 }}>
              {content.additionalTermsIntro}
            </Typography>

            <Stack spacing={3}>
              {content.additionalTerms.map((section) => (
                <NoticeSection key={section.title} section={section} content={content} />
              ))}
            </Stack>

            <Divider sx={{ my: 3 }} />

            <Typography variant="body2" sx={bodyTextSx}>
              {ui.footer}
            </Typography>

            <Button
              component={RouterLink}
              to="/"
              variant="outlined"
              sx={{ mt: 3, borderRadius: "12px", textTransform: "none", fontWeight: 600 }}
            >
              {ui.returnHome}
            </Button>
          </Box>
        </Card>
      </Container>
    </Box>
  );
}
