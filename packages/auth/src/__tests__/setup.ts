import { vi } from "vitest";

// Mock MSAL
vi.mock("@azure/msal-browser", () => {
  const mockInstance = {
    initialize: vi.fn().mockResolvedValue(undefined),
    getAllAccounts: vi.fn().mockReturnValue([]),
    acquireTokenSilent: vi.fn(),
    acquireTokenPopup: vi.fn(),
    loginRedirect: vi.fn(),
    loginPopup: vi.fn(),
    logoutPopup: vi.fn(),
  };

  return {
    PublicClientApplication: vi.fn(() => mockInstance),
    LogLevel: {
      Error: 0,
      Warning: 1,
      Info: 2,
      Verbose: 3,
    },
    InteractionRequiredAuthError: class extends Error {
      constructor(message?: string) {
        super(message);
        this.name = "InteractionRequiredAuthError";
      }
    },
  };
});

vi.mock("@azure/msal-react", () => ({
  MsalProvider: ({ children }: { children: React.ReactNode }) => children,
  AuthenticatedTemplate: ({ children }: { children: React.ReactNode }) =>
    children,
  UnauthenticatedTemplate: () => null,
  useMsal: vi.fn(),
}));

// Mock Next.js router
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));
