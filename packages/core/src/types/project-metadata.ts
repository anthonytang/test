export interface ProjectMetadata {
  // Core project information
  description: string; // The main project description
  is_active?: boolean;
  project_type?:
    | "M&A"
    | "capital_raise"
    | "equity_research"
    | "investment_memo"
    | "due_diligence"
    | "portfolio_analysis"
    | "market_research"
    | "other";
  industry_focus?: string;

  // Deal-specific fields (for M&A, PE, IB projects)
  transaction_side?: "buy_side" | "sell_side" | "advisor" | "neutral";
  deal_stage?:
    | "prospecting"
    | "initial_review"
    | "due_diligence"
    | "negotiation"
    | "closing"
    | "post_merger"
    | "monitoring";

  [key: string]: any;
}
