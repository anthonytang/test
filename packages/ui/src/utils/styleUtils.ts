/**
 * Get color classes for score indicators based on score value and selection state
 */
export const getScoreColorClasses = (
  score: number | undefined | null,
  isSelected: boolean = false
): string => {
  if (score === undefined || score === null) {
    return isSelected
      ? "bg-score-none-hover text-score-none hover:bg-score-none-selected"
      : "bg-score-none text-score-none hover:bg-score-none-hover";
  }

  if (score >= 0.5) {
    return isSelected
      ? "bg-score-high-hover text-score-high hover:bg-score-high-selected"
      : "bg-score-high text-score-high hover:bg-score-high-hover";
  }

  if (score >= 0.25) {
    return isSelected
      ? "bg-score-medium-hover text-score-medium hover:bg-score-medium-selected"
      : "bg-score-medium text-score-medium hover:bg-score-medium-hover";
  }

  return isSelected
    ? "bg-score-low-hover text-score-low hover:bg-score-low-selected"
    : "bg-score-low text-score-low hover:bg-score-low-hover";
};

/**
 * Get color classes for tag badges based on score value and selection state
 */
export const getTagColorClasses = (
  score: number | undefined | null,
  isSelected: boolean = false
): string => {
  if (score === undefined || score === null) {
    return isSelected
      ? "bg-score-none-hover text-score-none hover:bg-score-none-selected"
      : "bg-score-none text-score-none hover:bg-score-none-hover";
  }

  if (score >= 0.5) {
    return isSelected
      ? "bg-score-high-hover text-score-high hover:bg-score-high-selected"
      : "bg-score-high text-score-high hover:bg-score-high-hover";
  }

  if (score >= 0.25) {
    return isSelected
      ? "bg-score-medium-hover text-score-medium hover:bg-score-medium-selected"
      : "bg-score-medium text-score-medium hover:bg-score-medium-hover";
  }

  return isSelected
    ? "bg-score-low-hover text-score-low hover:bg-score-low-selected"
    : "bg-score-low text-score-low hover:bg-score-low-hover";
};
