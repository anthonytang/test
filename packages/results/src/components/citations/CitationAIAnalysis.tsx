"use client";

import { useState } from "react";
import { analyzeCitation } from "@studio/api";
import {
  SparklesIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from "@heroicons/react/24/outline";

interface CitationAIAnalysisProps {
  fieldName: string;
  fieldDescription: string;
  projectDescription: string;
  citedText: string;
  aiResponse: string;
  currentScores: Record<string, number>;
  onAnalysisComplete?: (analysis: any) => void;
}

interface AnalysisResult {
  enhanced_scores: Record<string, number>;
  score_adjustments: Record<string, number>;
  analysis_insights: Array<{
    category: string;
    insight: string;
    impact: string;
    confidence: string;
  }>;
  quality_assessment: {
    strengths: string[];
    weaknesses: string[];
    red_flags: string[];
    recommendations: string[];
  };
  field_specific_analysis: {
    relevance_to_field: string;
    evidence_sufficiency: string;
    temporal_relevance: string;
    data_quality: string;
  };
  summary: string;
}

export const CitationAIAnalysis: React.FC<CitationAIAnalysisProps> = ({
  fieldName,
  fieldDescription,
  projectDescription,
  citedText,
  aiResponse,
  currentScores,
  onAnalysisComplete,
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleAnalysis = async () => {
    setIsAnalyzing(true);
    setError(null);

    try {
      const result = await analyzeCitation(
        fieldName,
        fieldDescription,
        projectDescription,
        citedText,
        aiResponse,
        currentScores
      );

      if (result.success && result.citation_analysis) {
        setAnalysisResult(result.citation_analysis);
        onAnalysisComplete?.(result.citation_analysis);
      } else {
        throw new Error("Invalid response from citation analysis");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      console.error("Citation analysis error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getScoreChangeIcon = (change: number) => {
    if (change > 0) {
      return <ArrowUpIcon className="w-4 h-4 text-green-600" />;
    } else if (change < 0) {
      return <ArrowDownIcon className="w-4 h-4 text-red-600" />;
    }
    return null;
  };

  const getScoreChangeColor = (change: number) => {
    if (change > 0) return "text-green-600";
    if (change < 0) return "text-red-600";
    return "text-gray-600";
  };

  const getQualityColor = (quality: string) => {
    switch (quality.toLowerCase()) {
      case "high":
        return "text-green-600";
      case "medium":
        return "text-yellow-600";
      case "low":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  if (analysisResult) {
    return (
      <div className="border border-blue-200 rounded-lg bg-blue-50/50 p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <SparklesIcon className="w-5 h-5 text-blue-600" />
            <h4 className="font-semibold text-blue-900">
              AI Analysis Complete
            </h4>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            {isExpanded ? "Collapse" : "Expand"}
          </button>
        </div>

        {/* Summary */}
        <div className="mb-3">
          <p className="text-sm text-blue-800">{analysisResult.summary}</p>
        </div>

        {/* Enhanced Scores */}
        <div className="mb-3">
          <h5 className="font-medium text-blue-900 mb-2">Enhanced Scores</h5>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {Object.entries(analysisResult.enhanced_scores).map(
              ([key, value]) => {
                const originalScore =
                  currentScores[key.replace("_score", "")] || 0;
                const change = value - originalScore * 100;
                const displayKey = key
                  .replace("_", " ")
                  .replace(/\b\w/g, (l) => l.toUpperCase());

                return (
                  <div key={key} className="flex justify-between items-center">
                    <span className="text-blue-700">{displayKey}:</span>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold">{value.toFixed(1)}%</span>
                      {getScoreChangeIcon(change)}
                      <span
                        className={`text-xs ${getScoreChangeColor(change)}`}
                      >
                        {change > 0
                          ? `+${change.toFixed(1)}`
                          : change.toFixed(1)}
                      </span>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>

        {/* Key Insights */}
        <div className="mb-3">
          <h5 className="font-medium text-blue-900 mb-2">Key Insights</h5>
          <div className="space-y-2">
            {analysisResult.analysis_insights
              .slice(0, 3)
              .map((insight, idx) => (
                <div key={idx} className="flex items-start gap-2 text-sm">
                  <div
                    className={`w-2 h-2 rounded-full mt-2 ${
                      insight.confidence === "high"
                        ? "bg-green-500"
                        : insight.confidence === "medium"
                        ? "bg-yellow-500"
                        : "bg-red-500"
                    }`}
                  />
                  <div>
                    <span className="font-medium text-blue-800">
                      {insight.insight}
                    </span>
                    <span className="text-blue-600 ml-2">
                      ({insight.impact})
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Quality Assessment */}
        {isExpanded && (
          <div className="space-y-3 pt-3 border-t border-blue-200">
            {/* Strengths */}
            {analysisResult.quality_assessment.strengths.length > 0 && (
              <div>
                <h6 className="font-medium text-blue-900 mb-1 flex items-center gap-1">
                  <CheckCircleIcon className="w-4 h-4 text-green-600" />
                  Strengths
                </h6>
                <ul className="text-sm text-blue-700 space-y-1">
                  {analysisResult.quality_assessment.strengths.map(
                    (strength, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-green-600">•</span>
                        {strength}
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}

            {/* Weaknesses */}
            {analysisResult.quality_assessment.weaknesses.length > 0 && (
              <div>
                <h6 className="font-medium text-blue-900 mb-1 flex items-center gap-1">
                  <ExclamationTriangleIcon className="w-4 h-4 text-yellow-600" />
                  Areas for Improvement
                </h6>
                <ul className="text-sm text-blue-700 space-y-1">
                  {analysisResult.quality_assessment.weaknesses.map(
                    (weakness, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-yellow-600">•</span>
                        {weakness}
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}

            {/* Red Flags */}
            {analysisResult.quality_assessment.red_flags.length > 0 && (
              <div>
                <h6 className="font-medium text-blue-900 mb-1 flex items-center gap-1">
                  <XCircleIcon className="w-4 h-4 text-red-600" />
                  Red Flags
                </h6>
                <ul className="text-sm text-red-700 space-y-1">
                  {analysisResult.quality_assessment.red_flags.map(
                    (flag, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-red-600">•</span>
                        {flag}
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}

            {/* Section-Specific Analysis */}
            <div>
              <h6 className="font-medium text-blue-900 mb-2">
                Section-Specific Analysis
              </h6>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-blue-700">Relevance:</span>
                  <span
                    className={`ml-2 font-medium ${getQualityColor(
                      analysisResult.field_specific_analysis.relevance_to_field
                    )}`}
                  >
                    {analysisResult.field_specific_analysis.relevance_to_field}
                  </span>
                </div>
                <div>
                  <span className="text-blue-700">Evidence:</span>
                  <span
                    className={`ml-2 font-medium ${getQualityColor(
                      analysisResult.field_specific_analysis
                        .evidence_sufficiency
                    )}`}
                  >
                    {
                      analysisResult.field_specific_analysis
                        .evidence_sufficiency
                    }
                  </span>
                </div>
                <div>
                  <span className="text-blue-700">Temporal:</span>
                  <span
                    className={`ml-2 font-medium ${getQualityColor(
                      analysisResult.field_specific_analysis.temporal_relevance
                    )}`}
                  >
                    {analysisResult.field_specific_analysis.temporal_relevance}
                  </span>
                </div>
                <div>
                  <span className="text-blue-700">Quality:</span>
                  <span
                    className={`ml-2 font-medium ${getQualityColor(
                      analysisResult.field_specific_analysis.data_quality
                    )}`}
                  >
                    {analysisResult.field_specific_analysis.data_quality}
                  </span>
                </div>
              </div>
            </div>

            {/* Recommendations */}
            {analysisResult.quality_assessment.recommendations.length > 0 && (
              <div>
                <h6 className="font-medium text-blue-900 mb-1">
                  Recommendations
                </h6>
                <ul className="text-sm text-blue-700 space-y-1">
                  {analysisResult.quality_assessment.recommendations.map(
                    (rec, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-blue-600">•</span>
                        {rec}
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-200 rounded-lg bg-red-50/50 p-3">
        <div className="flex items-center gap-2 mb-2">
          <XCircleIcon className="w-5 h-5 text-red-600" />
          <h4 className="font-semibold text-red-900">Analysis Failed</h4>
        </div>
        <p className="text-sm text-red-700 mb-2">{error}</p>
        <button
          onClick={handleAnalysis}
          className="text-sm text-red-600 hover:text-red-800 underline"
        >
          Retry Analysis
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleAnalysis}
      disabled={isAnalyzing}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        isAnalyzing
          ? "bg-blue-100 text-blue-600 cursor-not-allowed"
          : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
      }`}
    >
      <SparklesIcon className="w-4 h-4" />
      {isAnalyzing ? "Analyzing..." : "AI Analysis"}
    </button>
  );
};
