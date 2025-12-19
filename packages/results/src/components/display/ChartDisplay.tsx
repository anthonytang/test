"use client";

import React, { useRef, useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { toPng } from "html-to-image";
import { ProcessedResults, Field } from "@studio/core";
import { TableDisplay } from "./TableDisplay";
import { useNotifications } from "@studio/notifications";
import { exportChartAsNativeExcel } from "@studio/api";

interface ChartDisplayProps {
  chartData: {
    rows: any[];
    suggested_chart_type?: string;
  };
  field: Field;
  fieldId: string;
  selectedSentence: { fieldId: string; line: string; tags: string[] } | null;
  setSelectedSentence: React.Dispatch<
    React.SetStateAction<{
      fieldId: string;
      line: string;
      tags: string[];
    } | null>
  >;
  setSelectedTag: React.Dispatch<
    React.SetStateAction<{
      fieldId: string;
      tag: string;
      lineNumbers: number[];
    } | null>
  >;
  results: ProcessedResults;
  onUpdateResultMetadata?: (metadata: any) => void;
  isEditing?: boolean;
}

const COLOR_SCHEMES = {
  default: [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
    "#84cc16",
  ],
  blue: [
    "#3b82f6",
    "#60a5fa",
    "#93c5fd",
    "#1e40af",
    "#2563eb",
    "#1d4ed8",
    "#1e3a8a",
    "#172554",
  ],
  green: [
    "#10b981",
    "#34d399",
    "#6ee7b7",
    "#059669",
    "#047857",
    "#065f46",
    "#064e3b",
    "#022c22",
  ],
  purple: [
    "#8b5cf6",
    "#a78bfa",
    "#c4b5fd",
    "#7c3aed",
    "#6d28d9",
    "#5b21b6",
    "#4c1d95",
    "#2e1065",
  ],
  warm: [
    "#ef4444",
    "#f59e0b",
    "#f97316",
    "#dc2626",
    "#ea580c",
    "#d97706",
    "#c2410c",
    "#92400e",
  ],
  cool: [
    "#06b6d4",
    "#0ea5e9",
    "#3b82f6",
    "#0891b2",
    "#0284c7",
    "#2563eb",
    "#0e7490",
    "#075985",
  ],
};

interface ChartConfig {
  type: "bar" | "line" | "pie" | "area";
  xAxis: string;
  yAxes: string[];
}

interface AdvancedSettings {
  chartHeight: number;
  chartWidth: string;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  xAxisHeight: number;
  xAxisFontSize: number;
  xAxisAngle: number;
  showXAxisGrid: boolean;
  yAxisWidth: number;
  yAxisFontSize: number;
  showYAxisGrid: boolean;
  showLegend: boolean;
  legendPosition: "top" | "bottom" | "left" | "right";
  showGridLines: boolean;
  showTooltip: boolean;
  containerPadding: number;
  colorScheme: "default" | "blue" | "green" | "purple" | "warm" | "cool";
}

// Default settings
const DEFAULT_ADVANCED_SETTINGS: AdvancedSettings = {
  chartHeight: 400,
  chartWidth: "100%",
  marginTop: 20,
  marginRight: 30,
  marginBottom: 20,
  marginLeft: 50,
  xAxisHeight: 80,
  xAxisFontSize: 11,
  xAxisAngle: -45,
  showXAxisGrid: true,
  yAxisWidth: 60,
  yAxisFontSize: 11,
  showYAxisGrid: true,
  showLegend: true,
  legendPosition: "bottom",
  showGridLines: true,
  showTooltip: true,
  containerPadding: 16,
  colorScheme: "default",
};

// Sanitize text to prevent XSS
const sanitizeText = (text: unknown): string => {
  if (typeof text !== "string") {
    return "";
  }

  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
};

// Generate safe file name
const generateSafeFileName = (fieldName: string, timestamp: number): string => {
  // Sanitize field name
  const sanitized = sanitizeText(fieldName);
  // Remove dangerous characters and limit length
  const safe = sanitized
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

  return safe || `chart-${timestamp}`;
};

// Validate chart type
const isValidChartType = (
  type: unknown
): type is "bar" | "line" | "pie" | "area" => {
  return type === "bar" || type === "line" || type === "pie" || type === "area";
};

// Validate color scheme
const isValidColorScheme = (
  scheme: unknown
): scheme is "default" | "blue" | "green" | "purple" | "warm" | "cool" => {
  return (
    scheme === "default" ||
    scheme === "blue" ||
    scheme === "green" ||
    scheme === "purple" ||
    scheme === "warm" ||
    scheme === "cool"
  );
};

// Validate chart config
const isValidChartConfig = (config: unknown): config is ChartConfig => {
  if (!config || typeof config !== "object") {
    return false;
  }

  const obj = config as any;

  if (!isValidChartType(obj.type)) {
    return false;
  }

  if (typeof obj.xAxis !== "string" || obj.xAxis.length === 0) {
    return false;
  }

  if (
    !Array.isArray(obj.yAxes) ||
    !obj.yAxes.every((y: unknown) => typeof y === "string")
  ) {
    return false;
  }

  return true;
};

// Validate numeric value
const safeParseNumber = (text: string): number | string => {
  if (typeof text !== "string") {
    return text;
  }

  const cleaned = text.replace(/[^0-9.-]/g, "");
  const num = parseFloat(cleaned);

  // Return number if valid, otherwise original text
  return isNaN(num) || !isFinite(num) ? text : num;
};

// Validate cell structure
const isValidChartCell = (cell: unknown): cell is { text: string } => {
  if (!cell || typeof cell !== "object") {
    return false;
  }

  const obj = cell as any;
  return typeof obj.text === "string";
};

// Validate chart row
const isValidChartRow = (
  row: unknown
): row is { cells: Array<{ text: string }> } => {
  if (!row || typeof row !== "object") {
    return false;
  }

  const obj = row as any;
  return Array.isArray(obj.cells) && obj.cells.every(isValidChartCell);
};

// Validate chart data
const isValidChartData = (
  data: unknown
): data is { rows: any[]; suggested_chart_type?: string } => {
  if (!data || typeof data !== "object") {
    return false;
  }

  const obj = data as any;

  if (!Array.isArray(obj.rows) || obj.rows.length < 2) {
    return false;
  }

  // All rows should be valid
  if (!obj.rows.every(isValidChartRow)) {
    return false;
  }

  // Optional chart type should be valid if present
  if (obj.suggested_chart_type && !isValidChartType(obj.suggested_chart_type)) {
    return false;
  }

  return true;
};

interface MemoizedChartProps {
  transformedData: any[];
  chartConfig: ChartConfig;
  advancedSettings: AdvancedSettings;
  headers: string[];
}

// Memoized chart component
const MemoizedChart = React.memo<MemoizedChartProps>(
  ({ transformedData, chartConfig, advancedSettings }) => {
    const colors =
      COLOR_SCHEMES[advancedSettings.colorScheme] || COLOR_SCHEMES.default;

    const commonProps = {
      data: transformedData,
      margin: {
        top: Math.max(0, Math.min(advancedSettings.marginTop, 100)),
        right: Math.max(0, Math.min(advancedSettings.marginRight, 100)),
        left: Math.max(0, Math.min(advancedSettings.marginLeft, 100)),
        bottom: Math.max(0, Math.min(advancedSettings.marginBottom, 100)),
      },
    };

    const renderChart = () => {
      switch (chartConfig.type) {
        case "bar":
          return (
            <BarChart {...commonProps}>
              {advancedSettings.showGridLines && (
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              )}
              <XAxis
                dataKey={chartConfig.xAxis}
                angle={advancedSettings.xAxisAngle}
                textAnchor="end"
                height={advancedSettings.xAxisHeight}
                tick={{ fontSize: advancedSettings.xAxisFontSize }}
              />
              <YAxis
                width={advancedSettings.yAxisWidth}
                tick={{ fontSize: advancedSettings.yAxisFontSize }}
              />
              {advancedSettings.showTooltip && <Tooltip />}
              {advancedSettings.showLegend && (
                <Legend wrapperStyle={{ paddingTop: "20px" }} />
              )}
              {chartConfig.yAxes.map((yAxis: string, idx: number) => (
                <Bar
                  key={yAxis}
                  dataKey={yAxis}
                  fill={colors[idx % colors.length]}
                  name={yAxis}
                />
              ))}
            </BarChart>
          );

        case "line":
          return (
            <LineChart {...commonProps}>
              {advancedSettings.showGridLines && (
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              )}
              <XAxis
                dataKey={chartConfig.xAxis}
                angle={advancedSettings.xAxisAngle}
                textAnchor="end"
                height={advancedSettings.xAxisHeight}
                tick={{ fontSize: advancedSettings.xAxisFontSize }}
              />
              <YAxis
                width={advancedSettings.yAxisWidth}
                tick={{ fontSize: advancedSettings.yAxisFontSize }}
              />
              {advancedSettings.showTooltip && <Tooltip />}
              {advancedSettings.showLegend && (
                <Legend wrapperStyle={{ paddingTop: "20px" }} />
              )}
              {chartConfig.yAxes.map((yAxis: string, idx: number) => (
                <Line
                  key={yAxis}
                  type="monotone"
                  dataKey={yAxis}
                  stroke={colors[idx % colors.length]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name={yAxis}
                />
              ))}
            </LineChart>
          );

        case "pie":
          const pieData = transformedData.map((item: any, idx: number) => ({
            name: item[chartConfig.xAxis] || "",
            value: chartConfig.yAxes[0] ? item[chartConfig.yAxes[0]] : 0,
            fill: colors[idx % colors.length],
          }));

          return (
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={true}
                label={(entry) => `${entry.name}: ${entry.value}`}
                outerRadius={120}
                dataKey="value"
              >
                {pieData.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              {advancedSettings.showTooltip && <Tooltip />}
              {advancedSettings.showLegend && <Legend />}
            </PieChart>
          );

        case "area":
          return (
            <AreaChart {...commonProps}>
              {advancedSettings.showGridLines && (
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              )}
              <XAxis
                dataKey={chartConfig.xAxis}
                angle={advancedSettings.xAxisAngle}
                textAnchor="end"
                height={advancedSettings.xAxisHeight}
                tick={{ fontSize: advancedSettings.xAxisFontSize }}
              />
              <YAxis
                width={advancedSettings.yAxisWidth}
                tick={{ fontSize: advancedSettings.yAxisFontSize }}
              />
              {advancedSettings.showTooltip && <Tooltip />}
              {advancedSettings.showLegend && (
                <Legend wrapperStyle={{ paddingTop: "20px" }} />
              )}
              {chartConfig.yAxes.map((yAxis: string, idx: number) => (
                <Area
                  key={yAxis}
                  type="monotone"
                  dataKey={yAxis}
                  stroke={colors[idx % colors.length]}
                  fill={colors[idx % colors.length]}
                  fillOpacity={0.6}
                  name={yAxis}
                />
              ))}
            </AreaChart>
          );

        default:
          return null;
      }
    };

    return (
      <ResponsiveContainer
        width={advancedSettings.chartWidth as any}
        height={advancedSettings.chartHeight}
      >
        {renderChart() || <div />}
      </ResponsiveContainer>
    );
  }
);

MemoizedChart.displayName = "MemoizedChart";

const ChartDisplayComponent: React.FC<ChartDisplayProps> = ({
  chartData,
  field,
  fieldId,
  selectedSentence,
  setSelectedSentence,
  setSelectedTag,
  results,
  onUpdateResultMetadata,
  isEditing,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const [downloadingPng, setDownloadingPng] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const { showError } = useNotifications();

  // Validate chartData and extract safely
  const { validatedChartData, isValid } = useMemo(() => {
    if (!isValidChartData(chartData)) {
      return { validatedChartData: null, isValid: false };
    }
    return { validatedChartData: chartData, isValid: true };
  }, [chartData]);

  // Extract headers from table (safely)
  const headers = useMemo(() => {
    if (!validatedChartData?.rows[0]) return [];

    return validatedChartData.rows[0].cells
      .filter(isValidChartCell)
      .map((c: { text: string }) => sanitizeText(c.text))
      .filter((text: string) => text.length > 0);
  }, [validatedChartData]);

  // Derive config from results.metadata (with validation)
  const chartConfig = useMemo(() => {
    if (
      results.metadata?.chartConfig &&
      isValidChartConfig(results.metadata.chartConfig)
    ) {
      // Cast to any to handle extra properties that may exist but aren't in interface
      const configData = results.metadata.chartConfig as any;
      const { advancedSettings, showTable, ...basicConfig } = configData;
      return basicConfig as ChartConfig;
    }

    const suggestedType = validatedChartData?.suggested_chart_type;
    const validType = isValidChartType(suggestedType) ? suggestedType : "bar";

    return {
      type: validType as ChartConfig["type"],
      xAxis: headers[0] || "",
      yAxes: headers.slice(1, 3),
    };
  }, [results.metadata?.chartConfig, validatedChartData, headers]);

  const advancedSettings = useMemo(() => {
    const settings = results.metadata?.chartConfig?.advancedSettings;

    // Validate color scheme
    if (settings && isValidColorScheme(settings.colorScheme)) {
      return settings;
    }

    return DEFAULT_ADVANCED_SETTINGS;
  }, [results.metadata?.chartConfig?.advancedSettings]);

  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showTable, setShowTable] = useState(false);

  // Transform table rows into chart data (with validation)
  const transformedData = useMemo(() => {
    if (!validatedChartData?.rows || validatedChartData.rows.length < 2) {
      return [];
    }

    const dataRows = validatedChartData.rows.slice(1);
    return dataRows
      .map((row) => {
        if (!isValidChartRow(row)) return null;

        const dataPoint: any = {};
        row.cells.forEach((cell, idx) => {
          if (!isValidChartCell(cell) || idx >= headers.length) return;

          const header = headers[idx];
          const value = safeParseNumber(cell.text);
          dataPoint[header] = value;
        });

        return dataPoint;
      })
      .filter(Boolean);
  }, [validatedChartData, headers]);

  const updateConfig = (updates: Partial<typeof chartConfig>) => {
    if (onUpdateResultMetadata) {
      const newConfig = { ...chartConfig, ...updates };
      if (isValidChartConfig(newConfig)) {
        onUpdateResultMetadata({
          ...results.metadata,
          chartConfig: {
            ...newConfig,
            advancedSettings,
          },
        });
      }
    }
  };

  const updateAdvancedSettings = (
    updates: Partial<typeof advancedSettings>
  ) => {
    if (onUpdateResultMetadata) {
      const newSettings = { ...advancedSettings, ...updates };

      // Validate color scheme if changed
      if (
        newSettings.colorScheme &&
        !isValidColorScheme(newSettings.colorScheme)
      ) {
        return;
      }

      onUpdateResultMetadata({
        ...results.metadata,
        chartConfig: {
          ...chartConfig,
          advancedSettings: newSettings,
        },
      });
    }
  };

  const downloadChart = async () => {
    if (!chartRef.current) return;
    setDownloadingPng(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));

      const dataUrl = await toPng(chartRef.current, {
        quality: 1.0,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        cacheBust: true,
      });

      // Generate safe file name
      const timestamp = Date.now();
      const fieldName = field?.name || "chart";
      const safeFileName = generateSafeFileName(fieldName, timestamp);
      const fileName = `${safeFileName}.png`;

      const link = document.createElement("a");
      link.download = fileName;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to download chart");
      showError("Download Failed", "Unable to download chart.");
    } finally {
      setDownloadingPng(false);
    }
  };

  const downloadChartAsExcel = async () => {
    setDownloadingExcel(true);
    try {
      // Validate fieldId and chart config before sending
      if (!fieldId || typeof fieldId !== "string") {
        throw new Error("Invalid field ID");
      }

      if (!isValidChartConfig(chartConfig)) {
        throw new Error("Invalid chart configuration");
      }

      const blob = await exportChartAsNativeExcel(
        fieldId,
        field?.name || "Chart",
        chartConfig.type,
        chartConfig,
        chartData,
        advancedSettings
      );

      // Generate safe file name
      const timestamp = Date.now();
      const fieldName = field?.name || "chart";
      const safeFileName = generateSafeFileName(fieldName, timestamp);
      const fileName = `${safeFileName}.xlsx`;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download chart as Excel");
      showError("Download Failed", "Unable to download chart as Excel.");
    } finally {
      setDownloadingExcel(false);
    }
  };

  if (isEditing || !isValid) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Chart */}
      <div className="relative">
        <div className="absolute -right-10 top-0 flex flex-col gap-1">
          <button
            onClick={downloadChart}
            disabled={downloadingPng}
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
            title="Download chart as PNG"
          >
            {downloadingPng ? (
              <svg
                className="animate-spin h-4 w-4"
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
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            )}
          </button>

          <button
            onClick={downloadChartAsExcel}
            disabled={downloadingExcel}
            className="p-1.5 rounded-md text-gray-500 hover:text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
            title="Download chart as Excel"
          >
            {downloadingExcel ? (
              <svg
                className="animate-spin h-4 w-4"
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
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            )}
          </button>
        </div>

        <div className="bg-white rounded-lg border border-gray-300 shadow-sm overflow-hidden">
          <div
            id={`chart-${fieldId}`}
            ref={chartRef}
            style={{ padding: `${advancedSettings.containerPadding}px`, backgroundColor: "#ffffff" }}
          >
            <MemoizedChart
              transformedData={transformedData}
              chartConfig={chartConfig}
              advancedSettings={advancedSettings}
              headers={headers}
            />
          </div>
        </div>
      </div>

      {/* Minimal Chart Settings */}
      <div className="flex items-center gap-3 text-sm">
        <button
          onClick={() => setShowTable(!showTable)}
          className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors flex items-center gap-1.5"
        >
          Table
          <svg
            className={`w-3.5 h-3.5 transition-transform ${
              showTable ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        <button
          onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
          className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors flex items-center gap-1.5"
        >
          Settings
          <svg
            className={`w-3.5 h-3.5 transition-transform ${
              showAdvancedSettings ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

      {/* Expandable Settings */}
      {showAdvancedSettings && (
        <div className="mt-3 p-4 bg-gray-100 border border-gray-300 rounded-lg shadow-sm space-y-3">
          {/* Top Row: Type, Colors, Display Options */}
          <div className="flex items-end gap-6">
            {/* Chart Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Type
              </label>
              <div className="relative">
                <select
                  value={chartConfig.type}
                  onChange={(e) => {
                    const type = e.target.value;
                    if (isValidChartType(type)) {
                      updateConfig({ type });
                    }
                  }}
                  className="pl-3 pr-8 py-1.5 text-sm border border-gray-300 rounded-md bg-white appearance-none cursor-pointer hover:border-gray-400 focus:outline-none focus:border-accent transition-colors"
                >
                  <option value="bar">Bar</option>
                  <option value="line">Line</option>
                  <option value="pie">Pie</option>
                  <option value="area">Area</option>
                </select>
                <svg
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>

            {/* Color Scheme */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Colors
              </label>
              <div className="relative">
                <select
                  value={advancedSettings.colorScheme}
                  onChange={(e) => {
                    const scheme = e.target.value;
                    if (isValidColorScheme(scheme)) {
                      updateAdvancedSettings({ colorScheme: scheme });
                    }
                  }}
                  className="pl-3 pr-8 py-1.5 text-sm border border-gray-300 rounded-md bg-white appearance-none cursor-pointer hover:border-gray-400 focus:outline-none focus:border-accent transition-colors"
                >
                  <option value="default">Default</option>
                  <option value="blue">Blue</option>
                  <option value="green">Green</option>
                  <option value="purple">Purple</option>
                  <option value="warm">Warm</option>
                  <option value="cool">Cool</option>
                </select>
                <svg
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>

            {/* Display Options */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Display
              </label>
              <div className="flex gap-2">
                <label
                  className={`px-3 py-1.5 text-sm rounded border transition-all cursor-pointer ${
                    advancedSettings.showGridLines
                      ? "bg-accent text-white border-accent"
                      : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={advancedSettings.showGridLines}
                    onChange={(e) =>
                      updateAdvancedSettings({
                        showGridLines: e.target.checked,
                      })
                    }
                    className="sr-only"
                  />
                  Grid
                </label>
                <label
                  className={`px-3 py-1.5 text-sm rounded border transition-all cursor-pointer ${
                    advancedSettings.showLegend
                      ? "bg-accent text-white border-accent"
                      : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={advancedSettings.showLegend}
                    onChange={(e) =>
                      updateAdvancedSettings({ showLegend: e.target.checked })
                    }
                    className="sr-only"
                  />
                  Legend
                </label>
                <label
                  className={`px-3 py-1.5 text-sm rounded border transition-all cursor-pointer ${
                    advancedSettings.showTooltip
                      ? "bg-accent text-white border-accent"
                      : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={advancedSettings.showTooltip}
                    onChange={(e) =>
                      updateAdvancedSettings({ showTooltip: e.target.checked })
                    }
                    className="sr-only"
                  />
                  Tooltip
                </label>
              </div>
            </div>
          </div>

          {/* Bottom Row: Data Series */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Series
            </label>
            <div className="flex flex-wrap gap-2">
              {headers.map((header: string) => (
                <label
                  key={header}
                  className={`px-3 py-1.5 text-sm rounded border transition-all cursor-pointer ${
                    chartConfig.yAxes.includes(header)
                      ? "bg-accent text-white border-accent"
                      : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={chartConfig.yAxes.includes(header)}
                    onChange={(e) => {
                      const current = chartConfig.yAxes;
                      const updated = e.target.checked
                        ? [...current, header]
                        : current.filter((y: string) => y !== header);
                      updateConfig({ yAxes: updated });
                    }}
                    className="sr-only"
                  />
                  {header}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Table (Collapsible) */}
      {showTable && (
        <div>
          <TableDisplay
            tableData={validatedChartData}
            fieldId={fieldId}
            selectedSentence={selectedSentence}
            setSelectedSentence={setSelectedSentence}
            setSelectedTag={setSelectedTag}
            results={results}
          />
        </div>
      )}
    </div>
  );
};

export const ChartDisplay = ChartDisplayComponent;
