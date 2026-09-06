/**
 * PersonEmailField.tsx — an email box that finds people as they are typed.
 *
 * Approval routing matches on the exact address, so the reliable way to fill
 * one of these fields is to pick the person rather than to spell them. Typing
 * two letters of a name searches the company's Microsoft 365 directory the
 * way Outlook does, and anything typed by hand is still accepted, because a
 * contractor or a shared mailbox will not always be found there.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { editorial } from "../../theme/editorial";
import {
  acquirePeopleToken,
  lookupPeople,
  type DirectoryPerson,
  type PeopleSearchStatus,
} from "../../utils/peopleSearch";

export interface PersonEmailFieldProps {
  label: string;
  value: string;
  onChange: (email: string) => void;
  /**
   * Told when a whole person was picked rather than an address typed, so the
   * caller can fill in the name and department it came with.
   */
  onPickPerson?: (person: DirectoryPerson) => void;
  /** People already known locally, offered above anything found in M365. */
  localPeople?: DirectoryPerson[];
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
}

const key = (email: string) => email.trim().toLowerCase();

/** Matches the way a person picker does: on any word of the name or address. */
function matchesLocal(person: DirectoryPerson, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;
  return [person.name, person.email, person.department, person.position]
    .some((field) => (field || "").toLowerCase().includes(needle));
}

export default function PersonEmailField({
  label,
  value,
  onChange,
  onPickPerson,
  localPeople = [],
  helperText,
  required,
  disabled,
}: PersonEmailFieldProps) {
  const { instance, accounts } = useMsal();
  const account = accounts[0];

  const [query, setQuery] = useState(value);
  const [remote, setRemote] = useState<DirectoryPerson[]>([]);
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState<PeopleSearchStatus>("ok");
  const [consenting, setConsenting] = useState(false);
  /** Bumped after consent so a query already typed searches again. */
  const [permissionEpoch, setPermissionEpoch] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2 || !account) {
      setRemote([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const run = ++latest.current;
    setSearching(true);
    const timer = window.setTimeout(() => {
      lookupPeople(instance, account, term, controller.signal)
        .then((result) => {
          if (run !== latest.current) return;
          setRemote(result.people);
          setStatus(result.status);
        })
        .catch(() => {
          if (run !== latest.current) return;
          setRemote([]);
        })
        .finally(() => {
          if (run === latest.current) setSearching(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      setSearching(false);
    };
  }, [query, instance, account, permissionEpoch]);

  /** Local matches first, then colleagues M365 knows about and we do not. */
  const options = useMemo(() => {
    const seen = new Set<string>();
    const merged: DirectoryPerson[] = [];
    for (const person of localPeople) {
      if (!person.email || !matchesLocal(person, query)) continue;
      if (seen.has(key(person.email))) continue;
      seen.add(key(person.email));
      merged.push(person);
    }
    for (const person of remote) {
      if (seen.has(key(person.email))) continue;
      seen.add(key(person.email));
      merged.push(person);
    }
    return merged;
  }, [localPeople, remote, query]);

  const grantAccess = async () => {
    if (!account) return;
    setConsenting(true);
    try {
      const token = await acquirePeopleToken(instance, account, true);
      if (token) {
        setStatus("ok");
        setPermissionEpoch((epoch) => epoch + 1);
      }
    } catch {
      setStatus("unavailable");
    } finally {
      setConsenting(false);
    }
  };

  const help = (() => {
    if (status === "needs-consent" && account) {
      return (
        <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }} component="span">
          <span>Colleague lookup is switched off. Addresses can still be typed in full.</span>
          <Button
            size="small"
            onClick={grantAccess}
            disabled={consenting}
            sx={{ textTransform: "none", p: 0, minWidth: 0, fontSize: "inherit" }}
          >
            {consenting ? "Asking..." : "Turn it on"}
          </Button>
        </Stack>
      );
    }
    if (status === "unavailable") {
      return "Could not reach the company directory just now — type the address in full.";
    }
    return helperText;
  })();

  return (
    <Autocomplete
      freeSolo
      disabled={disabled}
      options={options}
      // Every option is already a match; filtering again would drop people
      // found by department or by a surname the address does not contain.
      filterOptions={(list) => list}
      getOptionLabel={(option) => (typeof option === "string" ? option : option.email)}
      isOptionEqualToValue={(option, selected) => (
        key(typeof option === "string" ? option : option.email)
        === key(typeof selected === "string" ? selected : selected.email)
      )}
      inputValue={query}
      onInputChange={(_, next, reason) => {
        if (reason === "reset" && !next) return;
        setQuery(next);
        onChange(next);
      }}
      onChange={(_, picked) => {
        if (!picked || typeof picked === "string") return;
        setQuery(picked.email);
        onChange(picked.email);
        onPickPerson?.(picked);
      }}
      loading={searching}
      noOptionsText={query.trim().length < 2 ? "Type a name or address" : "Nobody found"}
      fullWidth
      renderOption={(props, option) => {
        const { key: optionKey, ...rest } = props as typeof props & { key: string };
        return (
          <Box component="li" key={optionKey} {...rest} sx={{ display: "block !important", py: 1 }}>
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: editorial.ink }}>
              {option.name || option.email}
            </Typography>
            <Typography sx={{ fontSize: "0.76rem", color: editorial.softMuted }}>
              {[option.email, option.position, option.department].filter(Boolean).join(" · ")}
            </Typography>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required}
          size="small"
          helperText={help}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              endAdornment: (
                <>
                  {searching ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
                  {params.slotProps.input.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
  );
}
