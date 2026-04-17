import { describe, expect, it } from 'vitest';

import { notionPageUrl } from './notionUrl';

describe('notionPageUrl', () => {
  it('strips dashes from the page id (Notion router requires 32-char hex)', () => {
    const url = notionPageUrl('abc12345-abc1-abc1-abc1-abc123456789', 'https');
    expect(url).toContain('abc12345abc1abc1abc1abc123456789');
    expect(url).not.toContain('-');
  });

  it('returns an https URL under the notion.so domain', () => {
    const url = notionPageUrl('1234', 'https');
    expect(url.startsWith('https://www.notion.so/')).toBe(true);
  });

  it('returns a notion:// deep link when the notion protocol is requested', () => {
    const url = notionPageUrl('1234', 'notion');
    expect(url.startsWith('notion://www.notion.so/')).toBe(true);
  });

  it('includes the workspace slug between the host and the page id', () => {
    // The workspace slug is currently hardcoded to 'leorca'. This test locks
    // that behaviour so the upcoming env-var externalization (Issue #1) has
    // a regression guard to update against.
    const url = notionPageUrl('abc', 'https');
    expect(url).toBe('https://www.notion.so/leorca/abc');
  });

  it('keeps an already-undashed id intact', () => {
    const url = notionPageUrl('plainid', 'https');
    expect(url).toBe('https://www.notion.so/leorca/plainid');
  });
});
