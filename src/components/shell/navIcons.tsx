import {
  ApartmentOutlined,
  AssignmentTurnedInOutlined,
  BadgeOutlined,
  BuildOutlined,
  DescriptionOutlined,
  FactCheckOutlined,
  GroupOutlined,
  InboxOutlined,
  PaletteOutlined,
  PersonOutlined,
  PolicyOutlined,
  SchoolOutlined,
  SpaceDashboardOutlined,
  StyleOutlined,
  TuneOutlined,
  WorkOutlineOutlined,
  AdminPanelSettingsOutlined,
} from "@mui/icons-material";
import type { SvgIconComponent } from "@mui/icons-material";
import type { NavIconKey } from "../../config/navigation";

/**
 * Icon per navigation entry.
 *
 * Kept out of `navigation.ts` on purpose: that module is imported by a unit
 * test, and pulling `@mui/icons-material` into it would drag the whole icon
 * package into a test that only cares about path matching. The config names an
 * icon; this resolves the name.
 *
 * `Record` rather than a lookup with a fallback, so adding a `NavIconKey`
 * without an icon fails the typecheck instead of silently rendering nothing.
 */
export const NAV_ICONS: Record<NavIconKey, SvgIconComponent> = {
  dashboard: SpaceDashboardOutlined,
  forms: DescriptionOutlined,
  submissions: InboxOutlined,
  approvals: AssignmentTurnedInOutlined,
  portal: WorkOutlineOutlined,
  learning: SchoolOutlined,
  admin: AdminPanelSettingsOutlined,
  profile: PersonOutlined,
  builder: BuildOutlined,
  routing: TuneOutlined,
  org: ApartmentOutlined,
  jobs: BadgeOutlined,
  applications: FactCheckOutlined,
  cards: StyleOutlined,
  guests: GroupOutlined,
  appearance: PaletteOutlined,
  privacy: PolicyOutlined,
};
