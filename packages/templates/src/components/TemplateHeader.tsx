"use client";

import { useRouter } from "next/navigation";

interface TemplateHeaderProps {
  templateName: string;
  templateMetadata?: {
    description: string;
    template_type?: string;
    department?: string;
    tags?: string[];
    [key: string]: any;
  };
  isEditingName: boolean;
  setIsEditingName: React.Dispatch<React.SetStateAction<boolean>>;
  editingName: string;
  setEditingName: React.Dispatch<React.SetStateAction<string>>;
  handleUpdateTemplate: (updates: { name: string }) => Promise<void>;
  projectId?: string;
  projectName?: string;
}

export const TemplateHeader: React.FC<TemplateHeaderProps> = ({
  templateName,
  // templateMetadata,
  // isEditingName,
  // setIsEditingName,
  // editingName,
  // setEditingName,
  // handleUpdateTemplate,
  projectId,
  projectName,
}) => {
  const router = useRouter();

  return (
    <div className="p-4 border-b border-gray-300 bg-gradient-to-r from-gray-50 via-white to-gray-50 shadow-sm">
      <div className="relative max-w-4xl mx-auto">
        <div className="absolute -left-20 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {/* Placeholder to match edit button alignment */}
          <div className="p-1.5">
            <div className="h-4 w-4"></div>
          </div>
          <button
            onClick={() =>
              router.push(projectId ? `/projects/${projectId}` : "/dashboard")
            }
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded hover:bg-gray-100 transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        </div>

        {/* Logo and Breadcrumbs */}
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center justify-center w-8 h-8 bg-accent rounded-lg shadow-sm">
            <svg
              className="w-4 h-4 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <span className="text-lg font-bold text-accent">Studio</span>

          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 ml-4">
            <span className="text-gray-400">/</span>
            <button
              onClick={() => router.push("/dashboard")}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Dashboard
            </button>
            {projectId && projectName && (
              <>
                <span className="text-gray-400">/</span>
                <button
                  onClick={() => router.push(`/projects/${projectId}`)}
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {projectName}
                </button>
              </>
            )}
            <span className="text-gray-400">/</span>
            <span className="text-sm text-gray-900 font-medium">
              {templateName}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
