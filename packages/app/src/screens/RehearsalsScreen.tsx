import { scheduleErrors } from '../lib/scheduleValidation';
import { theme } from '@moajam/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { useIdentity } from '../state/Identity';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { ScheduleDashboard } from '../components/ScheduleDashboard';
import { AppShell } from '../components/AppShell';
import { ScheduleDateTime } from '../components/ScheduleDateTime';
import {
  ActionButton,
  CheckItem,
  Copy,
  Divider,
  FlexBetween,
  FlexRow,
  Heading,
  Meta,
  PageDescription,
  PageHeading,
  PageTop,
  Pill,
  PillText,
  Progress,
  ProgressValue,
  ResponsiveGrid,
  Stack,
  Surface,
} from '../components/ProductUI';
import { AppIcon } from '../components/icons';
import { dateKey } from '../mocks/workspaces';
import type { ScreenProps } from '../navigation';
import { useMockAppState, useWorkspaceValue } from '../state/MockAppState';
import { Avatar, AvatarText, Input, Label } from '../styles/layout';

type SessionDraft = {
  title: string;
  date: string;
  start: string;
  end: string;
  place: string;
  goal: string;
};
function ModalFrame({
  visible,
  title,
  description,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { width } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center', padding: width < 620 ? 14 : 28 }}
      >
        <Pressable
          accessibilityLabel="모달 닫기"
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
          }}
        />
        <View
          style={{
            width: '100%',
            maxWidth: 620,
            maxHeight: '90%',
            alignSelf: 'center',
            overflow: 'hidden',
            borderRadius: 22,
            borderWidth: 1,
            borderColor: '#dce4f0',
            backgroundColor: 'white',
            shadowColor: '#0f172a',
            shadowOpacity: 0.2,
            shadowRadius: 28,
            shadowOffset: { width: 0, height: 14 },
            elevation: 12,
          }}
        >
          <FlexBetween style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: '#e8edf5' }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Heading>{title}</Heading>
              <Meta>{description}</Meta>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="닫기"
              onPress={onClose}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#f1f5f9',
              }}
            >
              <Copy style={{ fontSize: 20, lineHeight: 22 }}>×</Copy>
            </Pressable>
          </FlexBetween>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 7, flex: 1 }}>
      <Label>{label}</Label>
      <Input
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multiline={multiline}
        style={multiline ? { minHeight: 120, textAlignVertical: 'top', lineHeight: 22 } : undefined}
      />
    </View>
  );
}

