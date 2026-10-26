import { useEffect, useState } from 'react';
import type { AppRoute, NavigationOptions, SongTab } from './navigation';
import { PersonalScreen } from './screens/PersonalScreen';
import { WorkspaceScopeProvider, useMockAppState } from './state/MockAppState';
import { AppShell } from './components/AppShell';
import { ActionButton, Heading, Meta, Surface } from './components/ProductUI';
import { HomeScreen } from './screens/HomeScreen';
import { HelpScreen } from './screens/HelpScreen';
import { InstrumentExtractorScreen } from './screens/InstrumentExtractorScreen';
import { MembersScreen } from './screens/MembersScreen';
import { MusicToolsScreen } from './screens/MusicToolsScreen';
import { RecordingScreen } from './screens/RecordingScreen';
import { RecommendationDetailScreen } from './screens/RecommendationDetailScreen';
import { RehearsalsScreen } from './screens/RehearsalsScreen';
import { ScoreEditorScreen } from './screens/ScoreEditorScreen';
import { BandScoreEditorScreen } from './screens/BandScoreEditorScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SongsScreen } from './screens/SongsScreen';
import { SongWorkspaceScreen } from './screens/SongWorkspaceScreen';

interface AppScreenProps {
  focusId?: string;
  focusTime?: number;
  assetId?: string;
  projectId?: string;
  scoreView?: 'applied' | 'expanded';
  scorePart?: string;
  route: AppRoute;
  navigate: (route: AppRoute, options?: NavigationOptions) => void;
  entityId?: string;
  workspaceId?: string;
  songTab?: SongTab;
  feedback?: boolean;
}

export function AppScreen(props: AppScreenProps) {
  const { selectWorkspace, workspaces } = useMockAppState();
  useEffect(() => {
    if (props.workspaceId && workspaces.some((band) => band.id === props.workspaceId))
      selectWorkspace(props.workspaceId);
  }, [props.workspaceId, selectWorkspace, workspaces]);
  return (
    <WorkspaceScopeProvider id={props.workspaceId}>
      <ScopedScreen
        key={`${props.workspaceId ?? 'personal'}/${props.route}/${props.entityId ?? ''}/${props.scoreView ?? ''}/${props.scorePart ?? ''}/${props.focusId ?? ''}/${props.assetId ?? ''}`}
        {...props}
      />
    </WorkspaceScopeProvider>
  );
}
function ScopedScreen({
  route,
  navigate,
  entityId,
  workspaceId,
  songTab,
  scoreView,
  scorePart,
  feedback,
  focusId,
  focusTime,
  assetId,
  projectId,
}: AppScreenProps) {
  const { workspaces, workspace } = useMockAppState();
  if (workspaceId && !workspace)
    return (
      <AppShell activeRoute={route} onNavigate={navigate}>
        <Surface>
          <Heading>이 밴드에 접근할 수 없어요</Heading>
          <Meta>참여 중인 밴드인지 확인해주세요.</Meta>
          <ActionButton onPress={() => navigate('personal-home')}>개인 홈으로</ActionButton>
        </Surface>
      </AppShell>
    );
  if (
    !workspaces.length &&
    [
      'home',
      'recommendations',
      'recommendation',
      'songs',
      'song',
      'rehearsals',
      'members',
      'practice',
      'band-score-editor',
    ].includes(route)
  )
    return <PersonalScreen route="personal-home" navigate={navigate} />;
  switch (route) {
    case 'personal-home':
    case 'personal-rehearsals':
    case 'personal-songs':
      return <PersonalScreen route={route} navigate={navigate} />;
    case 'tools':
      return <MusicToolsScreen navigate={navigate} />;
    case 'track-editor':
      return entityId ? (
        <SongWorkspaceScreen navigate={navigate} entityId={entityId} songTab="tracks" />
      ) : (
        <RecordingScreen navigate={navigate} />
      );
    case 'personal-practice':
    case 'practice':
      return entityId ? (
        <SongWorkspaceScreen
          navigate={navigate}
          entityId={entityId}
          songTab="tracks"
          feedback={feedback}
          focusId={focusId}
          focusTime={focusTime}
          projectId={projectId}
          assetId={assetId}
        />
      ) : (
        <MusicToolsScreen navigate={navigate} mode="tracks" />
      );
    case 'recommendations':
      return <SongsScreen navigate={navigate} />;
    case 'recommendation':
      return <RecommendationDetailScreen navigate={navigate} entityId={entityId} />;
    case 'songs':
      return <SongsScreen navigate={navigate} />;
    case 'song':
      return (
        <SongWorkspaceScreen
          navigate={navigate}
          entityId={entityId}
          songTab={songTab}
          feedback={feedback}
          focusId={focusId}
          focusTime={focusTime}
          projectId={projectId}
          assetId={assetId}
        />
      );
    case 'rehearsals':
      return <RehearsalsScreen navigate={navigate} entityId={entityId} />;
    case 'members':
      return <MembersScreen navigate={navigate} />;
    case 'instrument':
      return <InstrumentExtractorScreen navigate={navigate} />;
    case 'score-editor':
      return <ScoreEditorScreen navigate={navigate} entityId={entityId} scorePart={scorePart} />;
    case 'band-score-editor':
      if (!entityId) return <MusicToolsScreen navigate={navigate} />;
      return (
        <BandScoreEditorScreen
          navigate={navigate}
          entityId={entityId}
          scoreView={scoreView}
          scorePart={scorePart}
        />
      );
    case 'settings':
      return <SettingsScreen navigate={navigate} />;
    case 'help':
      return <HelpScreen navigate={navigate} />;
    default:
      return <HomeScreen navigate={navigate} />;
  }
}

export function MoajamApp() {
  const [location, setLocation] = useState<{
    route: AppRoute;
    id?: string;
    workspaceId?: string;
    songTab?: SongTab;
    feedback?: boolean;
    scoreView?: 'applied' | 'expanded';
    scorePart?: string;
    focusId?: string;
    focusTime?: number;
    assetId?: string;
    projectId?: string;
  }>({
    route: 'personal-home',
  });
  const { selectedWorkspaceId } = useMockAppState();
  return (
    <AppScreen
      route={location.route}
      entityId={location.id}
      workspaceId={location.workspaceId}
      songTab={location.songTab}
      feedback={location.feedback}
      focusId={location.focusId}
      focusTime={location.focusTime}
      projectId={location.projectId}
      assetId={location.assetId}
      scorePart={location.scorePart}
      scoreView={location.scoreView}
      navigate={(route, options) =>
        setLocation({
          route,
          id: options?.id,
          songTab: options?.songTab,
          feedback: options?.feedback,
          focusId: options?.focusId,
          focusTime: options?.focusTime,
          projectId: options?.projectId,
          assetId: options?.assetId,
          scorePart: options?.scorePart,
          scoreView: options?.scoreView,
          workspaceId:
            options?.workspaceId ??
            (route.startsWith('personal-') ||
            ['tools', 'track-editor', 'score-editor', 'instrument'].includes(route)
              ? undefined
              : selectedWorkspaceId),
        })
      }
    />
  );
}
