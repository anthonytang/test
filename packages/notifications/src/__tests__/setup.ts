import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock window.location.reload
Object.defineProperty(window, 'location', {
  value: {
    reload: vi.fn(),
  },
  writable: true,
});

