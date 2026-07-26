import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  Collapse,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import {
  AdminPanelSettings as AdminIcon,
  ExpandLess,
  ExpandMore,
  FileDownloadOutlined as FileDownloadIcon,
  FilterList as FilterListIcon,
  RestartAlt as ClearFiltersIcon,
  Search as SearchIcon,
} from "@mui/icons-material";
import type { DiscoveredList } from "../../types";
import { editorial, editorialShadow } from "../../theme/editorial";
import { EMPTY_SUBMISSION_FILTERS, countActiveFilters } from "../../utils/submissionFilters";
import type { SubmissionFilterState } from "../../utils/submissionFilters";

interface ToolbarProps {
  filters: SubmissionFilterState;
  setFilters: (filters: SubmissionFilterState) => void;
  sortBy: string;
  setSortBy: (v: string) => void;
  isAdmin: boolean;
  canExportSubmissions: boolean;
  onOpenExport: () => void;
  visibleLists: DiscoveredList[];
  total: number;
  filtered: number;
}

export default function Toolbar({
  filters,
  setFilters,
  sortBy,
  setSortBy,
  isAdmin,
  canExportSubmissions,
  onOpenExport,
  visibleLists,
  total,
  filtered,
}: ToolbarProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const patch = (next: Partial<SubmissionFilterState>) => setFilters({ ...filters, ...next });
  const detailedFilterCount = countActiveFilters(filters) + (sortBy !== "newest" ? 1 : 0);
  const hasFilters = detailedFilterCount > 0;
  const searchFieldSx = {
    minWidth: 0,
    "& .MuiOutlinedInput-root": {
      borderRadius: "10px",
      backgroundColor: editorial.paperSoft,
      transition: "background-color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
      "&:hover": {
        backgroundColor: editorial.blueSoft,
      },
      "&.Mui-focused": {
        backgroundColor: "#ffffff",
        boxShadow: `0 0 0 3px ${editorial.pmwBlueSoft}`,
      },
    },
  } as const;
  const selectSx = {
    borderRadius: "10px",
    backgroundColor: editorial.paperSoft,
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
      borderColor: editorial.pmwBlue,
    },
  } as const;
  const clearFilters = () => {
    setFilters(EMPTY_SUBMISSION_FILTERS);
    setSortBy("newest");
  };

  return (
    <Box
      sx={{
        backgroundColor: "rgba(255, 255, 255, 0.92)",
        borderRadius: "12px",
        boxShadow: editorialShadow,
        p: { xs: 1.5, sm: 2 },
      }}
    >
      <Stack spacing={{ xs: 1.5, sm: 2 }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            gap: { xs: 1, sm: 1.5 },
            alignItems: "center",
          }}
        >
          <TextField
            placeholder="Search submissions..."
            value={filters.search}
            onChange={(e) => patch({ search: e.target.value })}
            size="small"
            sx={searchFieldSx}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: editorial.muted, fontSize: 20 }} />
                  </InputAdornment>
                ),
              },
            }}
          />

          <Button
            variant={advancedOpen ? "contained" : "outlined"}
            startIcon={<FilterListIcon />}
            endIcon={advancedOpen ? <ExpandLess /> : <ExpandMore />}
            onClick={() => setAdvancedOpen((open) => !open)}
            sx={{
              justifySelf: "end",
              height: 40,
              minWidth: { xs: 116, sm: 178 },
              px: { xs: 1.25, sm: 2 },
              borderRadius: "10px",
              whiteSpace: "nowrap",
              ...(advancedOpen
                ? {
                    backgroundColor: editorial.pmwBlue,
                    color: editorial.white,
                    boxShadow: `inset 0 0 0 1px ${editorial.pmwBlue}`,
                    "&:hover": {
                      backgroundColor: editorial.pmwBlueDark,
                    },
                  }
                : {
                    backgroundColor: editorial.white,
                    color: editorial.pmwBlueDark,
                    boxShadow: `inset 0 0 0 1px ${editorial.pmwBlueSoft}`,
                    "&:hover": {
                      backgroundColor: editorial.blueWash,
                      boxShadow: `inset 0 0 0 1px ${editorial.pmwBlue}`,
                    },
                  }),
              transition: "background-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
              "&:active": {
                transform: "scale(0.96)",
              },
              "& .MuiButton-startIcon": {
                mr: { xs: 0.5, sm: 0.75 },
              },
              "& .MuiButton-endIcon": {
                ml: { xs: 0.25, sm: 0.75 },
              },
            }}
          >
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
              Advanced Search
            </Box>
            <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
              Advanced
            </Box>
            {detailedFilterCount > 0 && (
              <Box component="span" sx={{ ml: 0.75 }}>
                ({detailedFilterCount})
              </Box>
            )}
          </Button>
        </Box>

        <Collapse in={advancedOpen} timeout={180} unmountOnExit>
          <Box
            sx={{
              pt: 2,
              borderTop: `1px solid ${editorial.border}`,
            }}
          >
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: isAdmin ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))",
                  lg: isAdmin ? "repeat(4, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))",
                },
                gap: 2,
                alignItems: "center",
              }}
            >
              <FormControl size="small" sx={{ minWidth: 0 }}>
                <InputLabel>List</InputLabel>
                <Select
                  value={filters.listTitle}
                  label="List"
                  onChange={(e) => patch({ listTitle: e.target.value })}
                  sx={selectSx}
                >
                  <MenuItem value="">All lists</MenuItem>
                  {visibleLists.map((list) => (
                    <MenuItem key={list.title} value={list.title}>
                      {list.title}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 0 }}>
                <InputLabel>Status</InputLabel>
                <Select
                  value={filters.stage}
                  label="Status"
                  onChange={(e) => patch({ stage: e.target.value })}
                  sx={selectSx}
                >
                  <MenuItem value="all">All statuses</MenuItem>
                  <MenuItem value="pending">Pending</MenuItem>
                  <MenuItem value="inProgress">In Review</MenuItem>
                  <MenuItem value="approved">Approved</MenuItem>
                  <MenuItem value="fullyApproved">Fully Approved</MenuItem>
                  <MenuItem value="rejected">Rejected</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 0 }}>
                <InputLabel>Sort by</InputLabel>
                <Select
                  value={sortBy}
                  label="Sort by"
                  onChange={(e) => setSortBy(e.target.value)}
                  sx={selectSx}
                >
                  <MenuItem value="newest">Newest first</MenuItem>
                  <MenuItem value="oldest">Oldest first</MenuItem>
                  <MenuItem value="status">By status</MenuItem>
                  <MenuItem value="list">By list</MenuItem>
                </Select>
              </FormControl>

              {isAdmin && (
                <TextField
                  placeholder="Filter by submitter email..."
                  value={filters.submitter}
                  onChange={(e) => patch({ submitter: e.target.value })}
                  size="small"
                  sx={searchFieldSx}
                />
              )}
            </Box>

            {(isAdmin || canExportSubmissions) && (
              <Box
                sx={{
                  mt: 2,
                  display: "flex",
                  alignItems: { xs: "stretch", sm: "center" },
                  justifyContent: "space-between",
                  gap: 1.5,
                  flexDirection: { xs: "column", sm: "row" },
                }}
              >
                {isAdmin ? (
                  <Chip
                    icon={<AdminIcon />}
                    label="Admin - all users visible"
                    size="small"
                    sx={{
                      justifySelf: { xs: "stretch", lg: "end" },
                      width: { xs: "100%", lg: "auto" },
                      backgroundColor: editorial.purpleWash,
                      color: editorial.pmwPurpleDark,
                      border: `1px solid ${editorial.pmwPurpleSoft}`,
                      fontWeight: 800,
                      fontSize: "0.75rem",
                      height: 32,
                      "& .MuiChip-icon": {
                        color: editorial.pmwPurpleDark,
                      },
                    }}
                  />
                ) : (
                  <Box />
                )}

                {canExportSubmissions && (
                  <Button
                    variant="outlined"
                    startIcon={<FileDownloadIcon />}
                    onClick={onOpenExport}
                    sx={{
                      minHeight: 40,
                      borderRadius: "10px",
                      px: 1.5,
                      color: editorial.pmwBlueDark,
                      borderColor: editorial.pmwBlueSoft,
                      backgroundColor: editorial.white,
                      fontWeight: 800,
                      textTransform: "none",
                      transition: "background-color 0.18s ease, border-color 0.18s ease, transform 0.18s ease",
                      "&:hover": {
                        backgroundColor: editorial.blueWash,
                        borderColor: editorial.pmwBlue,
                      },
                      "&:active": {
                        transform: "scale(0.96)",
                      },
                    }}
                  >
                    Export submissions
                  </Button>
                )}
              </Box>
            )}
          </Box>
        </Collapse>

        {hasFilters && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, pt: 1, flexWrap: "wrap" }}>
            <FilterListIcon sx={{ fontSize: 18, color: editorial.muted }} />
            <Chip
              label={`Showing ${filtered} of ${total} submissions`}
              size="small"
              sx={{
                backgroundColor: editorial.blueWash,
                color: editorial.pmwBlueDark,
                border: `1px solid ${editorial.pmwBlueSoft}`,
                fontWeight: 800,
                fontSize: "0.75rem",
                height: 32,
                fontVariantNumeric: "tabular-nums",
              }}
            />
            <Button
              size="small"
              variant="text"
              startIcon={<ClearFiltersIcon />}
              onClick={clearFilters}
              sx={{
                color: editorial.pmwBlueDark,
                fontWeight: 800,
                textTransform: "none",
                minHeight: 32,
                px: 1,
                "&:hover": {
                  backgroundColor: editorial.blueWash,
                },
              }}
            >
              Clear filters
            </Button>
          </Box>
        )}
      </Stack>
    </Box>
  );
}
