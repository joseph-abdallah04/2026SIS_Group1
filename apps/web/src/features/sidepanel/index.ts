// Public surface of the side panel: the right-hand rail of People, Chat and
// (on the board) the AI assistant. The session page holds which one is showing
// (`useSidePanel`) and hands the panel its People list. The board mounts
// `SidePanel`; the waiting room mounts `SidePanelFrame`, which has no assistant.
export { MuteAllButton } from './MuteAllButton';
export { PeoplePanel } from './PeoplePanel';
export { anyoneToMute, mergeRoster, type CallView } from './peopleRoster';
export { SidePanel, type SidePanelProps } from './SidePanel';
export { SidePanelFrame, type SidePanelFrameProps } from './SidePanelFrame';
export { useSidePanel, type SidePanelControl, type SidePanelTab } from './useSidePanel';
