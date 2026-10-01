import { scheduleErrors } from '../lib/scheduleValidation';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ScheduleDialog } from './ScheduleDialog';
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
import { type Rehearsal } from '../mocks/workspaces';
import { usePersonalSchedules } from '../state/personalSchedules';
import { ScheduleDateTime } from './ScheduleDateTime';

export function ScheduleModal({
  visible,
  date,
  onClose,
  workspaceId,
  event,
  onOpenRehearsal,
}: {
  visible: boolean;
  date: string;
  onClose: () => void;
  workspaceId?: string;
  event?: Rehearsal;
  onOpenRehearsal?: () => void;
}) {
  return (
    <ScheduleDialog visible={visible} onClose={onClose}>
      {visible && (
        <ScheduleForm
          date={date}
          onClose={onClose}
          workspaceId={workspaceId}
          event={event}
          onOpenRehearsal={onOpenRehearsal}
        />
      )}
    </ScheduleDialog>
  );
}

function ScheduleForm({
  date,
  onClose,
  workspaceId,
  event,
  onOpenRehearsal,
}: {
  date: string;
  onClose: () => void;
  workspaceId?: string;
  event?: Rehearsal;
  onOpenRehearsal?: () => void;
}) {
  const { workspaces, currentUserId, saveRehearsal } = useMockAppState();
  const personal = usePersonalSchedules();
  const [scope, setScope] = useState<'personal' | 'team'>(workspaceId ? 'team' : 'personal');
  const [saving, setSaving] = useState(false);
  const bands = workspaces.filter((band) =>
    band.members.some((member) => member.id === currentUserId && member.role === 'OWNER'),
  );
  const [bandId, setBandId] = useState(workspaceId ?? bands[0]?.id ?? '');
  const [draft, setDraft] = useState(
    event ?? {
      title: '',
      date,
      start: '18:00',
      end: '21:00',
      place: '',
      goal: '',
    },
  );
  const [error, setError] = useState('');
  const readOnly = !!event && scope === 'team' && !bands.some((band) => band.id === bandId);
  const save = async () => {
    if (saving || readOnly) return;
    const errors = scheduleErrors(
      draft,
      scope !== 'team' || bands.some((band) => band.id === bandId),
    );
    if (errors.length) {
      setError(errors.join('\n'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const next = {
        ...draft,
        title: draft.title.trim(),
        place: (draft.place ?? '').trim(),
        goal: draft.goal ?? '',
        id: event?.id ?? `session-${Date.now()}`,
      };
      if (scope === 'personal') await personal.save(next);
      else saveRehearsal(next, bandId);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : '일정을 저장하지 못했어요.');
    } finally {
      setSaving(false);
    }
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="일정 팝업 닫기"
        disabled={saving}
        onPress={onClose}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      />
      <Surface style={{ width: '100%', maxWidth: 520, maxHeight: '90%' }}>
        <FlexBetween>
          <Heading>
            {event ? (scope === 'team' ? '팀 일정' : '개인 일정 수정') : '일정 등록'}
          </Heading>
          <ActionButton secondary compact disabled={saving} onPress={onClose}>
            닫기
          </ActionButton>
        </FlexBetween>
        <ScrollView contentContainerStyle={{ gap: 14 }}>
          {!event && (
            <FlexRow>
              <Pill
                accessibilityRole="button"
                accessibilityState={{ selected: scope === 'personal' }}
                active={scope === 'personal'}
                onPress={() => setScope('personal')}
              >
                <PillText active={scope === 'personal'}>개인 일정</PillText>
              </Pill>
              <Pill
                accessibilityRole="button"
                accessibilityState={{ selected: scope === 'team' }}
                active={scope === 'team'}
                onPress={() => setScope('team')}
              >
                <PillText active={scope === 'team'}>팀 일정</PillText>
              </Pill>
            </FlexRow>
          )}
          <Meta>
            {scope === 'personal'
              ? '내 캘린더에만 표시돼요.'
              : '선택한 밴드의 모든 멤버에게 공유돼요.'}
          </Meta>
          {scope === 'team' && !event && (
            <>
              <Label>밴드 선택</Label>
              <FlexRow wrap>
                {bands.map((band) => (
                  <Pill
                    key={band.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: bandId === band.id }}
                    active={bandId === band.id}
                    onPress={() => setBandId(band.id)}
                  >
                    <PillText active={bandId === band.id}>{band.name}</PillText>
                  </Pill>
                ))}
              </FlexRow>
              {!bands.length && <Meta>일정 등록은 밴드 관리자만 할 수 있어요.</Meta>}
            </>
          )}
          {!!event && scope === 'team' && (
            <Meta>{workspaces.find((band) => band.id === bandId)?.name}</Meta>
          )}
          <View pointerEvents={readOnly ? 'none' : 'auto'} style={{ gap: 14 }}>
            <View style={{ gap: 6 }}>
              <Label>일정 이름</Label>
              <Input
                editable={!readOnly}
                accessibilityLabel="일정 이름"
                placeholder="어떤 일정인가요?"
                value={draft.title}
                onChangeText={(title) => setDraft((previous) => ({ ...previous, title }))}
              />
            </View>
            <ScheduleDateTime
              date={draft.date}
              start={draft.start}
              end={draft.end}
              onChange={(change) => setDraft((previous) => ({ ...previous, ...change }))}
            />
            {(
              [
                ['place', '장소 (선택)'],
                ['goal', '메모 / 목표 (선택)'],
              ] as const
            ).map(([key, label]) => (
              <View key={key} style={{ gap: 6 }}>
                <Label>{label}</Label>
                <Input
                  editable={!readOnly}
                  accessibilityLabel={label}
                  multiline={key === 'goal'}
                  style={
                    key === 'goal'
                      ? { minHeight: 120, textAlignVertical: 'top', lineHeight: 22 }
                      : undefined
                  }
                  placeholder={
                    key === 'goal'
                      ? '준비할 내용이나 함께 기억할 내용을 적어주세요.'
                      : '장소를 입력해주세요.'
                  }
                  value={draft[key]}
                  onChangeText={(value) => setDraft((previous) => ({ ...previous, [key]: value }))}
                />
              </View>
            ))}
          </View>
          {onOpenRehearsal && (
            <ActionButton secondary onPress={onOpenRehearsal}>
              팀 합주 일정으로 이동
            </ActionButton>
          )}
          {!!error && (
            <Meta accessibilityRole="alert" style={{ color: '#be3b4b' }}>
              {error}
            </Meta>
          )}
          {!readOnly && (
            <ActionButton
              disabled={
                saving ||
                (scope === 'personal' && personal.loading) ||
                (scope === 'team' && !bands.some((band) => band.id === bandId))
              }
              onPress={() => void save()}
            >
              {saving ? '저장 중…' : event ? '수정 저장' : '일정 등록'}
            </ActionButton>
          )}
          {event && scope === 'personal' && (
            <ActionButton
              secondary
              danger
              disabled={saving}
              onPress={() => {
                setSaving(true);
                void personal
                  .remove(event)
                  .then(onClose)
                  .catch((error: Error) => setError(error.message))
                  .finally(() => setSaving(false));
              }}
            >
              개인 일정 삭제
            </ActionButton>
          )}
        </ScrollView>
      </Surface>
    </View>
  );
}
