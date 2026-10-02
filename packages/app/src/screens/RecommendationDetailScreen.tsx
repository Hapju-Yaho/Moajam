import { SongActions } from '../components/SongActions';
import { theme } from '@moajam/ui';
import { useState } from 'react';
import { useIdentity } from '../state/Identity';
import { Linking, Pressable, useWindowDimensions, View } from 'react-native';
import { AppShell } from '../components/AppShell';
import { ReferenceVideo } from '../components/ReferenceVideo';
import {
  ActionButton,
  Copy,
  FlexBetween,
  FlexRow,
  Heading,
  Meta,
  PageHeading,
  Pill,
  PillText,
  ResponsiveGrid,
  SongCover,
  Stack,
  Surface,
} from '../components/ProductUI';
import type { ScreenProps } from '../navigation';
import { Discussion } from '../components/Discussion';
import { useMockAppState } from '../state/MockAppState';
import { ArtworkImage, Input } from '../styles/layout';

export function RecommendationDetailScreen({ navigate, entityId }: ScreenProps) {
  const currentUserId = useIdentity();
  const { width } = useWindowDimensions();
  const {
    recommendations,
    selectedRecommendationId,
    adoptSong,
    isAdopted,
    canManage,
    toggleReaction,
    deferRecommendation,
    editRecommendation,
  } = useMockAppState();
  const song = recommendations.find((item) => item.id === (entityId ?? selectedRecommendationId));
  const liked = song?.likedByMe ?? false;
  const voted = song?.votedByMe ?? false;
  const [reason, setReason] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    title: song?.title ?? '',
    artist: song?.artist ?? '',
    reason: song?.reason ?? '',
    referenceUrl: song?.referenceUrl ?? '',
  });
  const [editError, setEditError] = useState('');
  if (!song)
    return (
      <AppShell activeRoute="recommendation" onNavigate={navigate}>
        <Surface>
          <Heading>추천곡을 찾을 수 없어요</Heading>
          <ActionButton onPress={() => navigate('recommendations')}>추천 목록으로</ActionButton>
        </Surface>
      </AppShell>
    );
  const adopted = isAdopted(song.id);
  return (
    <AppShell activeRoute="recommendation" onNavigate={navigate}>
      <Pressable onPress={() => navigate('recommendations')}>
        <Meta style={{ color: theme.colors.primary, fontWeight: '500' }}>
          ← 곡 추천으로 돌아가기
        </Meta>
      </Pressable>
      <ResponsiveGrid stacked={width < 920}>
        <Stack gap={16} style={width < 920 ? undefined : { flex: 1.1 }}>
          <Surface>
            <FlexRow gap={18}>
              {song.thumbnailUrl ? (
                <ArtworkImage
                  source={{ uri: song.thumbnailUrl }}
                  resizeMode="cover"
                  style={{
                    width: width < 650 ? 80 : 142,
                    height: width < 650 ? 80 : 142,
                    borderRadius: 12,
                  }}
                />
              ) : (
                <SongCover id={song.id} size={width < 650 ? 80 : 142} />
              )}
              <View style={{ flex: 1, gap: 6 }}>
                <FlexBetween>
                  <PageHeading style={{ flex: 1 }}>{song.title}</PageHeading>
                  {adopted ? (
                    <Pill tone="green">
                      <PillText tone="green">이미 채택된 곡</PillText>
                    </Pill>
                  ) : null}
                </FlexBetween>
                <Heading>{song.artist}</Heading>
                <FlexRow wrap>
                  <Pill>
                    <PillText>{song.year}</PillText>
                  </Pill>
                </FlexRow>
                <Meta>추천일 {new Date(song.recommendedAt).toLocaleDateString('ko-KR')}</Meta>
              </View>
            </FlexRow>
            <Copy style={{ fontSize: 16, lineHeight: 25 }}>“{song.reason}”</Copy>
            <FlexRow gap={8}>
              <ActionButton
                compact
                secondary={!liked}
                onPress={() => toggleReaction(song.id, 'like')}
              >
                ♥ {song.likes} 좋아요
              </ActionButton>
              <View style={{ flex: 1 }} />
              {canManage || song.authorId === currentUserId ? (
                <FlexRow gap={8}>
                  <ActionButton
                    compact
                    secondary
                    onPress={() => {
                      setEditing(!editing);
                      setDraft({
                        title: song.title,
                        artist: song.artist,
                        reason: song.reason,
                        referenceUrl: song.referenceUrl ?? '',
                      });
                      setEditError('');
                    }}
                  >
                    추천 내용 수정
                  </ActionButton>
                  <SongActions song={song} recommendation onDeleted={() => navigate('songs')} />
                </FlexRow>
              ) : null}
            </FlexRow>
            {editing ? (
              <Surface>
                <FlexRow>
                  <Meta style={{ width: 96 }}>곡 제목</Meta>
                  <Input
                    style={{ flex: 1, minWidth: 0 }}
                    accessibilityLabel="추천곡 제목"
                    value={draft.title}
                    onChangeText={(title) => setDraft({ ...draft, title })}
                  />
                </FlexRow>
                <FlexRow>
                  <Meta style={{ width: 96 }}>아티스트</Meta>
                  <Input
                    style={{ flex: 1, minWidth: 0 }}
                    accessibilityLabel="추천곡 아티스트"
                    value={draft.artist}
                    onChangeText={(artist) => setDraft({ ...draft, artist })}
                  />
                </FlexRow>
                <FlexRow>
                  <Meta style={{ width: 96 }}>추천이유</Meta>
                  <Input
                    style={{ flex: 1, minWidth: 0 }}
                    accessibilityLabel="추천 이유"
                    value={draft.reason}
                    onChangeText={(reason) => setDraft({ ...draft, reason })}
                  />
                </FlexRow>
                <FlexRow>
                  <Meta style={{ width: 96 }}>레퍼런스 링크</Meta>
                  <Input
                    style={{ flex: 1, minWidth: 0 }}
                    accessibilityLabel="추천곡 링크"
                    value={draft.referenceUrl}
                    onChangeText={(referenceUrl) => setDraft({ ...draft, referenceUrl })}
                  />
                </FlexRow>
                <ActionButton
                  onPress={() => {
                    if (
                      editRecommendation(song.id, {
                        title: draft.title.trim(),
                        artist: draft.artist.trim(),
                        reason: draft.reason.trim(),
                        referenceUrl: draft.referenceUrl.trim(),
                      })
                    )
                      setEditing(false);
                    else setEditError('제목·아티스트와 링크 형식 또는 중복을 확인해주세요.');
                  }}
                >
                  수정 저장
                </ActionButton>
                <ActionButton secondary onPress={() => setEditing(false)}>
                  취소
                </ActionButton>
                {editError ? <Meta>{editError}</Meta> : null}
              </Surface>
            ) : null}
            <FlexRow wrap>
              <ActionButton secondary={!voted} onPress={() => toggleReaction(song.id, 'vote')}>
                🎸 {song.votes} 채택 추천
              </ActionButton>
            </FlexRow>
          </Surface>
          <Surface>
            <Heading>레퍼런스</Heading>
            <ReferenceVideo
              referenceUrl={song.referenceUrl}
              thumbnailUrl={song.thumbnailUrl}
              title={song.title}
            />
            <FlexBetween>
              <View>
                <Copy style={{ fontWeight: '600' }}>
                  {song.artist} - {song.title}
                </Copy>
                <Meta>등록된 레퍼런스 영상</Meta>
              </View>
              <ActionButton
                secondary
                disabled={!song.referenceUrl}
                onPress={() => {
                  if (song.referenceUrl) void Linking.openURL(song.referenceUrl);
                }}
              >
                새 창에서 열기
              </ActionButton>
            </FlexBetween>
          </Surface>
        </Stack>
        <Stack gap={16} style={width < 920 ? undefined : { flex: 0.9 }}>
          <Discussion documentKey={`recommendation/${song.id}/comments`} />
          <Surface tint="#f7f9ff">
            <Heading>이 곡을 채택할까요?</Heading>
            <Meta>
              채택하면 팀의 채택곡 워크스페이스가 생성되고 자료·연습·합주 기록을 모을 수 있어요.
            </Meta>
            <ActionButton onPress={() => adoptSong(song.id)} disabled={adopted || !canManage}>
              {adopted
                ? '이미 채택된 곡 ✓'
                : !canManage
                  ? '밴드 관리자만 채택할 수 있어요'
                  : '곡 채택하기'}
            </ActionButton>
            {canManage && !adopted ? (
              <>
                <Input value={reason} onChangeText={setReason} placeholder="보류 사유" />
                <ActionButton secondary onPress={() => deferRecommendation(song.id, reason)}>
                  {song.deferred ? '다시 논의하기' : '보류하기'}
                </ActionButton>
                {song.deferred ? <Meta>보류됨 · {song.deferredReason || '사유 없음'}</Meta> : null}
              </>
            ) : null}
          </Surface>
        </Stack>
      </ResponsiveGrid>
    </AppShell>
  );
}
