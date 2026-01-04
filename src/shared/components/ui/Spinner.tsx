import { Loader2 } from 'lucide-react';
import type { HTMLAttributes } from 'react';

import { classNames } from '@/shared/utils/classNames';

interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  label?: string;
}

export function Spinner({ label, className, ...props }: SpinnerProps) {
  return (
    <span
      className={classNames('inline-flex items-center gap-2 text-white/70', className)}
      {...props}
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label && <span className="text-sm">{label}</span>}
    </span>
  );
}
