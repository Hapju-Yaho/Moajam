import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Meta, Copy } from './ProductUI';

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
    <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
      <Meta style={{ textAlign: 'center' }}>{label}</Meta>
      <View style={{ height: 220, overflow: 'hidden', borderRadius: 12 }}>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 88,
            height: 44,
            width: '100%',
            backgroundColor: '#eaf0ff',
          }}
        />
        <ScrollView
          ref={scroll}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={44}
          decelerationRate="fast"
          contentContainerStyle={{ paddingVertical: 88 }}
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
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={`${value} ${label}`}
              accessibilityState={{ selected: index === item }}
              onPress={() => onChange(item)}
              style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Copy
                style={{
                  fontSize: label === '오전 / 오후' ? 23 : 30,
                  lineHeight: 38,
                  fontWeight: index === item ? '600' : '400',
                  color: index === item ? '#315ccc' : '#9ba8bd',
                }}
              >
                {value}
              </Copy>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}
