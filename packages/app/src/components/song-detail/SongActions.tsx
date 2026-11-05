import styledNative from '@emotion/native';
import { useState } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { ActionButton, FlexRow, Heading, Meta, Surface } from '@component/shared/ui/ProductUI';
import { Input } from '@styles/layout';
import { useMockAppState, useWorkspaceValue } from '@state/MockAppState';
import { SongAudioField } from '@component/shared/media/SongAudioField';
import type { SongAudio } from '@lib/songAudio';
import { parseVideoUrl } from '@lib/video';
import type { RecommendationItem } from '@mocks/data';
export function SongActions({
  song,
  recommendation = false,
  onDeleted,
}: {
  song: RecommendationItem;
  recommendation?: boolean;
  onDeleted?: () => void;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 480;
  const { canManage, currentUserId, updateSong, deleteSong, deleteRecommendation } =
    useMockAppState();
  const [mode, setMode] = useState<'edit' | 'delete' | null>(null);
  const [draft, setDraft] = useState({ title: '', artist: '', reason: '', referenceUrl: '' });
  const [error, setError] = useState('');
  const [songAudio, setSongAudio] = useWorkspaceValue<SongAudio | null>(
    `song/${song.id}/audio`,
    null,
  );
  const [draftAudio, setDraftAudio] = useState<SongAudio | null>(null);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  if (!canManage && (!recommendation || song.authorId !== currentUserId)) return null;
  return (
    <View>
      <FlexRow>
        {!recommendation && (
          <ActionButton
            secondary
            compact
            onPress={() => {
              setDraft({
                title: song.title,
                artist: song.artist,
                reason: song.reason,
                referenceUrl: song.referenceUrl ?? '',
              });
              setError('');
              setDraftAudio(songAudio);
              setMode('edit');
            }}
          >
            곡 정보 수정
          </ActionButton>
        )}
        <ActionButton
          secondary
          compact
          danger
          onPress={() => {
            setMode('delete');
          }}
        >
          {recommendation ? '추천 곡 삭제' : '참여 곡 삭제'}
        </ActionButton>
      </FlexRow>
      <Modal
        visible={mode !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!uploadingAudio) setMode(null);
        }}
      >
        <SongActionsContainer>
          <SongActionsButton
            accessibilityLabel="닫기"
            onPress={() => {
              if (!uploadingAudio) setMode(null);
            }}
          />
          <SongActionsPanel scrollable>
            <Heading>{mode === 'edit' ? '곡 정보 수정' : '곡을 삭제할까요?'}</Heading>
            {mode === 'delete' ? (
              <Meta>
                {song.title}을(를) {recommendation ? '추천 곡' : '참여 곡'} 목록에서 삭제합니다.
              </Meta>
            ) : (
              <>
                {(
                  [
                    ['title', '곡 제목'],
                    ['artist', '아티스트'],
                    ['reason', '추천이유'],
                    ['referenceUrl', '레퍼런스 링크'],
                  ] as const
                ).map(([key, label]) => (
                  <SongActionsRow key={key} $compact={compact}>
                    <SongActionsMeta>{label}</SongActionsMeta>
                    <SongActionsInput
                      $compact={compact}
                      accessibilityLabel={label}
                      value={draft[key]}
                      onChangeText={(value) => setDraft((old) => ({ ...old, [key]: value }))}
                    />
                  </SongActionsRow>
                ))}
                {!!error && <Meta>{error}</Meta>}
                <SongActionsRow2 $compact={compact}>
                  <SongActionsMeta>곡 음원</SongActionsMeta>
                  <SongActionsContainer2 $compact={compact}>
                    <SongAudioField
                      songId={song.id}
                      value={draftAudio}
                      onChange={setDraftAudio}
                      onBusy={setUploadingAudio}
                    />
                  </SongActionsContainer2>
                </SongActionsRow2>
              </>
            )}
            <FlexRow>
              <ActionButton secondary disabled={uploadingAudio} onPress={() => setMode(null)}>
                취소
              </ActionButton>
              <ActionButton
                danger={mode === 'delete'}
                disabled={uploadingAudio}
                onPress={() => {
                  if (mode === 'delete') {
                    if (recommendation) deleteRecommendation(song.id);
                    else deleteSong(song.id);
                    onDeleted?.();
                  } else {
                    const video = parseVideoUrl(draft.referenceUrl);
                    if (
                      !draft.title.trim() ||
                      !draft.artist.trim() ||
                      (draft.referenceUrl.trim() && !video)
                    ) {
                      setError('곡 제목, 아티스트와 레퍼런스 링크 형식을 확인해주세요.');
                      return;
                    }
                    updateSong(song.id, {
                      title: draft.title.trim(),
                      artist: draft.artist.trim(),
                      reason: draft.reason.trim(),
                      referenceUrl: video?.url ?? '',
                      ...(draft.referenceUrl !== (song.referenceUrl ?? '')
                        ? { thumbnailUrl: video?.thumbnail }
                        : {}),
                    });
                    setSongAudio(draftAudio);
                  }
                  setMode(null);
                }}
              >
                {mode === 'delete' ? '삭제' : '저장'}
              </ActionButton>
            </FlexRow>
          </SongActionsPanel>
        </SongActionsContainer>
      </Modal>
    </View>
  );
}

const SongActionsContainer = styledNative(View)({
  flex: 1,
  justifyContent: 'center',
  alignItems: 'center',
  paddingTop: 20,
  paddingRight: 20,
  paddingBottom: 20,
  paddingLeft: 20,
  backgroundColor: '#0f172a80',
});

const SongActionsButton = styledNative(Pressable)({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

const SongActionsPanel = styledNative(Surface)({ width: '100%', maxWidth: 520 });

const SongActionsRow = styledNative(FlexRow, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $compact: boolean }>(({ $compact }) =>
  $compact
    ? { flexDirection: 'column', alignItems: 'stretch', rowGap: 6, columnGap: 6 }
    : undefined,
);

const SongActionsMeta = styledNative(Meta)({ width: 96 });

const SongActionsInput = styledNative(Input, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $compact: boolean }>(({ $compact }) => ({ flex: $compact ? undefined : 1, minWidth: 0 }));

const SongActionsRow2 = styledNative(FlexRow, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $compact: boolean }>(({ $compact }) =>
  $compact
    ? { flexDirection: 'column', alignItems: 'stretch', rowGap: 6, columnGap: 6 }
    : undefined,
);

const SongActionsContainer2 = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $compact: boolean }>(({ $compact }) => ({ flex: $compact ? undefined : 1, minWidth: 0 }));
