import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Animated, View } from 'react-native';

const previousVisibility = new Map<string, boolean>();
export function SpaceMenuReveal({
  id,
  visible,
  children,
}: PropsWithChildren<{ id: string; visible: boolean }>) {
  const progress = useRef(
    new Animated.Value((previousVisibility.get(id) ?? visible) ? 1 : 0),
  ).current;
  const [height, setHeight] = useState(0);
  useEffect(() => {
    previousVisibility.set(id, visible);
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!active) return;
      if (reduce) progress.setValue(visible ? 1 : 0);
      else
        Animated.timing(progress, {
          toValue: visible ? 1 : 0,
          duration: 260,
          useNativeDriver: false,
        }).start();
    });
    return () => {
      active = false;
      progress.stopAnimation();
    };
  }, [id, visible, progress]);
  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={{
        overflow: 'hidden',
        height: height
          ? progress.interpolate({ inputRange: [0, 1], outputRange: [0, height] })
          : visible
            ? undefined
            : 0,
        opacity: progress,
      }}
    >
      <View onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>{children}</View>
    </Animated.View>
  );
}
