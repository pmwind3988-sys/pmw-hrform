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
  Typography,
} from "@mui/material";
import { Search as SearchIcon, FilterList as FilterListIcon } from "@mui/icons-material";
import type { DiscoveredList } from "../../types";

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
    <Stack spacing={2}>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 2,
          alignItems: "center",
        }}
      >
        {/* Search */}
        <TextField
          placeholder="Search submissions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          sx={{
            flex: "1 1 220px",
            minWidth: 200,
            "& .MuiOutlinedInput-root": {
              borderRadius: "10px",
              backgroundColor: "#ffffff",
            },
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: "rgba(0,0,0,0.3)", fontSize: 20 }} />
                </InputAdornment>
              ),
            },
          }}
        />

        {/* List filter */}
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>List</InputLabel>
          <Select
            value={listFilter}
            label="List"
            onChange={(e) => setListFilter(e.target.value)}
            sx={{ borderRadius: "10px", backgroundColor: "#ffffff" }}
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
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={statusFilter}
            label="Status"
            onChange={(e) => setStatusFilter(e.target.value)}
            sx={{ borderRadius: "10px", backgroundColor: "#ffffff" }}
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
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Sort by</InputLabel>
          <Select
            value={sortBy}
            label="Sort by"
            onChange={(e) => setSortBy(e.target.value)}
            sx={{ borderRadius: "10px", backgroundColor: "#ffffff" }}
          >
            <MenuItem value="newest">Newest first</MenuItem>
            <MenuItem value="oldest">Oldest first</MenuItem>
            <MenuItem value="status">By status</MenuItem>
            <MenuItem value="list">By list</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Admin submitter filter + indicator */}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 2,
          alignItems: "center",
        }}
      >
        {isAdmin && (
          <>
            <TextField
              placeholder="Filter by submitter email..."
              value={submitterFilter}
              onChange={(e) => setSubmitterFilter(e.target.value)}
              size="small"
              sx={{
                flex: "1 1 250px",
                minWidth: 200,
                "& .MuiOutlinedInput-root": {
                  borderRadius: "10px",
                  backgroundColor: "#ffffff",
                },
              }}
            />
            <Chip
              label="Admin — all users visible"
              size="small"
              sx={{
                backgroundColor: "rgba(98,100,167,0.08)",
                color: "#6264A7",
                border: "1px solid rgba(98,100,167,0.15)",
                fontWeight: 500,
                fontSize: "0.7rem",
              }}
            />
          </>
        )}

        {hasFilters && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, ml: "auto" }}>
            <FilterListIcon sx={{ fontSize: 16, color: "rgba(0,0,0,0.3)" }} />
            <Typography variant="body2" sx={{ color: "rgba(0,0,0,0.45)" }}>
              Showing {filtered} of {total} submissions
            </Typography>
          </Box>
        )}
      </Box>
    </Stack>
  );
}
