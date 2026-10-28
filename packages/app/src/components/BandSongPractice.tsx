import type { ComponentProps } from 'react';
import type { ScreenProps } from '../navigation';
import { PracticeStudio } from './PracticeStudio';
import { SongPdfLibrary } from './SongPdfLibrary';
import { SongLyrics } from './SongLyrics';
import { ActionButton, FlexRow } from './ProductUI';

export type BandSongPracticeProps = {
  songId: string;
  title: string;
  workspaceId: string;
  navigate: ScreenProps['navigate'];
  initialView: 'pdf' | 'recording';
  assetId?: string;
  studioProps: ComponentProps<typeof PracticeStudio>;
};
export function BandSongPractice({
  songId,
  title,
  workspaceId,
  navigate,
  assetId,
  studioProps,
}: BandSongPracticeProps) {
  return (
    <>
      <FlexRow wrap>
        <SongPdfLibrary songId={songId} title={title} assetId={assetId} />
        <ActionButton
          secondary
          compact
          onPress={() => navigate('band-score-editor', { id: songId, workspaceId })}
        >
          악보 프로젝트
        </ActionButton>
        <SongLyrics songId={songId} title={title} />
      </FlexRow>
      <PracticeStudio {...studioProps} />
    </>
  );
}
