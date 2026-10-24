// Keep one backend token contract for loaded settings, legacy drafts and requests.
export const normalizeNumberingTokens = (value = '') => String(value)
  .replace(/\((YEAR|YYYY|YY|MONTH|MM|DAY|DD|FY|QUARTER)\)/gi, '{$1}')
  .replace(/\{DAY\}/gi, '{DD}');
