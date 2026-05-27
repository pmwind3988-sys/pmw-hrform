import { Box, Stack, Typography } from "@mui/material";
import { Description as DescriptionIcon } from "@mui/icons-material";
import { editorial } from "../../theme/editorial";

interface EmptyStateProps {
  hasFilters: boolean;
}

export default function EmptyState({ hasFilters }: EmptyStateProps) {
  return (
    <Box sx={{ py: 8, display: "flex", justifyContent: "center" }}>
      <Stack
        spacing={2}
        sx={{
          alignItems: "center",
          maxWidth: 440,
          textAlign: "center",
          backgroundColor: "rgba(255,255,255,0.62)",
          border: `1px dashed ${editorial.ink}`,
          borderRadius: "14px",
          px: { xs: 3, sm: 5 },
          py: 5,
        }}
      >
        <DescriptionIcon
          sx={{
            fontSize: 64,
            color: editorial.ink,
          }}
        />

        <Typography
          variant="h5"
          sx={{
            fontFamily: "Georgia, 'Times New Roman', Times, serif",
            fontWeight: 400,
            color: editorial.ink,
            letterSpacing: 0,
          }}
        >
          {hasFilters ? "No submissions match your filters" : "No submissions yet"}
        </Typography>

        <Typography
          variant="body2"
          sx={{
            color: editorial.muted,
            lineHeight: 1.7,
          }}
        >
          {hasFilters
            ? "Try adjusting your search criteria or clearing some filters."
            : "Submissions will appear here once users start filling out the HR forms."}
        </Typography>
      </Stack>
    </Box>
  );
}
