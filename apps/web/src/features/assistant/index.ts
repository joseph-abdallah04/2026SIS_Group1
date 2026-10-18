// Public surface of the assistant feature. The session's side panel holds the
// conversation with `useAssistantDock` and shows it in `AssistantPanel`;
// everything else here exists for the settings screen and for tests.
export { AssistantPanel } from './AssistantPanel';
export { useAssistantChat, type ChatEntry, type ProposeState } from './useAssistantChat';
export { useAssistantDock, type AssistantDock } from './useAssistantDock';
export {
  fetchLlmConfig,
  saveLlmConfig,
  deleteLlmConfig,
  testLlmConfig,
  streamAssistantChat,
} from './api';
