import { AppIcon } from '../components/icons';
import { BandSettings } from '../components/BandSettings';
import { useIdentity } from '../state/Identity';
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { AppShell } from '../components/AppShell';
import {
  ActionButton,
  Copy,
  FlexBetween,
  FlexRow,
  Heading,
  Meta,
  PageDescription,
  PageHeading,
  PageTop,
  Pill,
  PillText,
  ResponsiveGrid,
  SongCover,
  Stack,
  Surface,
} from '../components/ProductUI';
import { useMockAppState } from '../state/MockAppState';
import type { ScreenProps } from '../navigation';
import { Avatar, AvatarText } from '../styles/layout';
import { ScheduleDashboard } from '../components/ScheduleDashboard';

export function HomeScreen({ navigate }: ScreenProps) {
  const currentUserId = useIdentity();
  const { width } = useWindowDimensions();
  const { workspace, members, adoptedSongs, recommendations, rehearsals, leaveWorkspace } =
    useMockAppState();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  const closeLeave = () => {
    if (!leaving) {
      setConfirmLeave(false);
      setConfirmDelete(false);
      setLeaveError('');
    }
  };
  const lastOwner =
    members.length > 1 &&
    members.find((member) => member.id === currentUserId)?.role === 'OWNER' &&
    members.filter((member) => member.role === 'OWNER').length <= 1;
  const leave = async () => {
    if (leaving) return;
    setLeaving(true);
    setLeaveError('');
    setConfirmDelete(false);
    try {
      await leaveWorkspace(confirmDelete);
      setConfirmLeave(false);
      navigate('personal-home');
    } catch (error) {
      setLeaveError(
        error instanceof Error ? error.message : '탈퇴하지 못했습니다. 다시 시도해주세요.',
      );
    } finally {
      setLeaving(false);
    }
  };
  const next = rehearsals
    .filter((event) => !event.cancelled && new Date(`${event.date}T${event.end}`) >= new Date())
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))[0];
  const candidates = recommendations.filter(
    (song) => !adoptedSongs.some((adopted) => adopted.id === song.id),
  );
  return (
    <AppShell activeRoute="home" onNavigate={navigate}>
      <FlexBetween
        style={width < 650 ? { flexDirection: 'column', alignItems: 'stretch' } : undefined}
      >
        <PageTop>
          <FlexRow>
            {workspace?.photo && (
              <Image
                source={{ uri: workspace.photo }}
                style={{ width: 48, height: 48, borderRadius: 24 }}
              />
            )}
            <PageHeading>{workspace?.name}</PageHeading>
          </FlexRow>
          <PageDescription>{workspace?.description}</PageDescription>
        </PageTop>
        <FlexRow style={{ flexShrink: 0 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="밴드 설정"
            onPress={() => setSettingsOpen(true)}
            style={{
              width: 40,
              height: 40,
              borderWidth: 1,
              borderColor: '#dce3ed',
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppIcon name="settings" size={20} color="#52647b" />
          </Pressable>
          <ActionButton secondary onPress={() => navigate('members')}>
            멤버 보기
          </ActionButton>
          <ActionButton
            secondary
            danger
            onPress={() => {
              setLeaveError('');
              setConfirmDelete(false);
              setConfirmLeave(true);
            }}
          >
            나가기
          </ActionButton>
        </FlexRow>
      </FlexBetween>
      <ResponsiveGrid stacked={width < 1050}>
        <Surface style={{ flex: 1.6 }}>
          <FlexBetween>
            <Heading>다음 합주</Heading>
            {next && (
              <Pill tone="amber">
                <PillText tone="amber">예정</PillText>
              </Pill>
            )}
          </FlexBetween>
          {next ? (
            <>
              <PageHeading style={{ fontSize: 24 }}>{next.date}</PageHeading>
              <Copy>
                {next.title} · {next.start}–{next.end}
              </Copy>
              <Meta>{next.place}</Meta>
              <Meta>{next.goal}</Meta>
              <ActionButton secondary onPress={() => navigate('rehearsals', { id: next.id })}>
                일정 보기 →
              </ActionButton>
            </>
          ) : (
            <>
              <Copy>아직 예정된 합주가 없어요.</Copy>
              <ActionButton secondary onPress={() => navigate('rehearsals')}>
                첫 합주 만들기
              </ActionButton>
            </>
          )}
        </Surface>
        <Surface style={{ flex: 1 }}>
          <Heading>함께 준비하는 음악</Heading>
          <PageHeading style={{ fontSize: 25 }}>
            {adoptedSongs.length}곡 · {members.length}명
          </PageHeading>
          <FlexRow wrap>
            {members.map((member) => (
              <Avatar key={member.id} color={member.color} size={34}>
                <AvatarText>{member.initials}</AvatarText>
              </Avatar>
            ))}
          </FlexRow>
        </Surface>
      </ResponsiveGrid>
      <Heading>밴드 일정</Heading>
      <Meta>이 밴드의 모든 멤버가 함께 확인하는 팀 일정이에요.</Meta>
      <ScheduleDashboard
        events={rehearsals
          .filter((event) => !event.cancelled)
          .map((event) => ({
            ...event,
            workspaceId: workspace!.id,
            bandName: workspace!.name,
            bandColor: workspace!.color,
          }))}
        navigate={navigate}
        workspaceId={workspace?.id}
        compact
      />
      <ResponsiveGrid stacked={width < 1050}>
        <Stack style={{ flex: 1.4 }}>
          <Surface>
            <FlexBetween>
              <Heading>함께 연습할 곡</Heading>
              <ActionButton secondary compact onPress={() => navigate('songs')}>
                전체 보기 →
              </ActionButton>
            </FlexBetween>
            {adoptedSongs.map((song) => (
              <View
                key={song.id}
                style={{
                  paddingVertical: 10,
                  gap: 8,
                  borderTopWidth: 1,
                  borderTopColor: '#edf1f6',
                }}
              >
                <FlexRow gap={12}>
                  <SongCover
                    id={song.id}
                    thumbnailUrl={song.thumbnailUrl}
                    referenceUrl={song.referenceUrl}
                    size={50}
                  />
                  <View style={{ flex: 1 }}>
                    <Copy style={{ fontWeight: '500' }}>{song.title}</Copy>
                    <Meta>{song.artist}</Meta>
                  </View>
                  <ActionButton compact onPress={() => navigate('practice', { id: song.id })}>
                    연습하기
                  </ActionButton>
                </FlexRow>
              </View>
            ))}
            {!adoptedSongs.length && <Meta>곡 추천에서 첫 연습곡을 골라보세요.</Meta>}
          </Surface>
        </Stack>
        <Stack style={{ flex: 1 }}>
          <Surface>
            <Heading>다음 채택 후보</Heading>
            {candidates.length ? (
              candidates.slice(0, 3).map((song) => (
                <View key={song.id} style={{ gap: 8 }}>
                  <Copy style={{ fontWeight: '500' }}>{song.title}</Copy>
                  <Meta>
                    {song.artist} · 좋아요 {song.likes} · 채택 추천 {song.votes}
                  </Meta>
                  <ActionButton
                    secondary
                    onPress={() => navigate('recommendation', { id: song.id })}
                  >
                    후보 상세 보기
                  </ActionButton>
                </View>
              ))
            ) : (
              <Meta>새로운 곡을 추천하고 의견을 나눠보세요.</Meta>
            )}
            <ActionButton secondary onPress={() => navigate('recommendations')}>
              곡 추천 보기 →
            </ActionButton>
          </Surface>
          <Surface>
            <Heading>우리 밴드</Heading>
            <Copy>
              {members.find((member) => member.id === currentUserId)?.part} 파트로 함께하고 있어요.
            </Copy>
            <Meta>다른 밴드의 일정과 참여 곡은 개인 공간에서 함께 확인할 수 있어요.</Meta>
            <ActionButton secondary onPress={() => navigate('personal-home')}>
              개인 홈으로 →
            </ActionButton>
          </Surface>
        </Stack>
      </ResponsiveGrid>
      <Modal
        visible={settingsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSettingsOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#0006', justifyContent: 'center', padding: 20 }}>
          <Pressable
            accessibilityLabel="밴드 설정 닫기"
            onPress={() => setSettingsOpen(false)}
            style={{ position: 'absolute', inset: 0 }}
          />
          <ScrollView
            style={{ maxHeight: '90%', width: '100%', maxWidth: 580, alignSelf: 'center' }}
          >
            <BandSettings key={workspace?.id} onClose={() => setSettingsOpen(false)} />
          </ScrollView>
        </View>
      </Modal>
      <Modal visible={confirmLeave} transparent animationType="fade" onRequestClose={closeLeave}>
        <View
          style={{
            flex: 1,
            padding: 20,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(16,29,53,0.48)',
          }}
        >
          <Surface style={{ width: '100%', maxWidth: 440 }}>
            <Heading>{confirmDelete ? '밴드 공간도 삭제할까요?' : '정말 나가실 건가요?'}</Heading>
            <Copy>
              {workspace?.name} 밴드를 탈퇴하면 밴드의 공유 자료에 접근할 수 없고, 내 밴드
              목록에서도 제외됩니다.
            </Copy>
            {members.length === 1 && (
              <Copy style={{ color: '#be3b4b' }}>
                멤버가 없으면 밴드 공간도 지워집니다. 곡, 일정, 메모와 첨부 파일 등 관련 데이터가
                모두 영구 삭제되며 복구할 수 없습니다.
              </Copy>
            )}
            {lastOwner && (
              <Meta>탈퇴하려면 멤버 보기에서 다른 멤버를 먼저 관리자로 지정해주세요.</Meta>
            )}
            {!!leaveError && (
              <Copy accessibilityRole="alert" style={{ color: '#be3b4b' }}>
                {leaveError}
              </Copy>
            )}
            <FlexRow style={{ justifyContent: 'flex-end' }}>
              <ActionButton secondary disabled={leaving} onPress={closeLeave}>
                취소
              </ActionButton>
              <ActionButton
                danger
                disabled={leaving || lastOwner}
                onPress={() => {
                  if (members.length === 1 && !confirmDelete) setConfirmDelete(true);
                  else void leave();
                }}
              >
                {leaving ? '탈퇴 중…' : confirmDelete ? '모든 데이터 삭제 및 탈퇴' : '밴드 탈퇴'}
              </ActionButton>
            </FlexRow>
          </Surface>
        </View>
      </Modal>
    </AppShell>
  );
}
