import '@testing-library/jest-dom/vitest';

import { beforeEach, vi } from 'vitest';

// Vite's build-time validator guarantees VITE_NKG_NOTION_WORKSPACE is set
// for dev/build, but Vitest runs with mode='test' and bypasses that check.
// Provide a sane default so unrelated tests don't trip the runtime guard
// in `notionUrl.ts`. Tests that care about env behaviour override this
// explicitly with `vi.stubEnv`.
beforeEach(() => {
  vi.stubEnv('VITE_NKG_NOTION_WORKSPACE', 'leorca');
});
