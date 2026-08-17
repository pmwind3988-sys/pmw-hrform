import { getPdpaContent, PDPA_LOCALES, type PdpaLocale } from "../utils/pdpa";

type Props = {
  locale: PdpaLocale;
  onChange: (locale: PdpaLocale) => void;
  /** Colour for the inactive options; the active one always uses `color`. */
  mutedColor?: string;
  color?: string;
};

/**
 * Inline "English | Bahasa Malaysia" switch for the consent wording. Kept as
 * plain elements with inherited typography so it can sit inside the MUI form
 * pages and the native-renderer markup alike.
 *
 * Act 709 s.7(3) requires the notice in both languages, so the person must be
 * able to switch at the point of consent, not only on the notice page.
 */
export default function PdpaLanguageToggle({ locale, onChange, mutedColor, color }: Props) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.75rem" }}>
      {PDPA_LOCALES.map((option, index) => {
        const active = option === locale;
        return (
          <span key={option} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {index > 0 && <span style={{ color: mutedColor, opacity: 0.5 }}>|</span>}
            <button
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
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                font: "inherit",
                fontSize: "0.75rem",
                fontWeight: active ? 800 : 500,
                color: active ? color : mutedColor,
                textDecoration: active ? "underline" : "none",
              }}
            >
              {getPdpaContent(option).ui.languageName}
            </button>
          </span>
        );
      })}
    </span>
  );
}
