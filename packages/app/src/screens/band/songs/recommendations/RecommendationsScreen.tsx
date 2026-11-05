import { css as nativeCss } from '@emotion/native';

import styled from '@emotion/native';
import { Body, Button, Muted, Row, theme } from '@moajam/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  ActionButton,
  Copy,
  FlexBetween,
  FlexRow,
  Heading,
  Meta,
  Pill,
  PillText,
  SoftIcon,
} from '@component/shared/ui/ProductUI';
import { AppIcon } from '@component/shared/icons';
import { fetchYouTubeMetadata, parseYouTubeUrl } from '@lib/youtube';
import type { ScreenProps } from '@app/navigation';
import { useMockAppState } from '@state/MockAppState';
import {
  Artwork,
  ArtworkImage,
  ArtworkText,
  Between,
  Chip,
  ChipText,
  Input,
  Inline,
  Label,
  PageHeader,
  PageTitle,
  SearchInput,
  SectionTitle,
} from '@styles/layout';

const Recommendation = styled.Pressable`
  padding: 16px;
  gap: 14px;
  border: 1px solid ${theme.colors.border};
  border-radius: 14px;
  background-color: white;
`;

const LatestComment = styled.View`
  padding: 10px 12px;
  gap: 3px;
  border-radius: 9px;
  background-color: #f7f9fc;
`;

const ModalBackdrop = styled.View`
  flex: 1;
  padding: 16px;
  align-items: center;
  justify-content: center;
  background-color: rgba(10, 20, 38, 0.64);
`;

const DismissLayer = styled.Pressable`
  position: absolute;
  inset: 0;
`;

const ModalCard = styled.View`
  width: 100%;
  max-width: 680px;
  max-height: 94%;
  overflow: hidden;
  border-radius: 20px;
  background-color: white;
  elevation: 12;
`;

const ModalScroll = styled.ScrollView`
  width: 100%;
`;

const ModalHeader = styled.View`
  padding: 22px 24px 18px;
  border-bottom-width: 1px;
  border-bottom-color: ${theme.colors.border};
`;

const Field = styled.View`
  gap: 7px;
`;

const PreviewImage = styled.Image`
  width: 176px;
  height: 99px;
  flex-shrink: 0;
  border-radius: 10px;
  background-color: ${theme.colors.surfaceRaised};
`;

const UrlPanel = styled.View`
  padding: 16px;
  border: 1px solid #cdddfd;
  border-radius: 14px;
  background-color: #f4f7ff;
`;

const PreviewCard = styled.View`
  padding: 12px;
  border: 1px solid ${theme.colors.border};
  border-radius: 13px;
  background-color: white;
`;

const ModalFooter = styled.View`
  padding: 16px 24px 20px;
  border-top-width: 1px;
  border-top-color: ${theme.colors.border};
  background-color: #fbfcfe;
`;

const StatusText = styled.Text<{ error?: boolean }>`
  font-weight: 400;
  color: ${({ error }) => (error ? theme.colors.danger : theme.colors.textMuted)};
  font-size: 13px;
  line-height: 19px;
`;

const CloseButton = styled.Pressable`
  width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  border-radius: 17px;
  background-color: ${theme.colors.surfaceRaised};
`;

const StepBadge = styled.View`
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background-color: ${theme.colors.primary};
`;

type MetadataState = 'idle' | 'loading' | 'success' | 'error';

