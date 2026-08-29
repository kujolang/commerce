export const HTTP_PROTOCOLS = new Set(['https:', 'http:']);
export const safeUrl = (value, { allowHttp = false } = {}) => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) throw new Error();
    if (url.username || url.password) throw new Error();
    return url.toString();
  } catch { throw new Error('Provider returned an unsafe URL'); }
};

export const publicFields = (value, fields) => Object.fromEntries(fields.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));

export async function fetchWithPolicy(url, options = {}, policy = {}) {
  const request = policy.fetch || globalThis.fetch;
  const timeoutMs = Math.max(100, Math.min(30000, Number(policy.timeoutMs || 10000)));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Provider request timed out')), timeoutMs);
  try {
    return await request(url, { ...options, signal: options.signal || controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Provider request timed out');
    throw error;
  } finally { clearTimeout(timer); }
}

export const form = entries => {
  const value = new URLSearchParams();
  for (const [key, item] of entries) value.append(key, String(item));
  return value;
};

export const addIf = (entries, key, value) => {
  if (value !== undefined && value !== null && value !== '') entries.push([key, value]);
};

export async function hmacSha256(secret, value, encoding = 'hex') {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
  if (encoding === 'base64') return btoa(String.fromCharCode(...bytes));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(left, right) {
  const a = String(left || ''), b = String(right || '');
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return result === 0;
}

export function providerError(response, fallback) {
  const requestId = response.headers.get('request-id') || response.headers.get('paypal-debug-id') || response.headers.get('x-request-id') || response.headers.get('x-square-request-id');
  const error = new Error(fallback);
  if (requestId) error.requestId = requestId;
  error.status = response.status;
  return error;
}

export const checkoutResult = (url, extra = {}) => ({ checkout_url: safeUrl(url), ...extra });
