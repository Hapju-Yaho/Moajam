import { SongPdfLibrary } from '../SongPdfLibrary';
import type { ScreenProps } from '../../navigation';
import { View, useWindowDimensions } from 'react-native';
import { ReferenceVideo } from '../ReferenceVideo';
import { useMockAppState, useWorkspaceValue } from '../../state/MockAppState';
import type { WorkspaceSong } from '../../mocks/workspaces';
import { PracticeStudio } from '../PracticeStudio';
import { ActionButton, Copy, PageHeading, Meta, Surface, FlexRow } from '../ProductUI';
import type { Arrangement } from './SongOverview';
export function SongPractice({
  song,
  feedback,
  navigate,
}: {
  song: WorkspaceSong;
  feedback?: boolean;
  navigate?: ScreenProps['navigate'];
}) {
  const { width } = useWindowDimensions();
  const { workspaceId, canManage, updateSong } = useMockAppState();
  const [arrangement] = useWorkspaceValue<Arrangement>(`song/${song.id}/arrangement`, {
    key: '',
    bpm: '',
    structure: '',
  });
  return (
    <>
      <Surface>
        {song.archived && (
          <>
            <Meta>보관 중인 곡이에요. 기존 자료로 개인 연습을 이어갈 수 있어요.</Meta>
            {canManage && (
              <ActionButton secondary onPress={() => updateSong(song.id, { archived: false })}>
                밴드 연습 재개
              </ActionButton>
            )}
          </>
        )}
        <View
          style={{
            flexDirection: width >= 1100 ? 'row' : 'column',
            alignItems: width >= 1100 ? 'center' : 'stretch',
            gap: 28,
          }}
        >
          <View style={{ flex: 1, gap: 12, justifyContent: 'center' }}>
            <Meta style={{ color: '#527b60', fontWeight: '600', letterSpacing: 1 }}>
              NOW PRACTICING
            </Meta>
            <PageHeading style={{ fontSize: 28 }}>{song.title}</PageHeading>
            <Copy style={{ color: '#75847b' }}>{song.artist}</Copy>
            <FlexRow wrap>
              <SongPdfLibrary songId={song.id} title={song.title} />
              {navigate && (
                <ActionButton
                  secondary
                  compact
                  onPress={() =>
                    navigate('band-score-editor', {
                      id: song.id,
                      workspaceId,
                      scoreView: 'expanded',
                    })
                  }
                >
                  악보 편집
                </ActionButton>
              )}
            </FlexRow>
          </View>
          {song.referenceUrl && (
            <View style={{ width: width >= 1100 ? '48%' : '100%', maxWidth: 500 }}>
              <ReferenceVideo
                title={song.title}
                referenceUrl={song.referenceUrl}
                thumbnailUrl={song.thumbnailUrl}
              />
            </View>
          )}
        </View>
      </Surface>
      <PracticeStudio
        feedback={feedback}
        key={`${workspaceId}/${song.id}`}
        scopeKey={`${workspaceId}/${song.id}`}
        bpm={Number(arrangement.bpm) || 120}
      />
    </>
  );
}
