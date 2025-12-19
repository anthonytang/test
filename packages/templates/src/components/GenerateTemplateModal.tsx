import { useState, useEffect } from "react";
import { EnhancementAPI } from "@studio/api";
import { useAuth } from "@studio/auth";

interface GenerateTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (templateData: any) => Promise<void> | void;
  projectName: string;
  projectDescription: string;
  projectMetadata: Record<string, any>;
}

export default function GenerateTemplateModal({
  isOpen,
  onClose,
  onGenerate,
  projectName,
  projectDescription,
  projectMetadata,
}: GenerateTemplateModalProps) {
  const [userContext, setUserContext] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const { getAccessToken } = useAuth();

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen && !isGenerating) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscKey);
      return () => {
        document.removeEventListener("keydown", handleEscKey);
      };
    }
    return undefined;
  }, [isOpen, onClose, isGenerating]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userContext.trim()) return;

    try {
      setIsGenerating(true);
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Authentication required");
      }

      const response = await EnhancementAPI.generateTemplate(
        userContext.trim(),
        token,
        projectName,
        projectDescription,
        projectMetadata
      );

      if (response.success) {
        // Call onGenerate and wait for it to complete before closing
        // onGenerate should be async and handle all the template creation
        await onGenerate(response.data);
        setUserContext("");
        onClose();
      }
    } catch (error) {
      console.error("Error generating template:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClose = () => {
    if (!isGenerating) {
      setUserContext("");
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-sm transform transition-all max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              {/* Empty div to maintain layout consistency */}
            </div>
            <button
              onClick={handleClose}
              disabled={isGenerating}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-50 ml-3"
              title="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 flex flex-col min-h-[400px]">
            <div
              className="flex-1 flex flex-col justify-center space-y-4"
              style={{ paddingBottom: "10%" }}
            >
              <div className="text-center">
                <h3 className="text-2xl font-light text-gray-800">
                  What type of template would you like to create?
                </h3>
              </div>

              <div className="relative">
                <textarea
                  value={userContext}
                  onChange={(e) => {
                    setUserContext(e.target.value);
                    // Auto-resize textarea
                    e.target.style.height = "auto";
                    e.target.style.height =
                      Math.min(e.target.scrollHeight, 200) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  className="w-full px-5 py-4 pr-14 text-lg border border-gray-300 rounded-xl focus:outline-none focus:border-accent resize-none shadow-sm overflow-hidden"
                  placeholder="Description"
                  rows={1}
                  style={{ minHeight: "56px" }}
                  disabled={isGenerating}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={isGenerating || !userContext.trim()}
                  className="absolute bottom-[18px] right-3 p-2 rounded-lg bg-accent text-white disabled:bg-gray-200 disabled:text-gray-400 transition-all hover:bg-accent-600 disabled:cursor-not-allowed"
                  title="Generate template"
                >
                  {isGenerating ? (
                    <svg
                      className="animate-spin h-5 w-5 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  ) : (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M14 5l7 7m0 0l-7 7m7-7H3"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
