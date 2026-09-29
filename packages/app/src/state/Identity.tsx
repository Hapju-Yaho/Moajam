import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { View } from 'react-native';
import {
  currentIdentity,
  subscribeIdentity,
  serverConfigured,
  clientConfig,
  api,
} from '../lib/remote';
import { activatePreferences, loadRemotePreferences } from './preferences';
import { Meta } from '../components/ProductUI';
import { LoginScreen } from '../screens/LoginScreen';
import { OnboardingScreen, type OnboardingState } from '../screens/OnboardingScreen';
const Identity = createContext('m1');
export function IdentityProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<string | null>(serverConfigured ? null : 'm1');
  const [loading, setLoading] = useState(serverConfigured);
  const [temporary, setTemporary] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  useEffect(() => {
    let alive = true;
    let sequence = 0;
    let loadedIdentity: string | null = null;
    const refresh = () => {
      const run = ++sequence;
      void (async () => {
        if (serverConfigured) {
          const config = await clientConfig();
          if (alive && run === sequence) setTemporary(config.authMode === 'temporary');
        }
        const id = await currentIdentity();
        if (id && id === loadedIdentity) return;
        const profile =
          id && serverConfigured ? await api<{ displayName: string } | null>('/me') : null;
        const setup =
          id && serverConfigured
            ? await api<OnboardingState>('/me/onboarding', 'GET', undefined, id)
            : null;
        if (id && serverConfigured)
          await loadRemotePreferences(id, profile?.displayName, () => alive && run === sequence);
        if (alive && run === sequence) {
          if (id && !serverConfigured) activatePreferences(id, profile?.displayName);
          setUser(id);
          setOnboarding(setup);
          loadedIdentity = id;
          setLoading(false);
          setError('');
        }
      })().catch((failure: unknown) => {
        if (alive && run === sequence) {
          setUser(null);
          loadedIdentity = null;
          setError(failure instanceof Error ? failure.message : '계정을 확인하지 못했습니다.');
          setLoading(false);
        }
      });
    };
    const unsubscribe = subscribeIdentity(refresh);
    refresh();
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [retry]);
  if (loading)
    return (
      <View style={{ padding: 40 }}>
        <Meta>Moajam을 준비하고 있어요…</Meta>
      </View>
    );
  if (!user)
    return (
      <LoginScreen
        temporary={temporary}
        error={error}
        onRetry={() => {
          setLoading(true);
          setRetry((value) => value + 1);
        }}
      />
    );
  return (
    <Identity.Provider key={user} value={user}>
      {onboarding && !onboarding.completed ? (
        <OnboardingScreen
          user={user}
          initial={onboarding}
          onComplete={() => {
            setLoading(true);
            setRetry((value) => value + 1);
          }}
        />
      ) : (
        children
      )}
    </Identity.Provider>
  );
}
// eslint-disable-next-line react-refresh/only-export-components
export function useIdentity() {
  return useContext(Identity);
}
