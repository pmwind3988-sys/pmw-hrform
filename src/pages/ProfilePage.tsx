import { Box, Tooltip, Typography } from "@mui/material";
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
import Card from "../components/common/Card";
import PageHeader from "../components/common/PageHeader";

interface DetailRow {
  label: string;
  value: string;
  icon: SvgIconComponent;
}

/** "Aiman Rahman Bin Zainal" -> "AR". Falls back to the first letter of whatever we have. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}

/**
 * Profile → My Profile.
 *
 * Who you are signed in as and what you are permitted to do, in one place,
 * because "why can't I see the builder?" is a question the old layout gave
 * nobody a way to answer.
 *
 * The directory fields come from Microsoft Graph and are read-only here on
 * purpose: they are owned by the tenant directory, and a form that looked
 * editable but silently discarded a corrected phone number would be worse than
 * no form.
 */
export default function ProfilePage() {
  const { userEmail, isAdmin, canUseFormBuilder } = useDashboard();
  const profile = useUserProfile();

  const roles = [
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
  ].filter((role) => role.granted);

  const name = profile.displayName || userEmail || "Signed in";
  const roleLine = [profile.jobTitle, profile.department].filter(Boolean).join(" · ");

  const rows: DetailRow[] = [
    { label: "Work email", value: profile.email || userEmail, icon: AlternateEmailOutlined },
    { label: "Job title", value: profile.jobTitle, icon: BadgeOutlined },
    { label: "Department", value: profile.department, icon: ApartmentOutlined },
    { label: "Phone", value: profile.phone, icon: PhoneOutlined },
  ];
  const hasUnset = !profile.loading && rows.some((row) => !row.value);

  return (
    <Box sx={{ maxWidth: 860, mx: "auto" }}>
      <PageHeader title="My profile" />

      <Box sx={{ display: "grid", gap: 3 }}>
        <Card>
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 0.5 }}>
            <Box
              aria-hidden
              sx={{
                width: 88,
                height: 88,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: editorial.navy,
                color: editorial.white,
                fontSize: "1.9rem",
                fontWeight: 700,
                boxShadow: `0 0 0 6px ${editorial.sky}`,
                mb: 1.5,
              }}
            >
              {initialsOf(profile.displayName || userEmail)}
            </Box>
            <Typography component="h3" sx={{ ...siType.pageTitle, color: editorial.ink, maxWidth: "100%", overflowWrap: "anywhere" }}>
              {name}
            </Typography>
            <Typography sx={{ ...siType.body, color: editorial.muted, maxWidth: "100%", overflowWrap: "anywhere" }}>
              {profile.loading ? "Loading your details…" : roleLine || "Job title and department not set"}
            </Typography>

            {roles.length > 0 && (
              <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 1, mt: 1.5 }}>
                {roles.map((role) => (
                  <Tooltip key={role.label} title={role.detail}>
                    <Box
                      component="span"
                      tabIndex={0}
                      sx={{
                        ...siType.subtext,
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.75,
                        px: 1.5,
                        py: 0.5,
                        borderRadius: `${si.radiusPill}px`,
                        backgroundColor: editorial.successSoft,
                        color: editorial.success,
                      }}
                    >
                      <Box component="span" aria-hidden sx={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: editorial.success }} />
                      {role.label}
                    </Box>
                  </Tooltip>
                ))}
              </Box>
            )}
          </Box>

          {/**
            * A directory lookup can fail while the session is perfectly valid —
            * Graph consent, a network blip — so the failure is reported as
            * "details unavailable" rather than left to render as a profile with
            * every field mysteriously blank.
            */}
          {profile.error && (
            <Typography role="status" sx={{ ...siType.subtext, color: editorial.warning, mt: 2, textAlign: "center" }}>
              Directory details are unavailable right now. Your sign-in is unaffected.
            </Typography>
          )}
        </Card>

        <Card>
          <Typography component="h3" sx={{ ...siType.sectionTitle, color: editorial.ink, mb: 1 }}>
            Your details
          </Typography>
          <Box sx={{ display: "grid" }}>
            {rows.map((row) => {
              const missing = !row.value;
              return (
                <Box
                  key={row.label}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    minHeight: si.rowHeightTwoLine,
                    px: 1,
                    py: 1,
                    borderRadius: `${si.radius}px`,
                    "&:hover": { backgroundColor: editorial.blueSoft },
                  }}
                >
                  <Box
                    aria-hidden
                    sx={{
                      width: 40,
                      height: 40,
                      flexShrink: 0,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: missing ? editorial.skySoft : editorial.sky,
                      color: missing ? editorial.softMuted : editorial.navy,
                    }}
                  >
                    <row.icon sx={{ fontSize: 20 }} />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      sx={{
                        ...siType.cardTitle,
                        color: missing ? editorial.softMuted : editorial.ink,
                        fontWeight: missing ? 500 : 600,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {missing ? (profile.loading ? "…" : "Not set") : row.value}
                    </Typography>
                    <Typography sx={{ ...siType.subtext, color: editorial.muted }}>{row.label}</Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
          {hasUnset && (
            <Typography sx={{ ...siType.subtext, color: editorial.muted, mt: 1.5, px: 1 }}>
              “Not set” means HR has not added it to the company directory yet.
            </Typography>
          )}
        </Card>

        <Card>
          <Typography component="h3" sx={{ ...siType.sectionTitle, color: editorial.ink }}>
            Your access
          </Typography>
          <Typography sx={{ ...siType.subtext, color: editorial.muted, mt: 0.5, mb: 1.5 }}>
            Ask HR if something here is wrong.
          </Typography>

          {roles.map((role) => (
            <Box
              key={role.label}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                px: 1,
                py: 1,
                borderRadius: `${si.radius}px`,
                "&:hover": { backgroundColor: editorial.blueSoft },
              }}
            >
              <Box
                aria-hidden
                sx={{
                  width: 40,
                  height: 40,
                  flexShrink: 0,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: editorial.successSoft,
                  color: editorial.success,
                }}
              >
                <VerifiedUserOutlined sx={{ fontSize: 20 }} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ ...siType.cardTitle, color: editorial.ink }}>{role.label}</Typography>
                <Typography sx={{ ...siType.subtext, color: editorial.muted }}>{role.detail}</Typography>
              </Box>
            </Box>
          ))}

          {!isAdmin && !canUseFormBuilder && (
            <Typography sx={{ ...siType.body, color: editorial.muted, px: 1 }}>
              You have standard employee access: fill in forms and track your own submissions.
            </Typography>
          )}
        </Card>
      </Box>
    </Box>
  );
}
