/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AZURE_CLIENT_ID: string;
  readonly VITE_AZURE_TENANT_ID: string;
  readonly VITE_SP_SITE_URL: string;
  /** Optional second site the form builder may target. Blank disables the switcher. */
  readonly VITE_SP_SITE_URL_OSHES?: string;
  /** Group on the OSHES site whose members may author forms there. */
  readonly VITE_OSHES_ADMIN_GROUP?: string;
  /**
   * Deployment that serves OSHES forms, used for every link the builder issues
   * for that site. Defaults to https://pmw-oshes.vercel.app.
   */
  readonly VITE_APP_URL_OSHES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
