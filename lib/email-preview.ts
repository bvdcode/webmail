import { htmlToPlainText } from '@/lib/html-to-text';
import { stripInvisibleLeading } from '@/lib/utils';

const HTML_PREVIEW_RE = /^(?:<!doctype\b|<!--|<(?:html|head|body|style|meta|title|table|tbody|thead|tfoot|tr|td|th|div|p|span|br|a|img|section|article|h[1-6]|ul|ol|li)\b)/i;

/**
 * Keeps normal JMAP preview text intact while turning malformed HTML-shaped
 * previews into readable single-line snippets. Some senders put a complete
 * HTML document in their text/plain alternative, which servers may then use
 * verbatim for Email/preview.
 */
export function normalizeEmailPreview(preview: string): string {
  const strippedPreview = stripInvisibleLeading(preview);
  if (!strippedPreview || !HTML_PREVIEW_RE.test(strippedPreview)) {
    return strippedPreview;
  }

  return stripInvisibleLeading(htmlToPlainText(strippedPreview))
    .replace(/\s+/g, ' ')
    .trim();
}
