import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveJmapRequestServerUrl } from './jmap-api';

describe('resolveJmapRequestServerUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the public URL when no internal URL is configured', () => {
    expect(resolveJmapRequestServerUrl('https://mail.example.test/'))
      .toBe('https://mail.example.test');
  });

  it('uses the internal URL for the configured public server', () => {
    vi.stubEnv('JMAP_SERVER_URL', 'https://mail.example.test/');
    vi.stubEnv('JMAP_INTERNAL_SERVER_URL', 'http://stalwart:8080/');

    expect(resolveJmapRequestServerUrl('https://mail.example.test'))
      .toBe('http://stalwart:8080');
  });

  it('does not redirect a different JMAP server to the internal URL', () => {
    vi.stubEnv('JMAP_SERVER_URL', 'https://mail.example.test');
    vi.stubEnv('JMAP_INTERNAL_SERVER_URL', 'http://stalwart:8080');

    expect(resolveJmapRequestServerUrl('https://other.example.test'))
      .toBe('https://other.example.test');
  });
});