export function RecommendationsScreen({
  navigate,
  embedded = false,
}: ScreenProps & { embedded?: boolean }) {
  const { width } = useWindowDimensions();
  const {
    recommendations: songs,
    adoptedSongs,
    addRecommendation,
    isAdopted,
    selectRecommendation,
    workspace,
    toggleReaction,
  } = useMockAppState();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'최신순' | '인기순'>('최신순');
  const [includeAdopted, setIncludeAdopted] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [referenceUrl, setReferenceUrl] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [reason, setReason] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [metadataState, setMetadataState] = useState<MetadataState>('idle');
  const [metadataMessage, setMetadataMessage] = useState('');
  const lastAutoFill = useRef({ title: '', artist: '' });

  useEffect(() => {
    if (!isFormOpen) return;

    const reference = parseYouTubeUrl(referenceUrl);
    if (!reference) {
      setThumbnailUrl('');
      setMetadataState(referenceUrl.trim() ? 'error' : 'idle');
      setMetadataMessage(
        referenceUrl.trim() ? '올바른 YouTube 또는 YouTube Music 링크를 입력해 주세요.' : '',
      );
      return;
    }

    setThumbnailUrl(reference.thumbnailUrl);
    setMetadataState('loading');
    setMetadataMessage('영상 정보를 불러오는 중이에요.');
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetchYouTubeMetadata(reference, controller.signal)
        .then((metadata) => {
          setTitle((current) =>
            !current.trim() || current === lastAutoFill.current.title ? metadata.title : current,
          );
          setArtist((current) =>
            !current.trim() || current === lastAutoFill.current.artist ? metadata.artist : current,
          );
          lastAutoFill.current = { title: metadata.title, artist: metadata.artist };
          setThumbnailUrl(metadata.thumbnailUrl);
          setMetadataState('success');
          setMetadataMessage(
            '썸네일, 제목, 가수를 자동으로 가져왔어요. 자유롭게 수정할 수 있어요.',
          );
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === 'AbortError') return;
          setMetadataState('error');
          setMetadataMessage('자동으로 불러오지 못했어요. 제목과 가수를 직접 입력해 주세요.');
        });
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [isFormOpen, referenceUrl]);

  const resetForm = () => {
    setReferenceUrl('');
    setTitle('');
    setArtist('');
    setReason('');
    setThumbnailUrl('');
    setMetadataState('idle');
    setMetadataMessage('');
    lastAutoFill.current = { title: '', artist: '' };
  };

  const closeForm = () => {
    setIsFormOpen(false);
    resetForm();
  };

  const saveRecommendation = () => {
    const reference = parseYouTubeUrl(referenceUrl);
    if (!reference || !title.trim() || !artist.trim()) return;

    const added = addRecommendation({
      id: `recommendation-${Date.now()}`,
      title: title.trim(),
      artist: artist.trim(),
      reason: reason.trim() || '함께 연주해 보고 싶은 곡이에요.',
      likes: 0,
      votes: 0,
      comments: 0,
      tint: '#315fa8',
      year: new Date().getFullYear(),
      recommendedAt: new Date().toISOString(),
      thumbnailUrl: thumbnailUrl || reference.thumbnailUrl,
      referenceUrl: reference.canonicalUrl,
    });
    if (added) closeForm();
  };

  const isSaveDisabled =
    !parseYouTubeUrl(referenceUrl) ||
    !title.trim() ||
    !artist.trim() ||
    metadataState === 'loading';
  const filtered = useMemo(
    () =>
      songs
        .filter((song) => includeAdopted || !adoptedSongs.some((adopted) => adopted.id === song.id))
        .filter((song) =>
          `${song.title} ${song.artist}`.toLowerCase().includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          filter === '인기순'
            ? b.likes - a.likes
            : Date.parse(b.recommendedAt) - Date.parse(a.recommendedAt),
        ),
    [filter, query, songs, adoptedSongs, includeAdopted],
  );

  const content = (
    <>
      <PageHeader>
        <Between>
          <View>
            <PageTitle>곡 추천</PageTitle>
            <Muted>다음 합주곡을 함께 골라보세요.</Muted>
          </View>
          <Button onPress={() => setIsFormOpen(true)}>+ 곡 추천하기</Button>
        </Between>
      </PageHeader>
      <Inline wrap>
        <SearchInput value={query} onChangeText={setQuery} placeholder="곡명 또는 아티스트 검색" />
        {(['최신순', '인기순'] as const).map((item) => (
          <Chip key={item} active={filter === item} onPress={() => setFilter(item)}>
            <ChipText active={filter === item}>{item}</ChipText>
          </Chip>
        ))}
        <Chip
          active={includeAdopted}
          accessibilityRole="button"
          accessibilityState={{ selected: includeAdopted }}
          onPress={() => setIncludeAdopted((value) => !value)}
        >
          <ChipText active={includeAdopted}>채택된 곡 포함</ChipText>
        </Chip>
      </Inline>
      <RecommendationsScreenContainer>
        <Between>
          <SectionTitle>추천곡 {filtered.length}</SectionTitle>
          <Muted>최근 댓글까지 카드에서 바로 확인하세요</Muted>
        </Between>
        {filtered.length === 0 ? (
          <RecommendationsScreenContainer2>
            <Body>
              {songs.length
                ? query.trim()
                  ? '검색한 곡이 없어요.'
                  : '표시할 추천곡이 없어요.'
                : '아직 추천한 곡이 없어요.'}
            </Body>
            <Muted>
              {songs.length
                ? includeAdopted
                  ? '다른 곡명이나 아티스트로 검색해보세요.'
                  : '다른 검색어를 입력하거나 채택된 곡 포함을 켜보세요.'
                : '곡 추천하기로 첫 후보를 등록해보세요.'}
            </Muted>
          </RecommendationsScreenContainer2>
        ) : null}
        <RecommendationsScreenContainer3 $width={width}>
          {filtered.map((song) => {
            const isLiked = song.likedByMe ?? false;
            return (
              <RecommendationsScreenContainer4 key={song.id} $width={width}>
                <RecommendationsScreenRecommendation
                  onPress={() => {
                    selectRecommendation(song.id);
                    navigate('recommendation', { id: song.id });
                  }}
                >
                  <RecommendationsScreenContainer5>
                    {song.thumbnailUrl ? (
                      <ArtworkImage source={{ uri: song.thumbnailUrl }} resizeMode="cover" />
                    ) : (
                      <Artwork tint={song.tint}>
                        <ArtworkText>♪</ArtworkText>
                      </Artwork>
                    )}
                    <RecommendationsScreenContainer6>
                      <FlexBetween>
                        <RecommendationsScreenBody>{song.title}</RecommendationsScreenBody>
                        {isAdopted(song.id) ? (
                          <Pill tone="green">
                            <PillText tone="green">이미 채택된 곡</PillText>
                          </Pill>
                        ) : null}
                      </FlexBetween>
                      <Muted>
                        {song.artist} · {song.year}
                      </Muted>
                      <Muted numberOfLines={1}>{song.reason}</Muted>
                    </RecommendationsScreenContainer6>
                  </RecommendationsScreenContainer5>
                  <RecommendationsScreenLatestComment>
                    <Label>{song.deferred ? '보류된 추천' : '최근 의견'}</Label>
                    <Muted numberOfLines={2}>
                      {song.deferred
                        ? song.deferredReason || '다음 선곡 때 다시 논의해요.'
                        : ((
                            workspace?.documents?.[`recommendation/${song.id}/comments`] as
                              { text: string }[] | undefined
                          )?.at(0)?.text ?? '첫 의견을 남겨보세요.')}
                    </Muted>
                  </RecommendationsScreenLatestComment>
                  <Between>
                    <Row gap={12}>
                      <RecommendationsScreenText
                        onPress={(event) => {
                          event.stopPropagation();
                          toggleReaction(song.id, 'like');
                        }}
                        $isLiked={isLiked}
                      >
                        ♥ {song.likes}
                      </RecommendationsScreenText>
                      <Muted>▢ {song.comments}</Muted>
                    </Row>
                    <Muted>댓글 {song.comments}개 →</Muted>
                  </Between>
                </RecommendationsScreenRecommendation>
              </RecommendationsScreenContainer4>
            );
          })}
        </RecommendationsScreenContainer3>
      </RecommendationsScreenContainer>
      <Modal visible={isFormOpen} transparent animationType="fade" onRequestClose={closeForm}>
        <RecommendationsScreenKeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ModalBackdrop>
            <DismissLayer accessibilityLabel="추천곡 등록 닫기" onPress={closeForm} />
            <ModalCard>
              <ModalHeader>
                <FlexBetween>
                  <RecommendationsScreenRow gap={12}>
                    <SoftIcon size={42}>
                      <AppIcon name="sparkles" color={theme.colors.primary} size={20} />
                    </SoftIcon>
                    <RecommendationsScreenContainer7>
                      <RecommendationsScreenHeading>새로운 곡 추천</RecommendationsScreenHeading>
                      <Meta>링크를 입력하면 곡 정보를 자동으로 불러옵니다.</Meta>
                    </RecommendationsScreenContainer7>
                  </RecommendationsScreenRow>
                  <CloseButton accessibilityLabel="닫기" onPress={closeForm}>
                    <RecommendationsScreenText2>×</RecommendationsScreenText2>
                  </CloseButton>
                </FlexBetween>
              </ModalHeader>
              <ModalScroll
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={RecommendationsScreenModalScrollContentStyle({
                  $width: width,
                })}
              >
                <RecommendationsScreenUrlPanel>
                  <FlexRow gap={9}>
                    <StepBadge>
                      <RecommendationsScreenText3>1</RecommendationsScreenText3>
                    </StepBadge>
                    <RecommendationsScreenContainer8>
                      <Label>YouTube 링크 붙여넣기</Label>
                      <Meta>일반 영상, Shorts, YouTube Music 링크를 지원해요.</Meta>
                    </RecommendationsScreenContainer8>
                  </FlexRow>
                  <RecommendationsScreenInput
                    value={referenceUrl}
                    onChangeText={setReferenceUrl}
                    placeholder="https://youtube.com/watch?v=..."
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    $metadataState={metadataState}
                  />
                  {metadataState === 'loading' ? (
                    <Row gap={7}>
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                      <StatusText>{metadataMessage}</StatusText>
                    </Row>
                  ) : metadataMessage ? (
                    <StatusText error={metadataState === 'error'}>{metadataMessage}</StatusText>
                  ) : (
                    <FlexRow gap={6}>
                      <AppIcon name="help" color={theme.colors.textMuted} size={14} />
                      <StatusText>
                        링크를 붙여 넣으면 제목과 아티스트가 자동으로 채워져요.
                      </StatusText>
                    </FlexRow>
                  )}
                </RecommendationsScreenUrlPanel>

                {thumbnailUrl ? (
                  <PreviewCard>
                    <RecommendationsScreenContainer9 $width={width}>
                      <RecommendationsScreenPreviewImage
                        source={{ uri: thumbnailUrl }}
                        resizeMode="cover"
                        $width={width}
                      />
                      <RecommendationsScreenContainer10>
                        <RecommendationsScreenMeta>불러온 영상</RecommendationsScreenMeta>
                        <RecommendationsScreenCopy numberOfLines={2}>
                          {title || '곡 제목을 불러오는 중이에요'}
                        </RecommendationsScreenCopy>
                        <Meta numberOfLines={1}>{artist || '아티스트 확인 중'}</Meta>
                        <FlexRow gap={6}>
                          <RecommendationsScreenContainer11 $metadataState={metadataState} />
                          <Meta>
                            {metadataState === 'success' ? '영상 정보 확인 완료' : '정보 확인 중'}
                          </Meta>
                        </FlexRow>
                      </RecommendationsScreenContainer10>
                    </RecommendationsScreenContainer9>
                  </PreviewCard>
                ) : null}

                <RecommendationsScreenContainer>
                  <FlexRow gap={9}>
                    <StepBadge>
                      <RecommendationsScreenText3>2</RecommendationsScreenText3>
                    </StepBadge>
                    <View>
                      <Label>곡 정보 확인</Label>
                      <Meta>자동으로 채워진 정보는 직접 수정할 수 있어요.</Meta>
                    </View>
                  </FlexRow>
                  <RecommendationsScreenContainer12 $width={width}>
                    <RecommendationsScreenField>
                      <FlexRow gap={5}>
                        <Label>곡 제목</Label>
                        <RecommendationsScreenText4>*</RecommendationsScreenText4>
                      </FlexRow>
                      <Input value={title} onChangeText={setTitle} placeholder="곡 제목" />
                    </RecommendationsScreenField>
                    <RecommendationsScreenField>
                      <FlexRow gap={5}>
                        <Label>아티스트</Label>
                        <RecommendationsScreenText4>*</RecommendationsScreenText4>
                      </FlexRow>
                      <Input
                        value={artist}
                        onChangeText={setArtist}
                        placeholder="가수 또는 아티스트"
                      />
                    </RecommendationsScreenField>
                  </RecommendationsScreenContainer12>
                  <RecommendationsScreenField2>
                    <FlexBetween>
                      <Label>추천 이유</Label>
                      <Meta>{reason.length} / 200</Meta>
                    </FlexBetween>
                    <RecommendationsScreenInput2
                      value={reason}
                      onChangeText={(value) => setReason(value.slice(0, 200))}
                      placeholder="이 곡을 함께 연주하고 싶은 이유를 적어주세요."
                      multiline
                      numberOfLines={3}
                    />
                  </RecommendationsScreenField2>
                </RecommendationsScreenContainer>
              </ModalScroll>
              <ModalFooter>
                <RecommendationsScreenContainer13>
                  <RecommendationsScreenContainer14 $width={width}>
                    <ActionButton secondary onPress={closeForm}>
                      취소
                    </ActionButton>
                  </RecommendationsScreenContainer14>
                  <RecommendationsScreenContainer15 $width={width}>
                    <ActionButton disabled={isSaveDisabled} onPress={saveRecommendation}>
                      추천곡 추가
                    </ActionButton>
                  </RecommendationsScreenContainer15>
                </RecommendationsScreenContainer13>
              </ModalFooter>
            </ModalCard>
          </ModalBackdrop>
        </RecommendationsScreenKeyboardAvoidingView>
      </Modal>
    </>
  );
  return embedded ? (
    <RecommendationsScreenContainer16>{content}</RecommendationsScreenContainer16>
  ) : (
    <>{content}</>
  );
}

