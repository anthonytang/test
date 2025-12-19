import { describe, it, expect, vi, beforeEach } from "vitest";
import { EnhancementAPI } from "../../clients/enhancement-api";
import { BackendClient } from "../backend-client";

// Mock BackendClient
vi.mock("../backend-client", () => ({
  BackendClient: {
    fetch: vi.fn(),
  },
}));

describe("EnhancementAPI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("enhanceDescription", () => {
    it("should call BackendClient with correct endpoint and payload", async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          original_description: "Original",
          enhanced_description: "Enhanced",
          metadata: { user_id: "user-123", timestamp: 1234567890 },
        }),
      };

      vi.mocked(BackendClient.fetch).mockResolvedValue(mockResponse as any);

      await EnhancementAPI.enhanceDescription(
        "Test description",
        "test-token",
        "Test Project"
      );

      expect(BackendClient.fetch).toHaveBeenCalledWith("/enhance-description", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        token: "test-token",
        body: JSON.stringify({
          project_description: "Test description",
          project_title: "Test Project",
        }),
      });
    });

    it("should return enhanced description response", async () => {
      const expectedResponse = {
        success: true,
        original_description: "Original",
        enhanced_description: "Enhanced",
        metadata: { user_id: "user-123", timestamp: 1234567890 },
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(expectedResponse),
      };

      vi.mocked(BackendClient.fetch).mockResolvedValue(mockResponse as any);

      const result = await EnhancementAPI.enhanceDescription(
        "Test description",
        "test-token"
      );

      expect(result).toEqual(expectedResponse);
    });

    it("should throw error when response is not ok", async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: vi.fn().mockResolvedValue({ detail: "Invalid description" }),
      };

      vi.mocked(BackendClient.fetch).mockResolvedValue(mockResponse as any);

      await expect(
        EnhancementAPI.enhanceDescription("", "test-token")
      ).rejects.toThrow("Invalid description");
    });

    it("should handle json parse error and throw generic error", async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: vi.fn().mockRejectedValue(new Error("Parse error")),
      };

      vi.mocked(BackendClient.fetch).mockResolvedValue(mockResponse as any);

      await expect(
        EnhancementAPI.enhanceDescription("Test", "test-token")
      ).rejects.toThrow("Unknown error");
    });
  });

  describe("enhanceFieldDescription", () => {
    it("should call BackendClient with correct parameters", async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          original_field_description: "Original",
          enhanced_field_description: "Enhanced",
          metadata: { user_id: "user-123", timestamp: 1234567890 },
        }),
      };

      vi.mocked(BackendClient.fetch).mockResolvedValue(mockResponse as any);

      await EnhancementAPI.enhanceFieldDescription(
        "Field description",
        "Field Name",
        "text",
        "Make it better",
        "test-token"
      );

      expect(BackendClient.fetch).toHaveBeenCalledWith(
        "/enhance-field-description",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          token: "test-token",
          body: JSON.stringify({
            field_description: "Field description",
            field_name: "Field Name",
            field_type: "text",
            user_message: "Make it better",
          }),
        }
      );
    });

    it("should throw error on failure", async () => {
      const mockResponse = {
        ok: false,
        status: 403,
        statusText: "Forbidden",
        json: vi.fn().mockResolvedValue({ detail: "Access denied" }),
      };

      vi.mocked(BackendClient.fetch).mockResolvedValue(mockResponse as any);

      await expect(
        EnhancementAPI.enhanceFieldDescription(
          "Field",
          "Name",
          "text",
          "Message",
          "invalid-token"
        )
      ).rejects.toThrow("Access denied");
    });
  });

  describe("generateTemplate", () => {
    it("should call BackendClient with description and optional project context", async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          template_data: {
            template: {
              name: "Generated Template",
              metadata: {
                description: "Test",
                template_type: "analysis",
                department: "research",
                tags: ["ai", "test"],
              },
            },
            fields: [],
          },
          metadata: {
            user_id: "user-123",
            project_name: "Test Project",
            timestamp: 1234567890,
          },
        }),
      };

      vi.mocked(BackendClient.fetch).mockResolvedValue(mockResponse as any);

      await EnhancementAPI.generateTemplate(
        "I want a template for financial analysis",
        "test-token",
        "Test Project",
        "Project description",
        { custom: "metadata" }
      );

      expect(BackendClient.fetch).toHaveBeenCalledWith("/generate-template", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        token: "test-token",
        body: JSON.stringify({
          description: "I want a template for financial analysis",
          project_name: "Test Project",
          project_description: "Project description",
          project_metadata: { custom: "metadata" },
        }),
      });
    });

    it("should omit optional fields when not provided", async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      };

      vi.mocked(BackendClient.fetch).mockResolvedValue(mockResponse as any);

      await EnhancementAPI.generateTemplate(
        "I want a template for analysis",
        "token"
      );

      const callArgs = vi.mocked(BackendClient.fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body).toEqual({
        description: "I want a template for analysis",
      });
      expect(body).not.toHaveProperty("project_name");
      expect(body).not.toHaveProperty("project_description");
      expect(body).not.toHaveProperty("project_metadata");
    });
  });

  describe("createProjectConversational", () => {
    it("should call BackendClient with description", async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          project: {
            name: "New Project",
            metadata: {},
          },
          metadata: {
            user_id: "user-123",
            timestamp: 1234567890,
          },
        }),
      };

      vi.mocked(BackendClient.fetch).mockResolvedValue(mockResponse as any);

      await EnhancementAPI.createProjectConversational(
        "Create a new analysis project",
        "test-token"
      );

      expect(BackendClient.fetch).toHaveBeenCalledWith(
        "/conversational/create-project",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          token: "test-token",
          body: JSON.stringify({
            description: "Create a new analysis project",
          }),
        }
      );
    });

    it("should handle errors properly", async () => {
      const mockResponse = {
        ok: false,
        status: 422,
        statusText: "Unprocessable Entity",
        json: vi.fn().mockResolvedValue({
          detail: "Invalid project description",
        }),
      };

      vi.mocked(BackendClient.fetch).mockResolvedValue(mockResponse as any);

      await expect(
        EnhancementAPI.createProjectConversational("", "token")
      ).rejects.toThrow("Invalid project description");
    });
  });
});
