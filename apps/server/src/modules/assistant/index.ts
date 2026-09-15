// Public surface of the `assistant` module (docs/02 §2).
//
// Everything else under this folder is private. Other modules import only from here.
//
// Depends on: auth (who is asking), sessions + pinboard (read-only context).
// Depended on by: nothing — the assistant sits at the top of the dependency graph, which is
// why it can be built before the modules it reads from exist.
export { assistantRouter } from './routes.js';

// For the Auth owner, when F33 moves into the auth module: these are the only functions
// that touch UserLLMConfig.
export {
  getLlmConfigPublic,
  getLlmCredentials,
  saveLlmConfig,
  deleteLlmConfig,
  testLlmConfig,
} from './llmConfig.service.js';

// For the Session / Pinboard / Voting owners: register a provider and its output is
// injected into every assistant prompt for that session. See context.ts for an example.
export { registerAssistantContextProvider, type AssistantContextProvider } from './context.js';
