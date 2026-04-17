import { afterEach, describe, expect, it, vi } from 'vitest';

import { notionPageUrl } from './notionUrl';

describe('notionPageUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('strips dashes from the page id (Notion router requires 32-char hex)', () => {
    const url = notionPageUrl('abc12345-abc1-abc1-abc1-abc123456789', 'https');
    expect(url).toContain('abc12345abc1abc1abc1abc123456789');
    // The id portion after the workspace slug must have no dashes; the URL
    // scheme itself always contains "://".
    const [, idPart] = url.split('leorca/');
    expect(idPart).not.toContain('-');
  });

  it('returns an https URL under the notion.so domain', () => {
    const url = notionPageUrl('1234', 'https');
    expect(url.startsWith('https://www.notion.so/')).toBe(true);
  });

  it('returns a notion:// deep link when the notion protocol is requested', () => {
    const url = notionPageUrl('1234', 'notion');
    expect(url.startsWith('notion://www.notion.so/')).toBe(true);
  });

  it('keeps an already-undashed id intact', () => {
    const url = notionPageUrl('plainid', 'https');
    expect(url).toContain('/plainid');
  });

  describe('VITE_NKG_NOTION_WORKSPACE slug', () => {
    it('uses the configured workspace slug', () => {
      vi.stubEnv('VITE_NKG_NOTION_WORKSPACE', 'acme');
      const url = notionPageUrl('abc', 'https');
      expect(url).toBe('https://www.notion.so/acme/abc');
    });

    it('passes the slug through to the notion:// deep link', () => {
      vi.stubEnv('VITE_NKG_NOTION_WORKSPACE', 'team-alpha');
      const url = notionPageUrl('abc', 'notion');
      expect(url).toBe('notion://www.notion.so/team-alpha/abc');
    });

    it('throws when the env var is empty (no silent fallback)', () => {
      vi.stubEnv('VITE_NKG_NOTION_WORKSPACE', '');
      expect(() => notionPageUrl('abc', 'https')).toThrow(/VITE_NKG_NOTION_WORKSPACE/);
    });

    it('throws when the env var is only whitespace', () => {
      vi.stubEnv('VITE_NKG_NOTION_WORKSPACE', '   ');
      expect(() => notionPageUrl('abc', 'https')).toThrow(/VITE_NKG_NOTION_WORKSPACE/);
    });
  });
});
