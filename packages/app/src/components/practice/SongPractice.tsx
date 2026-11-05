import styledNative from '@emotion/native';
import { SongPdfLibrary } from '@component/shared/media/SongPdfLibrary';
import type { ScreenProps } from '@app/navigation';
import { View, useWindowDimensions } from 'react-native';
import { ReferenceVideo } from '@component/shared/media/ReferenceVideo';
import { useMockAppState, useWorkspaceValue } from '@state/MockAppState';
import type { WorkspaceSong } from '@mocks/workspaces';
import { PracticeStudio } from './PracticeStudio';
import { SongAudioPlayer } from '@component/shared/media/SongAudioPlayer';
import {
  ActionButton,
  Copy,
  PageHeading,
  Meta,
  Surface,
  FlexRow,
} from '@component/shared/ui/ProductUI';
import type { Arrangement } from '@component/song-detail/SongOverview';
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
        <SongPracticeContainer $width={width}>
          <SongPracticeContainer2>
            <SongPracticeMeta>NOW PRACTICING</SongPracticeMeta>
            <SongPracticePageHeading>{song.title}</SongPracticePageHeading>
            <SongPracticeCopy>{song.artist}</SongPracticeCopy>
            <SongAudioPlayer songId={song.id} />
            <FlexRow nativeID="practice-score-actions" wrap>
              <SongPdfLibrary songId={song.id} title={song.title} />
              {navigate && (
                <ActionButton
                  nativeID="practice-score-edit"
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
          </SongPracticeContainer2>
          {song.referenceUrl && (
            <SongPracticeContainer3 $width={width}>
              <ReferenceVideo
                title={song.title}
                referenceUrl={song.referenceUrl}
                thumbnailUrl={song.thumbnailUrl}
              />
            </SongPracticeContainer3>
          )}
        </SongPracticeContainer>
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

const SongPracticeContainer = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $width: number }>(({ $width }) => ({
  flexDirection: $width >= 1100 ? 'row' : 'column',
  alignItems: $width >= 1100 ? 'center' : 'stretch',
  rowGap: 28,
  columnGap: 28,
}));

const SongPracticeContainer2 = styledNative(View)({
  flex: 1,
  rowGap: 12,
  columnGap: 12,
  justifyContent: 'center',
});

const SongPracticeMeta = styledNative(Meta)({
  color: '#527b60',
  fontWeight: '600',
  letterSpacing: 1,
});

const SongPracticePageHeading = styledNative(PageHeading)({ fontSize: 28 });

const SongPracticeCopy = styledNative(Copy)({ color: '#75847b' });

const SongPracticeContainer3 = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $width: number }>(({ $width }) => ({ width: $width >= 1100 ? '48%' : '100%', maxWidth: 500 }));
