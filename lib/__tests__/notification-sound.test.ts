import { beforeEach, describe, expect, it, vi } from 'vitest';

class AudioStub {
  static instances: AudioStub[] = [];

  volume = 1;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly play = vi.fn(async () => {});

  constructor(readonly src: string) {
    AudioStub.instances.push(this);
  }
}

describe('playNotificationSound', () => {
  beforeEach(() => {
    AudioStub.instances = [];
    vi.resetModules();
    vi.stubGlobal('Audio', AudioStub);
  });

  it('does not overlap notification sounds from the same refresh burst', async () => {
    const { playNotificationSound } = await import('@/lib/notification-sound');

    expect(playNotificationSound('cheerful')).toBe(true);
    expect(playNotificationSound('cheerful')).toBe(false);
    expect(AudioStub.instances).toHaveLength(1);

    AudioStub.instances[0].onended?.();

    expect(playNotificationSound('cheerful')).toBe(true);
    expect(AudioStub.instances).toHaveLength(2);
  });
});
