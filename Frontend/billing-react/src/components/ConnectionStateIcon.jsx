import { OFFLINE_MESSAGE, transportErrorMessage } from '../../../billing-api-client/transportError.js';

// Decorative symbols use the same transport classification as the error copy.
export function ConnectionStateIcon({ error }) {
  const message = transportErrorMessage(error);
  const state = message === OFFLINE_MESSAGE ? 'offline' : message ? 'server' : 'error';

  return <div className={`connection-state-icon connection-state-icon--${state}`} data-connection-state={state} aria-hidden="true">
    <svg viewBox="0 0 80 80" fill="none" focusable="false">
      {state === 'offline' ? <g stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 29a39 39 0 0 1 48 1M23 39a27 27 0 0 1 31 0M31 49a14 14 0 0 1 14-1" />
        <path d="m16 15 48 48" />
        <circle cx="40" cy="59" r="3" fill="currentColor" stroke="none" />
      </g> : state === 'server' ? <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="17" y="15" width="46" height="19" rx="5" />
        <path d="M43 43H22a5 5 0 0 0-5 5v9a5 5 0 0 0 5 5h18M26 24h.1M26 52h.1M46 24h8M35 24h.1M35 52h.1" />
        <circle cx="58" cy="55" r="14" fill="var(--surface, #fff)" />
        <path d="m53 50 10 10m0-10L53 60" />
      </g> : <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M35 18 13 57a6 6 0 0 0 5 9h44a6 6 0 0 0 5-9L45 18a6 6 0 0 0-10 0Z" />
        <path d="M40 33v15m0 9h.1" />
      </g>}
    </svg>
  </div>;
}
