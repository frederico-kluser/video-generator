export async function readVideoDurationMs(
  sourceUrl: string,
  timeoutMs = 5000,
): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    let settled = false;

    const finalize = (duration: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      video.src = '';
      video.removeAttribute('src');
      video.load();
      video.remove();
      resolve(duration);
    };

    const timeoutId = window.setTimeout(() => finalize(null), timeoutMs);

    video.preload = 'metadata';
    video.muted = true;
    video.src = sourceUrl;

    video.onloadedmetadata = () => {
      window.clearTimeout(timeoutId);
      const duration = Number.isFinite(video.duration)
        ? Math.max(0, Math.round(video.duration * 1000))
        : null;
      finalize(duration);
    };

    video.onerror = () => {
      window.clearTimeout(timeoutId);
      finalize(null);
    };
  });
}
