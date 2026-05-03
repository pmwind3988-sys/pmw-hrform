import { Box, Stack, Typography } from "@mui/material";
import { Description as DescriptionIcon } from "@mui/icons-material";

interface EmptyStateProps {
  hasFilters: boolean;
}

export default function EmptyState({ hasFilters }: EmptyStateProps) {
  return (
    <Box sx={{ py: 8, display: "flex", justifyContent: "center" }}>
      <Stack spacing={2} sx={{ alignItems: "center", maxWidth: 400, textAlign: "center" }}>
        <DescriptionIcon
          sx={{
            fontSize: 64,
            color: "rgba(0,0,0,0.12)",
          }}
        />

        <Typography
          variant="h5"
          sx={{
            fontWeight: 300,
            color: "#1a1a2e",
            letterSpacing: "-0.02em",
          }}
        >
          {hasFilters ? "No submissions match your filters" : "No submissions yet"}
        </Typography>

        <Typography
          variant="body2"
          sx={{
            color: "rgba(0,0,0,0.45)",
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
