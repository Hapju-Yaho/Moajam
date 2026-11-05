import { css as nativeCss } from '@emotion/native';
import styledNative from '@emotion/native';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Meta, Copy } from '@component/shared/ui/ProductUI';

export function TimeWheel({
  label,
  values,
  index,
  onChange,
}: {
  label: string;
  values: string[];
  index: number;
  onChange: (index: number) => void;
}) {
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    scroll.current?.scrollTo({ y: index * 44, animated: false });
  }, [index]);
  return (
    <TimeWheelContainer>
      <TimeWheelMeta>{label}</TimeWheelMeta>
      <TimeWheelContainer2>
        <TimeWheelContainer3 pointerEvents="none" />
        <ScrollView
          ref={scroll}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={44}
          decelerationRate="fast"
          contentContainerStyle={TimeWheelScrollContentStyle}
          onContentSizeChange={() => scroll.current?.scrollTo({ y: index * 44, animated: false })}
          onMomentumScrollEnd={(event) =>
            onChange(
              Math.max(
                0,
                Math.min(values.length - 1, Math.round(event.nativeEvent.contentOffset.y / 44)),
              ),
            )
          }
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ text: values[index] }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) =>
            onChange(
              Math.max(
                0,
                Math.min(
                  values.length - 1,
                  index + (event.nativeEvent.actionName === 'increment' ? 1 : -1),
                ),
              ),
            )
          }
        >
          {values.map((value, item) => (
            <TimeWheelButton
              key={value}
              accessibilityRole="button"
              accessibilityLabel={`${value} ${label}`}
              accessibilityState={{ selected: index === item }}
              onPress={() => onChange(item)}
            >
              <TimeWheelCopy $label={label} $index={index} $item={item}>
                {value}
              </TimeWheelCopy>
            </TimeWheelButton>
          ))}
        </ScrollView>
      </TimeWheelContainer2>
    </TimeWheelContainer>
  );
}

const TimeWheelContainer = styledNative(View)({ flex: 1, minWidth: 0, rowGap: 8, columnGap: 8 });

const TimeWheelMeta = styledNative(Meta)({ textAlign: 'center' });

const TimeWheelContainer2 = styledNative(View)({
  height: 220,
  overflow: 'hidden',
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
  borderBottomRightRadius: 12,
  borderBottomLeftRadius: 12,
});

const TimeWheelContainer3 = styledNative(View)({
  position: 'absolute',
  top: 88,
  height: 44,
  width: '100%',
  backgroundColor: '#eaf0ff',
});

const TimeWheelButton = styledNative(Pressable)({
  height: 44,
  alignItems: 'center',
  justifyContent: 'center',
});

const TimeWheelCopy = styledNative(Copy, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $label: string; $index: number; $item: number }>(({ $label, $index, $item }) => ({
  fontSize: $label === '오전 / 오후' ? 23 : 30,
  lineHeight: 38,
  fontWeight: $index === $item ? '600' : '400',
  color: $index === $item ? '#315ccc' : '#9ba8bd',
}));

const TimeWheelScrollContentStyle = nativeCss({ paddingVertical: 88 });
