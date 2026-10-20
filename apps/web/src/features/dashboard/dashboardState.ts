/**
 * What a page hands the dashboard as it goes back to it: the draft it just
 * saved, so the dashboard can say so and point it out among the rest.
 */
export interface DashboardState {
  savedDraftId?: string;
}
