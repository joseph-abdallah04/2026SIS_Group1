// Public surface of the assistant feature. The session view mounts `AssistantBubble`;
// everything else here exists for the settings screen and for tests.
export { AssistantBubble, type AssistantBubbleProps } from './AssistantBubble';
export { AssistantPanel } from './AssistantPanel';
export { useAssistantChat, type ChatEntry, type ProposeState } from './useAssistantChat';
export {
  fetchLlmConfig,
  saveLlmConfig,
  deleteLlmConfig,
  testLlmConfig,
  streamAssistantChat,
} from './api';
