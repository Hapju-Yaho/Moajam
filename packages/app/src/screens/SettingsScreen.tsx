import { BandSettings } from '../components/BandSettings';
import { useState } from 'react';
import { AccountPanel } from '../components/AccountPanel';
import { AppShell } from '../components/AppShell';
import {
  ActionButton,
  Copy,
  FlexRow,
  Heading,
  Meta,
  PageHeading,
  Pill,
  PillText,
  Surface,
  Toggle,
} from '../components/ProductUI';
import { ProfilePhoto } from '../components/ProfilePhoto';
import { SessionPicker } from '../components/SessionPicker';
import { usePreferences, persistPreferences } from '../state/preferences';
import { useMockAppState } from '../state/MockAppState';
import { downloadText } from '../lib/platformActions';
import { Input } from '../styles/layout';
import type { ScreenProps } from '../navigation';
export function SettingsScreen({ navigate }: ScreenProps) {
  const preferences = usePreferences();
  const [draft, setDraft] = useState(preferences);
  const [bpmText, setBpmText] = useState(String(preferences.bpm));
  const commitBpm = () => {
    const value = Number(bpmText);
    const bpm = Math.max(30, Math.min(300, Number.isFinite(value) ? Math.round(value) : 30));
    setBpmText(String(bpm));
    setDraft((current) => ({ ...current, bpm }));
    return bpm;
  };
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const { workspace, workspaces, canManage } = useMockAppState();
  const save = async () => {
    if (!draft.name.trim()) {
      setMessage('이름을 입력해주세요.');
      return;
    }
    const bpm = commitBpm();
    setSaving(true);
    try {
      const saved = await persistPreferences({ ...draft, bpm, name: draft.name.trim() });
      setDraft((current) => (current === draft ? saved : current));
      setMessage('설정을 저장했습니다.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : '설정을 저장하지 못했습니다. 저장 공간과 연결을 확인해주세요.',
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <AppShell activeRoute="settings" onNavigate={navigate}>
      <PageHeading>내 프로필과 설정</PageHeading>
      <Surface>
        <Heading>내 프로필</Heading>
        <ProfilePhoto
          value={draft.photo}
          onChange={(photo) => setDraft((previous) => ({ ...previous, photo }))}
          disabled={saving}
        />
        <Meta>이름</Meta>
        <Input value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} />
        <Meta>담당 세션 · 여러 개 선택할 수 있어요</Meta>
        <SessionPicker
          value={draft.parts}
          onChange={(parts) => setDraft({ ...draft, parts })}
          disabled={saving}
        />
        <Meta>소개</Meta>
        <Input multiline value={draft.bio} onChangeText={(bio) => setDraft({ ...draft, bio })} />
      </Surface>
      <Surface>
        <Heading>오디오 기본 설정</Heading>
        <Meta>기본 볼륨</Meta>
        <FlexRow wrap>
          {[0.25, 0.5, 0.8, 1].map((volume) => (
            <Pill
              key={volume}
              active={draft.volume === volume}
              onPress={() => setDraft({ ...draft, volume })}
            >
              <PillText active={draft.volume === volume}>{Math.round(volume * 100)}%</PillText>
            </Pill>
          ))}
        </FlexRow>
        <Meta>메트로놈 BPM (30–300)</Meta>
        <Input
          keyboardType="numeric"
          value={bpmText}
          onChangeText={setBpmText}
          onBlur={commitBpm}
          onSubmitEditing={commitBpm}
        />
        <FlexRow>
          <Copy>연습 메트로놈</Copy>
          <Toggle
            on={draft.metronome}
            onPress={() => setDraft({ ...draft, metronome: !draft.metronome })}
          />
        </FlexRow>
        <Meta>녹음 카운트인</Meta>
        <FlexRow wrap>
          {[0, 4, 8].map((countIn) => (
            <Pill
              key={countIn}
              active={draft.countIn === countIn}
              onPress={() => setDraft({ ...draft, countIn })}
            >
              <PillText active={draft.countIn === countIn}>
                {countIn ? `${countIn}박` : '없음'}
              </PillText>
            </Pill>
          ))}
        </FlexRow>
      </Surface>
      <Surface>
        <Heading>알림 수신 설정</Heading>
        <Meta>수신 선호를 저장합니다. 서버 알림 채널이 연결되면 적용됩니다.</Meta>
        {(['push', 'email', 'reminder'] as const).map((key, index) => (
          <FlexRow key={key}>
            <Copy style={{ flex: 1 }}>
              {['푸시 알림', '이메일 요약', '합주 하루 전 알림'][index]}
            </Copy>
            <Toggle on={draft[key]} onPress={() => setDraft({ ...draft, [key]: !draft[key] })} />
          </FlexRow>
        ))}
      </Surface>
      <FlexRow wrap>
        <ActionButton disabled={saving} onPress={() => void save()}>
          {saving ? '저장 중…' : '변경사항 저장'}
        </ActionButton>
        <ActionButton
          secondary
          onPress={() => {
            setDraft(preferences);
            setBpmText(String(preferences.bpm));
            setMessage('변경 내용을 취소했습니다.');
          }}
        >
          변경 취소
        </ActionButton>
      </FlexRow>
      {message ? <Meta accessibilityLiveRegion="polite">{message}</Meta> : null}
      <Surface>
        <Heading>현재 밴드</Heading>
        <Copy>
          {workspace?.name} · {canManage ? 'Owner' : 'Member'}
        </Copy>
        <ActionButton secondary onPress={() => navigate('members')}>
          멤버 관리
        </ActionButton>
      </Surface>
      {workspace && <BandSettings key={workspace.id} />}
      <AccountPanel navigate={navigate} />
      <Surface>
        <Heading>내 데이터</Heading>
        <Meta>
          현재 불러온 밴드 기록을 JSON으로 내려받습니다. 오디오와 악보 파일은 각 보관함에서 별도로
          내려받아주세요.
        </Meta>
        <ActionButton
          secondary
          onPress={() =>
            downloadText(
              `moajam-backup-${new Date().toISOString().slice(0, 10)}.json`,
              JSON.stringify(
                { exportedAt: new Date().toISOString(), workspaces, preferences },
                null,
                2,
              ),
              'application/json',
            )
          }
        >
          기록 백업 다운로드
        </ActionButton>
        <ActionButton secondary onPress={() => navigate('help')}>
          도움말과 문의
        </ActionButton>
      </Surface>
    </AppShell>
  );
}
