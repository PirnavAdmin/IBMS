import { connectionFailureMessage, SERVER_UNREACHABLE_MESSAGE, transportErrorMessage } from '../../../billing-api-client/transportError.js';

export const connectionErrorMessage = SERVER_UNREACHABLE_MESSAGE;

// Keep infrastructure details out of business-facing error states.
export function errorPresentation(message) {
  return transportErrorMessage(message) || (typeof message === 'string' ? message : message?.userMessage || message?.message) || connectionFailureMessage();
}
