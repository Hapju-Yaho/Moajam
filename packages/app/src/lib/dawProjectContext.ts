import { createContext, useContext, type ReactNode } from 'react';
import type { BandDawProject } from './bandDawProjects';

export type ProjectBridge = {
  dirty: boolean;
  save: (name: string) => Promise<boolean>;
  copy: (name: string) => Promise<BandDawProject>;
  refresh: () => Promise<void>;
};
export type ProjectControls = {
  name: string;
  nameDirty: boolean;
  onSaved: () => void | Promise<void>;
  onBusy: (busy: boolean) => void;
  onDirty: (dirty: boolean) => void;
  bridge: { current: ProjectBridge | null };
  toolbar: ReactNode;
  panel: ReactNode;
};
export const DawProjectContext = createContext<ProjectControls | null>(null);
export const useDawProject = () => useContext(DawProjectContext);
