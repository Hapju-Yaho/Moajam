import './ScoreEditorViewport.web.css';
import { createContext, useContext } from 'react';

export type ScoreInspectorTab = 'notes' | 'measures' | 'settings';
export const ScoreEditorLayoutContext = createContext({
  expanded: false,
  inspectorOpen: false,
  setInspectorOpen: (_value: boolean) => {
    void _value;
  },
  inspector: 'notes' as ScoreInspectorTab,
  setInspector: (_value: ScoreInspectorTab) => {
    void _value;
  },
  filePanel: null as 'file' | null,
  setFilePanel: (_value: 'file' | null) => {
    void _value;
  },
});
export const useScoreEditorLayout = () => useContext(ScoreEditorLayoutContext);
