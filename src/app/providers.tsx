import { ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { AppErrorFallback } from '@/shared/components/error-boundary/AppErrorFallback';
import { ThemeProvider } from '@/shared/theme/ThemeProvider';

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ErrorBoundary FallbackComponent={AppErrorFallback} resetKeys={[]}>
      <ThemeProvider>{children}</ThemeProvider>
    </ErrorBoundary>
  );
}
