import styledNative from '@emotion/native';
import { SongActions } from '@component/song-detail/SongActions';
import { theme } from '@moajam/ui';
import { useState } from 'react';
import { useIdentity } from '@state/Identity';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { ReferenceVideo } from '@component/shared/media/ReferenceVideo';
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
  Stack,
  Surface,
} from '@component/shared/ui/ProductUI';
import type { ScreenProps } from '@app/navigation';
import { Discussion } from '@component/shared/discussion/Discussion';
import { useMockAppState } from '@state/MockAppState';
import { Input } from '@styles/layout';

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
      <>
        <Surface>
          <Heading>추천곡을 찾을 수 없어요</Heading>
          <ActionButton onPress={() => navigate('recommendations')}>추천 목록으로</ActionButton>
        </Surface>
      </>
    );
  const adopted = isAdopted(song.id);
  return (
    <>
      <Pressable onPress={() => navigate('recommendations')}>
        <RecommendationDetailScreenMeta>← 곡 추천으로 돌아가기</RecommendationDetailScreenMeta>
      </Pressable>
      <Stack gap={16}>
        <Surface>
          <RecommendationDetailScreenContainer $width={width}>
            <RecommendationDetailScreenContainer2 $width={width}>
              <ReferenceVideo
                referenceUrl={song.referenceUrl}
                thumbnailUrl={song.thumbnailUrl}
                title={song.title}
              />
            </RecommendationDetailScreenContainer2>
            <RecommendationDetailScreenContainer3>
              <FlexBetween>
                <RecommendationDetailScreenPageHeading>
                  {song.title}
                </RecommendationDetailScreenPageHeading>
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
            </RecommendationDetailScreenContainer3>
          </RecommendationDetailScreenContainer>
          <RecommendationDetailScreenCopy>“{song.reason}”</RecommendationDetailScreenCopy>
          <FlexRow gap={8} wrap>
            <ActionButton
              compact
              secondary={!liked}
              onPress={() => toggleReaction(song.id, 'like')}
            >
              ♥ {song.likes} 좋아요
            </ActionButton>
            <RecommendationDetailScreenContainer4 />
            <ActionButton
              compact
              onPress={() => {
                adoptSong(song.id);
                navigate('recommendations');
              }}
              disabled={adopted || !canManage}
            >
              {adopted
                ? '이미 채택된 곡 ✓'
                : !canManage
                  ? '밴드 관리자만 채택할 수 있어요'
                  : '곡 채택하기'}
            </ActionButton>

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
                <RecommendationDetailScreenMeta2>곡 제목</RecommendationDetailScreenMeta2>
                <RecommendationDetailScreenInput
                  accessibilityLabel="추천곡 제목"
                  value={draft.title}
                  onChangeText={(title) => setDraft({ ...draft, title })}
                />
              </FlexRow>
              <FlexRow>
                <RecommendationDetailScreenMeta2>아티스트</RecommendationDetailScreenMeta2>
                <RecommendationDetailScreenInput
                  accessibilityLabel="추천곡 아티스트"
                  value={draft.artist}
                  onChangeText={(artist) => setDraft({ ...draft, artist })}
                />
              </FlexRow>
              <FlexRow>
                <RecommendationDetailScreenMeta2>추천이유</RecommendationDetailScreenMeta2>
                <RecommendationDetailScreenInput
                  accessibilityLabel="추천 이유"
                  value={draft.reason}
                  onChangeText={(reason) => setDraft({ ...draft, reason })}
                />
              </FlexRow>
              <FlexRow>
                <RecommendationDetailScreenMeta2>레퍼런스 링크</RecommendationDetailScreenMeta2>
                <RecommendationDetailScreenInput
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
        </Surface>
        {canManage && !adopted ? (
          <Surface tint="#f7f9ff">
            <Input value={reason} onChangeText={setReason} placeholder="보류 사유" />
            <ActionButton secondary onPress={() => deferRecommendation(song.id, reason)}>
              {song.deferred ? '다시 논의하기' : '보류하기'}
            </ActionButton>
            {song.deferred ? <Meta>보류됨 · {song.deferredReason || '사유 없음'}</Meta> : null}
          </Surface>
        ) : null}
        <Discussion documentKey={`recommendation/${song.id}/comments`} />
      </Stack>
    </>
  );
}

const RecommendationDetailScreenMeta = styledNative(Meta)({
  color: theme.colors.primary,
  fontWeight: '500',
});

const RecommendationDetailScreenContainer = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $width: number }>(({ $width }) => ({
  flexDirection: $width < 760 ? 'column' : 'row',
  rowGap: 24,
  columnGap: 24,
  alignItems: $width < 760 ? 'stretch' : 'center',
}));

const RecommendationDetailScreenContainer2 = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $width: number }>(({ $width }) => ($width < 760 ? undefined : { flex: 1, minWidth: 0 }));

const RecommendationDetailScreenContainer3 = styledNative(View)({
  flex: 1,
  rowGap: 6,
  columnGap: 6,
});

const RecommendationDetailScreenPageHeading = styledNative(PageHeading)({ flex: 1 });

const RecommendationDetailScreenCopy = styledNative(Copy)({ fontSize: 16, lineHeight: 25 });

const RecommendationDetailScreenContainer4 = styledNative(View)({ flex: 1 });

const RecommendationDetailScreenMeta2 = styledNative(Meta)({ width: 96 });

const RecommendationDetailScreenInput = styledNative(Input)({ flex: 1, minWidth: 0 });
