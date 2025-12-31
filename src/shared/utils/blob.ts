export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error('Failed to convert blob to data URL.'));
    reader.onload = () => {
      const { result } = reader;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('Unexpected reader result while converting blob.'));
      }
    };
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [metadata, base64Content] = dataUrl.split(',');
  if (!metadata || !base64Content) {
    throw new Error('Invalid data URL format.');
  }

  const mimeMatch = metadata.match(/data:(.*);base64/);
  const mimeType = mimeMatch?.[1] ?? 'application/octet-stream';
  const binaryString = atob(base64Content);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);

  for (let i = 0; i < len; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeType });
}
