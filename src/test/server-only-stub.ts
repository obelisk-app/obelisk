/**
 * `server-only` throws on import outside a React Server Component, which is
 * exactly what makes it useful in the build — it stops the viewer's relay
 * fetch from being pulled into the client bundle.
 *
 * Vitest runs in a client-ish environment, so importing a guarded module
 * under test would throw. Aliasing the package to this no-op keeps the guard
 * real where it matters (next build) while letting the pure logic be tested.
 */
export {};
