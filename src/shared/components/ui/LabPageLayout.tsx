import type { ReactNode } from 'react';

import { classNames } from '@/shared/utils/classNames';

interface LabPageLayoutProps {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  warning?: ReactNode;
  children: ReactNode;
  maxWidthClassName?: string;
  className?: string;
}

export function LabPageLayout({
  title,
  description,
  eyebrow = 'Labs',
  warning,
  children,
  maxWidthClassName = 'max-w-4xl',
  className,
}: LabPageLayoutProps) {
  return (
    <div
      className={classNames(
        'mx-auto flex w-full flex-col gap-8 px-6 py-12',
        maxWidthClassName,
        className,
      )}
    >
      <header className="space-y-2">
        {eyebrow && (
          <p className="text-sm uppercase tracking-[0.3em] text-primary-300">{eyebrow}</p>
        )}
        <h1 className="text-3xl font-semibold text-white">{title}</h1>
        {description && <div className="text-base text-white/70">{description}</div>}
      </header>

      {warning}

      {children}
    </div>
  );
}
