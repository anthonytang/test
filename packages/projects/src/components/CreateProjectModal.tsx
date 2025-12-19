import { useState, useEffect } from "react";
import { ProjectMetadata } from "@studio/core";
import { useAuth } from "@studio/auth";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, metadata: ProjectMetadata) => void;
}

export default function CreateProjectModal({
  isOpen,
  onClose,
  onSubmit,
}: CreateProjectModalProps) {
  // Mode toggle
  const [isConversationalMode, setIsConversationalMode] = useState(true);
  const [conversationalInput, setConversationalInput] = useState("");
  const [isProcessingConversational, setIsProcessingConversational] =
    useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [_selectedIntegration, setSelectedIntegration] = useState("local");

  // Metadata fields
  const [projectType, setProjectType] = useState<
    ProjectMetadata["project_type"] | ""
  >("");
  const [industryFocus, setIndustryFocus] = useState("");
  const [transactionSide, setTransactionSide] = useState<
    ProjectMetadata["transaction_side"] | ""
  >("");
  const [dealStage, setDealStage] = useState<
    ProjectMetadata["deal_stage"] | ""
  >("");

  // UI state
  const { getAccessToken, user } = useAuth();

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (name.trim() && description.trim()) {
      const metadata: ProjectMetadata = {
        description: description.trim(),
        is_active: true,
        project_type: projectType || "other",
        industry_focus: industryFocus || undefined,
        transaction_side: transactionSide || "neutral",
        deal_stage: dealStage || undefined,
      };
      onSubmit(name.trim(), metadata);
      resetForm();
      onClose();
    }
  };

  const handleConversationalSubmit = async () => {
    if (!conversationalInput.trim()) return;

    // Check if user is available
    if (!user) {
      console.warn("User not loaded yet");
      return;
    }

    try {
      setIsProcessingConversational(true);
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Authentication required");
      }

      // Call conversational API through Next.js API route (handles APIM in cloud)
      const response = await fetch(
        `/api/conversational/create-project`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            description: conversationalInput.trim(),
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to create project: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.data) {
        // Populate form fields with generated data
        const metadata = data.data.metadata;

        // Set all the form fields from the generated metadata
        setName(data.data.name);
        setDescription(metadata.description || "");
        setProjectType(metadata.project_type || "other");
        setIndustryFocus(metadata.industry_focus || "");
        setTransactionSide(metadata.transaction_side || "neutral");
        setDealStage(metadata.deal_stage || "prospecting");

        // Switch to form view for review
        setIsConversationalMode(false);

        // Clear the conversational input
        setConversationalInput("");
      }
    } catch (error) {
      console.error("Error creating project conversationally:", error);
      // Could add error notification here
    } finally {
      setIsProcessingConversational(false);
    }
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setSelectedIntegration("local");
    setProjectType("");
    setIndustryFocus("");
    setTransactionSide("");
    setDealStage("");
    setConversationalInput("");
    setIsConversationalMode(true);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Handle escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  if (!isOpen) return null;

  const projectTypeOptions = [
    { value: "M&A", label: "M&A" },
    { value: "capital_raise", label: "Capital Raise" },
    { value: "equity_research", label: "Equity Research" },
    { value: "investment_memo", label: "Investment Memo" },
    { value: "due_diligence", label: "Due Diligence" },
    { value: "portfolio_analysis", label: "Portfolio Analysis" },
    { value: "market_research", label: "Market Research" },
    { value: "other", label: "Other" },
  ];

  const transactionSideOptions = [
    { value: "buy_side", label: "Buy Side" },
    { value: "sell_side", label: "Sell Side" },
    { value: "advisor", label: "Advisor" },
    { value: "neutral", label: "Neutral" },
  ];

  const dealStageOptions = [
    { value: "prospecting", label: "Prospecting" },
    { value: "initial_review", label: "Initial Review" },
    { value: "due_diligence", label: "Due Diligence" },
    { value: "negotiation", label: "Negotiation" },
    { value: "closing", label: "Closing" },
    { value: "post_merger", label: "Post-Merger" },
    { value: "monitoring", label: "Monitoring" },
  ];

  const industryOptions = [
    "Technology",
    "Healthcare",
    "Finance",
    "Real Estate",
    "Energy",
    "Consumer Goods",
    "Industrial",
    "Telecom",
    "Materials",
    "Utilities",
  ];

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-sm transform transition-all max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsConversationalMode(!isConversationalMode)}
                  className="text-sm font-medium text-accent-600 hover:text-accent-700 transition-colors flex items-center gap-2 px-3 py-1.5 rounded-md border border-accent-200 hover:border-accent-300 hover:bg-accent-50"
                >
                  {isConversationalMode ? (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                      Create manually
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                      Use AI assistant
                    </>
                  )}
                </button>
              </div>
            </div>
            <button
              onClick={handleClose}
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
          {isConversationalMode ? (
            // Conversational Mode
            <div className="p-6 flex flex-col min-h-[400px]">
              <div
                className="flex-1 flex flex-col justify-center space-y-4"
                style={{ paddingBottom: "10%" }}
              >
                <div className="text-center">
                  <h3 className="text-2xl font-light text-gray-800">
                    What type of project would you like to create?
                  </h3>
                </div>

                <div className="relative">
                  <textarea
                    value={conversationalInput}
                    onChange={(e) => {
                      setConversationalInput(e.target.value);
                      // Auto-resize textarea
                      e.target.style.height = "auto";
                      e.target.style.height =
                        Math.min(e.target.scrollHeight, 200) + "px";
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleConversationalSubmit();
                      }
                    }}
                    className="w-full px-5 py-4 pr-14 text-lg border border-gray-300 rounded-xl focus:outline-none focus:border-accent resize-none shadow-sm overflow-hidden"
                    placeholder="Description"
                    rows={1}
                    style={{ minHeight: "56px" }}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleConversationalSubmit}
                    disabled={
                      !conversationalInput.trim() || isProcessingConversational
                    }
                    className="absolute bottom-[18px] right-3 p-2 rounded-lg bg-accent text-white disabled:bg-gray-200 disabled:text-gray-400 transition-all hover:bg-accent-600 disabled:cursor-not-allowed"
                    title="Send"
                  >
                    {isProcessingConversational ? (
                      <svg
                        className="animate-spin h-5 w-5"
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
                          d="M5 10l7-7m0 0l7 7m-7-7v18"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // Form Mode - Single continuous scrollable form
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Basic Information */}
              <div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Project Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-accent"
                      placeholder="Name"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-accent resize-none"
                      placeholder="Description"
                      rows={3}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Project Type & Details */}
              <div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Project Type
                    </label>
                    <select
                      value={projectType}
                      onChange={(e) =>
                        setProjectType(
                          e.target.value as ProjectMetadata["project_type"]
                        )
                      }
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-accent bg-white appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg%20xmlns%3d%22http%3a%2f%2fwww.w3.org%2f2000%2fsvg%22%20viewBox%3d%220%200%2024%2024%22%20fill%3d%22none%22%20stroke%3d%22%23999%22%20stroke-width%3d%222%22%3e%3cpath%20d%3d%22M6%209l6%206%206-6%22/%3e%3c/svg%3e')] bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat pr-10"
                    >
                      <option value="">Select type</option>
                      {projectTypeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Transaction Side
                      </label>
                      <select
                        value={transactionSide}
                        onChange={(e) =>
                          setTransactionSide(
                            e.target
                              .value as ProjectMetadata["transaction_side"]
                          )
                        }
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-accent bg-white appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg%20xmlns%3d%22http%3a%2f%2fwww.w3.org%2f2000%2fsvg%22%20viewBox%3d%220%200%2024%2024%22%20fill%3d%22none%22%20stroke%3d%22%23999%22%20stroke-width%3d%222%22%3e%3cpath%20d%3d%22M6%209l6%206%206-6%22/%3e%3c/svg%3e')] bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat pr-10"
                      >
                        <option value="">Select side</option>
                        {transactionSideOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Deal Stage
                      </label>
                      <select
                        value={dealStage}
                        onChange={(e) =>
                          setDealStage(
                            e.target.value as ProjectMetadata["deal_stage"]
                          )
                        }
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-accent bg-white appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg%20xmlns%3d%22http%3a%2f%2fwww.w3.org%2f2000%2fsvg%22%20viewBox%3d%220%200%2024%2024%22%20fill%3d%22none%22%20stroke%3d%22%23999%22%20stroke-width%3d%222%22%3e%3cpath%20d%3d%22M6%209l6%206%206-6%22/%3e%3c/svg%3e')] bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat pr-10"
                      >
                        <option value="">Select stage</option>
                        {dealStageOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Industry Focus
                    </label>
                    <select
                      value={industryFocus}
                      onChange={(e) => setIndustryFocus(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-accent bg-white appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg%20xmlns%3d%22http%3a%2f%2fwww.w3.org%2f2000%2fsvg%22%20viewBox%3d%220%200%2024%2024%22%20fill%3d%22none%22%20stroke%3d%22%23999%22%20stroke-width%3d%222%22%3e%3cpath%20d%3d%22M6%209l6%206%206-6%22/%3e%3c/svg%3e')] bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat pr-10"
                    >
                      <option value="">Select industry</option>
                      {industryOptions.map((industry) => (
                        <option key={industry} value={industry}>
                          {industry}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!name.trim() || !description.trim()}
                  className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create Project
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
