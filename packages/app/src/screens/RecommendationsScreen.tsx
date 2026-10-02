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
import { AppShell } from '../components/AppShell';
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
} from '../components/ProductUI';
import { AppIcon } from '../components/icons';
import { fetchYouTubeMetadata, parseYouTubeUrl } from '../lib/youtube';
import type { ScreenProps } from '../navigation';
import { useMockAppState } from '../state/MockAppState';
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
} from '../styles/layout';

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
    addRecommendation,
    isAdopted,
    selectRecommendation,
    workspace,
    toggleReaction,
  } = useMockAppState();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'최신순' | '인기순'>('최신순');
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
        .filter((song) =>
          `${song.title} ${song.artist}`.toLowerCase().includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          filter === '인기순'
            ? b.likes - a.likes
            : Date.parse(b.recommendedAt) - Date.parse(a.recommendedAt),
        ),
    [filter, query, songs],
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
      </Inline>
      <View style={{ gap: 14 }}>
        <Between>
          <SectionTitle>추천곡 {filtered.length}</SectionTitle>
          <Muted>최근 댓글까지 카드에서 바로 확인하세요</Muted>
        </Between>
        {filtered.length === 0 ? (
          <View style={{ padding: 24, gap: 8 }}>
            <Body>{songs.length ? '검색한 곡이 없어요.' : '아직 추천한 곡이 없어요.'}</Body>
            <Muted>
              {songs.length
                ? '다른 곡명이나 아티스트로 검색해보세요.'
                : '곡 추천하기로 첫 후보를 등록해보세요.'}
            </Muted>
          </View>
        ) : null}
        <View style={{ flexDirection: width < 900 ? 'column' : 'row', flexWrap: 'wrap', gap: 16 }}>
          {filtered.map((song) => {
            const isLiked = song.likedByMe ?? false;
            return (
              <View key={song.id} style={{ width: width < 900 ? '100%' : '48.8%', gap: 6 }}>
                <Recommendation
                  onPress={() => {
                    selectRecommendation(song.id);
                    navigate('recommendation', { id: song.id });
                  }}
                  style={[{ gap: 14, overflow: 'hidden' }, { width: '100%' }]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    {song.thumbnailUrl ? (
                      <ArtworkImage source={{ uri: song.thumbnailUrl }} resizeMode="cover" />
                    ) : (
                      <Artwork tint={song.tint}>
                        <ArtworkText>♪</ArtworkText>
                      </Artwork>
                    )}
                    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                      <FlexBetween>
                        <Body style={{ flex: 1, fontWeight: '500' }}>{song.title}</Body>
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
                    </View>
                  </View>
                  <LatestComment style={{ gap: 3 }}>
                    <Label>{song.deferred ? '보류된 추천' : '최근 의견'}</Label>
                    <Muted numberOfLines={2}>
                      {song.deferred
                        ? song.deferredReason || '다음 선곡 때 다시 논의해요.'
                        : ((
                            workspace?.documents?.[`recommendation/${song.id}/comments`] as
                              { text: string }[] | undefined
                          )?.at(0)?.text ?? '첫 의견을 남겨보세요.')}
                    </Muted>
                  </LatestComment>
                  <Between>
                    <Row gap={12}>
                      <Text
                        onPress={(event) => {
                          event.stopPropagation();
                          toggleReaction(song.id, 'like');
                        }}
                        style={{ color: isLiked ? theme.colors.danger : theme.colors.textMuted }}
                      >
                        ♥ {song.likes}
                      </Text>
                      <Muted>🎸 {song.votes}</Muted>
                      <Muted>▢ {song.comments}</Muted>
                    </Row>
                    <Muted>댓글 {song.comments}개 →</Muted>
                  </Between>
                </Recommendation>
              </View>
            );
          })}
        </View>
      </View>
      <Modal visible={isFormOpen} transparent animationType="fade" onRequestClose={closeForm}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ModalBackdrop>
            <DismissLayer accessibilityLabel="추천곡 등록 닫기" onPress={closeForm} />
            <ModalCard>
              <ModalHeader>
                <FlexBetween>
                  <FlexRow gap={12} style={{ flex: 1, minWidth: 0 }}>
                    <SoftIcon size={42}>
                      <AppIcon name="sparkles" color={theme.colors.primary} size={20} />
                    </SoftIcon>
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <Heading style={{ fontSize: 20 }}>새로운 곡 추천</Heading>
                      <Meta>링크를 입력하면 곡 정보를 자동으로 불러옵니다.</Meta>
                    </View>
                  </FlexRow>
                  <CloseButton accessibilityLabel="닫기" onPress={closeForm}>
                    <Text style={{ color: theme.colors.text, fontSize: 22, lineHeight: 24 }}>
                      ×
                    </Text>
                  </CloseButton>
                </FlexBetween>
              </ModalHeader>
              <ModalScroll
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: width < 640 ? 16 : 24, gap: 18 }}
              >
                <UrlPanel style={{ gap: 12 }}>
                  <FlexRow gap={9}>
                    <StepBadge>
                      <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>1</Text>
                    </StepBadge>
                    <View style={{ flex: 1 }}>
                      <Label>YouTube 링크 붙여넣기</Label>
                      <Meta>일반 영상, Shorts, YouTube Music 링크를 지원해요.</Meta>
                    </View>
                  </FlexRow>
                  <Input
                    value={referenceUrl}
                    onChangeText={setReferenceUrl}
                    placeholder="https://youtube.com/watch?v=..."
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    style={{
                      minHeight: 48,
                      borderColor: metadataState === 'error' ? theme.colors.danger : '#b9cdfc',
                    }}
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
                </UrlPanel>

                {thumbnailUrl ? (
                  <PreviewCard>
                    <View
                      style={{
                        flexDirection: width < 560 ? 'column' : 'row',
                        alignItems: width < 560 ? 'stretch' : 'center',
                        gap: 14,
                      }}
                    >
                      <PreviewImage
                        source={{ uri: thumbnailUrl }}
                        resizeMode="cover"
                        style={width < 560 ? { width: '100%', height: 170 } : undefined}
                      />
                      <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                        <Meta style={{ color: theme.colors.primary, fontWeight: '500' }}>
                          불러온 영상
                        </Meta>
                        <Copy numberOfLines={2} style={{ fontWeight: '600' }}>
                          {title || '곡 제목을 불러오는 중이에요'}
                        </Copy>
                        <Meta numberOfLines={1}>{artist || '아티스트 확인 중'}</Meta>
                        <FlexRow gap={6}>
                          <View
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: 4,
                              backgroundColor:
                                metadataState === 'success'
                                  ? theme.colors.success
                                  : theme.colors.warning,
                            }}
                          />
                          <Meta>
                            {metadataState === 'success' ? '영상 정보 확인 완료' : '정보 확인 중'}
                          </Meta>
                        </FlexRow>
                      </View>
                    </View>
                  </PreviewCard>
                ) : null}

                <View style={{ gap: 14 }}>
                  <FlexRow gap={9}>
                    <StepBadge>
                      <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>2</Text>
                    </StepBadge>
                    <View>
                      <Label>곡 정보 확인</Label>
                      <Meta>자동으로 채워진 정보는 직접 수정할 수 있어요.</Meta>
                    </View>
                  </FlexRow>
                  <View
                    style={{
                      flexDirection: width < 560 ? 'column' : 'row',
                      alignItems: 'stretch',
                      gap: 12,
                    }}
                  >
                    <Field style={{ flex: 1, gap: 7 }}>
                      <FlexRow gap={5}>
                        <Label>곡 제목</Label>
                        <Text style={{ color: theme.colors.danger, fontSize: 12 }}>*</Text>
                      </FlexRow>
                      <Input value={title} onChangeText={setTitle} placeholder="곡 제목" />
                    </Field>
                    <Field style={{ flex: 1, gap: 7 }}>
                      <FlexRow gap={5}>
                        <Label>아티스트</Label>
                        <Text style={{ color: theme.colors.danger, fontSize: 12 }}>*</Text>
                      </FlexRow>
                      <Input
                        value={artist}
                        onChangeText={setArtist}
                        placeholder="가수 또는 아티스트"
                      />
                    </Field>
                  </View>
                  <Field style={{ gap: 7 }}>
                    <FlexBetween>
                      <Label>추천 이유</Label>
                      <Meta>{reason.length} / 200</Meta>
                    </FlexBetween>
                    <Input
                      value={reason}
                      onChangeText={(value) => setReason(value.slice(0, 200))}
                      placeholder="이 곡을 함께 연주하고 싶은 이유를 적어주세요."
                      multiline
                      numberOfLines={3}
                      style={{ minHeight: 96, textAlignVertical: 'top' }}
                    />
                  </Field>
                </View>
              </ModalScroll>
              <ModalFooter>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'flex-end',
                    gap: 10,
                  }}
                >
                  <View style={width < 560 ? { flex: 1 } : undefined}>
                    <ActionButton secondary onPress={closeForm}>
                      취소
                    </ActionButton>
                  </View>
                  <View style={width < 560 ? { flex: 1.4 } : undefined}>
                    <ActionButton disabled={isSaveDisabled} onPress={saveRecommendation}>
                      추천곡 추가
                    </ActionButton>
                  </View>
                </View>
              </ModalFooter>
            </ModalCard>
          </ModalBackdrop>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
  return embedded ? (
    <View style={{ gap: 16 }}>{content}</View>
  ) : (
    <AppShell activeRoute="songs" onNavigate={navigate}>
      {content}
    </AppShell>
  );
}
