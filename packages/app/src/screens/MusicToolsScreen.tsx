import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppShell } from '../components/AppShell';
import {
  ActionButton,
  Copy,
  FlexBetween,
  FlexRow,
  Heading,
  Meta,
  PageHeading,
  Pill,
  PillText,
  Surface,
} from '../components/ProductUI';
import { Input } from '../styles/layout';
import { useMockAppState } from '../state/MockAppState';
import type { ScreenProps } from '../navigation';

export function MusicToolsScreen({
  navigate,
  mode = 'scores',
}: ScreenProps & { mode?: 'scores' | 'tracks' }) {
  const { workspaces } = useMockAppState();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const songs = workspaces.flatMap((band) =>
    band.adoptedSongs.map((song) => ({ ...song, workspaceId: band.id, bandName: band.name })),
  );
  const visible = songs.filter(
    (song) =>
      !song.archived &&
      (filter === 'all' || song.workspaceId === filter) &&
      `${song.title} ${song.artist} ${song.bandName}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <AppShell activeRoute={mode === 'scores' ? 'tools' : 'track-editor'} onNavigate={navigate}>
      <View style={{ gap: 8 }}>
        <Meta>합주 도구</Meta>
        <PageHeading>{mode === 'scores' ? '악보 편집' : '사운드 트랙 편집'}</PageHeading>
        <Copy>작업할 곡을 선택하세요. 저장한 결과는 곡 상세에서 함께 볼 수 있어요.</Copy>
      </View>
      <FlexRow wrap>
        <Pill active={mode === 'scores'} onPress={() => navigate('tools')}>
          <PillText active={mode === 'scores'}>악보 편집</PillText>
        </Pill>
        <Pill active={mode === 'tracks'} onPress={() => navigate('track-editor')}>
          <PillText active={mode === 'tracks'}>사운드 트랙 편집</PillText>
        </Pill>
      </FlexRow>
      {mode === 'scores' ? (
        <Surface>
          <FlexBetween>
            <Heading>내 작업</Heading>
            <ActionButton secondary onPress={() => navigate('score-editor')}>
              개인 악보 열기
            </ActionButton>
          </FlexBetween>
          <Meta>기존 개인 악보를 이어서 편집해요. 밴드로 가져오기 전까지 나만 볼 수 있어요.</Meta>
        </Surface>
      ) : (
        <Surface>
          <FlexBetween>
            <Heading>음원 준비</Heading>
            <ActionButton secondary onPress={() => navigate('instrument')}>
              악기 추출
            </ActionButton>
          </FlexBetween>
          <Meta>합주에 사용할 음원을 악기별로 분리하고 트랙 작업에 활용하세요.</Meta>
        </Surface>
      )}
      <Surface>
        <Heading>밴드 곡 선택</Heading>
        <Input
          accessibilityLabel="편집할 곡 검색"
          placeholder="곡, 아티스트, 밴드 검색"
          value={query}
          onChangeText={setQuery}
        />
        <FlexRow wrap>
          <Pill active={filter === 'all'} onPress={() => setFilter('all')}>
            <PillText active={filter === 'all'}>모든 밴드</PillText>
          </Pill>
          {workspaces.map((band) => (
            <Pill key={band.id} active={filter === band.id} onPress={() => setFilter(band.id)}>
              <PillText active={filter === band.id}>{band.name}</PillText>
            </Pill>
          ))}
        </FlexRow>
        {visible.map((song) => (
          <View
            key={`${song.workspaceId}/${song.id}`}
            style={{ gap: 8, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#e4eaf1' }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${song.bandName} ${song.title} 편집`}
              onPress={() =>
                navigate(mode === 'scores' ? 'band-score-editor' : 'track-editor', {
                  id: song.id,
                  workspaceId: song.workspaceId,
                })
              }
            >
              <Meta>{song.bandName}</Meta>
              <Heading>{song.title}</Heading>
              <Copy>{song.artist}</Copy>
            </Pressable>
            <FlexRow wrap>
              <ActionButton
                compact
                onPress={() =>
                  navigate(mode === 'scores' ? 'band-score-editor' : 'track-editor', {
                    id: song.id,
                    workspaceId: song.workspaceId,
                  })
                }
              >
                {mode === 'scores' ? '악보 편집' : '사운드 트랙 편집'}
              </ActionButton>
              {mode === 'scores' && (
                <ActionButton
                  secondary
                  compact
                  onPress={() =>
                    navigate('score-editor', { id: song.id, workspaceId: song.workspaceId })
                  }
                >
                  이 곡의 개인 악보
                </ActionButton>
              )}
              <ActionButton
                secondary
                compact
                onPress={() =>
                  navigate('song', {
                    id: song.id,
                    workspaceId: song.workspaceId,
                    songTab: mode === 'scores' ? 'scores' : 'tracks',
                  })
                }
              >
                곡 상세
              </ActionButton>
            </FlexRow>
          </View>
        ))}
        {!visible.length && (
          <Meta>
            {songs.length
              ? '검색 조건에 맞는 곡이 없어요.'
              : '밴드에서 곡을 채택하면 이곳에서 편집할 수 있어요.'}
          </Meta>
        )}
      </Surface>
    </AppShell>
  );
}
