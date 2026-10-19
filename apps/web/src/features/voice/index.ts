// Public surface of the voice feature (F11, F12, F13). The session view
// renders `VoiceNotice`, `VoiceReconnect`, `MicToggle` and `PeopleSnapshot`,
// and its People panel draws `ParticipantBubble`s with the leader's
// `useLeaderMute`. The waiting room uses the same pieces in the same header,
// and layers voice onto the seats it already draws, which is what the
// helpers below are for. Everything else here is internal.
export { MicToggle } from './MicToggle';
export { PeopleSnapshot } from './PeopleSnapshot';
export { localName, presenceParticipants, voiceStateByIdentity } from './participantList';
export { disconnectAllVoiceRooms } from './roomRegistry';
export { MUTE_ALL, useLeaderMute, type LeaderMute } from './useLeaderMute';
export { useSustainedSpeaking } from './useSustainedSpeaking';
export {
  useVoiceRoom,
  type MicStatus,
  type VoiceParticipant,
  type VoiceStatus,
} from './useVoiceRoom';
export { VoiceNotice } from './VoiceNotice';
export { VoiceReconnect } from './VoiceReconnect';
