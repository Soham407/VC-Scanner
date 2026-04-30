import { BlurryImageError, extractText } from '../lib/ocr';

const mockRecognize = jest.fn();

jest.mock(
  '@react-native-ml-kit/text-recognition',
  () => ({
    __esModule: true,
    default: {
      recognize: (...args: unknown[]) => mockRecognize(...args)
    }
  }),
  { virtual: true }
);

describe('extractText', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns trimmed OCR text from ML Kit', async () => {
    mockRecognize.mockResolvedValue({
      text: '  John Doe\nAcme Corp\nSales Manager  '
    });

    await expect(extractText('file:///tmp/card.jpg')).resolves.toBe('John Doe\nAcme Corp\nSales Manager');
    expect(mockRecognize).toHaveBeenCalledWith('file:///tmp/card.jpg');
  });

  it('throws BlurryImageError when trimmed OCR text is shorter than 20 chars', async () => {
    mockRecognize.mockResolvedValue({
      text: '  too short  '
    });

    await expect(extractText('file:///tmp/blurry.jpg')).rejects.toBeInstanceOf(BlurryImageError);
  });
});
