import { useCallback, useReducer, type SetStateAction } from 'react';
type State<T> = { present: T; past: T[]; grouping: boolean; recorded: boolean };
type Action<T> =
  | { type: 'set' | 'replace' | 'reset'; value: SetStateAction<T> }
  | { type: 'undo' | 'begin' | 'end' | 'cancel' };
export function useUndoState<T>(initial: T) {
  const [state, dispatch] = useReducer(
    (state: State<T>, action: Action<T>): State<T> => {
      if (action.type === 'begin') return { ...state, grouping: true, recorded: false };
      if (action.type === 'end') return { ...state, grouping: false, recorded: false };
      if (action.type === 'cancel')
        return state.grouping && state.recorded
          ? {
              present: state.past.at(-1)!,
              past: state.past.slice(0, -1),
              grouping: false,
              recorded: false,
            }
          : { ...state, grouping: false, recorded: false };
      if (action.type === 'undo')
        return state.past.length
          ? {
              present: state.past.at(-1)!,
              past: state.past.slice(0, -1),
              grouping: false,
              recorded: false,
            }
          : state;
      if (!('value' in action)) return state;
      const next =
        typeof action.value === 'function'
          ? (action.value as (value: T) => T)(state.present)
          : action.value;
      if (Object.is(next, state.present)) return state;
      if (action.type === 'reset')
        return { present: next, past: [], grouping: false, recorded: false };
      if (action.type === 'replace') return { ...state, present: next };
      const remember = !state.grouping || !state.recorded;
      return {
        ...state,
        present: next,
        past: remember ? [...state.past, state.present].slice(-50) : state.past,
        recorded: state.grouping,
      };
    },
    { present: initial, past: [], grouping: false, recorded: false },
  );
  const set = useCallback((value: SetStateAction<T>) => dispatch({ type: 'set', value }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const begin = useCallback(() => dispatch({ type: 'begin' }), []);
  const end = useCallback(() => dispatch({ type: 'end' }), []);
  const cancel = useCallback(() => dispatch({ type: 'cancel' }), []);
  const reset = useCallback((value: SetStateAction<T>) => dispatch({ type: 'reset', value }), []);
  const replace = useCallback(
    (value: SetStateAction<T>) => dispatch({ type: 'replace', value }),
    [],
  );
  return [
    state.present,
    set,
    { undo, begin, end, cancel, reset, replace, canUndo: state.past.length > 0 },
  ] as const;
}
