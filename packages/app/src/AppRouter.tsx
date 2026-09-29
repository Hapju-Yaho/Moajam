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
import { PracticeScreen } from './screens/PracticeScreen';
import { RecommendationDetailScreen } from './screens/RecommendationDetailScreen';
import { BandPracticeScreen } from './screens/BandPracticeScreen';
import { RehearsalsScreen } from './screens/RehearsalsScreen';
import { ScoreEditorScreen } from './screens/ScoreEditorScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SongsScreen } from './screens/SongsScreen';
import { SongWorkspaceScreen } from './screens/SongWorkspaceScreen';

interface AppScreenProps {
  route: AppRoute;
  navigate: (route: AppRoute, options?: NavigationOptions) => void;
  entityId?: string;
  workspaceId?: string;
  songTab?: SongTab;
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
        key={`${props.workspaceId ?? 'personal'}/${props.route}/${props.entityId ?? ''}`}
        {...props}
      />
    </WorkspaceScopeProvider>
  );
}
function ScopedScreen({ route, navigate, entityId, workspaceId, songTab }: AppScreenProps) {
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
    ].includes(route)
  )
    return <PersonalScreen route="personal-home" navigate={navigate} />;
  switch (route) {
    case 'personal-home':
    case 'personal-rehearsals':
    case 'personal-songs':
      return <PersonalScreen route={route} navigate={navigate} />;
    case 'personal-practice':
      return <PracticeScreen navigate={navigate} entityId={entityId} />;
    case 'recommendations':
      return <SongsScreen navigate={navigate} />;
    case 'recommendation':
      return <RecommendationDetailScreen navigate={navigate} entityId={entityId} />;
    case 'songs':
      return <SongsScreen navigate={navigate} />;
    case 'song':
      return songTab === 'practice' ? (
        <BandPracticeScreen navigate={navigate} entityId={entityId} />
      ) : (
        <SongWorkspaceScreen navigate={navigate} entityId={entityId} songTab={songTab} />
      );
    case 'practice':
      return <BandPracticeScreen navigate={navigate} entityId={entityId} />;
    case 'rehearsals':
      return <RehearsalsScreen navigate={navigate} entityId={entityId} />;
    case 'members':
      return <MembersScreen navigate={navigate} />;
    case 'instrument':
      return <InstrumentExtractorScreen navigate={navigate} />;
    case 'score-editor':
      return <ScoreEditorScreen navigate={navigate} entityId={entityId} />;
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
      navigate={(route, options) =>
        setLocation({
          route,
          id: options?.id,
          songTab: options?.songTab,
          workspaceId:
            options?.workspaceId ??
            (route.startsWith('personal-') ? undefined : selectedWorkspaceId),
        })
      }
    />
  );
}
