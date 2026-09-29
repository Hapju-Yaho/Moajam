import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { configureRemote } from './remote-client';
configureRemote({
  apiUrl: process.env.EXPO_PUBLIC_API_URL?.trim() || 'http://localhost:3000/v1',
  demo:
    (process.env.EXPO_PUBLIC_USE_MOCK_DATA ?? process.env.EXPO_PUBLIC_DEMO_MODE)?.trim() === 'true',
  storage: AsyncStorage,
  authRedirect: process.env.EXPO_PUBLIC_KAKAO_REDIRECT_URI?.trim(),
  nativeCallback: 'moajam://auth/callback',
  openAuthSession: async (url, redirect) => {
    const result = await WebBrowser.openAuthSessionAsync(url, redirect);
    return result.type === 'success' ? result.url : null;
  },
});
export * from './remote-client';
export * from './remote-workspaces';
