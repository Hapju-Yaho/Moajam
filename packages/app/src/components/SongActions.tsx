import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { ActionButton, FlexRow, Heading, Meta, Surface } from './ProductUI';
import { Input } from '../styles/layout';
import { useMockAppState } from '../state/MockAppState';
import { parseVideoUrl } from '../lib/video';
import type { RecommendationItem } from '../mocks/data';
export function SongActions({
  song,
  recommendation = false,
  onDeleted,
}: {
  song: RecommendationItem;
  recommendation?: boolean;
  onDeleted?: () => void;
}) {
  const { canManage, currentUserId, updateSong, deleteSong, deleteRecommendation } =
    useMockAppState();
  const [mode, setMode] = useState<'edit' | 'delete' | null>(null);
  const [draft, setDraft] = useState({ title: '', artist: '', reason: '', referenceUrl: '' });
  const [error, setError] = useState('');
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
        onRequestClose={() => setMode(null)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
            backgroundColor: '#0f172a80',
          }}
        >
          <Pressable
            accessibilityLabel="닫기"
            onPress={() => setMode(null)}
            style={{ position: 'absolute', inset: 0 }}
          />
          <Surface style={{ width: '100%', maxWidth: 520 }}>
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
                  <FlexRow key={key}>
                    <Meta style={{ width: 96 }}>{label}</Meta>
                    <Input
                      style={{ flex: 1, minWidth: 0 }}
                      accessibilityLabel={label}
                      value={draft[key]}
                      onChangeText={(value) => setDraft((old) => ({ ...old, [key]: value }))}
                    />
                  </FlexRow>
                ))}
                {!!error && <Meta>{error}</Meta>}
              </>
            )}
            <FlexRow>
              <ActionButton secondary onPress={() => setMode(null)}>
                취소
              </ActionButton>
              <ActionButton
                danger={mode === 'delete'}
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
                  }
                  setMode(null);
                }}
              >
                {mode === 'delete' ? '삭제' : '저장'}
              </ActionButton>
            </FlexRow>
          </Surface>
        </View>
      </Modal>
    </View>
  );
}
