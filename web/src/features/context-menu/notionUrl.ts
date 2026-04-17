/**
 * Build a Notion page URL for the given page ID.
 *
 * - Notion's URL router requires the undashed 32-char hex ID.
 * - The `leorca` workspace slug is included for team workspace compatibility.
 * - `notion://` opens the native desktop app when installed; `https://` opens
 *   the web client.
 */
export function notionPageUrl(pageId: string, protocol: 'https' | 'notion'): string {
  const id = pageId.replace(/-/g, '');
  return `${protocol}://www.notion.so/leorca/${id}`;
}
