import { configureRemote } from './remote-client';
const env = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env;
configureRemote({
  apiUrl: env.VITE_API_URL?.trim() || '/api/v1',
  demo: (env.VITE_USE_MOCK_DATA ?? env.VITE_DEMO_MODE)?.trim() === 'true',
  authRedirect: window.location.origin + '/auth/kakao/callback',
  oauthStorage: {
    getItem: async (key) => window.sessionStorage.getItem(key),
    setItem: async (key, value) => window.sessionStorage.setItem(key, value),
    removeItem: async (key) => window.sessionStorage.removeItem(key),
  },
  getAuthCallback: () =>
    window.location.pathname === '/auth/kakao/callback' ? window.location.href : null,
  clearAuthCallback: () => {
    if (window.location.pathname === '/auth/kakao/callback')
      window.history.replaceState(null, '', '/login');
  },
  navigateToAuthorization: (url) => window.location.assign(url),
  loginPreview: window.location.pathname === '/login',
  onSignedIn: () => {
    if (['/login', '/auth/kakao/callback'].includes(window.location.pathname)) {
      window.history.replaceState(null, '', '/me');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  },
});
export * from './remote-client';
export * from './remote-workspaces';
