import { Muted } from '@moajam/ui';
import { useWindowDimensions, View } from 'react-native';
import { adoptedSongs } from '../../mocks/data';
import type { AppRoute } from '../../navigation';
import { ArtworkImage, Between, LinkText, SectionTitle } from '../../styles/layout';
import { HomeCard, PracticeButton, PracticeButtonText, SongName, SongRow } from '../../styles/home';
import { AppIcon } from '../icons';

const homeSongs = [adoptedSongs[1], adoptedSongs[0], adoptedSongs[2]];
export function ReadySongsCard({ navigate }: { navigate: (route: AppRoute) => void }) {
  const { width } = useWindowDimensions();

  return (
    <HomeCard>
      <Between>
        <SectionTitle>연습할 곡</SectionTitle>
        <LinkText onPress={() => navigate('songs')}>전체 보기 →</LinkText>
      </Between>
      <View>
        {homeSongs.map((song) => (
          <SongRow key={song.id} onPress={() => navigate('song')}>
            <ArtworkImage
              source={song.thumbnailUrl ? { uri: song.thumbnailUrl } : undefined}
              resizeMode="cover"
              style={{ width: 48, height: 48 }}
            />
            <View style={{ flex: 1, gap: 3 }}>
              <SongName numberOfLines={1}>{song.title}</SongName>
              <Muted>{song.artist}</Muted>
            </View>
            {width >= 700 ? (
              <PracticeButton
                onPress={(event) => {
                  event.stopPropagation();
                  navigate('practice');
                }}
              >
                <PracticeButtonText>연습하기</PracticeButtonText>
              </PracticeButton>
            ) : (
              <AppIcon name="chevron-right" color="#66738a" size={18} />
            )}
          </SongRow>
        ))}
      </View>
    </HomeCard>
  );
}
