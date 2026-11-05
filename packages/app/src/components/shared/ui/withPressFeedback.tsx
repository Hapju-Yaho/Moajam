import { createElement, useState, type ComponentType } from 'react';
import type { PressableProps } from 'react-native';

/** Supplies press state to styled components without replacing caller event handlers. */
export function withPressFeedback<P extends PressableProps & { $pressed: boolean }>(
  Component: ComponentType<P>,
) {
  return function PressFeedback(props: Omit<P, '$pressed'>) {
    const [pressed, setPressed] = useState(false);
    const componentProps = {
      ...props,
      $pressed: pressed && !props.disabled,
      onPressIn: (event) => {
        setPressed(true);
        props.onPressIn?.(event);
      },
      onPressOut: (event) => {
        setPressed(false);
        props.onPressOut?.(event);
      },
    } satisfies PressableProps & { $pressed: boolean };
    return createElement(Component, componentProps as P);
  };
}
