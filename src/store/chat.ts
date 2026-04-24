// The chat store is composed from domain-focused slices living in
// `src/store/chat/`. This file exists to preserve the original
// `@/store/chat` import path so the ~47 consumers across `src/` keep working
// unchanged. See `src/store/chat/index.ts` for the composition and each
// `*-slice.ts` for the state + actions that make up that domain.
export * from './chat/index';
