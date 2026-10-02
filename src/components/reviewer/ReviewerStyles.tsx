import { REVIEWER_CSS } from "./reviewerTheme";

/** Mount once inside any reviewer screen so the shared classes exist. */
export default function ReviewerStyles() {
  return <style>{REVIEWER_CSS}</style>;
}
