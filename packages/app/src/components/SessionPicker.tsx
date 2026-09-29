import { Pressable, Text, View } from 'react-native';
import type { MemberPart } from '@moajam/domain';
const choices: Array<[MemberPart, string]> = [
  ['VOCAL', '보컬'],
  ['GUITAR', '기타'],
  ['BASS', '베이스'],
  ['DRUMS', '드럼'],
  ['KEYBOARD', '키보드'],
  ['OTHER', '기타 악기'],
];
export function SessionPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: MemberPart[];
  onChange: (value: MemberPart[]) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {choices.map(([part, label]) => {
        const selected = value.includes(part);
        return (
          <Pressable
            key={part}
            accessibilityRole="checkbox"
            accessibilityLabel={label}
          accessibilityState={{ checked: selected, disabled }}
          aria-checked={selected}
            disabled={disabled}
            onPress={() =>
              onChange(selected ? value.filter((item) => item !== part) : [...value, part])
            }
            style={{
              paddingHorizontal: 18,
              paddingVertical: 13,
              borderWidth: 1,
              borderColor: selected ? '#4876dd' : '#dce3ed',
              backgroundColor: selected ? '#edf3ff' : '#fff',
              borderRadius: 12,
              opacity: disabled ? 0.6 : 1,
            }}
          >
            <Text
              style={{
                color: selected ? '#315fc6' : '#46586c',
                fontSize: 15,
                fontWeight: selected ? '700' : '400',
              }}
            >
              {selected ? '✓ ' : ''}
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
