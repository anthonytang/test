import { BackendClient } from "@studio/api";

export interface EnhanceDescriptionRequest {
  project_description: string;
  project_title?: string;
}

export interface EnhanceDescriptionResponse {
  success: boolean;
  original_description: string;
  enhanced_description: string;
  metadata: {
    user_id: string;
    timestamp: number;
  };
}

export interface EnhanceFieldDescriptionRequest {
  current_description: string;
  field_name: string;
  field_type: string;
  user_feedback: string;
}

export interface EnhanceFieldDescriptionResponse {
  success: boolean;
  data: {
    original_field_description: string;
    enhanced_field_description: string;
  };
  metadata: {
    user_id: string;
    timestamp: number;
  };
}

export interface TemplateGenerationRequest {
  description: string;
  project_name?: string;
  project_description?: string;
  project_metadata?: Record<string, any>;
}

export interface TemplateGenerationResponse {
  success: boolean;
  data: {
    template: {
      name: string;
      metadata: {
        description: string;
        template_type?: string;
        department?: string;
        tags?: string[];
      };
    };
    sections: Array<{
      name: string;
      description: string;
      type: "text" | "table" | "chart";
      sort_order: number;
    }>;
  };
  metadata: {
    user_id: string;
    timestamp: number;
  };
}

export interface ConversationalCreateRequest {
  description: string;
}

export interface ConversationalCreateResponse {
  success: boolean;
  data: {
    name: string;
    metadata: Record<string, any>;
  };
  metadata: {
    user_id: string;
    timestamp: number;
  };
}

// Check at runtime, not bundle time
function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * API client for enhancement features
 * Supports both browser (via Next.js API routes) and server-side (direct backend) calls
 */
export class EnhancementAPI {
  /**
   * Enhance a project description using AI
   */
  static async enhanceDescription(
    description: string,
    token: string,
    projectTitle?: string
  ): Promise<EnhanceDescriptionResponse> {
    const payload: EnhanceDescriptionRequest = {
      project_description: description,
      project_title: projectTitle || "",
    };

    let response: Response;

    if (isBrowser()) {
      // Browser → Next API route → APIM → FastAPI
      response = await fetch("/api/enhance-description", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    } else {
      // Server-side → BackendClient → FastAPI
      response = await BackendClient.fetch("/enhance-description", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        token,
        body: JSON.stringify(payload),
      });
    }

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ detail: "Unknown error" }));
      throw new Error(
        errorData.detail || `HTTP ${response.status}: ${response.statusText}`
      );
    }

    return response.json();
  }

  /**
   * Refine a field description using AI based on user feedback
   */
  static async enhanceFieldDescription(
    currentDescription: string,
    fieldName: string,
    fieldType: string,
    userFeedback: string,
    token: string
  ): Promise<EnhanceFieldDescriptionResponse> {
    const payload: EnhanceFieldDescriptionRequest = {
      current_description: currentDescription,
      field_name: fieldName,
      field_type: fieldType,
      user_feedback: userFeedback,
    };

    let response: Response;

    if (isBrowser()) {
      // Browser → Next API route → APIM → FastAPI
      response = await fetch("/api/enhance-field-description", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    } else {
      // Server-side → BackendClient → FastAPI
      response = await BackendClient.fetch("/enhance-field-description", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        token,
        body: JSON.stringify(payload),
      });
    }

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ detail: "Unknown error" }));
      throw new Error(
        errorData.detail || `HTTP ${response.status}: ${response.statusText}`
      );
    }

    return response.json();
  }

  /**
   * Generate a template based on user description with optional project context
   */
  static async generateTemplate(
    description: string,
    token: string,
    projectName?: string,
    projectDescription?: string,
    projectMetadata?: Record<string, any>
  ): Promise<TemplateGenerationResponse> {
    const payload: TemplateGenerationRequest = {
      description,
      ...(projectName && { project_name: projectName }),
      ...(projectDescription && { project_description: projectDescription }),
      ...(projectMetadata && { project_metadata: projectMetadata }),
    };

    let response: Response;

    if (isBrowser()) {
      response = await fetch("/api/generate-template", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    } else {
      response = await BackendClient.fetch("/generate-template", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        token,
        body: JSON.stringify(payload),
      });
    }

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ detail: "Unknown error" }));
      throw new Error(
        errorData.detail || `HTTP ${response.status}: ${response.statusText}`
      );
    }

    return response.json();
  }

  /**
   * Create a project from natural language description
   */
  static async createProjectConversational(
    description: string,
    token: string
  ): Promise<ConversationalCreateResponse> {
    const payload: ConversationalCreateRequest = {
      description,
    };

    let response: Response;

    if (isBrowser()) {
      response = await fetch("/api/conversational/create-project", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    } else {
      response = await BackendClient.fetch("/conversational/create-project", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        token,
        body: JSON.stringify(payload),
      });
    }

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ detail: "Unknown error" }));
      throw new Error(
        errorData.detail || `HTTP ${response.status}: ${response.statusText}`
      );
    }

    return response.json();
  }
}
