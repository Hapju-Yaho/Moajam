import styledNative from '@emotion/native';
import { useState } from 'react';
import { usePreferences } from '@state/preferences';
import { useIdentity } from '@state/Identity';
import { Image, Modal, Pressable, useWindowDimensions, View } from 'react-native';
import { api, serverConfigured } from '@lib/remote';
import { InvitationPanel } from '@component/shared/band/InvitationPanel';
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
} from '@component/shared/ui/ProductUI';
import type { ScreenProps } from '@app/navigation';
import { useMockAppState, type MockMember } from '@state/MockAppState';
import { Avatar, AvatarText, Input } from '@styles/layout';

export const MembersScreen: React.FC<ScreenProps> = () => {
  const currentUserId = useIdentity();
  const profile = usePreferences();
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
    <>
      <MembersScreenHeader $width={width}>
        <PageTop>
          <PageHeading>멤버</PageHeading>
          <PageDescription>밴드 멤버의 파트와 권한을 관리합니다.</PageDescription>
        </PageTop>
        <ActionButton onPress={() => setInvite(!invite)}>+ 멤버 초대</ActionButton>
      </MembersScreenHeader>
      {invite ? <InvitationPanel workspaceId={workspaceId} canManage={canManage} /> : null}
      <Input value={query} onChangeText={setQuery} placeholder="멤버 이름 또는 파트 검색" />
      <ResponsiveGrid stacked={width < 940}>
        <MembersScreenStack gap={12} $width={width}>
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
                        {(member.id === currentUserId ? profile.photo : member.photo) ? (
                          <MembersScreenImage
                            source={{
                              uri: member.id === currentUserId ? profile.photo : member.photo,
                            }}
                            accessibilityLabel={`${member.name} 프로필`}
                          />
                        ) : (
                          <AvatarText>{member.initials}</AvatarText>
                        )}
                      </Avatar>
                      <View>
                        <MembersScreenCopy>
                          {member.name}
                          {member.id === currentUserId ? ' (나)' : ''}
                        </MembersScreenCopy>
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
                      <MembersScreenButton
                        accessibilityRole="button"
                        accessibilityLabel={`${member.name} 메뉴`}
                        disabled={!canManage}
                        onPress={() =>
                          setMenuMemberId((current) => (current === member.id ? null : member.id))
                        }
                        $backgroundColor={menuMemberId === member.id ? '#eef3ff' : 'transparent'}
                      >
                        <MembersScreenCopy2>⋮</MembersScreenCopy2>
                      </MembersScreenButton>
                    </FlexRow>
                  </FlexBetween>
                  {menuMemberId === member.id ? (
                    <MembersScreenPanel tint="#f8faff">
                      <FlexBetween>
                        <View>
                          <MembersScreenCopy>{member.name} 관리</MembersScreenCopy>
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
                    </MembersScreenPanel>
                  ) : null}
                  {index < members.length - 1 ? <Divider /> : null}
                </View>
              ))}
          </Surface>
        </MembersScreenStack>
        <MembersScreenStack2 gap={16} $width={width}>
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
                <MembersScreenContainer key={part}>
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
                </MembersScreenContainer>
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
        </MembersScreenStack2>
      </ResponsiveGrid>

      <Modal
        visible={editingMember !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingMember(null)}
      >
        <MembersScreenContainer2>
          <MembersScreenPanel2 scrollable>
            <FlexBetween>
              <View>
                <Heading>멤버 역할 변경</Heading>
                <Meta>{editingMember?.name}님의 파트와 권한을 설정해요.</Meta>
              </View>
              <Pressable onPress={() => setEditingMember(null)}>
                <MembersScreenCopy2>×</MembersScreenCopy2>
              </Pressable>
            </FlexBetween>
            <MembersScreenContainer3>
              <MembersScreenCopy>담당 파트</MembersScreenCopy>
              <FlexRow wrap>
                {['Vocal', 'Guitar', 'Guitar 2', 'Bass', 'Drums', 'Keyboard'].map((part) => (
                  <Pill key={part} active={draftPart === part} onPress={() => setDraftPart(part)}>
                    <PillText active={draftPart === part}>{part}</PillText>
                  </Pill>
                ))}
              </FlexRow>
            </MembersScreenContainer3>
            <MembersScreenContainer3>
              <MembersScreenCopy>워크스페이스 권한</MembersScreenCopy>
              <FlexRow>
                {['MEMBER', 'OWNER'].map((role) => (
                  <Pill key={role} active={draftRole === role} onPress={() => setDraftRole(role)}>
                    <PillText active={draftRole === role}>
                      {role === 'OWNER' ? 'Owner' : 'Member'}
                    </PillText>
                  </Pill>
                ))}
              </FlexRow>
            </MembersScreenContainer3>
            <FlexBetween>
              <ActionButton secondary onPress={() => setEditingMember(null)}>
                취소
              </ActionButton>
              {actionError ? <Meta accessibilityRole="alert">{actionError}</Meta> : null}
              <ActionButton disabled={!draftPart} onPress={saveMember}>
                변경사항 저장
              </ActionButton>
            </FlexBetween>
          </MembersScreenPanel2>
        </MembersScreenContainer2>
      </Modal>

      <Modal
        visible={reminderSent}
        transparent
        animationType="fade"
        onRequestClose={() => setReminderSent(false)}
      >
        <MembersScreenButton2 onPress={() => setReminderSent(false)}>
          <MembersScreenButton3 onPress={(event) => event.stopPropagation()}>
            <MembersScreenPanel3 scrollable>
              <MembersScreenContainer4>
                <MembersScreenCopy3>✓</MembersScreenCopy3>
              </MembersScreenContainer4>
              <Heading>리마인드 안내</Heading>
              <MembersScreenMeta>
                {serverConfigured
                  ? '밴드 멤버의 알림함으로 아래 내용을 보냅니다.'
                  : '알림 발송에는 서버 로그인이 필요합니다.'}
              </MembersScreenMeta>
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
            </MembersScreenPanel3>
          </MembersScreenButton3>
        </MembersScreenButton2>
      </Modal>
    </>
  );
};

