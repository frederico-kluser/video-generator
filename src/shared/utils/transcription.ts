export type MergeTranscriptOptions = {
  /** Separator inserted between existing text and the new transcript. */
  separator?: string;
  /** When true, the transcript replaces the existing content instead of appending. */
  replace?: boolean;
};

const DEFAULT_SEPARATOR = '\n\n';

export function mergeTranscript(
  current: string | undefined | null,
  transcript: string,
  options: MergeTranscriptOptions = {},
): string {
  const normalized = transcript?.trim();
  if (!normalized) {
    return current ?? '';
  }

  if (options.replace) {
    return normalized;
  }

  const existing = current?.trim();
  if (!existing) {
    return normalized;
  }

  const separator = options.separator ?? DEFAULT_SEPARATOR;
  return `${existing}${separator}${normalized}`.trim();
}
