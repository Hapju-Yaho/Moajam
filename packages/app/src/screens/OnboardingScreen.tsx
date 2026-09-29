import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { MemberPart } from '@moajam/domain';
import { ActionButton, Heading, Meta, Surface } from '../components/ProductUI';
import { ProfilePhoto } from '../components/ProfilePhoto';
import { SessionPicker } from '../components/SessionPicker';
import { Input } from '../styles/layout';
import { api, signOut } from '../lib/remote';

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
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f6f8fc' }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
    >
      <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: 24 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ color: '#4876dd', fontSize: 14, fontWeight: '700' }}>
            WELCOME TO MOAJAM
          </Text>
          <Text
            accessibilityRole="header"
            style={{ color: '#183044', fontSize: 30, fontWeight: '700' }}
          >
            어떤 음악을 함께할까요?
          </Text>
          <Text style={{ color: '#6b7c8c', fontSize: 15, lineHeight: 23 }}>
            함께 연주할 멤버들에게 나를 소개해주세요.
          </Text>
        </View>
        <Surface style={{ padding: 26, gap: 20 }}>
          <Heading>프로필 사진</Heading>
          <ProfilePhoto value={photo} onChange={setPhoto} disabled={busy} />
          <Meta>사진은 나중에 추가해도 괜찮아요. PNG·JPEG·WebP, 최대 500KB</Meta>
          <View style={{ gap: 8 }}>
            <Heading>이름</Heading>
            <Input
              accessibilityLabel="이름"
              placeholder="멤버들에게 보여줄 이름"
              value={name}
              maxLength={80}
              editable={!busy}
              onChangeText={setName}
            />
          </View>
          <View style={{ gap: 12 }}>
            <Heading>담당 세션</Heading>
            <Meta>하나 이상 선택해주세요. 여러 세션을 맡고 있어도 좋아요.</Meta>
            <SessionPicker value={parts} onChange={setParts} disabled={busy} />
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={{ color: '#bd3944', fontSize: 14 }}>
              {error}
            </Text>
          ) : null}
          <ActionButton
            disabled={busy || !name.trim() || !parts.length}
            onPress={() => void save()}
          >
            {busy ? '프로필 저장 중…' : '설정 완료하고 시작하기'}
          </ActionButton>
          <Meta>프로필과 담당 세션은 설정에서 언제든 바꿀 수 있어요.</Meta>
        </Surface>
        <ActionButton
          secondary
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
          다른 계정으로 로그인
        </ActionButton>
      </View>
    </ScrollView>
  );
}
