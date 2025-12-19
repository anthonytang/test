/**
 * Centralized color configuration for project types and template types.
 * All colors use Tailwind CSS classes for consistency across the app.
 */

interface ColorConfig {
  bg: string;
  text: string;
  bgClass: string;
  textClass: string;
}

const PROJECT_TYPE_COLORS: Record<string, ColorConfig> = {
  "M&A": {
    bg: "fuchsia-500",
    text: "white",
    bgClass: "bg-fuchsia-500",
    textClass: "text-white",
  },
  equity_research: {
    bg: "accent",
    text: "white",
    bgClass: "bg-accent",
    textClass: "text-white",
  },
  due_diligence: {
    bg: "violet-500",
    text: "white",
    bgClass: "bg-violet-500",
    textClass: "text-white",
  },
  capital_raise: {
    bg: "cyan-500",
    text: "white",
    bgClass: "bg-cyan-500",
    textClass: "text-white",
  },
  investment_memo: {
    bg: "indigo-500",
    text: "white",
    bgClass: "bg-indigo-500",
    textClass: "text-white",
  },
  portfolio_analysis: {
    bg: "purple-500",
    text: "white",
    bgClass: "bg-purple-500",
    textClass: "text-white",
  },
  market_research: {
    bg: "sky-500",
    text: "white",
    bgClass: "bg-sky-500",
    textClass: "text-white",
  },
  other: {
    bg: "teal-500",
    text: "white",
    bgClass: "bg-teal-500",
    textClass: "text-white",
  },
};

const TEMPLATE_TYPE_COLORS: Record<string, ColorConfig> = {
  financial: {
    bg: "indigo-500",
    text: "white",
    bgClass: "bg-indigo-500",
    textClass: "text-white",
  },
  operational: {
    bg: "accent",
    text: "white",
    bgClass: "bg-accent",
    textClass: "text-white",
  },
  legal: {
    bg: "violet-500",
    text: "white",
    bgClass: "bg-violet-500",
    textClass: "text-white",
  },
  technical: {
    bg: "cyan-500",
    text: "white",
    bgClass: "bg-cyan-500",
    textClass: "text-white",
  },
  market: {
    bg: "fuchsia-500",
    text: "white",
    bgClass: "bg-fuchsia-500",
    textClass: "text-white",
  },
  other: {
    bg: "purple-500",
    text: "white",
    bgClass: "bg-purple-500",
    textClass: "text-white",
  },
};

const DEFAULT_PROJECT_COLOR: ColorConfig = PROJECT_TYPE_COLORS.other!;
const DEFAULT_TEMPLATE_COLOR: ColorConfig = TEMPLATE_TYPE_COLORS.other!;

function getProjectTypeColor(projectType?: string): ColorConfig {
  if (!projectType) return DEFAULT_PROJECT_COLOR;
  const color = PROJECT_TYPE_COLORS[projectType];
  return color ?? DEFAULT_PROJECT_COLOR;
}

function getTemplateTypeColor(templateType?: string): ColorConfig {
  if (!templateType) return DEFAULT_TEMPLATE_COLOR;
  const color = TEMPLATE_TYPE_COLORS[templateType];
  return color ?? DEFAULT_TEMPLATE_COLOR;
}

/**
 * Get combined Tailwind classes for a project type
 */
export function getProjectTypeClasses(projectType?: string): string {
  const color = getProjectTypeColor(projectType);
  return `${color.bgClass} ${color.textClass}`;
}

/**
 * Get combined Tailwind classes for a template type
 */
export function getTemplateTypeClasses(templateType?: string): string {
  const color = getTemplateTypeColor(templateType);
  return `${color.bgClass} ${color.textClass}`;
}
