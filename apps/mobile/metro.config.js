const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);
const appSource = path.resolve(__dirname, '../../packages/app/src');
const aliases = {
  '@app': appSource,
  '@component': path.join(appSource, 'components'),
  '@lib': path.join(appSource, 'lib'),
  '@mocks': path.join(appSource, 'mocks'),
  '@screens': path.join(appSource, 'screens'),
  '@state': path.join(appSource, 'state'),
  '@styles': path.join(appSource, 'styles'),
  '@assets': path.resolve(__dirname, '../../packages/app/assets'),
};
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const alias = Object.keys(aliases).find((name) => moduleName.startsWith(`${name}/`));
  const target = alias ? path.join(aliases[alias], moduleName.slice(alias.length + 1)) : moduleName;
  // Delegate extension/platform selection to Metro (.native, .ios, .android).
  return (defaultResolveRequest ?? context.resolveRequest)(context, target, platform);
};

module.exports = config;
