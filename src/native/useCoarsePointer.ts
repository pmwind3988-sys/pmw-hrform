import { useEffect, useState } from "react";

/**
 * True when the device's primary pointer is coarse — a finger, not a mouse.
 *
 * On such a device a native `<select>` is the right control for any dropdown,
 * long or short: the operating system draws its own picker (the Android
 * bottom dialog, the iOS wheel), which scrolls and reads better than a
 * hand-built listbox and costs nothing to make accessible. A searchable
 * combobox earns its keep only where there is a keyboard to type into, so the
 * control that offers one checks this first and steps aside on touch.
 *
 * Read reactively rather than once: a browser's device-emulation toggle, or a
 * 2-in-1 switching between its touchpad and bare touch, flips the match, and a
 * stale answer would strand the person on the wrong control. Guarded for the
 * case where `matchMedia` is absent (older test environments), where it
 * resolves to `false` and the keyboard control is used — the safe default.
 */
export function useCoarsePointer(): boolean {
  const query = "(pointer: coarse)";
  const read = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false;

  const [coarse, setCoarse] = useState<boolean>(read);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const onChange = () => setCoarse(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return coarse;
}