const RecommendationsScreenContainer = styled(View)({ rowGap: 14, columnGap: 14 });

const RecommendationsScreenContainer2 = styled(View)({
  paddingTop: 24,
  paddingRight: 24,
  paddingBottom: 24,
  paddingLeft: 24,
  rowGap: 8,
  columnGap: 8,
});

const RecommendationsScreenContainer3 = styled(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $width: number }>(({ $width }) => ({
  flexDirection: $width < 900 ? 'column' : 'row',
  flexWrap: 'wrap',
  rowGap: 16,
  columnGap: 16,
}));

const RecommendationsScreenContainer4 = styled(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $width: number }>(({ $width }) => ({
  width: $width < 900 ? '100%' : '48.8%',
  rowGap: 6,
  columnGap: 6,
}));

const RecommendationsScreenContainer5 = styled(View)({
  flexDirection: 'row',
  alignItems: 'center',
  rowGap: 14,
  columnGap: 14,
});

const RecommendationsScreenContainer6 = styled(View)({
  flex: 1,
  minWidth: 0,
  rowGap: 4,
  columnGap: 4,
});

const RecommendationsScreenBody = styled(Body)({ flex: 1, fontWeight: '500' });

const RecommendationsScreenLatestComment = styled(LatestComment)({ rowGap: 3, columnGap: 3 });

