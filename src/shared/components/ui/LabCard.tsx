import type { ReactNode } from 'react';

import { classNames } from '@/shared/utils/classNames';

interface LabCardProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function LabCard({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: LabCardProps) {
  const hasHeaderContent = title || description || actions;

  return (
    <section
      className={classNames(
        'rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur',
        className,
      )}
    >
      {hasHeaderContent && (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            {title && <h2 className="text-xl font-semibold text-white">{title}</h2>}
            {description && <p className="text-sm text-white/70">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
        </div>
      )}
      <div className={contentClassName}>{children}</div>
    </section>
  );
}
