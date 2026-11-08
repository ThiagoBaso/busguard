import type { CurrentUser, NoticeMessage, PageKey } from './types';

export type Notify = (message: string, tone?: NoticeMessage['tone']) => void;
export type Navigate = (page: PageKey, tripId?: number) => void;

export interface ScreenProps {
  notify: Notify;
  navigate: Navigate;
  currentUser: CurrentUser;
  selectedTripId: number | null;
}
