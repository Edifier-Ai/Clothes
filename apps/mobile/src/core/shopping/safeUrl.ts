const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const MAX_URL_LENGTH = 2_048;

/**
 * 商品链接是不可信输入：仅接收无凭证的 http/https URL。非法输入返回 null 而非抛错，
 * 候选的手工信息仍能保存；UI 只渲染返回值，绝不回显原始危险字符串为可点击链接。
 */
export function sanitizeShoppingUrl(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (CONTROL_CHARACTERS.test(value)) return null;
  const input = value.trim();
  if (!input || input.length > MAX_URL_LENGTH) return null;
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
