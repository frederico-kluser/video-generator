type LogContext = Record<string, unknown> | undefined;

type LogLevel = 'info' | 'warn' | 'error';

const withContext = (context?: LogContext) => (context ? ['context:', context] : []);

const log = (level: LogLevel, emoji: string, message: string, context?: LogContext) => {
  const formattedMessage = `${emoji} [VideoGenerator] ${message}`;

  switch (level) {
    case 'info':
      console.info(formattedMessage, ...withContext(context));
      break;
    case 'warn':
      console.warn(formattedMessage, ...withContext(context));
      break;
    case 'error':
      console.error(formattedMessage, ...withContext(context));
      break;
    default:
      console.log(formattedMessage, ...withContext(context));
  }
};

export const appLogger = {
  info: (message: string, context?: LogContext) => log('info', 'ℹ️', message, context),
  warn: (message: string, context?: LogContext) => log('warn', '⚠️', message, context),
  error: (message: string, context?: LogContext) => log('error', '🚨', message, context),
};
