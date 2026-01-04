import type { ReactNode } from 'react';

import { classNames } from '@/shared/utils/classNames';

type LabAlertVariant = 'warning' | 'danger' | 'info';

const variantClasses: Record<LabAlertVariant, string> = {
  warning: 'border-amber-400/40 bg-amber-400/10 text-amber-100',
  danger: 'border-red-500/40 bg-red-500/10 text-red-100',
  info: 'border-primary-400/40 bg-primary-500/10 text-primary-100',
};

interface LabAlertProps {
  children: ReactNode;
  variant?: LabAlertVariant;
  className?: string;
}

export function LabAlert({ children, variant = 'warning', className }: LabAlertProps) {
  return (
    <div
      className={classNames(
        'rounded-xl border px-4 py-3 text-sm',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </div>
  );
}
