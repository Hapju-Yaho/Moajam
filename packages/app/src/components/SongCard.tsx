import styled from '@emotion/native';
import { Muted, Row, theme } from '@moajam/ui';
import type { AppRoute } from '../navigation';
import { Artwork, ArtworkText } from '../styles/layout';
import { View } from 'react-native';

const Surface = styled.Pressable`
  padding: 14px;
  gap: 13px;
  flex-direction: row;
  align-items: center;
  border: 1px solid ${theme.colors.border};
  border-radius: 14px;
  background-color: white;
`;

const Title = styled.Text`
  color: ${theme.colors.text};
  font-size: 15px;
  font-weight: 500;
`;

const Stat = styled.Text`
  color: ${theme.colors.textMuted};
  font-size: 12px;
  font-weight: 500;
`;

interface SongCardProps {
  title: string;
  artist: string;
  tint: string;
  stats?: { likes: number; votes: number; comments: number };
  navigate: (route: AppRoute) => void;
  destination?: AppRoute;
}

export function SongCard({
  title,
  artist,
  tint,
  stats,
  navigate,
  destination = 'song',
}: SongCardProps) {
  return (
    <Surface onPress={() => navigate(destination)}>
      <Artwork tint={tint}>
        <ArtworkText>♪</ArtworkText>
      </Artwork>
      <View style={{ flex: 1, gap: 3 }}>
        <Title>{title}</Title>
        <Muted>{artist}</Muted>
        {stats && (
          <Row gap={12} style={{ marginTop: 5 }}>
            <Stat>♥ {stats.likes}</Stat>
            <Stat>🎸 {stats.votes}</Stat>
            <Stat>▢ {stats.comments}</Stat>
          </Row>
        )}
      </View>
      <Stat>›</Stat>
    </Surface>
  );
}
