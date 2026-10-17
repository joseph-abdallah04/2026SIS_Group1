// Public surface of the side panel: the board's right-hand rail of People,
// Chat and the AI assistant. The session page holds which one is showing
// (`useSidePanel`) and hands the panel its People list.
export { MuteAllButton } from './MuteAllButton';
export { PeoplePanel } from './PeoplePanel';
export { anyoneToMute, mergeRoster, type CallView } from './peopleRoster';
export { SidePanel, type SidePanelProps } from './SidePanel';
export { useSidePanel, type SidePanelControl, type SidePanelTab } from './useSidePanel';
