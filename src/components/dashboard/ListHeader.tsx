import { Box, Typography, useMediaQuery, useTheme } from "@mui/material";
import { editorial, siType } from "../../theme/editorial";
import { SUBMISSION_GRID_COLUMNS, SUBMISSION_GRID_GAP } from "./submissionGrid";

interface ListHeaderProps {
  isAdmin: boolean;
}

export default function ListHeader({ isAdmin }: ListHeaderProps) {
  const theme = useTheme();
  // Rows fall back to the card layout below md, so the column header goes with them.
  const isCompact = useMediaQuery(theme.breakpoints.down("md"));

  if (isCompact) return null;

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: isAdmin ? SUBMISSION_GRID_COLUMNS.admin : SUBMISSION_GRID_COLUMNS.member,
        gap: SUBMISSION_GRID_GAP,
        px: 2.5,
        py: 1.25,
        // The canvas, so the header strip reads as a label band over the rows
        // rather than as one more white row among them.
        backgroundColor: editorial.appSurface,
        borderBottom: `1px solid ${editorial.border}`,
        alignItems: "center",
      }}
    >
      <Typography
        sx={{ ...siType.micro, color: editorial.muted }}
      >
        Submission
      </Typography>
      {isAdmin && (
        <Typography
          sx={{ ...siType.micro, color: editorial.muted }}
        >
          Submitted By
        </Typography>
      )}
      <Typography
        sx={{ ...siType.micro, color: editorial.muted }}
      >
        List
      </Typography>
      <Typography
        sx={{ ...siType.micro, color: editorial.muted }}
      >
        Submitted
      </Typography>
      <Typography
        sx={{ ...siType.micro, color: editorial.muted }}
      >
        Status
      </Typography>
      {isAdmin ? (
        <Typography
          variant="caption"
          sx={{
            textTransform: "uppercase",
            letterSpacing: 0,
            color: editorial.muted,
            fontWeight: 600,
            fontSize: "0.72rem",
            textAlign: "right",
          }}
        >
          Actions
        </Typography>
      ) : (
        <Box />
      )}
    </Box>
  );
}
