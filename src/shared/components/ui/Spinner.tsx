import { Loader2 } from 'lucide-react';
import type { HTMLAttributes } from 'react';

import { classNames } from '@/shared/utils/classNames';

type SpinnerSize = 'sm' | 'md' | 'lg';

interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  label?: string;
  labelClassName?: string;
  size?: SpinnerSize;
}

const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-8 w-8',
};

export function Spinner({ label, labelClassName, size = 'sm', className, ...props }: SpinnerProps) {
  const hasLabel = Boolean(label);

  return (
    <span
      className={classNames(
        'inline-flex items-center text-white/70',
        hasLabel ? 'gap-2' : undefined,
        className,
      )}
      {...props}
    >
      <Loader2 className={classNames('animate-spin', sizeClasses[size])} aria-hidden />
      {hasLabel && <span className={classNames('text-sm', labelClassName)}>{label}</span>}
    </span>
  );
}
