import { css as nativeCss } from '@emotion/native';
import styledNative from '@emotion/native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { MemberPart } from '@moajam/domain';
import { ActionButton, Heading, Meta, Surface } from '@component/shared/ui/ProductUI';
import { ProfilePhoto } from '@component/shared/ui/ProfilePhoto';
import { SessionPicker } from '@component/shared/ui/SessionPicker';
import { Input } from '@styles/layout';
import { api, signOut } from '@lib/remote';

export type OnboardingState = {
  displayName: string;
  photo: string;
  parts: MemberPart[];
  completed: boolean;
  completedAt: string | null;
};
export function OnboardingScreen({
  user,
  initial,
  onComplete,
}: {
  user: string;
  initial: OnboardingState;
  onComplete: () => void;
}) {
  const [name, setName] = useState(initial.displayName);
  const [photo, setPhoto] = useState(initial.photo);
  const [parts, setParts] = useState(initial.parts);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (!name.trim() || !parts.length) {
      setError('이름을 입력하고 담당 세션을 하나 이상 선택해주세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api<OnboardingState>(
        '/me/onboarding',
        'PUT',
        { displayName: name.trim(), photo, parts },
        user,
      );
      onComplete();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : '프로필을 저장하지 못했어요. 다시 시도해주세요.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <OnboardingScreenScroll
      contentContainerStyle={OnboardingScreenOnboardingScreenScrollContentStyle}
    >
      <OnboardingScreenContainer>
        <OnboardingScreenContainer2>
          <OnboardingScreenText>WELCOME TO MOAJAM</OnboardingScreenText>
          <OnboardingScreenText2 accessibilityRole="header">
            어떤 음악을 함께할까요?
          </OnboardingScreenText2>
          <OnboardingScreenText3>함께 연주할 멤버들에게 나를 소개해주세요.</OnboardingScreenText3>
        </OnboardingScreenContainer2>
        <OnboardingScreenPanel>
          <OnboardingScreenContainer3>
            <ProfilePhoto value={photo} onChange={setPhoto} disabled={busy} avatarOnly />
            <OnboardingScreenContainer4>
              <Heading>이름</Heading>
              <Input
                accessibilityLabel="이름"
                placeholder="멤버들에게 보여줄 이름"
                value={name}
                maxLength={80}
                editable={!busy}
                onChangeText={setName}
              />
            </OnboardingScreenContainer4>
          </OnboardingScreenContainer3>
          <OnboardingScreenContainer5>
            <Heading>담당 세션</Heading>
            <Meta>하나 이상 선택해주세요. 여러 세션을 맡고 있어도 좋아요.</Meta>
            <SessionPicker value={parts} onChange={setParts} disabled={busy} compact />
          </OnboardingScreenContainer5>
          {error ? (
            <OnboardingScreenText4 accessibilityRole="alert">{error}</OnboardingScreenText4>
          ) : null}
          <ActionButton
            disabled={busy || !name.trim() || !parts.length}
            onPress={() => void save()}
          >
            {busy ? '프로필 저장 중…' : '설정 완료하고 시작하기'}
          </ActionButton>
          <Meta>프로필과 담당 세션은 설정에서 언제든 바꿀 수 있어요.</Meta>
        </OnboardingScreenPanel>
        <OnboardingScreenButton
          accessibilityRole="button"
          $busy={busy}
          disabled={busy}
          onPress={() => {
            setBusy(true);
            void signOut()
              .catch((reason) =>
                setError(reason instanceof Error ? reason.message : '로그아웃하지 못했어요.'),
              )
              .finally(() => setBusy(false));
          }}
        >
          <OnboardingScreenText5>다른 계정으로 로그인</OnboardingScreenText5>
        </OnboardingScreenButton>
      </OnboardingScreenContainer>
    </OnboardingScreenScroll>
  );
}

const OnboardingScreenScroll = styledNative(ScrollView)({ flex: 1, backgroundColor: '#f6f8fc' });

const OnboardingScreenContainer = styledNative(View)({
  width: '100%',
  maxWidth: 560,
  alignSelf: 'center',
  rowGap: 24,
  columnGap: 24,
});

const OnboardingScreenContainer2 = styledNative(View)({ rowGap: 8, columnGap: 8 });

const OnboardingScreenText = styledNative(Text)({
  color: '#4876dd',
  fontSize: 14,
  fontWeight: '700',
});

const OnboardingScreenText2 = styledNative(Text)({
  color: '#183044',
  fontSize: 30,
  fontWeight: '700',
});

const OnboardingScreenText3 = styledNative(Text)({
  color: '#6b7c8c',
  fontSize: 15,
  lineHeight: 23,
});

const OnboardingScreenPanel = styledNative(Surface)({
  paddingTop: 26,
  paddingRight: 26,
  paddingBottom: 26,
  paddingLeft: 26,
  rowGap: 20,
  columnGap: 20,
});

const OnboardingScreenContainer3 = styledNative(View)({
  flexDirection: 'row',
  alignItems: 'flex-start',
  rowGap: 20,
  columnGap: 20,
  marginBottom: 16,
});

const OnboardingScreenContainer4 = styledNative(View)({
  flex: 1,
  minWidth: 0,
  rowGap: 8,
  columnGap: 8,
});

const OnboardingScreenContainer5 = styledNative(View)({ rowGap: 12, columnGap: 12 });

const OnboardingScreenText4 = styledNative(Text)({ color: '#bd3944', fontSize: 14 });

const OnboardingScreenButton = styledNative(Pressable, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $busy: boolean }>(({ $busy }) => ({
  alignSelf: 'center',
  paddingTop: 4,
  paddingBottom: 4,
  paddingLeft: 12,
  paddingRight: 12,
  opacity: $busy ? 0.6 : 1,
}));

const OnboardingScreenText5 = styledNative(Text)({
  color: '#87929e',
  fontSize: 13,
  textDecorationLine: 'underline',
});

const OnboardingScreenOnboardingScreenScrollContentStyle = nativeCss({
  flexGrow: 1,
  justifyContent: 'center',
  padding: 24,
});
