// Public surface of the voice module (docs/02 §2). Everything else in this
// folder is private — other modules import from here, never from a file inside.
export { voiceRoutes } from './routes.js';
// Exposed for the session lifecycle owner (F32 "end session → voice disconnects
// cleanly") and for tests; the HTTP route is the only caller today.
export { issueVoiceToken, isVoiceConfigured, TOKEN_TTL_SECONDS } from './service.js';
