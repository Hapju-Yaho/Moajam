import styledNative from '@emotion/native';
import { useContext } from 'react';
import { Pressable } from 'react-native';
import { ScreenHelpContext } from './ScreenHelpContext';
import { AppIcon } from '@component/shared/icons';
export function ScreenHelpButton() {
  const open = useContext(ScreenHelpContext);
  return (
    <TourHelp
      nativeID="tour-help"
      accessibilityRole="button"
      accessibilityLabel="도움말 열기"
      onPress={open}
    >
      <AppIcon name="help" size={19} color="#416bd1" />
    </TourHelp>
  );
}

const TourHelp = styledNative(Pressable)({
  width: 34,
  height: 34,
  alignItems: 'center',
  justifyContent: 'center',
  borderTopLeftRadius: 9,
  borderTopRightRadius: 9,
  borderBottomRightRadius: 9,
  borderBottomLeftRadius: 9,
});
