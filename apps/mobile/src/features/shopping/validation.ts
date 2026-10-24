export type ProductUrlResult =
  | { ok: true; value: string | null }
  | { ok: false; message: string };

/**
 * 商品链接是不可信输入。这里只做提交前的即时反馈；core 会在持久化前再次校验。
 */
export function validateProductUrl(input: string): ProductUrlResult {
  const raw = input.trim();
  if (!raw) return { ok: true, value: null };
  if (raw.length > 2048 || /[\u0000-\u001f\u007f]/.test(raw)) {
    return { ok: false, message: '链接过长或包含不可见字符，请检查后重试。' };
  }

  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, message: '只接受 http 或 https 商品链接。' };
    }
    if (!url.hostname || url.username || url.password) {
      return { ok: false, message: '链接不能包含账号、密码或缺少网站地址。' };
    }
    return { ok: true, value: url.toString() };
  } catch {
    return { ok: false, message: '商品链接格式不正确；也可以留空后继续。' };
  }
}

export function parsePriceMinor(input: string): number | null | 'invalid' {
  const raw = input.trim();
  if (!raw) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return 'invalid';
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 10_000_000) return 'invalid';
  return Math.round(value * 100);
}

export function clampAssumedWears(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(999, Math.max(1, Math.round(value)));
}
