import styledNative from '@emotion/native';
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
  compact = false,
}: {
  value: MemberPart[];
  onChange: (value: MemberPart[]) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <SessionPickerContainer $compact={compact}>
      {choices.map(([part, label]) => {
        const selected = value.includes(part);
        return (
          <SessionPickerButton
            key={part}
            accessibilityRole="checkbox"
            accessibilityLabel={label}
            accessibilityState={{ checked: selected, disabled }}
            aria-checked={selected}
            disabled={disabled}
            onPress={() =>
              onChange(selected ? value.filter((item) => item !== part) : [...value, part])
            }
            $compact={compact}
            $selected={selected}
            $disabled={disabled}
          >
            <SessionPickerText $selected={selected} $compact={compact}>
              {selected ? '✓ ' : ''}
              {label}
            </SessionPickerText>
          </SessionPickerButton>
        );
      })}
    </SessionPickerContainer>
  );
}

const SessionPickerContainer = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $compact: boolean }>(({ $compact }) => ({
  flexDirection: 'row',
  flexWrap: 'wrap',
  rowGap: $compact ? 8 : 10,
  columnGap: $compact ? 8 : 10,
}));

const SessionPickerButton = styledNative(Pressable, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $compact: boolean; $selected: boolean; $disabled: boolean }>(
  ({ $compact, $selected, $disabled }) => ({
    paddingLeft: $compact ? 12 : 18,
    paddingRight: $compact ? 12 : 18,
    paddingTop: $compact ? 11 : 13,
    paddingBottom: $compact ? 11 : 13,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderTopColor: $selected ? '#4876dd' : '#dce3ed',
    borderRightColor: $selected ? '#4876dd' : '#dce3ed',
    borderBottomColor: $selected ? '#4876dd' : '#dce3ed',
    borderLeftColor: $selected ? '#4876dd' : '#dce3ed',
    backgroundColor: $selected ? '#edf3ff' : '#fff',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderBottomLeftRadius: 12,
    opacity: $disabled ? 0.6 : 1,
  }),
);

const SessionPickerText = styledNative(Text, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $selected: boolean; $compact: boolean }>(({ $selected, $compact }) => ({
  color: $selected ? '#315fc6' : '#46586c',
  fontSize: $compact ? 14 : 15,
  fontWeight: $selected ? '700' : '400',
}));