export function RehearsalsScreen({ navigate, entityId }: ScreenProps) {
  const currentUserId = useIdentity();
  const { width } = useWindowDimensions();
  const {
    members,
    workspace,
    workspaceId,
    rehearsals,
    saveRehearsal,
    canManage,
    setDocument,
    cancelRehearsal,
    adoptedSongs,
  } = useMockAppState();
  const initialSchedule = rehearsals.find((event) => event.id === entityId);
  const [selectedId, setSelectedId] = useState(initialSchedule?.id);
  useEffect(() => {
    setSelectedId(entityId);
  }, [entityId, workspaceId]);
  const schedule = rehearsals.find((event) => event.id === selectedId);
  const [formError, setFormError] = useState('');
  const blankSchedule: SessionDraft = {
    title: '정기 합주',
    date: dateKey(new Date()),
    start: '18:00',
    end: '21:00',
    place: '',
    goal: '',
  };
  const [checks, setChecks] = useWorkspaceValue<{ id: string; label: string; done: boolean }[]>(
    `session/${selectedId}/checks`,
    [],
  );
  const [checkDraft, setCheckDraft] = useState('');
  const [isCheckModalOpen, setIsCheckModalOpen] = useState(false);
  const [memo, setMemo] = useWorkspaceValue(`session/${selectedId}/memo`, '');
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState<SessionDraft>(initialSchedule ?? blankSchedule);
  const [modalMode, setModalMode] = useState<'new' | 'edit' | null>(null);
  const [selectedMembers] = useWorkspaceValue<string[]>(`session/${selectedId}/members`, []);
  const [draftMembers, setDraftMembers] = useState(members.map((member) => member.id));
  const [isAssignmentOpen, setIsAssignmentOpen] = useState(false);
  const [tasks, setTasks] = useWorkspaceValue<
    { id: string; label: string; done: boolean; assigneeId: string; due?: string }[]
  >(`session/${selectedId}/tasks`, []);
  const [taskDraft, setTaskDraft] = useState('');
  const completed = checks.filter((item) => item.done).length;

  const openEditSchedule = () => {
    if (!schedule) return;
    setFormError('');
    setDraft(schedule);
    setDraftMembers(selectedMembers);
    setModalMode('edit');
  };
  const updateDraft = (key: keyof SessionDraft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const saveSchedule = () => {
    const errors = scheduleErrors(draft);
    if (errors.length) {
      setFormError(errors.join('\n'));
      return;
    }
    const id = modalMode === 'edit' && schedule ? schedule.id : `session-${Date.now()}`;
    saveRehearsal({ ...draft, id });
    setSelectedId(id);
    setDocument(`session/${id}/members`, draftMembers, []);
    setModalMode(null);
  };
  const addChecklistItem = () => {
    if (!checkDraft.trim()) return;
    setChecks((current) => [
      ...current,
      { id: `check-${Date.now()}`, label: checkDraft.trim(), done: false },
    ]);
    setCheckDraft('');
    setIsCheckModalOpen(false);
  };

  return (
    <AppShell activeRoute="rehearsals" onNavigate={navigate}>
      <FlexBetween
        style={width < 650 ? { flexDirection: 'column', alignItems: 'stretch' } : undefined}
      >
        <PageTop>
          <PageHeading>합주 세션</PageHeading>
          <PageDescription>
            일정, 현장 체크리스트, 녹음과 다음 액션을 하나의 기록으로 남겨요.
          </PageDescription>
        </PageTop>
      </FlexBetween>

      <ScheduleDashboard
        showNotifications={false}
        allowPersonal
        events={rehearsals.map((event) => ({
          ...event,
          workspaceId,
          bandName: workspace?.name ?? '',
          bandColor: workspace?.color ?? '#416bd1',
        }))}
        navigate={navigate}
        workspaceId={workspaceId}
        initialDate={schedule?.date}
        onSelectEvent={(event) => setSelectedId(event.id)}
        onSelectDate={() => setSelectedId(undefined)}
      />
      {schedule ? (
        <>
          <Surface>
            <FlexBetween style={width < 620 ? { alignItems: 'flex-start' } : undefined}>
              <FlexRow style={{ flex: 1, alignItems: 'flex-start' }}>
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 12,
                    backgroundColor: '#edf3ff',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AppIcon name="calendar" color={theme.colors.primary} size={25} />
                </View>
                <View style={{ flex: 1 }}>
                  <Heading>{schedule.date}</Heading>
                  <Copy>
                    {schedule.start}–{schedule.end} · {schedule.place}
                  </Copy>
                  <Meta>
                    {schedule.title} · {schedule.goal || '합주 목표를 정해보세요'}
                  </Meta>
                </View>
              </FlexRow>
              <ActionButton
                secondary
                compact={width < 620}
                disabled={!canManage}
                onPress={openEditSchedule}
              >
                일정 편집
              </ActionButton>
            </FlexBetween>
            <FlexRow wrap>
              {canManage ? (
                <ActionButton
                  secondary
                  danger
                  compact
                  onPress={() => {
                    cancelRehearsal(schedule.id);
                    setSelectedId(undefined);
                  }}
                >
                  일정 삭제
                </ActionButton>
              ) : null}
              <Meta>{schedule.cancelled ? '취소된 합주입니다.' : '합주할 곡을 선택하세요.'}</Meta>
              {adoptedSongs.map((song) => (
                <Pill
                  key={song.id}
                  active={schedule.songIds?.includes(song.id)}
                  onPress={() => {
                    if (canManage)
                      saveRehearsal({
                        ...schedule,
                        songIds: schedule.songIds?.includes(song.id)
                          ? schedule.songIds.filter((id) => id !== song.id)
                          : [...(schedule.songIds ?? []), song.id],
                      });
                  }}
                >
                  <PillText>{song.title}</PillText>
                </Pill>
              ))}
            </FlexRow>
            <Divider />
            <FlexBetween>
              <FlexRow>
                {members
                  .filter((member) => selectedMembers.includes(member.id))
                  .map((member) => (
                    <Avatar key={member.id} color={member.color}>
                      <AvatarText>{member.initials}</AvatarText>
                    </Avatar>
                  ))}
              </FlexRow>
              <Pill tone="green">
                <PillText tone="green">{selectedMembers.length}명 참석</PillText>
              </Pill>
              <ActionButton
                secondary
                compact
                onPress={() =>
                  setDocument(
                    `session/${selectedId}/members`,
                    selectedMembers.includes(currentUserId)
                      ? selectedMembers.filter((id) => id !== currentUserId)
                      : [...selectedMembers, currentUserId],
                    [],
                  )
                }
              >
                {selectedMembers.includes(currentUserId) ? '참석 취소' : '참석하기'}
              </ActionButton>
            </FlexBetween>
          </Surface>

          <ResponsiveGrid stacked={width < 940}>
            <Stack gap={16} style={width < 940 ? undefined : { flex: 1 }}>
              <Surface>
                <FlexBetween>
                  <Heading>오늘 확인할 것</Heading>
                  <Meta>
                    {completed} / {checks.length} 완료
                  </Meta>
                </FlexBetween>
                <Progress>
                  <ProgressValue value={checks.length ? (completed / checks.length) * 100 : 0} />
                </Progress>
                {checks.map((item) => (
                  <CheckItem
                    key={item.id}
                    checked={item.done}
                    label={item.label}
                    onPress={() =>
                      setChecks((all) =>
                        all.map((value) =>
                          value.id === item.id ? { ...value, done: !value.done } : value,
                        ),
                      )
                    }
                  />
                ))}
                <ActionButton secondary onPress={() => setIsCheckModalOpen(true)}>
                  + 항목 추가
                </ActionButton>
              </Surface>
            </Stack>
            <Stack gap={16} style={width < 940 ? undefined : { flex: 1 }}>
              <Surface>
                <FlexBetween>
                  <Heading>합주 메모</Heading>
                  <Meta>{saved ? '저장됨' : '자동 저장'}</Meta>
                </FlexBetween>
                <Input
                  value={memo}
                  onChangeText={(value) => {
                    setMemo(value);
                    setSaved(false);
                  }}
                  multiline
                  style={{ minHeight: 160, textAlignVertical: 'top' }}
                />
                <ActionButton onPress={() => setSaved(true)}>메모 저장</ActionButton>
              </Surface>
              <Surface>
                <View style={{ gap: 3 }}>
                  <Heading>다음 합주까지</Heading>
                  <Meta>할 일의 담당자를 지정해요. 변경 알림은 아직 발송되지 않습니다.</Meta>
                </View>
                <Input
                  value={taskDraft}
                  onChangeText={setTaskDraft}
                  placeholder="다음 합주까지 할 일"
                />
                <ActionButton
                  secondary
                  disabled={!taskDraft.trim()}
                  onPress={() => {
                    setTasks((all) => [
                      ...all,
                      {
                        id: `task-${Date.now()}`,
                        label: taskDraft.trim(),
                        done: false,
                        assigneeId: currentUserId,
                      },
                    ]);
                    setTaskDraft('');
                  }}
                >
                  할 일 추가
                </ActionButton>
                {tasks.map((task) => {
                  const assignee = members.find((member) => member.id === task.assigneeId);
                  return (
                    <CheckItem
                      key={task.id}
                      checked={task.done}
                      label={task.label}
                      onPress={() =>
                        setTasks((current) =>
                          current.map((item) =>
                            item.id === task.id ? { ...item, done: !item.done } : item,
                          ),
                        )
                      }
                      meta={
                        <Pill tone={assignee ? undefined : 'amber'}>
                          <PillText tone={assignee ? undefined : 'amber'}>
                            {assignee?.name ?? '미지정'}
                          </PillText>
                        </Pill>
                      }
                    />
                  );
                })}
                <ActionButton secondary onPress={() => setIsAssignmentOpen(true)}>
                  할 일 담당자 지정
                </ActionButton>
              </Surface>
            </Stack>
          </ResponsiveGrid>
        </>
      ) : null}
      <Heading>지난 합주</Heading>
      {rehearsals
        .filter((event) => !event.cancelled && new Date(`${event.date}T${event.end}`) < new Date())
        .map((event) => ({
          date: event.date,
          fullDate: event.id,
          place: event.place,
          info: event.title,
          memo: '',
          decisions: [],
        }))
        .map((session) => (
          <Surface key={session.fullDate}>
            <FlexBetween>
              <FlexRow>
                <Pill>
                  <PillText>{session.date}</PillText>
                </Pill>
                <View>
                  <Copy style={{ fontWeight: '600' }}>{session.place}</Copy>
                  <Meta>{session.info}</Meta>
                </View>
              </FlexRow>
              <ActionButton secondary compact onPress={() => setSelectedId(session.fullDate)}>
                기록 보기
              </ActionButton>
            </FlexBetween>
          </Surface>
        ))}

      <ModalFrame
        visible={modalMode !== null}
        title={modalMode === 'new' ? '새 합주 세션 추가' : '합주 일정 편집'}
        description={
          modalMode === 'new'
            ? '날짜와 장소, 참석 멤버를 정해 새 합주를 만들어요.'
            : '변경한 내용은 참석 멤버에게 공유됩니다.'
        }
        onClose={() => setModalMode(null)}
      >
        {formError ? (
          <Copy accessibilityRole="alert" style={{ color: '#be3b4b' }}>
            {formError}
          </Copy>
        ) : null}
        <FormField
          label="세션 이름"
          value={draft.title}
          onChangeText={(value) => updateDraft('title', value)}
          placeholder="예: 정기 합주"
        />
        <ScheduleDateTime
          date={draft.date}
          start={draft.start}
          end={draft.end}
          onChange={(change) => setDraft((previous) => ({ ...previous, ...change }))}
        />
        <FormField
          label="장소"
          value={draft.place}
          onChangeText={(value) => updateDraft('place', value)}
          placeholder="합주실 이름 또는 주소"
        />
        <FormField
          label="이번 합주 목표 (선택)"
          value={draft.goal}
          onChangeText={(value) => updateDraft('goal', value)}
          placeholder="이번 합주에서 꼭 맞춰볼 내용을 적어주세요."
          multiline
        />
        <View style={{ gap: 9 }}>
          <Label>참석 멤버</Label>
          <FlexRow wrap gap={8}>
            {members.map((member) => {
              const active = draftMembers.includes(member.id);
              return (
                <Pressable
                  key={member.id}
                  onPress={() =>
                    setDraftMembers((current) =>
                      active ? current.filter((id) => id !== member.id) : [...current, member.id],
                    )
                  }
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 7,
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: active ? theme.colors.primary : '#dce4f0',
                    backgroundColor: active ? '#eef3ff' : 'white',
                  }}
                >
                  <Avatar color={member.color} style={{ width: 28, height: 28 }}>
                    <AvatarText>{member.initials}</AvatarText>
                  </Avatar>
                  <Copy style={{ fontWeight: '500' }}>{member.name}</Copy>
                </Pressable>
              );
            })}
          </FlexRow>
        </View>
        <Divider />
        <FlexBetween>
          <ActionButton secondary onPress={() => setModalMode(null)}>
            취소
          </ActionButton>
          <ActionButton disabled={!draft.date.trim() || !draft.place.trim()} onPress={saveSchedule}>
            {modalMode === 'new' ? '합주 세션 만들기' : '변경사항 저장'}
          </ActionButton>
        </FlexBetween>
      </ModalFrame>

      <ModalFrame
        visible={isCheckModalOpen}
        title="확인 항목 추가"
        description="이번 합주에서 꼭 확인할 내용을 추가해요."
        onClose={() => setIsCheckModalOpen(false)}
      >
        <FormField
          label="항목 내용"
          value={checkDraft}
          onChangeText={setCheckDraft}
          placeholder="예: 2절 기타 톤 다시 확인"
        />
        <FlexBetween>
          <ActionButton secondary onPress={() => setIsCheckModalOpen(false)}>
            취소
          </ActionButton>
          <ActionButton disabled={!checkDraft.trim()} onPress={addChecklistItem}>
            항목 추가
          </ActionButton>
        </FlexBetween>
      </ModalFrame>

      <ModalFrame
        visible={isAssignmentOpen}
        title="할 일 담당자 지정"
        description="각 할 일을 담당할 멤버를 선택해요."
        onClose={() => setIsAssignmentOpen(false)}
      >
        {tasks.map((task) => (
          <Surface key={task.id} tint="#f8faff">
            <Copy style={{ fontWeight: '600' }}>{task.label}</Copy>
            <FlexRow wrap>
              {members.map((member) => {
                const active = task.assigneeId === member.id;
                return (
                  <Pill
                    key={member.id}
                    active={active}
                    onPress={() =>
                      setTasks((current) =>
                        current.map((item) =>
                          item.id === task.id ? { ...item, assigneeId: member.id } : item,
                        ),
                      )
                    }
                  >
                    <PillText active={active}>{member.name}</PillText>
                  </Pill>
                );
              })}
              <Pill
                active={!task.assigneeId}
                onPress={() =>
                  setTasks((current) =>
                    current.map((item) =>
                      item.id === task.id ? { ...item, assigneeId: '' } : item,
                    ),
                  )
                }
              >
                <PillText active={!task.assigneeId}>미지정</PillText>
              </Pill>
            </FlexRow>
          </Surface>
        ))}
        <ActionButton onPress={() => setIsAssignmentOpen(false)}>지정 완료</ActionButton>
      </ModalFrame>
    </AppShell>
  );
}
