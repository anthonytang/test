import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock html2canvas
vi.mock('html2canvas', () => ({
  default: vi.fn().mockResolvedValue({
    toDataURL: vi.fn(() => 'data:image/png;base64,test'),
  }),
}));

// Mock react-markdown
vi.mock('react-markdown', () => ({
  default: vi.fn(({ children }) => children),
}));

