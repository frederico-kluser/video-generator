import { Loader2 } from 'lucide-react';
import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { classNames } from '@/shared/utils/classNames';

type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  accent: 'btn-accent',
  danger: 'btn-danger',
  ghost: 'btn-ghost',
  outline: 'btn-ghost border border-white/20 hover:border-white/40',
};

const sizeClasses: Record<Exclude<ButtonSize, 'icon'>, string> = {
  sm: 'px-3 py-2 text-sm sm:px-4',
  md: '',
  lg: 'text-base px-6 py-3 sm:px-7',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled,
    leftIcon,
    rightIcon,
    className,
    fullWidth,
    children,
    ...props
  },
  ref,
) {
  const isIconButton = size === 'icon';
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      className={classNames(
        'relative inline-flex items-center justify-center gap-2 font-semibold transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-950',
        'disabled:cursor-not-allowed disabled:opacity-60',
        fullWidth ? 'w-full' : undefined,
        isIconButton ? 'btn-icon' : variantClasses[variant],
        !isIconButton ? sizeClasses[size as Exclude<ButtonSize, 'icon'>] : undefined,
        loading ? 'cursor-wait' : undefined,
        className,
      )}
      disabled={isDisabled}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {!isIconButton && leftIcon}
      {children}
      {!isIconButton && rightIcon}
    </button>
  );
});
