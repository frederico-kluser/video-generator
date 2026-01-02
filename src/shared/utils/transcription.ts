export type MergeTranscriptOptions = {
  separator?: string;
  replace?: boolean;
};

export function mergeTranscript(
  _current: string | undefined | null,
  transcript: string,
  _options: MergeTranscriptOptions = {},
): string {
  const normalized = transcript?.trim();
  if (!normalized) {
    return '';
  }

  return normalized;
}
