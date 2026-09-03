/**
 * SearchableSelect.tsx — a dropdown you can type into.
 *
 * Stands in for the native `<select>` once a list is long enough that scanning
 * it stops being quicker than typing — twenty-four departments, ten companies.
 * Short lists keep the native control, which is better than anything custom
 * and, on a phone, better than anything at all.
 *
 * It stores the option's value and shows its text, exactly as the native
 * control does, so nothing about what a submission records changes.
 *
 * Built rather than pulled in: the two libraries that do this well are each
 * larger than this file by an order of magnitude, and this form engine exists
 * because the last dependency in this position was replaced.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { filterChoices, nextActiveIndex } from "./choiceSearch";

export interface SearchableOption {
  value: string;
  text: string;
  key: string;
}

interface Props {
  options: SearchableOption[];
  /** The stored value, or "" for nothing chosen. */
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  invalid: boolean;
  controlId: string;
  placeholder: string;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  disabled,
  invalid,
  controlId,
  placeholder,
}: Props) {
  const listId = `${useId()}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((option) => option.value === value);

  /**
   * While closed the box shows the chosen option; while open it shows what is
   * being typed. Typing therefore replaces the label rather than appending to
   * it, which is what makes the first keystroke a search rather than an edit.
   */
  const shown = open ? query : (selected?.text ?? "");
  const matches = useMemo(
    () => (open ? filterChoices(options, query) : options),
    [open, options, query],
  );

  // Closing on an outside click, rather than on blur: blur fires before a
  // click on an option registers, and closing there would swallow the choice.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keeps the highlighted row in view when it is moved by the keyboard.
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelectorAll("li")[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const openList = (): void => {
    if (disabled) return;
    setQuery("");
    setActive(options.findIndex((option) => option.value === value));
    setOpen(true);
  };

  const choose = (option: SearchableOption | undefined): void => {
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) { openList(); return; }
      setActive((current) => nextActiveIndex(current, event.key === "ArrowDown" ? 1 : -1, matches.length));
      return;
    }
    if (event.key === "Enter") {
      if (!open) return;
      // Only swallowed when it does something, so Enter still submits the form
      // from a closed dropdown.
      event.preventDefault();
      choose(matches[active] ?? (matches.length === 1 ? matches[0] : undefined));
      return;
    }
    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      setOpen(false);
      setQuery("");
      return;
    }
    if (event.key === "Tab") setOpen(false);
  };

  return (
    <div className="nf-combo" ref={rootRef}>
      <input
        id={controlId}
        ref={inputRef}
        className="nf-select nf-combo-input"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={shown}
        placeholder={placeholder}
        disabled={disabled}
        data-invalid={invalid}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          if (!open) setOpen(true);
        }}
        onFocus={openList}
        onClick={openList}
        onKeyDown={onKeyDown}
      />
      {selected && !open && !disabled && (
        <button
          type="button"
          className="nf-combo-clear"
          aria-label="Clear selection"
          onClick={() => { onChange(""); inputRef.current?.focus(); }}
        >
          ×
        </button>
      )}
      {open && (
        <ul className="nf-combo-list" id={listId} role="listbox" ref={listRef}>
          {matches.length === 0 && (
            <li className="nf-combo-empty" role="presentation">No match</li>
          )}
          {matches.map((option, index) => (
            <li
              key={option.key}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={option.value === value}
              className="nf-combo-option"
              data-active={index === active}
              // Pointer down rather than click: it lands before the input's
              // blur, so the choice is never lost to the list closing first.
              onPointerDown={(event) => { event.preventDefault(); choose(option); }}
              onPointerEnter={() => setActive(index)}
            >
              {option.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
