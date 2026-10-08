import { getPdpaContent, PDPA_LOCALES, type PdpaLocale } from "../utils/pdpa";
import { editorial } from "../theme/editorial";

type Props = {
  locale: PdpaLocale;
  onChange: (locale: PdpaLocale) => void;
  /** Colour for the inactive options; the active one always uses `color`. */
  mutedColor?: string;
  color?: string;
};

/**
 * Inline "English | Bahasa Malaysia" switch for the consent wording, drawn as a
 * small pill with the chosen language filled. Kept as plain elements with
 * inherited typography so it can sit inside the MUI form pages and the
 * native-renderer markup alike.
 *
 * Act 709 s.7(3) requires the notice in both languages, so the person must be
 * able to switch at the point of consent, not only on the notice page.
 */
export default function PdpaLanguageToggle({ locale, onChange, mutedColor, color }: Props) {
  return (
    <span
      role="group"
      aria-label="Notice language / Bahasa notis"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: 2,
        borderRadius: 999,
        backgroundColor: editorial.skySoft,
        fontSize: "0.78rem",
        verticalAlign: "middle",
      }}
    >
      {PDPA_LOCALES.map((option) => {
        const active = option === locale;
        return (
          <button
            key={option}
            type="button"
            lang={option}
            aria-pressed={active}
            onClick={(e) => {
              // These sit inside <label> elements on some forms; without this
              // the click would also toggle the consent checkbox.
              e.preventDefault();
              e.stopPropagation();
              onChange(option);
            }}
            style={{
              border: "none",
              cursor: "pointer",
              font: "inherit",
              fontSize: "0.78rem",
              fontWeight: active ? 700 : 500,
              minHeight: 28,
              padding: "0 12px",
              borderRadius: 999,
              backgroundColor: active ? editorial.white : "transparent",
              boxShadow: active ? "0 1px 2px rgba(15, 23, 42, 0.12)" : "none",
              color: active ? color ?? editorial.ink : mutedColor ?? editorial.muted,
            }}
          >
            {getPdpaContent(option).ui.languageName}
          </button>
        );
      })}
    </span>
  );
}
