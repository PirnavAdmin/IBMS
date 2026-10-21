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

export function workEmailSchema() {
  return yup.string().trim()
    .email('Please enter a valid work email')
    .test('recognized-email-domain', 'Please enter a valid work email', hasRecognizedEmailDomain)
    .required('Work email is required');
}


export function hasExcessiveNameRepetition(value = '') {
  return /([\p{L}\p{M}])\1{7,}/u.test(value.normalize('NFC').toLocaleLowerCase());
}

export const registrationSchema = yup.object({
  fullName: yup.string().trim().required('Full name is required').min(2, 'Name must be at least 2 characters')
    .matches(/^[\p{L}\p{M}][\p{L}\p{M}\s.'\u2019\u02bc\p{Pd}]*$/u, { message: 'Use letters, spaces, hyphens or apostrophes for your name', excludeEmptyString: true })
    .test('name-repetition', 'Full Name contains invalid repeated characters', value => !hasExcessiveNameRepetition(value)),
  email: workEmailSchema(),
  password: yup.string().required('Password is required')
    .min(8, 'Use 8 or more characters with letters and numbers')
    .matches(/[a-z]/, 'Include a lowercase letter').matches(/[A-Z]/, 'Include an uppercase letter')
    .matches(/\d/, 'Include a number').matches(/[^A-Za-z0-9]/, 'Include a special character'),
  confirmPassword: yup.string().required('Please confirm your password').oneOf([yup.ref('password')], 'Passwords must match'),
  terms: yup.boolean().required('You must agree to Terms and Privacy Policy').oneOf([true], 'You must agree to Terms and Privacy Policy'),
}).required();
