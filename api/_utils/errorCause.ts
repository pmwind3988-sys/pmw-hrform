/**
 * errorCause.ts — attaching the original failure to the error that replaces it.
 *
 * `new Error(message, { cause })` is ES2022, and these files are compiled twice
 * against different libraries: once by this project's own `tsc -b`, which
 * targets ES2022 and accepts it, and once by the deployment platform when it
 * turns each route into a serverless function, which types `Error` as taking a
 * message alone. The second compile rejected the two-argument form in seven
 * places, and reported it on every build.
 *
 * Setting the property afterwards satisfies both. Nothing changes at runtime:
 * the Node these functions run on has supported `cause` for years, and the
 * property is exactly what the constructor would have set.
 */

/**
 * Returns the error with `cause` attached, so a throw can stay one expression.
 *
 * ```ts
 * throw withCause(new Error("Could not read the list."), error);
 * ```
 *
 * Preserves the error's own type, so a caller throwing a subclass gets its
 * subclass back rather than a plain `Error`.
 */
export function withCause<E extends Error>(error: E, cause: unknown): E {
  (error as E & { cause?: unknown }).cause = cause;
  return error;
}
