import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Container,
  Divider,
  Link,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ShieldIcon from "@mui/icons-material/Shield";
import { editorial } from "../theme/editorial";
import { usePdpaLocale } from "../hooks/usePdpaLocale";
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
        border: `1px solid ${editorial.ink}`,
        borderRadius: "12px",
        backgroundColor: editorial.blueSoft,
      }}
    >
      <Typography variant="body2" sx={{ color: editorial.ink, fontWeight: 800, mb: 0.75 }}>
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
      <Typography variant="h6" sx={{ fontWeight: 800, color: editorial.ink }}>
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
  const { ui } = content;

  return (
    <Box sx={{ minHeight: "100vh", background: "linear-gradient(180deg, #BFDDF4 0%, #DCECF8 42%, #F7F5EF 100%)", py: { xs: 3, md: 5 } }}>
      <Container maxWidth="md">
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(-1)}
          sx={{ mb: 2, textTransform: "none", color: editorial.ink, fontWeight: 800 }}
        >
          {ui.back}
        </Button>

        <Paper sx={{ borderRadius: "18px", overflow: "hidden", border: `1px solid ${editorial.ink}`, boxShadow: "none" }}>
          <Box sx={{ p: { xs: 3, md: 5 }, backgroundColor: editorial.yellow, color: editorial.ink, borderBottom: `1px solid ${editorial.ink}` }}>
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
                <Typography variant="overline" sx={{ letterSpacing: 0, fontWeight: 700 }}>
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
                  backgroundColor: "rgba(255,255,255,0.55)",
                  "& .MuiToggleButton-root": {
                    textTransform: "none",
                    fontWeight: 800,
                    color: editorial.ink,
                    borderColor: editorial.ink,
                    px: 1.5,
                  },
                  "& .MuiToggleButton-root.Mui-selected": {
                    backgroundColor: editorial.ink,
                    color: editorial.yellow,
                    "&:hover": { backgroundColor: editorial.ink },
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

            <Typography variant="h1" sx={{ fontSize: { xs: "2.5rem", md: "4rem" } }}>
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
              sx={{ mt: 3, borderRadius: 0, textTransform: "none", fontWeight: 800 }}
            >
              {ui.returnHome}
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
