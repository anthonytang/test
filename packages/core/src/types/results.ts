export interface ProcessedResults {
  text: ResultItem[];
  lineMap: Record<string, LineMapItem>;
  evidenceAnalysis?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface ResultItem {
  line: string;
  tags: string[];
}

export interface LineMapItem {
  file_id: string;
  local_num: number;
  text: string;
  score?: number;
  is_grouped?: boolean;
  display_tag?: string;
  original_tag?: string;
  file_name?: string;
  chunk_type?: string;
  sheet_name?: string;
  excel_coord?: string;
}

export interface DatabaseResult {
  id: string;
  run_id: string;
  field_id: string;
  value: {
    text: ResultItem[];
    lineMap: Record<string, LineMapItem>;
    evidenceAnalysis?: Record<string, any>;
  };
  metadata: Record<string, any>;
  status: string;
}
