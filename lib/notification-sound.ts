import { debug } from '@/lib/debug';
import { withBasePath } from '@/lib/browser-navigation';

export type NotificationSoundChoice = 'default' | 'cheerful' | 'involved' | 'swift' | 'relax';

export const NOTIFICATION_SOUNDS: { id: NotificationSoundChoice; file?: string }[] = [
  { id: 'default' },
  { id: 'cheerful', file: '/notification/cheerful-527.mp3' },
  { id: 'involved', file: '/notification/involved-notification.mp3' },
  { id: 'swift', file: '/notification/notification-tone-swift-gesture.mp3' },
  { id: 'relax', file: '/notification/relax-message-tone.mp3' },
];

let soundPlaying = false;

function playBeep(onFinished: () => void) {
  const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = 800;
  oscillator.type = 'sine';

  // Longer, enveloped tone. A 150 ms blip was easy to miss on Bluetooth
  // outputs, whose audio path can take 100-200 ms to wake up and route - by
  // the time sound reached the headphones the blip was already over. The
  // fade in/out also avoids click artifacts.
  const now = audioContext.currentTime;
  const duration = 0.45;
  const peak = 0.12;
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(peak, now + 0.04);
  gainNode.gain.setValueAtTime(peak, now + duration - 0.08);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
  oscillator.onended = () => {
    void audioContext.close();
    onFinished();
  };
}

function playFile(file: string, onFinished: () => void) {
  // Prefix with the deployment base path (e.g. /webmail); a raw "/notification/
  // x.mp3" 404s under a subpath, which made playFile fall back to the beep for
  // every choice.
  const audio = new Audio(withBasePath(file));
  audio.volume = 0.3;
  let fellBack = false;
  audio.onended = onFinished;
  audio.onerror = () => {
    fellBack = true;
    onFinished();
  };
  audio.play().catch((e) => {
    if (fellBack) {
      return;
    }
    fellBack = true;
    audio.onended = null;
    audio.onerror = null;
    debug.log('push', 'Could not play audio file, falling back to beep:', e);
    playBeep(onFinished);
  });
}

export function playNotificationSound(sound?: NotificationSoundChoice): boolean {
  if (soundPlaying) {
    return false;
  }

  soundPlaying = true;
  let finished = false;
  const onFinished = () => {
    if (finished) {
      return;
    }
    finished = true;
    soundPlaying = false;
  };

  try {
    const choice = sound ?? 'default';
    const entry = NOTIFICATION_SOUNDS.find((s) => s.id === choice);

    if (entry?.file) {
      playFile(entry.file, onFinished);
    } else {
      playBeep(onFinished);
    }
    return true;
  } catch (e) {
    onFinished();
    debug.log('push', 'Could not play notification sound:', e);
    return false;
  }
}
