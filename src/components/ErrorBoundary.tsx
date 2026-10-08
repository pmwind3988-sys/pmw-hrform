/**
 * ErrorBoundary.tsx — Catches render errors and shows a fallback UI
 * instead of crashing the entire page.
 */
import { Component } from "react";
import { ContentCopyRounded, RefreshRounded } from "@mui/icons-material";
import StatusPanel from "./common/StatusPanel";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** `page` owns the screen; `inline` sits inside the shell's content area. */
  variant?: "page" | "inline";
}

interface State {
  hasError: boolean;
  error: Error | null;
  copied: boolean;
}

/** A deploy replaced the code this tab was built from; the fix is a reload. */
export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  return /ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    message,
  );
}

/**
 * The crash screen.
 *
 * It used to show a ⚠ glyph and the raw stack trace to everyone, with a plain
 * <button> that had no focus style. Now it says what happened in one line,
 * offers a reload, and keeps the technical detail one click away on the
 * clipboard — where IT can use it — rather than on screen, where nobody else
 * can.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, copied: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.props.onError?.(error, errorInfo);
  }

  private copyDetails = () => {
    const { error } = this.state;
    const details = [
      `Page: ${window.location.pathname}`,
      `Time: ${new Date().toISOString()}`,
      `Error: ${error?.name ?? "Error"}: ${error?.message ?? "Unknown error"}`,
      error?.stack ?? "",
    ].join("\n");
    void navigator.clipboard?.writeText(details).then(
      () => this.setState({ copied: true }),
      () => this.setState({ copied: false }),
    );
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const variant = this.props.variant ?? "page";
    const reload = { label: "Reload", onClick: () => window.location.reload(), icon: <RefreshRounded /> };

    if (isStaleBuildError(this.state.error)) {
      return (
        <StatusPanel
          variant={variant}
          tone="waiting"
          title="A new version of the portal is ready"
          body="It was updated while this tab was open. Reload to carry on; nothing you've submitted is lost."
          primary={reload}
        />
      );
    }

    return (
      <StatusPanel
        variant={variant}
        tone="unknown"
        title="This page ran into a problem"
        body="Reloading usually fixes it. Anything you already submitted is safe."
        primary={reload}
        secondary={{
          label: this.state.copied ? "Details copied" : "Copy details for IT",
          onClick: this.copyDetails,
          icon: <ContentCopyRounded />,
        }}
        code={this.state.error?.name && this.state.error.name !== "Error" ? this.state.error.name : undefined}
      />
    );
  }
}
