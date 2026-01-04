import { Mic } from 'lucide-react';

import { Button, type ButtonProps } from '@/shared/components/ui/Button';

export type RecordButtonProps = Omit<ButtonProps, 'variant' | 'size' | 'leftIcon'>;

export function RecordButton({ children, className, ...props }: RecordButtonProps) {
  return (
    <Button
      variant="danger"
      className={`inline-flex items-center gap-2 ${className ?? ''}`.trim()}
      leftIcon={<Mic className="h-4 w-4" />}
      {...props}
    >
      {children}
    </Button>
  );
}
