import { type PropsWithChildren, useEffect, useRef } from 'react';
import { Animated, AccessibilityInfo } from 'react-native';
export function BandListReveal({ children }: PropsWithChildren) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!active) return;
      if (reduce) progress.setValue(1);
      else Animated.timing(progress, { toValue: 1, duration: 180, useNativeDriver: false }).start();
    });
    return () => {
      active = false;
      progress.stopAnimation();
    };
  }, [progress]);
  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
