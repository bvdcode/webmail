import type { FilterAction } from '@/lib/jmap/sieve-types';

export function countForwardActions(actions: FilterAction[]): number {
  return actions.filter((action) => action.type === 'forward').length;
}

export function exceedsRedirectLimit(
  actions: FilterAction[],
  maxNumberRedirects?: number,
): boolean {
  if (maxNumberRedirects === undefined) {
    return false;
  }

  return countForwardActions(actions) > maxNumberRedirects;
}

export function retainsLocalCopy(actions: FilterAction[]): boolean {
  return actions.some((action) => {
    switch (action.type) {
      case 'keep':
      case 'move':
      case 'copy':
        return true;
      case 'forward':
      case 'mark_read':
      case 'star':
      case 'add_label':
      case 'discard':
      case 'reject':
      case 'stop':
        return false;
    }
  });
}
