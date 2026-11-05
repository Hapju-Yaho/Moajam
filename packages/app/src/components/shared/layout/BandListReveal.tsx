import styled from '@emotion/native';
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
  return <RevealFrame style={bandRevealMotion(progress)}>{children}</RevealFrame>;
}

const RevealFrame = styled(Animated.View)({});

// Animated values must reach the native animation driver through the style prop.
function bandRevealMotion(progress: Animated.Value) {
  return {
    opacity: progress,
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
  };
}
