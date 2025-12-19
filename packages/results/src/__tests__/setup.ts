import { vi } from 'vitest';

// Mock file-saver
vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}));

// Mock exceljs - will be properly mocked in individual test files

// Mock docx
vi.mock('docx', () => ({
  Document: vi.fn().mockImplementation(() => ({})),
  Packer: {
    toBlob: vi.fn().mockResolvedValue(new Blob()),
  },
  Paragraph: vi.fn(),
  TextRun: vi.fn(),
  Table: vi.fn(),
  TableRow: vi.fn(),
  TableCell: vi.fn(),
  ImageRun: vi.fn(),
  WidthType: {},
  HeadingLevel: {
    HEADING_1: 1,
    HEADING_2: 2,
    HEADING_3: 3,
    HEADING_4: 4,
    HEADING_5: 5,
    HEADING_6: 6,
  },
  AlignmentType: {},
  LevelFormat: {},
}));

// Mock html-to-image
vi.mock('html-to-image', () => ({
  toPng: vi.fn().mockResolvedValue('data:image/png;base64,test'),
}));

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

