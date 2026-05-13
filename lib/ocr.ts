const MIN_READABLE_TEXT_LENGTH = 20;

type TextRecognitionModule = {
  default?: {
    recognize: (uri: string) => Promise<{ text: string }>;
  };
  recognize?: (uri: string) => Promise<{ text: string }>;
};

export class BlurryImageError extends Error {
  constructor(message = 'Image too blurry, retake') {
    super(message);
    this.name = 'BlurryImageError';
  }
}

function normalizeOcrLine(line: string): string | null {
  const normalized = line
    .replace(/[•·●■□◆◇★☆]/g, ' ')
    .replace(/[|]{2,}/g, ' ')
    .replace(/[_~`^]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return null;
  }

  const alphaNumericCount = (normalized.match(/[A-Za-z0-9]/g) ?? []).length;
  if (alphaNumericCount === 0) {
    return null;
  }

  const symbolCount = (normalized.match(/[^A-Za-z0-9\s@.+,&()/#:-]/g) ?? []).length;
  if (symbolCount > alphaNumericCount) {
    return null;
  }

  return normalized;
}

export function normalizeOcrText(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map(normalizeOcrLine)
    .filter((line): line is string => line !== null);

  const dedupedLines: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    dedupedLines.push(line);
  }

  return dedupedLines.join('\n').trim();
}

export async function extractText(uri: string): Promise<string> {
  const textRecognitionModule = require('@react-native-ml-kit/text-recognition') as TextRecognitionModule;
  const textRecognition = textRecognitionModule.default ?? textRecognitionModule;
  if (typeof textRecognition.recognize !== 'function') {
    throw new Error('On-device OCR is unavailable in this build');
  }

  const result = await textRecognition.recognize(uri);
  const trimmedText = normalizeOcrText(result.text);

  if (trimmedText.length < MIN_READABLE_TEXT_LENGTH) {
    throw new BlurryImageError();
  }

  return trimmedText;
}
