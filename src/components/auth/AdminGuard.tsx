/**
 * AdminGuard.tsx — Route guard for admin-only pages
 *
 * Wraps admin routes. A non-admin gets a calm "not for you" page with a button
 * back to their dashboard. Nothing redirects them on a timer.
 */
import { useNavigate } from "react-router-dom";
import StatusPanel from "../common/StatusPanel";

interface AdminGuardProps {
  isAdmin: boolean;
  restrictedTo?: string;
  children: React.ReactNode;
}

export default function AdminGuard({ isAdmin, restrictedTo, children }: AdminGuardProps) {
  const navigate = useNavigate();

  if (isAdmin) {
    return <>{children}</>;
  }

  // Inside the shell, so the navigation stays on screen and this needs no
  // full-height frame of its own.
  return (
    <StatusPanel
      variant="page"
      tone="no-access"
      title="This page isn't open to your account"
      body={`It's for ${restrictedTo || "HR Forms administrators"}. Ask an HR Forms administrator if you need access.`}
      primary={{ label: "Go to dashboard", onClick: () => navigate("/user/dashboard", { replace: true }) }}
    />
  );
}
