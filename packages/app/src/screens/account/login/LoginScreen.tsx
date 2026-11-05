import { css as nativeCss } from '@emotion/native';
import { withPressFeedback } from '@component/shared/ui/withPressFeedback';
import styledNative from '@emotion/native';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { ActionButton, Meta, Surface } from '@component/shared/ui/ProductUI';
import { signInTemporary, signInWithKakao } from '@lib/remote';
import moajamLogo from '@assets/logo.png';

export function LoginScreen({
  temporary,
  error,
  onRetry,
}: {
  temporary: boolean;
  error: string;
  onRetry: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const submit = (login: () => Promise<void>) => {
    setBusy(true);
    setFailure('');
    void login()
      .catch((reason: unknown) =>
        setFailure(reason instanceof Error ? reason.message : '다시 시도해주세요.'),
      )
      .finally(() => setBusy(false));
  };
  return (
    <LoginScreenScroll contentContainerStyle={LoginScreenLoginScreenScrollContentStyle}>
      <LoginScreenContainer>
        <LoginScreenContainer2>
          <LoginScreenImage
            source={typeof moajamLogo === 'string' ? { uri: moajamLogo } : moajamLogo}
            resizeMode="contain"

            accessibilityLabel="Moajam 로고"
          />
          <LoginScreenText>함께 맞추는 우리 음악</LoginScreenText>
          <LoginScreenText2>연습부터 합주까지, Moajam에서 함께해요.</LoginScreenText2>
        </LoginScreenContainer2>
        <LoginScreenPanel>
          <LoginScreenText3>Moajam 시작하기</LoginScreenText3>
          <LoginScreenButton
            accessibilityRole="button"
            accessibilityLabel="카카오로 시작하기"
            disabled={busy}
            onPress={() => submit(signInWithKakao)}
            $busy={busy}
          >
            <LoginScreenText4>카카오로 시작하기</LoginScreenText4>
          </LoginScreenButton>
          {temporary && (
            <>
              <Meta>카카오 로그인은 준비 중이에요. 지금은 가입 없이 이용할 수 있어요.</Meta>
              <ActionButton secondary disabled={busy} onPress={() => submit(signInTemporary)}>
                {busy ? '시작하는 중…' : '임시 로그인'}
              </ActionButton>
              <Meta>같은 브라우저나 기기에서는 이전 임시 계정으로 이어서 시작해요.</Meta>
            </>
          )}
          {failure || error ? <Meta accessibilityRole="alert">{failure || error}</Meta> : null}
          {error ? (
            <ActionButton secondary disabled={busy} onPress={onRetry}>
              연결 다시 확인
            </ActionButton>
          ) : null}
        </LoginScreenPanel>
        <LoginScreenText5>우리의 연습이 하나의 음악이 되는 곳</LoginScreenText5>
      </LoginScreenContainer>
    </LoginScreenScroll>
  );
}

const LoginScreenScroll = styledNative(ScrollView)({ flex: 1, backgroundColor: '#f6f8fc' });

const LoginScreenContainer = styledNative(View)({
  maxWidth: 420,
  width: '100%',
  alignSelf: 'center',
  rowGap: 28,
  columnGap: 28,
});

const LoginScreenContainer2 = styledNative(View)({
  alignItems: 'center',
  rowGap: 14,
  columnGap: 14,
});

const LoginScreenImage = styledNative(Image)({ width: 88, height: 88 });

const LoginScreenText = styledNative(Text)({
  color: '#183044',
  fontSize: 32,
  fontWeight: '700',
  letterSpacing: -1,
});

const LoginScreenText2 = styledNative(Text)({
  color: '#6b7c8c',
  fontSize: 15,
  textAlign: 'center',
  lineHeight: 23,
});

const LoginScreenPanel = styledNative(Surface)({
  paddingTop: 28,
  paddingRight: 28,
  paddingBottom: 28,
  paddingLeft: 28,
  rowGap: 18,
  columnGap: 18,
});

const LoginScreenText3 = styledNative(Text)({ color: '#183044', fontSize: 20, fontWeight: '600' });

const LoginScreenText4 = styledNative(Text)({ color: '#191919', fontSize: 16, fontWeight: '600' });

const LoginScreenText5 = styledNative(Text)({
  textAlign: 'center',
  color: '#93a0ae',
  fontSize: 12,
});

const LoginScreenLoginScreenScrollContentStyle = nativeCss({
  flexGrow: 1,
  justifyContent: 'center',
  padding: 24,
});

const LoginScreenButton = withPressFeedback(
  styledNative(Pressable, {
    shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
  })<{ $busy: boolean; $pressed: boolean }>(({ $busy, $pressed }) => ({
    minHeight: 52,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    borderBottomLeftRadius: 10,
    backgroundColor: '#FEE500',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: $busy || $pressed ? 0.65 : 1,
  })),
);
