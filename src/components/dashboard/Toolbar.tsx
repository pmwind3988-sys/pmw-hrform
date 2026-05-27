import {
  Box,
  Chip,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import { Search as SearchIcon, FilterList as FilterListIcon } from "@mui/icons-material";
import type { DiscoveredList } from "../../types";
import { editorial } from "../../theme/editorial";

interface ToolbarProps {
  search: string;
  setSearch: (v: string) => void;
  listFilter: string;
  setListFilter: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  sortBy: string;
  setSortBy: (v: string) => void;
  submitterFilter: string;
  setSubmitterFilter: (v: string) => void;
  isAdmin: boolean;
  visibleLists: DiscoveredList[];
  total: number;
  filtered: number;
}

export default function Toolbar({
  search,
  setSearch,
  listFilter,
  setListFilter,
  statusFilter,
  setStatusFilter,
  sortBy,
  setSortBy,
  submitterFilter,
  setSubmitterFilter,
  isAdmin,
  visibleLists,
  total,
  filtered,
}: ToolbarProps) {
  const hasFilters =
    search || listFilter || statusFilter !== "all" || submitterFilter;

  return (
    <Box
      sx={{
        backgroundColor: "#ffffff",
        borderRadius: "14px",
        border: `1px solid ${editorial.border}`,
        boxShadow: "none",
        p: { xs: 1.5, sm: 2 },
      }}
    >
      <Stack spacing={{ xs: 1.5, sm: 2 }}>
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            flexWrap: "wrap",
            gap: 2,
            alignItems: { xs: "stretch", sm: "center" },
          }}
        >
          {/* Search */}
          <TextField
            placeholder="Search submissions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            sx={{
              flex: { xs: "none", sm: "1 1 280px" },
              minWidth: { xs: "100%", sm: 240 },
              "& .MuiOutlinedInput-root": {
                borderRadius: "10px",
                backgroundColor: editorial.paperSoft,
                transition: "all 0.2s ease",
                "&:hover": {
                  backgroundColor: editorial.blueWash,
                },
                "&.Mui-focused": {
                  backgroundColor: "#ffffff",
                  boxShadow: "0 0 0 3px rgba(255, 245, 70, 0.45)",
                },
              },
            }}
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

          {/* List filter */}
          <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 160 } }}>
            <InputLabel>List</InputLabel>
            <Select
              value={listFilter}
              label="List"
              onChange={(e) => setListFilter(e.target.value)}
              sx={{ borderRadius: "10px", backgroundColor: editorial.paperSoft }}
            >
              <MenuItem value="">All lists</MenuItem>
              {visibleLists.map((list) => (
                <MenuItem key={list.title} value={list.title}>
                  {list.title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Status filter */}
          <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 160 } }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              label="Status"
              onChange={(e) => setStatusFilter(e.target.value)}
              sx={{ borderRadius: "10px", backgroundColor: editorial.paperSoft }}
            >
              <MenuItem value="all">All statuses</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="inProgress">In Review</MenuItem>
              <MenuItem value="approved">Approved</MenuItem>
              <MenuItem value="fullyApproved">Fully Approved</MenuItem>
              <MenuItem value="rejected">Rejected</MenuItem>
            </Select>
          </FormControl>

          {/* Sort */}
          <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 140 } }}>
            <InputLabel>Sort by</InputLabel>
            <Select
              value={sortBy}
              label="Sort by"
              onChange={(e) => setSortBy(e.target.value)}
              sx={{ borderRadius: "10px", backgroundColor: editorial.paperSoft }}
            >
              <MenuItem value="newest">Newest first</MenuItem>
              <MenuItem value="oldest">Oldest first</MenuItem>
              <MenuItem value="status">By status</MenuItem>
              <MenuItem value="list">By list</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Admin submitter filter + indicator */}
        {isAdmin && (
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              flexWrap: "wrap",
              gap: 2,
              alignItems: { xs: "stretch", sm: "center" },
              pt: 2,
              borderTop: `1px solid ${editorial.border}`,
            }}
          >
            <TextField
              placeholder="Filter by submitter email..."
              value={submitterFilter}
              onChange={(e) => setSubmitterFilter(e.target.value)}
              size="small"
              sx={{
                flex: { xs: "none", sm: "1 1 280px" },
                minWidth: { xs: "100%", sm: 240 },
                "& .MuiOutlinedInput-root": {
                  borderRadius: "8px",
                  backgroundColor: editorial.paperSoft,
                  transition: "all 0.2s ease",
                  "&:hover": {
                    backgroundColor: editorial.blueWash,
                  },
                  "&.Mui-focused": {
                    backgroundColor: "#ffffff",
                    boxShadow: "0 0 0 3px rgba(255, 245, 70, 0.45)",
                  },
                },
              }}
            />
            <Chip
              label="Admin — all users visible"
              size="small"
              sx={{
                width: { xs: "100%", sm: "auto" },
                backgroundColor: editorial.yellow,
                color: editorial.ink,
                border: `1px solid ${editorial.ink}`,
                fontWeight: 500,
                fontSize: "0.75rem",
                height: 32,
              }}
            />
          </Box>
        )}

        {hasFilters && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, pt: 1 }}>
            <FilterListIcon sx={{ fontSize: 18, color: editorial.muted }} />
            <Chip
              label={`Showing ${filtered} of ${total} submissions`}
              size="small"
              sx={{
                backgroundColor: editorial.paperSoft,
                color: editorial.ink,
                border: `1px solid ${editorial.border}`,
                fontWeight: 500,
                fontSize: "0.75rem",
                height: 32,
              }}
            />
          </Box>
        )}
      </Stack>
    </Box>
  );
}
