import { AppShell } from '../components/AppShell';
import { ActionButton, FlexRow, Meta, PageHeading, Surface } from '../components/ProductUI';
import { PracticeStudio } from '../components/PracticeStudio';
import { useMockAppState, useWorkspaceValue } from '../state/MockAppState';
import type { ScreenProps } from '../navigation';
import { MusicToolsScreen } from './MusicToolsScreen';

export function TrackEditorScreen({ navigate, entityId }: ScreenProps) {
  const { adoptedSongs, workspaceId, workspace } = useMockAppState();
  const song = adoptedSongs.find((item) => item.id === entityId);
  const [arrangement] = useWorkspaceValue(`song/${entityId}/arrangement`, { bpm: '' });
  if (!entityId) return <MusicToolsScreen navigate={navigate} mode="tracks" />;
  return (
    <AppShell activeRoute="track-editor" onNavigate={navigate} entityId={entityId}>
      {song ? (
        <>
          <Meta>
            합주 도구 · {workspace?.name} / {song.title}
          </Meta>
          <PageHeading>사운드 트랙 편집</PageHeading>
          <FlexRow wrap>
            <ActionButton
              secondary
              onPress={() => navigate('song', { id: song.id, workspaceId, songTab: 'tracks' })}
            >
              ← 곡 상세로 돌아가기
            </ActionButton>
            <ActionButton secondary onPress={() => navigate('track-editor')}>
              다른 곡 선택
            </ActionButton>
            <ActionButton secondary onPress={() => navigate('instrument')}>
              악기 추출
            </ActionButton>
          </FlexRow>
          <PracticeStudio
            key={`${workspaceId}/${song.id}`}
            scopeKey={`${workspaceId}/${song.id}`}
            bpm={Number(arrangement.bpm) || 120}
          />
        </>
      ) : (
        <Surface>
          <Meta>곡을 찾을 수 없거나 접근 권한이 없어요.</Meta>
          <ActionButton onPress={() => navigate('track-editor')}>곡 다시 선택</ActionButton>
        </Surface>
      )}
    </AppShell>
  );
}
