import { ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { AppErrorFallback } from '@/shared/components/error-boundary/AppErrorFallback';

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ErrorBoundary FallbackComponent={AppErrorFallback} resetKeys={[]}>
      {children}
    </ErrorBoundary>
  );
}
