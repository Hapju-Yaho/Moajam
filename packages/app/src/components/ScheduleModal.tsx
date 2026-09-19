import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import {
  ActionButton,
  FlexBetween,
  FlexRow,
  Heading,
  Meta,
  Pill,
  PillText,
  Surface,
} from './ProductUI';
import { Input, Label } from '../styles/layout';
import { useMockAppState } from '../state/MockAppState';
import { dateKey } from '../mocks/workspaces';

export function ScheduleModal({
  visible,
  date,
  onClose,
}: {
  visible: boolean;
  date: string;
  onClose: () => void;
}) {
  // Keep the portal mounted so opening does not depend on a second render in StrictMode.
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {visible && <ScheduleForm date={date} onClose={onClose} />}
    </Modal>
  );
}

function ScheduleForm({ date, onClose }: { date: string; onClose: () => void }) {
  const { workspaces, currentUserId, saveRehearsal } = useMockAppState();
  const bands = workspaces.filter((band) =>
    band.members.some((member) => member.id === currentUserId && member.role === 'OWNER'),
  );
  const [bandId, setBandId] = useState(bands[0]?.id ?? '');
  const [draft, setDraft] = useState({
    title: '정기 합주',
    date,
    start: '18:00',
    end: '21:00',
    place: '',
    goal: '',
  });
  const [error, setError] = useState('');
  const save = () => {
    const parsed = new Date(`${draft.date}T00:00:00`);
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (
      !bands.some((band) => band.id === bandId) ||
      !draft.title.trim() ||
      !draft.place.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) ||
      Number.isNaN(parsed.getTime()) ||
      dateKey(parsed) !== draft.date ||
      !time.test(draft.start) ||
      !time.test(draft.end) ||
      draft.end <= draft.start
    ) {
      setError('밴드, 이름, 날짜, 장소를 확인해주세요. 종료 시간은 시작 시간 이후여야 해요.');
      return;
    }
    saveRehearsal(
      {
        ...draft,
        title: draft.title.trim(),
        place: draft.place.trim(),
        id: `session-${Date.now()}`,
      },
      bandId,
    );
    onClose();
  };
  return (
    <View
      style={{
        flex: 1,
        padding: 20,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(16,29,53,0.48)',
      }}
    >
      <Surface style={{ width: '100%', maxWidth: 520, maxHeight: '90%' }}>
        <FlexBetween>
          <Heading>합주 일정 등록</Heading>
          <ActionButton secondary compact onPress={onClose}>
            닫기
          </ActionButton>
        </FlexBetween>
        <ScrollView contentContainerStyle={{ gap: 14 }}>
          <Label>밴드 선택</Label>
          <FlexRow wrap>
            {bands.map((band) => (
              <Pill key={band.id} active={bandId === band.id} onPress={() => setBandId(band.id)}>
                <PillText active={bandId === band.id}>{band.name}</PillText>
              </Pill>
            ))}
          </FlexRow>
          {!bands.length && <Meta>일정 등록은 밴드 관리자만 할 수 있어요.</Meta>}
          {(
            [
              ['title', '일정 이름'],
              ['date', '날짜 (YYYY-MM-DD)'],
              ['start', '시작 시간 (HH:MM)'],
              ['end', '종료 시간 (HH:MM)'],
              ['place', '장소'],
              ['goal', '합주 목표 (선택)'],
            ] as const
          ).map(([key, label]) => (
            <View key={key} style={{ gap: 6 }}>
              <Label>{label}</Label>
              <Input
                accessibilityLabel={label}
                value={draft[key]}
                onChangeText={(value) => setDraft((previous) => ({ ...previous, [key]: value }))}
              />
            </View>
          ))}
          {!!error && (
            <Meta accessibilityRole="alert" style={{ color: '#be3b4b' }}>
              {error}
            </Meta>
          )}
          <ActionButton disabled={!bandId} onPress={save}>
            일정 등록
          </ActionButton>
        </ScrollView>
      </Surface>
    </View>
  );
}
