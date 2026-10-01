import { useState } from 'react';
import { useIdentity } from '../state/Identity';
import { Modal, Pressable, useWindowDimensions, View } from 'react-native';
import { api, serverConfigured } from '../lib/remote';
import { InvitationPanel } from '../components/InvitationPanel';
import { AppShell } from '../components/AppShell';
import {
  ActionButton,
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
import type { ScreenProps } from '../navigation';
import { useMockAppState, type MockMember } from '../state/MockAppState';
import { Avatar, AvatarText, Input } from '../styles/layout';

export function MembersScreen({ navigate }: ScreenProps) {
  const currentUserId = useIdentity();
  const { width } = useWindowDimensions();
  const { members, removeMember, updateMember, workspace, workspaceId, canManage, actionError } =
    useMockAppState();
  const [invite, setInvite] = useState(false);
  const [menuMemberId, setMenuMemberId] = useState<string | null>(null);
  const [editingMember, setEditingMember] = useState<MockMember | null>(null);
  const [draftPart, setDraftPart] = useState('');
  const [draftRole, setDraftRole] = useState('MEMBER');
  const [reminderSent, setReminderSent] = useState(false);
  const [reminderMessage, setReminderMessage] = useState(
    '다음 합주 일정과 체크리스트를 확인해주세요.',
  );
  const [reminderStatus, setReminderStatus] = useState('');
  const [query, setQuery] = useState('');

  const openRoleEditor = (member: MockMember) => {
    setEditingMember(member);
    setDraftPart(member.part);
    setDraftRole(member.role);
    setMenuMemberId(null);
  };

  const saveMember = () => {
    if (!editingMember) return;
    if (updateMember(editingMember.id, { part: draftPart, role: draftRole }))
      setEditingMember(null);
  };
  return (
    <AppShell activeRoute="members" onNavigate={navigate}>
      <FlexBetween
        style={width < 650 ? { flexDirection: 'column', alignItems: 'stretch' } : undefined}
      >
        <PageTop>
          <PageHeading>멤버</PageHeading>
          <PageDescription>밴드 멤버의 파트와 권한을 관리합니다.</PageDescription>
        </PageTop>
        <ActionButton onPress={() => setInvite(!invite)}>+ 멤버 초대</ActionButton>
      </FlexBetween>
      {invite ? <InvitationPanel workspaceId={workspaceId} canManage={canManage} /> : null}
      <Input value={query} onChangeText={setQuery} placeholder="멤버 이름 또는 파트 검색" />
      <ResponsiveGrid stacked={width < 940}>
        <Stack gap={12} style={width < 940 ? undefined : { flex: 1.45 }}>
          <Surface>
            <FlexBetween>
              <Heading>팀 멤버 {members.length}</Heading>
              <Meta>{workspace?.name}</Meta>
            </FlexBetween>
            {members
              .filter((member) =>
                (member.name + ' ' + member.part).toLowerCase().includes(query.toLowerCase()),
              )
              .map((member, index) => (
                <View key={member.id}>
                  <FlexBetween>
                    <FlexRow>
                      <Avatar color={member.color} size={44}>
                        <AvatarText>{member.initials}</AvatarText>
                      </Avatar>
                      <View>
                        <Copy style={{ fontWeight: '600' }}>
                          {member.name}
                          {index === 0 ? ' (나)' : ''}
                        </Copy>
                        <Meta>
                          {index === 0 ? '오늘 활동' : index < 3 ? '2시간 전 활동' : '어제 활동'}
                        </Meta>
                      </View>
                    </FlexRow>
                    <FlexRow>
                      <Pill>
                        <PillText>{member.part}</PillText>
                      </Pill>
                      {member.role === 'OWNER' ? (
                        <Pill tone="amber">
                          <PillText tone="amber">Owner</PillText>
                        </Pill>
                      ) : null}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${member.name} 메뉴`}
                        disabled={!canManage}
                        onPress={() =>
                          setMenuMemberId((current) => (current === member.id ? null : member.id))
                        }
                        style={{
                          width: 36,
                          height: 36,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 10,
                          backgroundColor: menuMemberId === member.id ? '#eef3ff' : 'transparent',
                        }}
                      >
                        <Copy style={{ fontSize: 22 }}>⋮</Copy>
                      </Pressable>
                    </FlexRow>
                  </FlexBetween>
                  {menuMemberId === member.id ? (
                    <Surface tint="#f8faff" style={{ marginTop: 10, padding: 12 }}>
                      <FlexBetween>
                        <View>
                          <Copy style={{ fontWeight: '600' }}>{member.name} 관리</Copy>
                          <Meta>역할과 권한을 변경하거나 팀에서 삭제할 수 있어요.</Meta>
                        </View>
                        <FlexRow wrap>
                          <ActionButton secondary compact onPress={() => openRoleEditor(member)}>
                            역할 변경
                          </ActionButton>
                          <ActionButton
                            secondary
                            danger
                            compact
                            disabled={member.id === currentUserId}
                            onPress={() => {
                              removeMember(member.id);
                              setMenuMemberId(null);
                            }}
                          >
                            {member.id === currentUserId ? '본인 삭제 불가' : '멤버 삭제'}
                          </ActionButton>
                        </FlexRow>
                      </FlexBetween>
                    </Surface>
                  ) : null}
                  {index < members.length - 1 ? <Divider /> : null}
                </View>
              ))}
          </Surface>
        </Stack>
        <Stack gap={16} style={width < 940 ? undefined : { flex: 0.85 }}>
          <Surface>
            <Heading>파트 구성</Heading>
            {[
              ['Vocal', '#ef79a8'],
              ['Guitar', '#4f91ed'],
              ['Bass', '#39b77c'],
              ['Drums', '#9b6bed'],
              ['Keyboard', '#e49a13'],
            ].map(([part, color]) => {
              const count = members.filter((member) =>
                part === 'Guitar' ? member.part.startsWith('Guitar') : member.part === part,
              ).length;
              return (
                <View key={part} style={{ gap: 6 }}>
                  <FlexBetween>
                    <Copy>{part}</Copy>
                    <Meta>{count}명</Meta>
                  </FlexBetween>
                  <Progress>
                    <ProgressValue
                      value={members.length ? (Number(count) / members.length) * 100 : 0}
                      color={String(color)}
                    />
                  </Progress>
                </View>
              );
            })}
          </Surface>
          <Surface>
            <Heading>밴드 알림</Heading>
            <Meta>밴드 멤버에게 앱 안의 알림을 보낼 수 있어요.</Meta>
            <ActionButton secondary onPress={() => setReminderSent(true)}>
              리마인드 보내기
            </ActionButton>
          </Surface>
          <Surface tint="#f8faff">
            <Heading>권한 안내</Heading>
            <Meta>
              Owner는 멤버·일정·곡을 관리할 수 있고 Member는 추천, 의견, 자료, 녹음을 추가할 수
              있습니다.
            </Meta>
          </Surface>
        </Stack>
      </ResponsiveGrid>

      <Modal
        visible={editingMember !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingMember(null)}
      >
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
          }}
        >
          <Surface style={{ width: '100%', maxWidth: 520 }}>
            <FlexBetween>
              <View>
                <Heading>멤버 역할 변경</Heading>
                <Meta>{editingMember?.name}님의 파트와 권한을 설정해요.</Meta>
              </View>
              <Pressable onPress={() => setEditingMember(null)}>
                <Copy style={{ fontSize: 22 }}>×</Copy>
              </Pressable>
            </FlexBetween>
            <View style={{ gap: 8 }}>
              <Copy style={{ fontWeight: '600' }}>담당 파트</Copy>
              <FlexRow wrap>
                {['Vocal', 'Guitar', 'Guitar 2', 'Bass', 'Drums', 'Keyboard'].map((part) => (
                  <Pill key={part} active={draftPart === part} onPress={() => setDraftPart(part)}>
                    <PillText active={draftPart === part}>{part}</PillText>
                  </Pill>
                ))}
              </FlexRow>
            </View>
            <View style={{ gap: 8 }}>
              <Copy style={{ fontWeight: '600' }}>워크스페이스 권한</Copy>
              <FlexRow>
                {['MEMBER', 'OWNER'].map((role) => (
                  <Pill key={role} active={draftRole === role} onPress={() => setDraftRole(role)}>
                    <PillText active={draftRole === role}>
                      {role === 'OWNER' ? 'Owner' : 'Member'}
                    </PillText>
                  </Pill>
                ))}
              </FlexRow>
            </View>
            <FlexBetween>
              <ActionButton secondary onPress={() => setEditingMember(null)}>
                취소
              </ActionButton>
              {actionError ? <Meta accessibilityRole="alert">{actionError}</Meta> : null}
              <ActionButton disabled={!draftPart} onPress={saveMember}>
                변경사항 저장
              </ActionButton>
            </FlexBetween>
          </Surface>
        </View>
      </Modal>

      <Modal
        visible={reminderSent}
        transparent
        animationType="fade"
        onRequestClose={() => setReminderSent(false)}
      >
        <Pressable
          onPress={() => setReminderSent(false)}
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
          }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{ width: '100%', maxWidth: 420 }}
          >
            <Surface style={{ alignItems: 'center', padding: 24 }}>
              <View
                style={{
                  width: 52,
                  height: 52,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 26,
                  backgroundColor: '#e9f8f0',
                }}
              >
                <Copy style={{ color: '#16a36a', fontSize: 24, fontWeight: '600' }}>✓</Copy>
              </View>
              <Heading>리마인드 안내</Heading>
              <Meta style={{ textAlign: 'center' }}>
                {serverConfigured
                  ? '밴드 멤버의 알림함으로 아래 내용을 보냅니다.'
                  : '알림 발송에는 서버 로그인이 필요합니다.'}
              </Meta>
              <Input multiline value={reminderMessage} onChangeText={setReminderMessage} />
              <ActionButton
                disabled={!serverConfigured || !canManage || !reminderMessage.trim()}
                onPress={() =>
                  void api(`/workspaces/${workspaceId}/reminders`, 'POST', {
                    message: reminderMessage.trim(),
                  })
                    .then(() => setReminderStatus('밴드 멤버의 알림함에 전달했습니다.'))
                    .catch((error: Error) => setReminderStatus(error.message))
                }
              >
                알림 보내기
              </ActionButton>
              {reminderStatus ? <Meta>{reminderStatus}</Meta> : null}
              <ActionButton secondary onPress={() => setReminderSent(false)}>
                닫기
              </ActionButton>
            </Surface>
          </Pressable>
        </Pressable>
      </Modal>
    </AppShell>
  );
}
