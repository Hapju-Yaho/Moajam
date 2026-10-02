declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native';
  const source: ImageSourcePropType;
  export default source;
}

declare module '*.svg' {
  const source: string;
  export default source;
}

declare module '*.css' {}