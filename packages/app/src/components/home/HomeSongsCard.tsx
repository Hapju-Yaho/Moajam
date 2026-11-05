import { withPressFeedback } from '@component/shared/ui/withPressFeedback';
import styledNative from '@emotion/native';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import type { HomeSong } from './home.types';
import {
  ActionButton,
  Copy,
  FlexBetween,
  Heading,
  Meta,
  SongCover,
  Surface,
} from '@component/shared/ui/ProductUI';
import { AppIcon } from '@component/shared/icons';

export function HomeSongsCard({
  songs,
  onOpenSong,
  onViewAll,
  title = '연습할 곡',
  emptyMessage = '아직 채택된 곡이 없어요. 밴드에서 연주할 곡을 함께 골라보세요.',
  coverSize = 40,
  style,
}: {
  songs: HomeSong[];
  onOpenSong: (song: HomeSong) => void;
  onViewAll: () => void;
  title?: string;
  emptyMessage?: string;
  coverSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Surface nativeID="tour-home-songs" style={style}>
      <HomeSongsCardHeader>
        <Heading>{title}</Heading>
        <ActionButton secondary compact onPress={onViewAll}>
          전체 보기 →
        </ActionButton>
      </HomeSongsCardHeader>
      <View>
        {songs.map((song) => (
          <HomeSongsCardButton
            key={`${song.workspaceId}/${song.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${song.bandName ? song.bandName + ' ' : ''}${song.title} 상세 보기`}
            onPress={() => onOpenSong(song)}
          >
            <SongCover
              id={song.id}
              thumbnailUrl={song.thumbnailUrl}
              referenceUrl={song.referenceUrl}
              size={coverSize}
            />
            <HomeSongsCardContainer>
              <HomeSongsCardCopy>{song.title}</HomeSongsCardCopy>
              <Meta>
                {song.bandName && (
                  <>
                    <HomeSongsCardMeta $songBandColor={song.bandColor}>
                      {song.bandName}
                    </HomeSongsCardMeta>{' '}
                    ·{' '}
                  </>
                )}
                {song.artist}
              </Meta>
              <>{song.myPart !== undefined && <Meta>내 파트 {song.myPart}</Meta>}</>
            </HomeSongsCardContainer>
            <AppIcon name="chevron-right" size={16} color="#72819a" />
          </HomeSongsCardButton>
        ))}
        {!songs.length && <Meta>{emptyMessage}</Meta>}
      </View>
    </Surface>
  );
}

const HomeSongsCardHeader = styledNative(FlexBetween)({ minHeight: 34 });

const HomeSongsCardContainer = styledNative(View)({
  flex: 1,
  minWidth: 0,
  rowGap: 2,
  columnGap: 2,
});

const HomeSongsCardCopy = styledNative(Copy)({ fontWeight: '600' });

const HomeSongsCardMeta = styledNative(Meta, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $songBandColor: string | undefined }>(({ $songBandColor }) => ({ color: $songBandColor }));

const HomeSongsCardButton = withPressFeedback(
  styledNative(Pressable, {
    shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
  })<{ $pressed: boolean }>(({ $pressed }) => ({
    flexDirection: 'row',
    alignItems: 'center',
    rowGap: 8,
    columnGap: 8,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: '#edf1f6',
    opacity: $pressed ? 0.7 : 1,
  })),
);
