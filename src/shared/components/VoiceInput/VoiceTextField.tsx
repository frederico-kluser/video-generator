import { forwardRef } from 'react';
import type {
  InputHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

import { Input, Textarea } from '@/shared/components/ui/Input';
import { classNames } from '@/shared/utils/classNames';

import { VoiceInputButton } from './VoiceInputButton';

type BaseProps = {
  containerClassName?: string;
  buttonClassName?: string;
  buttonAriaLabel?: string;
};

type VoiceTextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> &
  BaseProps & {
    value: string;
    onValueChange: (value: string) => void;
  };

type VoiceTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> &
  BaseProps & {
    value: string;
    onValueChange: (value: string) => void;
  };

export const VoiceTextInput = forwardRef<HTMLInputElement, VoiceTextInputProps>(
  (
    { value, onValueChange, containerClassName, buttonClassName, buttonAriaLabel, className, ...props },
    ref,
  ) => {
    return (
      <div className={classNames('flex items-center gap-2 sm:gap-3', containerClassName)}>
        <Input
          ref={ref}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className={classNames('flex-1', className)}
          {...props}
        />
        <VoiceInputButton
          ariaLabel={buttonAriaLabel ?? 'Ditado para o campo de texto'}
          className={buttonClassName}
          size="sm"
          onTranscription={onValueChange}
        />
      </div>
    );
  },
);

export const VoiceTextarea = forwardRef<HTMLTextAreaElement, VoiceTextareaProps>(
  (
    { value, onValueChange, containerClassName, buttonClassName, buttonAriaLabel, className, ...props },
    ref,
  ) => {
    return (
      <div className={classNames('flex items-start gap-2 sm:gap-3', containerClassName)}>
        <Textarea
          ref={ref}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className={classNames('flex-1', className)}
          {...props}
        />
        <VoiceInputButton
          ariaLabel={buttonAriaLabel ?? 'Ditado para o campo de texto'}
          className={classNames('mt-1', buttonClassName)}
          onTranscription={onValueChange}
        />
      </div>
    );
  },
);
