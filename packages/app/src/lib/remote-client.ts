type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
type Options = {
  apiUrl: string;
  demo?: boolean;
  storage?: Storage;
  oauthStorage?: Storage;
  authRedirect?: string;
  nativeCallback?: string;
  getAuthCallback?: () => string | null;
  clearAuthCallback?: () => void;
  navigateToAuthorization?: (url: string) => void;
  loginPreview?: boolean;
  onSignedIn?: () => void;
  openAuthSession?: (url: string, redirect: string) => Promise<string | null>;
};
let options: Options = { apiUrl: 'http://localhost:3000/v1' };
export let serverConfigured = true;
let allowAutoLogin = true;
let temporaryPending: Promise<void> | undefined;
let callbackPending: Promise<void> | undefined;
let loginPending: Promise<void> | undefined;
const listeners = new Set<() => void>();
type LocalSession = {
  refreshToken?: string;
  token: string;
  expiresAt: number;
  user: { id: string; provider: 'temporary' | 'kakao' };
};
let localSession: LocalSession | null | undefined;
type ClientConfig = {
  authMode: 'temporary' | 'kakao';
  kakaoLoginEnabled: boolean;
  temporaryLoginEnabled: boolean;
};
let configPending: Promise<ClientConfig> | undefined;
export function clientConfig(): Promise<ClientConfig> {
  return (configPending ??= request('/config')
    .then(async (response) => {
      if (!response.ok) throw new Error('서버 설정을 불러오지 못했습니다.');
      return response.json();
    })
    .catch((error) => {
      configPending = undefined;
      throw error;
    }));
}
async function isTemporary() {
  return (await clientConfig()).authMode === 'temporary';
}
const sessionKey = () => 'moajam.auth-session:' + options.apiUrl;
const resumeKeyName = () => 'moajam.temporary-resume:' + options.apiUrl;
const oauthKey = () => 'moajam.kakao-request:' + options.apiUrl;
async function read(key: string, oauth = false) {
  const storage = oauth ? (options.oauthStorage ?? options.storage) : options.storage;
  return storage ? storage.getItem(key) : (globalThis.localStorage?.getItem(key) ?? null);
}
async function write(key: string, value: string | null, oauth = false) {
  const storage = oauth ? (options.oauthStorage ?? options.storage) : options.storage;
  if (storage) {
    if (value === null) await storage.removeItem(key);
    else await storage.setItem(key, value);
  } else if (value === null) globalThis.localStorage?.removeItem(key);
  else globalThis.localStorage?.setItem(key, value);
}
async function session() {
  if (localSession === undefined) {
    const value = await read(sessionKey());
    try {
      const parsed = value ? JSON.parse(value) : null;
      localSession =
        parsed &&
        typeof parsed.token === 'string' &&
        typeof parsed.expiresAt === 'number' &&
        typeof parsed.user?.id === 'string' &&
        ['temporary', 'kakao'].includes(parsed.user.provider)
          ? parsed
          : null;
    } catch {
      localSession = null;
    }
  }
  return localSession;
}
async function setSession(value: LocalSession | null) {
  await write(sessionKey(), value ? JSON.stringify(value) : null);
  localSession = value;
  listeners.forEach((callback) => callback());
}
async function authRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await request('/auth/' + path, {
    method: 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(error.detail ?? '계정 요청에 실패했습니다.', response.status);
  }
  return response.json();
}
export function reachableUrl(value: string) {
  const url = new URL(value);
  if (!options.apiUrl.startsWith('http'))
    return ['localhost', '127.0.0.1'].includes(url.hostname) &&
      url.pathname.startsWith('/v1/local-files/')
      ? options.apiUrl.replace(/\/$/, '') + url.pathname.slice(3) + url.search
      : value;
  if (['localhost', '127.0.0.1'].includes(url.hostname))
    url.hostname = new URL(options.apiUrl).hostname;
  return url.toString();
}
export function configureRemote(value: Options) {
  options = value;
  serverConfigured = !value.demo;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
async function request(path: string, init?: RequestInit) {
  if (!serverConfigured) throw new Error('목데이터 모드에서는 서버 API를 사용하지 않습니다.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    return await fetch(options.apiUrl.replace(/\/$/, '') + path, {
      ...init,
      signal: controller.signal,
    });
  } catch {
    throw new Error('서버에 연결하지 못했습니다. 백엔드 실행 상태와 네트워크를 확인해주세요.');
  } finally {
    clearTimeout(timer);
  }
}
async function completeKakaoCallback(value: string) {
  const saved = await read(oauthKey(), true);
  // Consume the attempt before any token request: callbacks cannot be replayed.
  await write(oauthKey(), null, true);
  let attempt: { state: string; redirectUri: string; expiresAt: number } | null = null;
  try {
    attempt = saved ? JSON.parse(saved) : null;
  } catch {
    /* Invalid local state. */
  }
  const callback = new URL(value);
  const expected = new URL(
    options.nativeCallback ?? options.authRedirect ?? 'https://invalid.invalid',
  );
  if (
    callback.origin !== expected.origin ||
    callback.protocol !== expected.protocol ||
    callback.host !== expected.host ||
    callback.pathname !== expected.pathname
  )
    throw new Error('로그인 응답 주소가 올바르지 않습니다.');
  if (
    !attempt ||
    attempt.expiresAt <= Date.now() ||
    attempt.redirectUri !== options.authRedirect ||
    !attempt.state ||
    callback.searchParams.get('state') !== attempt.state
  )
    throw new Error('로그인 요청이 만료되었거나 일치하지 않습니다. 다시 시작해주세요.');
  const code = callback.searchParams.get('code');
  if (!code || callback.searchParams.has('error'))
    throw new Error('카카오 로그인을 완료하지 못했습니다. 다시 시도해주세요.');
  const result = await authRequest<{
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
    user: LocalSession['user'];
  }>('kakao', { code, redirectUri: attempt.redirectUri });
  options.loginPreview = false;
  await setSession({
    token: result.accessToken,
    refreshToken: result.refreshToken,
    expiresAt: result.expiresAt,
    user: result.user,
  });
  options.onSignedIn?.();
}
let renewal: Promise<LocalSession | null> | undefined;
async function renewSession(current: LocalSession): Promise<LocalSession | null> {
  renewal ??= (async () => {
    let next: LocalSession;
    try {
      if (current.user.provider === 'temporary') {
        const resumeKey = await read(resumeKeyName());
        if (!resumeKey) throw new ApiError('다시 로그인해주세요.', 401);
        const result = await authRequest<LocalSession & { resumeKey: string }>('temporary', {
          resumeKey,
        });
        if (result.user.id !== current.user.id) throw new ApiError('계정이 변경되었습니다.', 401);
        next = result;
      } else {
        let result: {
          accessToken: string;
          refreshToken: string;
          expiresAt: number;
          user: LocalSession['user'];
        };
        if (current.refreshToken)
          result = await authRequest('refresh', { refreshToken: current.refreshToken });
        else {
          const response = await request('/auth/renew', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + current.token },
          });
          if (!response.ok) throw new ApiError('다시 로그인해주세요.', response.status);
          result = await response.json();
        }
        if (result.user.id !== current.user.id) throw new ApiError('계정이 변경되었습니다.', 401);
        next = {
          token: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt,
          user: result.user,
        };
      }
      if (localSession?.token !== current.token) return localSession ?? null;
      await setSession(next);
      return next;
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 401 &&
        localSession?.token === current.token
      ) {
        allowAutoLogin = false;
        await setSession(null);
      }
      throw error;
    }
  })().finally(() => {
    renewal = undefined;
  });
  return renewal;
}
async function activeSession() {
  const current = await session();
  if (!current) return null;
  return current.expiresAt - Date.now() < 60000 ||
    (current.user.provider === 'kakao' && !current.refreshToken)
    ? renewSession(current)
    : current;
}
export async function currentIdentity() {
  if (!serverConfigured) return 'm1';
  const callback = options.getAuthCallback?.();
  if (callback) {
    callbackPending ??= completeKakaoCallback(callback).finally(() =>
      options.clearAuthCallback?.(),
    );
    await callbackPending;
  }
  if (options.loginPreview) return null;
  const temporary = await isTemporary();
  let current = await activeSession();
  if (
    current &&
    (current.expiresAt <= Date.now() ||
      current.user.provider !== (temporary ? 'temporary' : 'kakao'))
  ) {
    await setSession(null);
    current = null;
  }
  if (!current && temporary && allowAutoLogin) await signInTemporary();
  return (await session())?.user.id ?? null;
}
export function subscribeIdentity(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
export async function signInTemporary() {
  temporaryPending ??= (async () => {
    if (!(await isTemporary())) throw new Error('임시 로그인을 사용할 수 없습니다.');
    const resumeKey = await read(resumeKeyName());
    const result = await authRequest<LocalSession & { resumeKey: string }>(
      'temporary',
      resumeKey ? { resumeKey } : {},
    );
    await write(resumeKeyName(), result.resumeKey);
    options.loginPreview = false;
    allowAutoLogin = true;
    options.onSignedIn?.();
    await setSession({ token: result.token, expiresAt: result.expiresAt, user: result.user });
  })().finally(() => {
    temporaryPending = undefined;
  });
  return temporaryPending;
}
export async function signInWithKakao() {
  loginPending ??= (async () => {
    if (await isTemporary()) throw new Error('현재 임시 로그인 모드입니다.');
    if (!options.authRedirect) throw new Error('카카오 로그인 콜백 주소를 설정해주세요.');
    const result = await authRequest<{
      authorizationUrl: string;
      state: string;
      expiresIn: number;
    }>('kakao/authorize', { redirectUri: options.authRedirect });
    callbackPending = undefined;
    await write(
      oauthKey(),
      JSON.stringify({
        state: result.state,
        redirectUri: options.authRedirect,
        expiresAt: Date.now() + result.expiresIn * 1000,
      }),
      true,
    );
    if (options.openAuthSession) {
      try {
        const callback = await options.openAuthSession(
          result.authorizationUrl,
          options.nativeCallback ?? options.authRedirect,
        );
        if (callback) await completeKakaoCallback(callback);
      } finally {
        await write(oauthKey(), null, true);
      }
    } else if (options.navigateToAuthorization)
      options.navigateToAuthorization(result.authorizationUrl);
    else throw new Error('로그인 브라우저를 열 수 없습니다.');
  })().finally(() => {
    loginPending = undefined;
  });
  return loginPending;
}
export async function signOut() {
  if (!serverConfigured) return;
  try {
    await api('/auth/logout', 'POST');
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
  }
  allowAutoLogin = false;
  await setSession(null);
}
export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  expectedUser?: string,
): Promise<T> {
  if (!serverConfigured) throw new Error('목데이터 모드에서는 서버 API를 사용하지 않습니다.');
  const current = await activeSession();
  if (!current || (expectedUser && current.user.id !== expectedUser))
    throw new ApiError('다시 로그인해주세요.', 401);
  if (current.expiresAt <= Date.now()) {
    allowAutoLogin = false;
    await setSession(null);
    throw new ApiError('로그인이 만료되었습니다. 다시 로그인해주세요.', 401);
  }
  const response = await request(path, {
    method,
    headers: {
      Authorization: 'Bearer ' + current.token,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (response.status === 401 && localSession?.token === current.token) {
      allowAutoLogin = false;
      await setSession(null);
    }
    throw new ApiError(error.detail ?? '요청에 실패했습니다.', response.status, error.code);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  // Nest/Fastify may serialize a missing document as an empty 200 response.
  const result = text.trim() ? JSON.parse(text) : null;
  if (result && typeof result === 'object')
    for (const key of ['url', 'signedUrl'])
      if (typeof result[key] === 'string') result[key] = reachableUrl(result[key]);
  return result;
}

export async function uploadRemoteFile(
  blob: Blob,
  name: string,
  scope: string,
  workspaceId?: string,
  expectedUser?: string,
): Promise<string> {
  const user = await currentIdentity();
  if (!user) throw new Error('로그인이 필요합니다.');
  if (expectedUser && user !== expectedUser)
    throw new Error('계정이 변경되어 업로드를 중단했습니다.');
  const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
  const mime = (
    blob.type ||
    {
      xml: 'application/xml',
      musicxml: 'application/xml',
      wav: 'audio/wav',
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
    }[extension] ||
    'application/octet-stream'
  ).split(';')[0];
  if (blob.size > 104857600) throw new Error('100MB 이하 파일을 선택해주세요.');
  const upload = await api<{ assetId: string; signedUrl: string }>(
    '/assets/uploads',
    'POST',
    { name, mime, size: blob.size, scope, ...(workspaceId ? { workspaceId } : {}) },
    user,
  );
  const form = new FormData();
  form.append('cacheControl', '3600');
  form.append('', blob.type === mime ? blob : new Blob([blob], { type: mime }), name);
  const response = await fetch(upload.signedUrl, { method: 'PUT', body: form });
  if (!response.ok) throw new Error('파일을 업로드하지 못했습니다. 다시 시도해주세요.');
  await api(`/assets/${upload.assetId}/complete`, 'POST', undefined, user);
  return upload.assetId;
}
