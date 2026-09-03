// Public surface of the voice feature (F11). The session view renders
// `VoiceNotice` and nothing else; F12's mic toggle and F13's participant list
// build on `useVoiceRoom`'s return value rather than reaching into this folder.
export {
  useVoiceRoom,
  type MicStatus,
  type VoiceParticipant,
  type VoiceStatus,
} from './useVoiceRoom';
export { VoiceNotice } from './VoiceNotice';
