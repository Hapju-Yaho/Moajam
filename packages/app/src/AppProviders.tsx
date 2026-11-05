import { ThemeProvider } from '@emotion/react';
import { createQueryClient } from '@moajam/api';
import { theme } from '@moajam/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type PropsWithChildren } from 'react';
import { MockAppStateProvider } from '@state/MockAppState';
import { IdentityProvider } from '@state/Identity';

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <IdentityProvider>
          <MockAppStateProvider>{children}</MockAppStateProvider>
        </IdentityProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
