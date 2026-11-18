export function splitAttachmentName(name: string): [stem: string, extension: string] {
  const dot = name.lastIndexOf('.');
  if (dot > 0 && dot < name.length - 1) {
    return [name.slice(0, dot), name.slice(dot)];
  }
  return [name, ''];
}

const MAX_FILE_NAME_BYTES = 255;

export function attachmentNameProblem(name: string): 'rename_too_long' | 'rename_invalid_chars' | null {
  if (new TextEncoder().encode(name).length > MAX_FILE_NAME_BYTES) {
    return 'rename_too_long';
  }
  for (const character of name) {
    const code = character.codePointAt(0) ?? 0;
    if (character === '/' || character === '\\' || code < 32 || (code >= 127 && code <= 159)) {
      return 'rename_invalid_chars';
    }
  }
  return null;
}
