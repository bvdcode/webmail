import { emailIframeCsp, sanitizeEmailBodyForIframe } from './email-sanitization';

export function htmlAttachmentDocument(html: string, blockRemote: boolean): string {
  const body = sanitizeEmailBodyForIframe(html, blockRemote).html;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${emailIframeCsp(blockRemote)}"><meta name="referrer" content="no-referrer"></head><body>${body}</body></html>`;
}
