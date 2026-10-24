import { Muted } from '@moajam/ui';
import { View } from 'react-native';
import { adoptedSongs } from '../../mocks/data';
import type { ScreenProps } from '../../navigation';
import { ArtworkImage, Between, LinkText, SectionTitle } from '../../styles/layout';
import { HomeCard, SongName, SongRow } from '../../styles/home';
import { AppIcon } from '../icons';

const homeSongs = [adoptedSongs[1], adoptedSongs[0], adoptedSongs[2]];
export function ReadySongsCard({ navigate }: { navigate: ScreenProps['navigate'] }) {
  return (
    <HomeCard>
      <Between>
        <SectionTitle>연습할 곡</SectionTitle>
        <LinkText onPress={() => navigate('songs')}>전체 보기 →</LinkText>
      </Between>
      <View>
        {homeSongs.map((song) => (
          <SongRow key={song.id} onPress={() => navigate('song', { id: song.id })}>
            <ArtworkImage
              source={song.thumbnailUrl ? { uri: song.thumbnailUrl } : undefined}
              resizeMode="cover"
              style={{ width: 48, height: 48 }}
            />
            <View style={{ flex: 1, gap: 3 }}>
              <SongName numberOfLines={1}>{song.title}</SongName>
              <Muted>{song.artist}</Muted>
            </View>
            <AppIcon name="chevron-right" color="#66738a" size={18} />
          </SongRow>
        ))}
      </View>
    </HomeCard>
  );
}
