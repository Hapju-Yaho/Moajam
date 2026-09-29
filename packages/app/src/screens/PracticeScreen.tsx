import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { AppShell } from '../components/AppShell';
import {
  ActionButton,
  Copy,
  FlexBetween,
  FlexRow,
  Heading,
  Meta,
  PageDescription,
  PageHeading,
  Pill,
  PillText,
  Surface,
} from '../components/ProductUI';
import { PracticeStudio } from '../components/PracticeStudio';
import { useMockAppState } from '../state/MockAppState';
import type { ScreenProps } from '../navigation';
import { ReferenceVideo } from '../components/ReferenceVideo';

export function PracticeScreen({
  navigate,
  entityId,
  fromBand = false,
}: ScreenProps & { fromBand?: boolean }) {
  const { allSongs, workspaceId, workspaces, adoptedSongs } = useMockAppState();
  const excludedSong = entityId ? adoptedSongs.find((item) => item.id === entityId) : undefined;
  const [filter, setFilter] = useState('all');
  const [choosing, setChoosing] = useState(false);
  const { width } = useWindowDimensions();
  const song = entityId
    ? allSongs.find((item) => item.workspaceId === workspaceId && item.id === entityId)
    : undefined;
  const visible = allSongs.filter((item) => filter === 'all' || item.workspaceId === filter);
  return (
    <AppShell activeRoute="personal-practice" onNavigate={navigate}>
      {!song && (
        <View style={{ gap: 5 }}>
          <PageHeading>연습실</PageHeading>
          <PageDescription>한 곡씩, 우리의 소리를 맞춰가요.</PageDescription>
        </View>
      )}
      {song && (
        <View
          style={{
            flexDirection: width >= 1100 ? 'row' : 'column',
            alignItems: width >= 1100 ? 'center' : 'stretch',
            gap: 28,
            paddingVertical: 8,
            paddingBottom: 24,
            borderBottomWidth: 1,
            borderBottomColor: '#dde5e0',
          }}
        >
          <View style={{ flex: 1, gap: 12 }}>
            <Meta style={{ color: '#527b60', fontWeight: '600', letterSpacing: 1 }}>
              NOW PRACTICING
            </Meta>
            <PageHeading style={{ fontSize: 28 }}>{song.title}</PageHeading>
            <Copy style={{ color: '#75847b' }}>{song.artist}</Copy>
            <Meta>
              {song.bandName} · 내 파트 {song.myPart || '미배정'}
            </Meta>
            <FlexRow wrap>
              <ActionButton secondary compact onPress={() => setChoosing(!choosing)}>
                {choosing ? '곡 선택 닫기' : '곡 변경'}
              </ActionButton>
              <ActionButton
                secondary
                compact
                onPress={() =>
                  navigate('song', {
                    workspaceId: song.workspaceId,
                    id: song.id,
                    songTab: 'resources',
                  })
                }
              >
                곡 자료
              </ActionButton>
              <ActionButton
                secondary
                compact
                onPress={() => navigate('song', { workspaceId: song.workspaceId, id: song.id })}
              >
                {fromBand ? '곡으로 돌아가기' : '밴드 곡 상세'}
              </ActionButton>
            </FlexRow>
          </View>
          {song.referenceUrl && (
            <View style={{ width: width >= 1100 ? '48%' : '100%', maxWidth: 500, gap: 8 }}>
              <ReferenceVideo
                title={song.title}
                referenceUrl={song.referenceUrl}
                thumbnailUrl={song.thumbnailUrl}
              />
            </View>
          )}
        </View>
      )}
      {(!song || choosing) && (
        <Surface>
          <FlexBetween>
            <Heading>{song ? `${song.title} · ${song.artist}` : '연습할 곡을 선택하세요'}</Heading>
            {song && (
              <ActionButton
                secondary
                compact
                onPress={() => navigate('song', { workspaceId: song.workspaceId, id: song.id })}
              >
                {fromBand ? '곡으로 돌아가기' : '밴드 곡 상세'}
              </ActionButton>
            )}
          </FlexBetween>
          {song && (
            <Meta style={{ color: song.bandColor }}>
              {song.bandName} · 내 파트 {song.myPart || '미배정'}
            </Meta>
          )}
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
          <FlexRow wrap>
            {visible.map((item) => (
              <Pill
                key={`${item.workspaceId}/${item.id}`}
                active={song?.id === item.id && song.workspaceId === item.workspaceId}
                accessibilityRole="button"
                onPress={() => {
                  setChoosing(false);
                  navigate('personal-practice', { id: item.id, workspaceId: item.workspaceId });
                }}
              >
                <PillText active={song?.id === item.id && song.workspaceId === item.workspaceId}>
                  {item.title} / {item.bandName}
                </PillText>
              </Pill>
            ))}
          </FlexRow>
          {!visible.length && (
            <Meta>이 밴드에 채택된 곡이 없어요. 밴드 공간에서 연습곡을 골라보세요.</Meta>
          )}
          {entityId &&
            !song &&
            (excludedSong ? (
              <>
                <Copy>
                  {excludedSong.archived
                    ? '보관 중인 곡이에요.'
                    : '참여 파트가 배정되지 않은 곡이에요.'}{' '}
                  곡 상세에서 개인 연습을 이어갈 수 있어요.
                </Copy>
                <ActionButton
                  secondary
                  onPress={() =>
                    navigate('song', { id: excludedSong.id, workspaceId, songTab: 'practice' })
                  }
                >
                  이 곡 연습하기
                </ActionButton>
              </>
            ) : (
              <Copy>선택한 곡을 찾을 수 없어요. 접근 가능한 곡을 다시 선택해주세요.</Copy>
            ))}
        </Surface>
      )}
      {song && (
        <PracticeStudio
          key={`${song.workspaceId}/${song.id}`}
          scopeKey={`${song.workspaceId}/${song.id}`}
        />
      )}
      <Surface tint="#f4f7ff">
        <Heading>개인 음악 도구</Heading>
        <Meta>연습에 필요한 음원과 악보를 준비해요.</Meta>
        <FlexRow wrap>
          <ActionButton secondary onPress={() => navigate('instrument')}>
            내 악기 추출
          </ActionButton>
          <ActionButton
            secondary
            onPress={() =>
              navigate(
                'score-editor',
                song ? { id: song.id, workspaceId: song.workspaceId } : undefined,
              )
            }
          >
            악보 편집
          </ActionButton>
        </FlexRow>
      </Surface>
    </AppShell>
  );
}
