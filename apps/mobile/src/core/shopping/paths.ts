const CONTROL = /[\u0000-\u001f\u007f]/;
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;
const WARDROBE_DIRS = new Set(['originals', 'masks', 'previews', 'thumbnails']);

function safeParts(relPath: string): string[] | null {
  if (!relPath || CONTROL.test(relPath) || relPath.includes('\\') || relPath.startsWith('/') || SCHEME.test(relPath)) {
    return null;
  }
  const parts = relPath.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || !SAFE_SEGMENT.test(part))) return null;
  return parts;
}

export function isSafeCandidateImagePath(relPath: string): boolean {
  const parts = safeParts(relPath);
  return parts?.length === 2 && parts[0] === 'shopping';
}

export function isSafeWardrobeImagePath(relPath: string): boolean {
  const parts = safeParts(relPath);
  return parts?.length === 2 && WARDROBE_DIRS.has(parts[0]!);
}

export function assertSafeCandidateImagePath(relPath: string): void {
  if (!isSafeCandidateImagePath(relPath)) throw new Error('unsafe shopping image path');
}

export function assertSafeWardrobeImagePath(relPath: string): void {
  if (!isSafeWardrobeImagePath(relPath)) throw new Error('unsafe wardrobe image path');
}

export function assertSafeReadableImagePath(relPath: string): void {
  if (!isSafeCandidateImagePath(relPath) && !isSafeWardrobeImagePath(relPath)) {
    throw new Error('unsafe image path');
  }
}
