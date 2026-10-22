// Lets Node run the app's TypeScript as-is: api/ imports "./x.js" and src/
// imports "./x", both of which only exist as "./x.ts" before a build.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!specifier.startsWith(".")) throw error;
    const base = specifier.endsWith(".js") ? specifier.slice(0, -3) : specifier;
    for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
      try { return await nextResolve(candidate, context); } catch { /* next */ }
    }
    throw error;
  }
}