const RecommendationsScreenText = styled(Text, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $isLiked: boolean }>(({ $isLiked }) => ({
  color: $isLiked ? theme.colors.danger : theme.colors.textMuted,
}));

const RecommendationsScreenKeyboardAvoidingView = styled(KeyboardAvoidingView)({ flex: 1 });

const RecommendationsScreenRow = styled(FlexRow)({ flex: 1, minWidth: 0 });

const RecommendationsScreenContainer7 = styled(View)({
  flex: 1,
  minWidth: 0,
  rowGap: 3,
  columnGap: 3,
});

const RecommendationsScreenHeading = styled(Heading)({ fontSize: 20 });

const RecommendationsScreenText2 = styled(Text)({
  color: theme.colors.text,
  fontSize: 22,
  lineHeight: 24,
});

const RecommendationsScreenUrlPanel = styled(UrlPanel)({ rowGap: 12, columnGap: 12 });

const RecommendationsScreenText3 = styled(Text)({
  color: 'white',
  fontSize: 12,
  fontWeight: '600',
});

const RecommendationsScreenContainer8 = styled(View)({ flex: 1 });

const RecommendationsScreenInput = styled(Input, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $metadataState: MetadataState }>(({ $metadataState }) => ({
  minHeight: 48,
  borderTopColor: $metadataState === 'error' ? theme.colors.danger : '#b9cdfc',
  borderRightColor: $metadataState === 'error' ? theme.colors.danger : '#b9cdfc',
  borderBottomColor: $metadataState === 'error' ? theme.colors.danger : '#b9cdfc',
  borderLeftColor: $metadataState === 'error' ? theme.colors.danger : '#b9cdfc',
}));

