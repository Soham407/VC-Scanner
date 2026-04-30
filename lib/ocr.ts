import TextRecognition from '@react-native-ml-kit/text-recognition';

const MIN_READABLE_TEXT_LENGTH = 20;

export class BlurryImageError extends Error {
  constructor(message = 'Image too blurry, retake') {
    super(message);
    this.name = 'BlurryImageError';
  }
}

export async function extractText(uri: string): Promise<string> {
  const result = await TextRecognition.recognize(uri);
  const trimmedText = result.text.trim();

  if (trimmedText.length < MIN_READABLE_TEXT_LENGTH) {
    throw new BlurryImageError();
  }

  return trimmedText;
}
