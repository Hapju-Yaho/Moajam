import {
  AppProviders,
  AppScreen,
  buildAppPath,
  parseSongTab,
  type AppRoute,
  type NavigationOptions,
} from '@moajam/app';
import { useMockAppState } from '@moajam/app';
import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import './styles.css';

function RoutedScreen({ route }: { route: AppRoute }) {
  const navigate = useNavigate();
  const params = useParams();
  const [search] = useSearchParams();
  const { selectedWorkspaceId } = useMockAppState();
  const workspaceId = params.workspaceId ?? search.get('workspaceId') ?? undefined;
  const entityId =
    params.recommendationId ??
    params.songId ??
    search.get('songId') ??
    search.get('sessionId') ??
    undefined;
  const go = (next: AppRoute, options?: NavigationOptions) => {
    const proceed = () =>
      navigate(
        buildAppPath(next, options, {
          route,
          workspaceId: workspaceId ?? selectedWorkspaceId,
          entityId,
        }),
      );
    const event = new CustomEvent('moajam:before-navigate', { cancelable: true, detail: proceed });
    if (window.dispatchEvent(event)) proceed();
  };
  return (
    <AppScreen
      route={route}
      workspaceId={workspaceId}
      entityId={entityId}
      songTab={parseSongTab(search.get('tab'))}
      feedback={search.get('feedback') === 'true'}
      scoreView={search.get('view') === 'applied' ? 'applied' : undefined}
      navigate={go}
    />
  );
}
const routes: Array<[string, AppRoute]> = [
  ['/me', 'personal-home'],
  ['/me/rehearsals', 'personal-rehearsals'],
  ['/me/songs', 'personal-songs'],
  ['/me/practice', 'personal-practice'],
  ['/workspaces/:workspaceId', 'home'],
  ['/workspaces/:workspaceId/recommendations', 'recommendations'],
  ['/workspaces/:workspaceId/recommendations/:recommendationId', 'recommendation'],
  ['/workspaces/:workspaceId/songs', 'songs'],
  ['/workspaces/:workspaceId/songs/:songId', 'song'],
  ['/workspaces/:workspaceId/songs/:songId/practice', 'practice'],
  ['/workspaces/:workspaceId/practice', 'practice'],
  ['/workspaces/:workspaceId/rehearsals', 'rehearsals'],
  ['/workspaces/:workspaceId/members', 'members'],
  ['/me/instrument-extractor', 'instrument'],
  ['/me/score-editor', 'score-editor'],
  ['/workspaces/:workspaceId/songs/:songId/score', 'band-score-editor'],
  ['/settings', 'settings'],
  ['/help', 'help'],
];
function WebApp() {
  return (
    <AppProviders>
      <BrowserRouter>
        <Routes>
          {routes.map(([path, route]) => (
            <Route key={path} path={path} element={<RoutedScreen route={route} />} />
          ))}
          <Route path="*" element={<Navigate to="/me" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProviders>
  );
}
function MobileKakaoCallback() {
  const query = new URLSearchParams(window.location.search);
  const callback = new URL('moajam://auth/callback');
  for (const key of ['code', 'state', 'error']) {
    const value = query.get(key);
    if (value) callback.searchParams.set(key, value);
  }
  const url = callback.toString();
  React.useEffect(() => {
    window.history.replaceState(null, '', '/auth/kakao/mobile-callback');
    window.location.assign(url);
  }, [url]);
  return (
    <main style={{ padding: 40 }}>
      <h1>Moajam으로 돌아가기</h1>
      <p>앱에서 로그인을 마무리해주세요.</p>
      <a href={url}>앱 열기</a>
    </main>
  );
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {window.location.pathname === '/auth/kakao/mobile-callback' ? (
      <MobileKakaoCallback />
    ) : (
      <WebApp />
    )}
  </React.StrictMode>,
);
