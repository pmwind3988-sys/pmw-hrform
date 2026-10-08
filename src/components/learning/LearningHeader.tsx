import type { ReactNode } from "react";
import { Box, Button } from "@mui/material";
import { ArrowBackRounded } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useInShell } from "../shell/ShellContext";
import PageHeader, { type PageAction } from "../common/PageHeader";
import { editorial, onCanvas } from "../../theme/editorial";

interface LearningHeaderProps {
  title: string;
  description?: ReactNode;
  backPath: string;
  backLabel: string;
  primary?: PageAction;
  secondary?: PageAction[];
  more?: PageAction[];
  /**
   * Off where there is no dashboard behind this page -- a back
   * arrow that only ever returns here is worse than no arrow.
   */
  showBack?: boolean;
}

/**
 * The top of the learning pages: the shared page header, plus a way back for
 * the visitors who are not inside the app shell (guest members), whose only
 * other route out is the browser's back button.
 */
export default function LearningHeader({
  title,
  description,
  backPath,
  backLabel,
  primary,
  secondary,
  more,
  showBack = true,
}: LearningHeaderProps) {
  const inShell = useInShell();
  const navigate = useNavigate();

  return (
    <>
      {showBack && !inShell && (
        <Box sx={{ mb: 1 }}>
          <Button
            variant="text"
            startIcon={<ArrowBackRounded />}
            onClick={() => navigate(backPath)}
            sx={{ ...onCanvas, "&:hover": { backgroundColor: editorial.blueSoft } }}
          >
            {backLabel}
          </Button>
        </Box>
      )}
      <PageHeader title={title} description={description} primary={primary} secondary={secondary} more={more} />
    </>
  );
}
