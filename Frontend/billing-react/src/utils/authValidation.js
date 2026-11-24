import * as yup from 'yup';
import { parse } from 'tldts';

// Validate known public suffixes without inventing a short .com-only allowlist.
// This is a format check, not a mailbox or account-existence lookup.
export function hasRecognizedEmailDomain(value) {
  if (!value) return true; // The required rule owns empty-field feedback.
  const at = value.lastIndexOf('@');
  if (at < 1) return false;
  if (value.indexOf('@') !== at) return false;
  const hostname = value.slice(at + 1);
  if (!hostname || /\s/.test(hostname)) return false;
  const labels = hostname.split('.');
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (!label || label.startsWith('-') || label.endsWith('-')) return false;
  }
  const result = parse(hostname, { extractHostname: false, validateHostname: true, allowPrivateDomains: false });
  return result.isIcann === true && Boolean(result.domain);
}

export const EMAIL_REGEX = /^[a-zA-Z0-9]+([._+-][a-zA-Z0-9]+)*@[a-zA-Z0-9]+([.-][a-zA-Z0-9]+)*\.(?:[a-zA-Z]{2,}|xn--[a-zA-Z0-9-]+)$/;

export function workEmailSchema() {
  return yup.string().trim()
    .required('Work email is required')
    .matches(EMAIL_REGEX, { message: 'Please enter a valid work email', excludeEmptyString: true })
    .email('Please enter a valid work email')
    .test('recognized-email-domain', 'Please enter a valid work email', hasRecognizedEmailDomain);
}


export function validateFullName(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed || trimmed.length < 2) {
    return 'Enter a name with at least 2 characters.';
  }
  if (trimmed.length > 100) {
    return 'Full Name cannot exceed 100 characters.';
  }
  const hasDigits = /\d/.test(trimmed);
  const hasSpecialChars = /[^\p{L}\p{M}\d\s.'\u2019\u02bc\p{Pd}-]/u.test(trimmed);
  const startsWithLetter = /^[\p{L}\p{M}]/u.test(trimmed);

  if (hasDigits && (hasSpecialChars || (!startsWithLetter && /[\p{L}\p{M}]/u.test(trimmed)))) {
    return 'Full Name should not contain numbers or special characters.';
  }
  if (hasDigits && hasSpecialChars) {
    return 'Full Name should not contain numbers or special characters.';
  }
  if (hasDigits) {
    return 'Full Name must not contain numbers.';
  }
  if (hasSpecialChars || !startsWithLetter) {
    return 'Full Name should not contain special characters.';
  }
  if (hasExcessiveNameRepetition(trimmed)) {
    return 'Full Name contains invalid repeated characters.';
  }
  return '';
}

export function hasExcessiveNameRepetition(value = '') {
  return /([\p{L}\p{M}])\1{7,}/u.test(value.normalize('NFC').toLocaleLowerCase());
}

export const ROLE_NAME_REGEX = /^[\p{L}\p{M}0-9\s\-_]+$/u;

export function validateRoleName(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) {
    return 'Role name is required.';
  }
  if (trimmed.length < 2) {
    return 'Role name must be at least 2 characters.';
  }
  if (trimmed.length > 50) {
    return 'Role name cannot exceed 50 characters.';
  }
  if (!ROLE_NAME_REGEX.test(trimmed)) {
    return 'Role name can only contain letters, numbers, spaces, hyphens, and underscores.';
  }
  if (!/^[\p{L}\p{M}0-9]/u.test(trimmed)) {
    return 'Role name must start with a letter or number.';
  }
  if (/[-_]{2,}/.test(trimmed)) {
    return 'Role name cannot contain consecutive hyphens or underscores.';
  }
  return '';
}

export function validateUserEmail(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return 'Enter a valid email address, such as name@example.com.';
  }
  const atIndex = trimmed.indexOf('@');
  if (atIndex === -1 || atIndex !== trimmed.lastIndexOf('@')) {
    return 'Enter a valid email address, such as name@example.com.';
  }
  const localPart = trimmed.slice(0, atIndex);

  // Check for unsupported special characters in local part (such as $, %, ^, &, *, ~, !, #, etc.)
  if (/[^a-zA-Z0-9._+-]/.test(localPart)) {
    return 'Special characters are not allowed in the email address format.';
  }

  // Check for invalid dot usage in local part
  if (localPart.startsWith('.') || localPart.endsWith('.') || /\.{2,}/.test(localPart)) {
    return 'Special characters are not allowed in the email address format.';
  }

  // Check full structure against EMAIL_REGEX and recognized domain
  if (!EMAIL_REGEX.test(trimmed) || !hasRecognizedEmailDomain(trimmed)) {
    return 'Enter a valid email address, such as name@example.com.';
  }

  return '';
}

export const registrationSchema = yup.object({
  fullName: yup.string().trim().required('Full name is required').min(2, 'Name must be at least 2 characters')
    .matches(/^[\p{L}\p{M}][\p{L}\p{M}\s.'\u2019\u02bc\p{Pd}]*$/u, { message: 'Use letters, spaces, hyphens or apostrophes for your name', excludeEmptyString: true })
    .test('name-repetition', 'Full Name contains invalid repeated characters', value => !hasExcessiveNameRepetition(value)),
  companyName: yup.string().trim().required('Company name is required').min(2, 'Company name must be at least 2 characters').max(150, 'Company name cannot exceed 150 characters'),
  email: workEmailSchema(),
  password: yup.string().required('Password is required')
    .min(8, 'Use 8 or more characters with letters and numbers')
    .matches(/[a-z]/, 'Include a lowercase letter').matches(/[A-Z]/, 'Include an uppercase letter')
    .matches(/\d/, 'Include a number').matches(/[^A-Za-z0-9]/, 'Include a special character'),
  confirmPassword: yup.string().required('Please confirm your password').oneOf([yup.ref('password')], 'Passwords must match'),
  terms: yup.boolean().required('You must agree to Terms and Privacy Policy').oneOf([true], 'You must agree to Terms and Privacy Policy'),
}).required();
