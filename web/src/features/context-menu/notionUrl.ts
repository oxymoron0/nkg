/**
 * Build a Notion page URL for the given page ID.
 *
 * - Notion's URL router requires the undashed 32-char hex ID.
 * - The workspace slug is read from `VITE_NKG_NOTION_WORKSPACE`, which Vite
 *   inlines at build time. The value is **required**: `vite.config.ts`
 *   fails the build when it is missing or empty, so the runtime should
 *   always see a valid slug. The additional guard below is defence in
 *   depth against tests/future call sites that skip the build-time check.
 * - `notion://` opens the native desktop app when installed; `https://`
 *   opens the web client.
 *
 * Env is resolved per call (not captured at module load) so tests can use
 * `vi.stubEnv` between cases without re-importing the module.
 */

function workspaceSlug(): string {
  const slug = import.meta.env.VITE_NKG_NOTION_WORKSPACE;
  if (!slug || slug.trim() === '') {
    throw new Error('VITE_NKG_NOTION_WORKSPACE is required but unset or empty.');
  }
  return slug;
}

export function notionPageUrl(pageId: string, protocol: 'https' | 'notion'): string {
  const id = pageId.replace(/-/g, '');
  return `${protocol}://www.notion.so/${workspaceSlug()}/${id}`;
}
