const parse = value => {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
};

const isObject = value => value !== null && typeof value === 'object';
const sensitiveField = /password|secret|token|securitystamp|otp/i;

function readableLabel(value) {
  return String(value)
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, character => character.toUpperCase());
}

function readableValue(value) {
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) return value.map(readableValue).join(', ');
  if (isObject(value)) return Object.entries(value)
    .filter(([key]) => !sensitiveField.test(key))
    .map(([key, item]) => `${readableLabel(key)}: ${readableValue(item)}`)
    .join(', ') || '—';
  return String(value).replace(/([a-z])([A-Z])/g, '$1 $2');
}

function summarize(value) {
  if (value == null || value === '') return '';
  if (!isObject(value) || Array.isArray(value)) return readableValue(value);
  const fields = [];
  const collect = (item, path = '') => {
    if (isObject(item) && !Array.isArray(item)) {
      for (const [key, child] of Object.entries(item)) {
        if (sensitiveField.test(key)) continue;
        collect(child, path ? `${path}.${key}` : key);
      }
    } else if (item != null && item !== '') {
      fields.push(`${readableLabel(path.replace(/\./g, ' '))}: ${readableValue(item)}`);
    }
  };
  collect(value);
  return fields.length ? fields.slice(0, 3).join(' · ')
    + (fields.length > 3 ? ` · +${fields.length - 3} more` : '') : '';
}

export function formatAuditChanges(row) {
  const changes = parse(row.changes);
  if (typeof changes === 'string' && changes.trim()) {
    return /^[\[{]/.test(changes.trim()) ? 'Audit details recorded' : changes;
  }
  const summary = summarize(changes);
  if (summary) return summary;

  const before = parse(row.oldValue);
  const after = parse(row.newValue);
  if (isObject(before) && isObject(after)) {
    const differences = [];
    const compare = (oldValue, newValue, path) => {
      if (isObject(oldValue) && isObject(newValue) && Array.isArray(oldValue) === Array.isArray(newValue)) {
        for (const key of new Set([...Object.keys(oldValue), ...Object.keys(newValue)])) {
          if (sensitiveField.test(key)) continue;
          compare(oldValue[key], newValue[key], path ? `${path}.${key}` : key);
        }
      } else if (!Object.is(oldValue, newValue)) {
        differences.push(`${readableLabel(path.replace(/\./g, ' '))}: ${readableValue(oldValue)} → ${readableValue(newValue)}`);
      }
    };
    compare(before, after, '');
    return differences.length ? differences.slice(0, 3).join(' · ')
      + (differences.length > 3 ? ` · +${differences.length - 3} more` : '') : 'No field changes';
  }
  if (row.oldValue != null || row.newValue != null) {
    return `${readableValue(before)} → ${readableValue(after)}`;
  }
  return 'Audit details recorded';
}