const MembersScreenHeader = styledNative(FlexBetween, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $width: number }>(({ $width }) =>
  $width < 650 ? { flexDirection: 'column', alignItems: 'stretch' } : undefined,
);

const MembersScreenStack = styledNative(Stack, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $width: number }>(({ $width }) => ($width < 940 ? undefined : { flex: 1.45 }));

const MembersScreenImage = styledNative(Image)({
  width: 44,
  height: 44,
  borderTopLeftRadius: 22,
  borderTopRightRadius: 22,
  borderBottomRightRadius: 22,
  borderBottomLeftRadius: 22,
});

const MembersScreenCopy = styledNative(Copy)({ fontWeight: '600' });

const MembersScreenButton = styledNative(Pressable, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $backgroundColor: 'transparent' | '#eef3ff' }>(({ $backgroundColor }) => ({
  width: 36,
  height: 36,
  alignItems: 'center',
  justifyContent: 'center',
  borderTopLeftRadius: 10,
  borderTopRightRadius: 10,
  borderBottomRightRadius: 10,
  borderBottomLeftRadius: 10,
  backgroundColor: $backgroundColor,
}));

const MembersScreenCopy2 = styledNative(Copy)({ fontSize: 22 });

const MembersScreenPanel = styledNative(Surface)({
  marginTop: 10,
  paddingTop: 12,
  paddingRight: 12,
  paddingBottom: 12,
  paddingLeft: 12,
});

const MembersScreenStack2 = styledNative(Stack, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $width: number }>(({ $width }) => ($width < 940 ? undefined : { flex: 0.85 }));

const MembersScreenContainer = styledNative(View)({ rowGap: 6, columnGap: 6 });

const MembersScreenContainer2 = styledNative(View)({
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  paddingTop: 20,
  paddingRight: 20,
  paddingBottom: 20,
  paddingLeft: 20,
  backgroundColor: 'rgba(15, 23, 42, 0.5)',
});

const MembersScreenPanel2 = styledNative(Surface)({ width: '100%', maxWidth: 520 });

const MembersScreenContainer3 = styledNative(View)({ rowGap: 8, columnGap: 8 });

const MembersScreenButton2 = styledNative(Pressable)({
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  paddingTop: 20,
  paddingRight: 20,
  paddingBottom: 20,
  paddingLeft: 20,
  backgroundColor: 'rgba(15, 23, 42, 0.5)',
});

const MembersScreenButton3 = styledNative(Pressable)({ width: '100%', maxWidth: 420 });

const MembersScreenPanel3 = styledNative(Surface)({
  paddingTop: 16,
  paddingRight: 16,
  paddingBottom: 16,
  paddingLeft: 16,
});

const MembersScreenContainer4 = styledNative(View)({
  width: 52,
  height: 52,
  alignItems: 'center',
  justifyContent: 'center',
  borderTopLeftRadius: 26,
  borderTopRightRadius: 26,
  borderBottomRightRadius: 26,
  borderBottomLeftRadius: 26,
  backgroundColor: '#e9f8f0',
});

const MembersScreenCopy3 = styledNative(Copy)({
  color: '#16a36a',
  fontSize: 24,
  fontWeight: '600',
});

const MembersScreenMeta = styledNative(Meta)({ textAlign: 'center' });
