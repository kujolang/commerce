const EXPONENTS = Object.freeze({
  BHD:3, CLF:4, CLP:0, DJF:0, GNF:0, IQD:3, ISK:0, JOD:3, JPY:0,
  KMF:0, KRW:0, KWD:3, LYD:3, MGA:2, OMR:3, PYG:0, RWF:0, TND:3,
  UGX:0, UYI:0, UYW:4, VND:0, VUV:0, XAF:0, XOF:0, XPF:0
});

export const currencyExponent = currency => EXPONENTS[String(currency || '').toUpperCase()] ?? 2;

export function normalizeMoney(value, { legacyDisplay = '' } = {}) {
  const currency = String(value?.currency || '').toUpperCase();
  const exponent = currencyExponent(currency);
  let amount = value?.amount;
  if (typeof amount === 'string' && /^-?\d+$/.test(amount)) amount = Number(amount);
  if (!Number.isSafeInteger(amount) && legacyDisplay) {
    const match = String(legacyDisplay).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (match) amount = Math.round(Number(match[0]) * (10 ** exponent));
  }
  return { amount, currency, display: String(value?.display || legacyDisplay || '') };
}

export function validateMoney(money) {
  const errors = [];
  if (!Number.isSafeInteger(money?.amount) || money.amount < 0) errors.push('price.amount must be a non-negative safe integer in currency minor units.');
  if (!/^[A-Z]{3}$/.test(money?.currency || '')) errors.push('price.currency must be a three-letter uppercase ISO currency code.');
  if (money?.display !== undefined && typeof money.display !== 'string') errors.push('price.display must be a string when provided.');
  return errors;
}

export function moneyDecimal(money) {
  const exponent = currencyExponent(money.currency);
  if (exponent === 0) return String(money.amount);
  const negative = money.amount < 0 ? '-' : '';
  const raw = String(Math.abs(money.amount)).padStart(exponent + 1, '0');
  return `${negative}${raw.slice(0, -exponent)}.${raw.slice(-exponent)}`;
}

export function formatMoney(money, locale = 'en') {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency }).format(money.amount / (10 ** currencyExponent(money.currency)));
  } catch {
    return `${moneyDecimal(money)} ${money.currency}`;
  }
}
