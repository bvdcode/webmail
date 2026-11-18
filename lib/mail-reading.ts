export type ReadingWidth = 'full' | 'comfortable';

export function mailReadingCss(width: ReadingWidth): string {
  switch (width) {
    case 'full':
      return '';
    case 'comfortable':
      return 'body{max-width:80ch!important;margin-inline:auto!important}';
  }
}

export function mailReadingClass(width: ReadingWidth): string {
  switch (width) {
    case 'full':
      return '';
    case 'comfortable':
      return 'max-w-[80ch] mx-auto';
  }
}
