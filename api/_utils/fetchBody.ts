/**
 * fetchBody.ts — handing raw bytes to `fetch` under either set of globals.
 *
 * These files are type-checked twice, against different libraries. This
 * project's own build gives them Node's globals alone, where `fetch` comes
 * from undici. The deployment platform compiles each route again with the DOM
 * library present as well, and there `fetch` resolves to the DOM overloads.
 *
 * The two disagree about bytes. Neither `Uint8Array`, `ArrayBufferView` nor
 * `BodyInit` satisfies both: `BodyInit` is not even declared without the DOM,
 * and a bare `ArrayBufferView` is rejected by undici. Every combination fails
 * one side or the other, which is why two upload calls reported an error on
 * every deployment build.
 *
 * `RequestInit` is declared by both, so asking it what a body may be resolves
 * to whichever answer is ambient. That is the one expression both compilers
 * accept, and it needs no `any`.
 *
 * Nothing changes at runtime: both implementations send the bytes as given.
 */

/** The bytes, typed as whatever the ambient `fetch` accepts as a body. */
export function asFetchBody(bytes: Uint8Array): NonNullable<RequestInit["body"]> {
  return bytes as unknown as NonNullable<RequestInit["body"]>;
}
