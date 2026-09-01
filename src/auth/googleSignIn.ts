/**
 * Loading and driving Google Identity Services — the script that renders the
 * "Continue with Google" button and hands back an identity token.
 *
 * The script is fetched from Google rather than bundled, which is the one thing
 * in this application that reaches outside its own origin for code. **That means
 * the Content-Security-Policy has to allow it, in BOTH places it is written** —
 * the header in `vercel.json` and the `<meta http-equiv>` in `index.html`. A
 * page carrying both is held to the intersection, so widening only one changes
 * nothing at all: the script is blocked, `window.google` never appears, and the
 * button simply never renders with no error anywhere the user can see. The same
 * trap once left learning videos playing with dead controls.
 */

const GSI_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const GSI_SCRIPT_ID = "pmw-google-identity-services";

/** Public by nature — it identifies the application, it does not authenticate it. */
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export function googleSignInConfigured(): boolean {
  return GOOGLE_CLIENT_ID.length > 0;
}

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    ux_mode?: "popup" | "redirect";
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

let loadPromise: Promise<GoogleAccountsId> | null = null;

/**
 * Loads the Google script once per page and resolves when its API is usable.
 *
 * Cached in a module-level promise rather than re-checked, because two sign-in
 * surfaces mounting at once would otherwise each append a `<script>` tag and
 * race. A failed load clears the cache so a later retry can try again — the
 * usual cause is a blocked network or a Content-Security-Policy that has only
 * been widened in one of the two files, and neither is permanent.
 */
export function loadGoogleIdentityServices(): Promise<GoogleAccountsId> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<GoogleAccountsId>((resolve, reject) => {
    const ready = window.google?.accounts?.id;
    if (ready) {
      resolve(ready);
      return;
    }

    const fail = () => {
      loadPromise = null;
      reject(new Error("Google sign-in could not be loaded."));
    };

    const settle = () => {
      const api = window.google?.accounts?.id;
      if (api) resolve(api);
      else fail();
    };

    const existing = document.getElementById(GSI_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", settle, { once: true });
      existing.addEventListener("error", fail, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GSI_SCRIPT_ID;
    script.src = GSI_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", settle, { once: true });
    script.addEventListener("error", fail, { once: true });
    document.head.appendChild(script);
  });

  return loadPromise;
}

/**
 * Renders Google's own button into `parent` and calls back with the identity
 * token it produces.
 *
 * Google's rendered button is used rather than a button of our own calling a
 * Google API: their branding rules require it, and it is the only path that
 * keeps the credential exchange inside Google's frame rather than ours.
 */
export async function renderGoogleButton(
  parent: HTMLElement,
  onCredential: (credential: string) => void,
  options: { width?: number } = {},
): Promise<void> {
  if (!googleSignInConfigured()) throw new Error("Google sign-in is not configured.");

  const api = await loadGoogleIdentityServices();

  api.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (response) => {
      if (response.credential) onCredential(response.credential);
    },
    // No One Tap prompt. This sits on a sign-in screen where the person has
    // already decided to sign in; a floating overlay on top of the choice they
    // are making is noise, and it appears on pages they did not ask it to.
    auto_select: false,
    cancel_on_tap_outside: true,
    ux_mode: "popup",
  });

  parent.replaceChildren();
  api.renderButton(parent, {
    type: "standard",
    theme: "outline",
    size: "large",
    text: "continue_with",
    shape: "rectangular",
    logo_alignment: "left",
    width: options.width ?? 360,
  });
}

/** Stops Google offering the last-used account automatically after a sign-out. */
export function forgetGoogleAccount(): void {
  try {
    window.google?.accounts?.id?.disableAutoSelect();
  } catch {
    // The script may never have loaded. Nothing to forget in that case.
  }
}
