import { Box, Typography } from "@mui/material";
import {
  AlternateEmailOutlined,
  ApartmentOutlined,
  BadgeOutlined,
  PhoneOutlined,
  VerifiedUserOutlined,
} from "@mui/icons-material";
import type { SvgIconComponent } from "@mui/icons-material";
import { useDashboard } from "../contexts/DashboardContext";
import { useUserProfile } from "../hooks/useUserProfile";
import { editorial, si, siType } from "../theme/editorial";

interface DetailRow {
  label: string;
  value: string;
  icon: SvgIconComponent;
}

/**
 * Profile → My Profile.
 *
 * A destination that did not exist. Who you are signed in as was a line inside
 * the dashboard's header card, and what you are permitted to do was implied by
 * which menu items happened to appear. Both are now stated outright, in one
 * place, because "why can't I see the builder?" is a question the old layout
 * gave nobody a way to answer.
 *
 * The directory fields come from Microsoft Graph and are read-only here on
 * purpose: they are owned by the tenant directory, and a form that looked
 * editable but silently discarded a corrected phone number would be worse than
 * no form.
 */
export default function ProfilePage() {
  const { userEmail, isAdmin, canUseFormBuilder } = useDashboard();
  const profile = useUserProfile();

  const permissions = [
    {
      granted: isAdmin,
      label: "Administrator",
      detail: "Manage jobs, portal cards, learning content and guest members.",
    },
    {
      granted: canUseFormBuilder,
      label: "Form Builder superuser",
      detail: "Build and publish forms, edit approval routing and the organisation directory.",
    },
  ];

  const rows: DetailRow[] = [
    { label: "Email", value: profile.email || userEmail, icon: AlternateEmailOutlined },
    { label: "Job title", value: profile.jobTitle, icon: BadgeOutlined },
    { label: "Department", value: profile.department, icon: ApartmentOutlined },
    { label: "Phone", value: profile.phone, icon: PhoneOutlined },
  ];

  const cardSx = {
    p: `${si.padLoose}px`,
    borderRadius: `${si.radius}px`,
    backgroundColor: editorial.panel,
    border: `1px solid ${editorial.border}`,
    boxShadow: si.shadow,
  };

  return (
    <Box sx={{ maxWidth: 860, mx: "auto", display: "grid", gap: 3 }}>
      <Box sx={cardSx}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              flexShrink: 0,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: editorial.navy,
              color: editorial.white,
              fontSize: "1.25rem",
              fontWeight: 700,
            }}
          >
            {(profile.displayName || userEmail || "?").trim().charAt(0).toUpperCase()}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ ...siType.pageTitle, color: editorial.ink }} noWrap>
              {profile.displayName || userEmail || "Signed in"}
            </Typography>
            <Typography sx={{ ...siType.subtext, color: editorial.muted }} noWrap>
              {profile.loading ? "Loading directory details…" : profile.email || userEmail}
            </Typography>
          </Box>
        </Box>

        {/**
          * A directory lookup can fail while the session is perfectly valid —
          * Graph consent, a network blip — so the failure is reported as
          * "details unavailable" rather than left to render as a profile with
          * every field mysteriously blank.
          */}
        {profile.error && (
          <Typography sx={{ ...siType.subtext, color: editorial.warning, mt: 2 }}>
            Directory details are unavailable right now. Your sign-in is unaffected.
          </Typography>
        )}

        <Box sx={{ mt: 3, display: "grid", gap: 0 }}>
          {rows.map((row) => (
            <Box
              key={row.label}
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "22px 1fr", sm: "22px 140px 1fr" },
                alignItems: "center",
                gap: 1.5,
                minHeight: si.rowHeight,
                borderTop: `1px solid ${editorial.border}`,
                py: 1,
              }}
            >
              <row.icon sx={{ fontSize: 18, color: editorial.muted }} />
              <Typography sx={{ ...siType.micro, color: editorial.muted }}>{row.label}</Typography>
              <Typography
                sx={{
                  ...siType.body,
                  color: row.value ? editorial.ink : editorial.softMuted,
                  gridColumn: { xs: "2", sm: "auto" },
                }}
              >
                {row.value || (profile.loading ? "…" : "Not set in the directory")}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={cardSx}>
        <Typography sx={{ ...siType.sectionTitle, color: editorial.ink }}>Your access</Typography>
        <Typography sx={{ ...siType.subtext, color: editorial.muted, mt: 0.5, mb: 2 }}>
          These come from SharePoint group membership. An HR Forms administrator changes them.
        </Typography>

        {permissions.map((permission) => (
          <Box
            key={permission.label}
            sx={{
              display: "flex",
              alignItems: "flex-start",
              gap: 1.5,
              py: 1.25,
              borderTop: `1px solid ${editorial.border}`,
            }}
          >
            <VerifiedUserOutlined
              sx={{
                fontSize: 18,
                mt: 0.25,
                flexShrink: 0,
                color: permission.granted ? editorial.success : editorial.softMuted,
              }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ ...siType.cardTitle, color: editorial.ink }}>
                {permission.label}
                <Typography
                  component="span"
                  sx={{
                    ...siType.micro,
                    ml: 1,
                    px: 0.75,
                    py: 0.25,
                    borderRadius: `${si.radiusBadge}px`,
                    backgroundColor: permission.granted ? editorial.successSoft : editorial.skySoft,
                    color: permission.granted ? editorial.success : editorial.muted,
                  }}
                >
                  {permission.granted ? "Granted" : "Not granted"}
                </Typography>
              </Typography>
              <Typography sx={{ ...siType.subtext, color: editorial.muted, mt: 0.25 }}>
                {permission.detail}
              </Typography>
            </Box>
          </Box>
        ))}

        {!isAdmin && !canUseFormBuilder && (
          <Typography sx={{ ...siType.subtext, color: editorial.muted, mt: 2 }}>
            You have standard employee access: fill in forms and track your own submissions.
          </Typography>
        )}
      </Box>
    </Box>
  );
}
