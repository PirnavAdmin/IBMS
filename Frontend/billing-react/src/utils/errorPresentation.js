export const connectionErrorMessage = 'Please check your connection and try again.';

// Keep infrastructure details out of business-facing error states.
export function errorPresentation(message) {
  return !message || /backend unavailable|ngrok|network error|failed to fetch|err_network/i.test(message)
    ? connectionErrorMessage
    : message;
}
