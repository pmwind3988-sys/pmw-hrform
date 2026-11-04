/**
 * The "Move to" menu rests on an empty value, and a menu only reports a choice
 * that differs from its current value. "Top level" therefore needs a value of
 * its own: if it were empty too, choosing it would silently do nothing.
 *
 * This cannot collide with a real topic: folders starting with "_" are treated
 * as system folders and never listed as topics.
 */
export const MOVE_TO_TOP_LEVEL = "__top-level__";

/** Turns the chosen menu value into the library path sent to the server. */
export function moveTargetPath(menuValue: string): string {
  return menuValue === MOVE_TO_TOP_LEVEL ? "" : menuValue;
}