const RecommendationsScreenContainer9 = styled(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $width: number }>(({ $width }) => ({
  flexDirection: $width < 560 ? 'column' : 'row',
  alignItems: $width < 560 ? 'stretch' : 'center',
  rowGap: 14,
  columnGap: 14,
}));

const RecommendationsScreenPreviewImage = styled(PreviewImage, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $width: number }>(({ $width }) => ($width < 560 ? { width: '100%', height: 170 } : undefined));

const RecommendationsScreenContainer10 = styled(View)({
  flex: 1,
  minWidth: 0,
  rowGap: 5,
  columnGap: 5,
});

const RecommendationsScreenMeta = styled(Meta)({ color: theme.colors.primary, fontWeight: '500' });

const RecommendationsScreenCopy = styled(Copy)({ fontWeight: '600' });

const RecommendationsScreenContainer11 = styled(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $metadataState: MetadataState }>(({ $metadataState }) => ({
  width: 7,
  height: 7,
  borderTopLeftRadius: 4,
  borderTopRightRadius: 4,
  borderBottomRightRadius: 4,
  borderBottomLeftRadius: 4,
  backgroundColor: $metadataState === 'success' ? theme.colors.success : theme.colors.warning,
}));

const RecommendationsScreenContainer12 = styled(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $width: number }>(({ $width }) => ({
  flexDirection: $width < 560 ? 'column' : 'row',
  alignItems: 'stretch',
  rowGap: 12,
  columnGap: 12,
}));

