// server/index.ts
// Entry point. During the refactor, this re-exports from the legacy
// server.ts so package.json scripts can point here without behavior change.
// Subsequent tasks move handlers/state into this directory; the final
// task deletes server.ts entirely.
import '../server';
