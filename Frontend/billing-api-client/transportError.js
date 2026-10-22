export const OFFLINE_MESSAGE = 'No internet connection. Please check your network and try again.';
export const SERVER_UNREACHABLE_MESSAGE = 'Unable to reach the server. Please try again later.';
export const SERVER_UNAVAILABLE_MESSAGE = 'Server is currently unavailable. Please try again later.';
export const TIMEOUT_MESSAGE = 'The server is taking too long to respond. Please try again.';

export const connectionFailureMessage = () =>
  typeof navigator !== 'undefined' && navigator.onLine === false ? OFFLINE_MESSAGE : SERVER_UNREACHABLE_MESSAGE;

// An online browser cannot tell server downtime apart from DNS, CORS or routing
// failures. Report an unreachable server without claiming the user's internet is down.
export function transportErrorMessage(error) {
  const status = error?.response?.status ?? error?.status;
  const message = typeof error === 'string' ? error : error?.userMessage || error?.message || '';
  const response = typeof error?.response?.data === 'string' ? error.response.data : '';
  if (status >= 500) return SERVER_UNAVAILABLE_MESSAGE;
  if (/ERR_NGROK|<html[\s>]/i.test(response) && /ngrok|offline/i.test(response)) return SERVER_UNAVAILABLE_MESSAGE;
  // Received HTTP errors have their own validation, authorization and conflict messages.
  if (status) return null;
  if (['ECONNABORTED', 'ETIMEDOUT'].includes(error?.code)) {
    return typeof navigator !== 'undefined' && navigator.onLine === false ? OFFLINE_MESSAGE : TIMEOUT_MESSAGE;
  }
  if (error?.request || ['ERR_NETWORK', 'ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH'].includes(error?.code) ||
      /backend unavailable|ngrok|network error|failed to fetch|fetch failed|err_network|check your connection|unable to reach (?:the )?(?:server|product service)|no internet connection/i.test(message)) {
    return connectionFailureMessage();
  }
  return null;
}