const RecommendationsScreenField = styled(Field)({ flex: 1, rowGap: 7, columnGap: 7 });

const RecommendationsScreenText4 = styled(Text)({ color: theme.colors.danger, fontSize: 12 });

const RecommendationsScreenField2 = styled(Field)({ rowGap: 7, columnGap: 7 });

const RecommendationsScreenInput2 = styled(Input)({ minHeight: 96, textAlignVertical: 'top' });

const RecommendationsScreenContainer13 = styled(View)({
  flexDirection: 'row',
  justifyContent: 'flex-end',
  rowGap: 10,
  columnGap: 10,
});

const RecommendationsScreenContainer14 = styled(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $width: number }>(({ $width }) => ($width < 560 ? { flex: 1 } : undefined));

const RecommendationsScreenContainer15 = styled(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $width: number }>(({ $width }) => ($width < 560 ? { flex: 1.4 } : undefined));

const RecommendationsScreenContainer16 = styled(View)({ rowGap: 16, columnGap: 16 });

const RecommendationsScreenRecommendation = styled(Recommendation)([
  { rowGap: 14, columnGap: 14, overflow: 'hidden' },
  { width: '100%' },
]);

const RecommendationsScreenModalScrollContentStyle = ({ $width }: { $width: number }) =>
  nativeCss({ padding: $width < 640 ? 16 : 24, gap: 18 });
