import { useContext } from 'react';
import { Pressable } from 'react-native';
import { ScreenHelpContext } from './ScreenHelpContext';
import { AppIcon } from './icons';
export function ScreenHelpButton() {
  const open = useContext(ScreenHelpContext);
  return (
    <Pressable
      nativeID="tour-help"
      accessibilityRole="button"
      accessibilityLabel="도움말 열기"
      onPress={open}
      style={{
        width: 34,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 9,
      }}
    >
      <AppIcon name="help" size={19} color="#416bd1" />
    </Pressable>
  );
}
