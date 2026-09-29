import { databaseUrl } from './database-url.js';
const environments = ['development', 'test', 'production'] as const;

type Environment = (typeof environments)[number];

export function validateEnvironment(config: Record<string, unknown>) {
  const nodeEnvironment = (config.NODE_ENV ?? 'development') as Environment;

  if (!environments.includes(nodeEnvironment)) {
    throw new Error(`NODE_ENV must be one of: ${environments.join(', ')}`);
  }

  const port = Number(config.PORT ?? 3000);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const authMode = String(config.AUTH_MODE ?? '').trim() || 'kakao';
  if (!['temporary', 'kakao'].includes(authMode))
    throw new Error('AUTH_MODE must be temporary or kakao');
  if (nodeEnvironment === 'production' && authMode === 'temporary')
    throw new Error('Temporary authentication is not allowed in production');
  const kakaoKey = String(config.KAKAO_REST_API_KEY ?? '').trim();
  const kakaoSecret = String(config.KAKAO_CLIENT_SECRET ?? '').trim();
  const jwtSecret = String(config.AUTH_JWT_SECRET ?? '').trim();
  if (jwtSecret && Buffer.byteLength(jwtSecret, 'utf8') < 32)
    throw new Error('AUTH_JWT_SECRET must contain at least 32 bytes');
  const redirects = String(config.KAKAO_ALLOWED_REDIRECT_URIS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  for (const value of redirects) {
    const uri = new URL(value);
    if (
      !['http:', 'https:'].includes(uri.protocol) ||
      uri.username ||
      uri.password ||
      uri.search ||
      uri.hash ||
      value.includes('*')
    )
      throw new Error(
        'KAKAO_ALLOWED_REDIRECT_URIS must contain exact HTTP(S) callback URLs without query or fragment',
      );
    if (nodeEnvironment === 'production' && uri.protocol !== 'https:')
      throw new Error('Production Kakao redirect URIs require HTTPS');
  }
  const ttl = Number(config.AUTH_ACCESS_TOKEN_TTL_SECONDS ?? 3600);
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 86400)
    throw new Error('AUTH_ACCESS_TOKEN_TTL_SECONDS must be between 60 and 86400');
  const kakaoEnabled = !!(kakaoKey && kakaoSecret && jwtSecret && redirects.length);
  if (nodeEnvironment === 'production' && !kakaoEnabled)
    throw new Error(
      'Kakao authentication requires KAKAO_REST_API_KEY, KAKAO_CLIENT_SECRET, AUTH_JWT_SECRET and KAKAO_ALLOWED_REDIRECT_URIS',
    );
  return {
    ...config,
    NODE_ENV: nodeEnvironment,
    PORT: port,
    AUTH_MODE: authMode,
    KAKAO_REST_API_KEY: kakaoKey,
    KAKAO_CLIENT_SECRET: kakaoSecret,
    KAKAO_ALLOWED_REDIRECT_URIS: redirects,
    KAKAO_LOGIN_ENABLED: authMode === 'kakao' && kakaoEnabled,
    AUTH_JWT_SECRET: jwtSecret,
    AUTH_ACCESS_TOKEN_TTL_SECONDS: ttl,
    DATABASE_URL: databaseUrl(config),
    DATABASE_MODE: String(config.DATABASE_URL ?? '').trim() ? 'postgresql' : 'sqlite',
    SUPABASE_URL: String(config.SUPABASE_URL ?? '').trim(),
    SUPABASE_PUBLISHABLE_KEY: String(config.SUPABASE_PUBLISHABLE_KEY ?? '').trim(),
    CORS_ORIGINS:
      String(config.CORS_ORIGINS ?? '').trim() || 'http://localhost:5173,http://127.0.0.1:5173',
  };
}
