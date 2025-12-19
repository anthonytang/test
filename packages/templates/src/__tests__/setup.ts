import { vi } from "vitest";

// Mock Next.js router
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock @studio/api
vi.mock("@studio/api", () => ({
  azureApiClient: {
    getTemplatesForUser: vi.fn(),
    getTemplateWithFields: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    createField: vi.fn(),
    updateField: vi.fn(),
    deleteField: vi.fn(),
  },
}));

// Mock @studio/auth
vi.mock("@studio/auth", () => ({
  useAuth: vi.fn(() => ({
    user: {
      localAccountId: "user1",
      homeAccountId: "user1",
    },
  })),
  useAuthUser: vi.fn(() => ({
    getUserId: vi.fn(() => "user1"),
    getIdToken: vi.fn(() => Promise.resolve("token")),
  })),
}));

// Mock @studio/notifications
vi.mock("@studio/notifications", () => ({
  useNotifications: vi.fn(() => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showWarning: vi.fn(),
    showInfo: vi.fn(),
    showCompactSuccess: vi.fn(),
    showCompactError: vi.fn(),
    showCompactInfo: vi.fn(),
  })),
}));

// Mock @studio/results
vi.mock("@studio/results", () => ({
  ResultsDisplay: vi.fn(() => null),
}));
