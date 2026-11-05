import type { AppIconName } from '@component/shared/icons';

/** Screens prepare these display values; home components do not query application state. */
export interface HomeStat {
  icon: AppIconName;
  label: string;
  value: string;
}

export interface HomeBand {
  id: string;
  name: string;
  description: string;
  photo?: string;
  color: string;
  memberCount: number;
  myPart: string;
}

export interface HomeSong {
  id: string;
  workspaceId: string;
  title: string;
  artist: string;
  thumbnailUrl?: string;
  referenceUrl?: string;
  bandName?: string;
  bandColor?: string;
  myPart?: string;
}
