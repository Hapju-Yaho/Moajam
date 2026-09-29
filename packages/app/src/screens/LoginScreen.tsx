import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { ActionButton, Meta, Surface } from '../components/ProductUI';
import { signInTemporary, signInWithKakao } from '../lib/remote';
import moajamLogo from '../../assets/logo.png';

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
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f6f8fc' }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
    >
      <View style={{ maxWidth: 420, width: '100%', alignSelf: 'center', gap: 28 }}>
        <View style={{ alignItems: 'center', gap: 14 }}>
          <Image
            source={typeof moajamLogo === 'string' ? { uri: moajamLogo } : moajamLogo}
            resizeMode="contain"
            style={{ width: 88, height: 88 }}
            accessibilityLabel="Moajam 로고"
          />
          <Text style={{ color: '#183044', fontSize: 32, fontWeight: '700', letterSpacing: -1 }}>
            함께 맞추는 우리 음악
          </Text>
          <Text style={{ color: '#6b7c8c', fontSize: 15, textAlign: 'center', lineHeight: 23 }}>
            연습부터 합주까지, Moajam에서 함께해요.
          </Text>
        </View>
        <Surface style={{ padding: 28, gap: 18 }}>
          <Text style={{ color: '#183044', fontSize: 20, fontWeight: '600' }}>Moajam 시작하기</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="카카오로 시작하기"
            disabled={busy}
            onPress={() => submit(signInWithKakao)}
            style={({ pressed }) => ({
              minHeight: 52,
              borderRadius: 10,
              backgroundColor: '#FEE500',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: busy || pressed ? 0.65 : 1,
            })}
          >
            <Text style={{ color: '#191919', fontSize: 16, fontWeight: '600' }}>
              카카오로 시작하기
            </Text>
          </Pressable>
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
        </Surface>
        <Text style={{ textAlign: 'center', color: '#93a0ae', fontSize: 12 }}>
          우리의 연습이 하나의 음악이 되는 곳
        </Text>
      </View>
    </ScrollView>
  );
}
