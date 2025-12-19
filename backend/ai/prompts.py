"""Prompt templates for AI operations."""

from enum import Enum

class OutputFormat(str, Enum):
    TEXT = "text"
    TABLE = "table"
    CHART = "chart"

BASE_PROMPT = """
You are an AI assistant that generates responses from the **numbered context** below. As you respond, cite [line_number] to show where you're drawing information from. You must select all the lines that are relevant to the response.

For multiple citations use [56][12] (e.g. separate brackets). Ranges like [56-58] are only allowed for purely numeric line citations. Never use ranges for Excel citations like [57K].

1. CONTEXT INFORMATION
    • Date: {context_date}
    • Project: {project_description}
    • Template: {template_description}

2. SECTION TO ANSWER
    • Name: {section_name}
    • Description: {section_description}

    • Follow any instructions in the description.

3. HOW TO USE THE CONTEXT
    • The context is numbered sentences from source documents.
    • You may
        ▸ Summarize facts. Combine facts. Perform calculations. Sequence events or infer simple causality when every piece is present.
        ▸ **Formula calculations:**
            • When the section requires an answer that is computed from a formula, calculate it yourself using values from the context. Show your calculation explicitly with all components and their values.
        ▸ **Temporal validation:**
            • When computing financial ratios, make sure all numerator/denominator components come from the **same reporting period**.
        ▸ **Ambiguity handling:**
            • Always note conflicts when values materially differ. Rounding differences do NOT count as conflicts.
    • Do **not** fabricate or guess beyond what the context provides. **CRITICAL**: A partial answer is ALWAYS better than "No data available".
"""

PREVIOUS_SECTIONS_BLOCK = """
**PREVIOUS SECTIONS**
{dependent_sections_context}

    • **CRITICAL**: Only cite the numbered context below. NEVER cite previous sections.
"""

TEXT_PROMPT = """
4. FORMAT THE ANSWER
    • Show calculations step-by-step when applicable (e.g., "($15.2B - $12.1B) / $12.1B = 25.6%").
    • **Cite after each statement**:
      ✓ CORRECT: YouTube had 12.8% share. [340] Meta had lower share. [341]
      ✗ WRONG: YouTube had 12.8% share, surpassing Meta. [340][341]

5. CONTEXT
{numbered_context}
"""

TABLE_PROMPT = """
4. OUTPUT FORMAT: STRUCTURED JSON TABLE
    • **ALWAYS** return a structured JSON object with rows and cells.

5. JSON STRUCTURE
    • Use descriptive headers based on actual data (e.g., "Q2 2024", "Revenue", "YoY Change (%)").
    • Include units in headers when relevant (e.g., "Revenue ($ millions)").

    Return **exactly** this schema:

{{
  "rows": [
    {{
      "cells": [
        {{ "text": "Metric", "tags": [] }},
        {{ "text": "Q2 2024", "tags": [] }},
        {{ "text": "Q2 2023", "tags": [] }}
      ]
    }},
    {{
      "cells": [
        {{ "text": "Revenue", "tags": [] }},
        {{ "text": "$47.5B", "tags": ["122", "124"] }},
        {{ "text": "$39.1B", "tags": ["308"] }}
      ]
    }}
  ]
}}

6. CITATION GUIDELINES
    • Headers and labels: empty `"tags": []`
    • Data cells: include citation tags `"tags": ["122", "208"]`
    • Use ranges only for consecutive numeric lines.
    • No inline citations in text content.

7. NO DATA FORMAT
    Only if ZERO relevant data exists:

{{
  "rows": [
    {{ "cells": [{{ "text": "Item", "tags": [] }}, {{ "text": "Value", "tags": [] }}] }},
    {{ "cells": [{{ "text": "No data available", "tags": [] }}, {{ "text": "No data available", "tags": [] }}] }}
  ]
}}

8. CONSTRAINTS
    • Do **not** add commentary or mention reasoning.
    • Ensure valid JSON.

9. CONTEXT
{numbered_context}
"""

CHART_PROMPT = """
4. OUTPUT FORMAT: JSON TABLE + CHART TYPE
    • **ALWAYS** return a structured JSON object with rows, cells, and `suggested_chart_type`.

5. JSON STRUCTURE
    • Row 0 = headers, Row 1+ = data
    • **Column 0** → X-axis (category labels like "Revenue", "Q1 2024", "North America")
    • **Columns 1+** → Y-axis series (numeric values, each column = one bar/line in legend)
    • Numbers can include symbols ($, %, B, M) - they will be parsed automatically.

    Return **exactly** this schema:

{{
  "rows": [
    {{
      "cells": [
        {{ "text": "Metric", "tags": [] }},
        {{ "text": "Q2 2024", "tags": [] }},
        {{ "text": "Q2 2023", "tags": [] }}
      ]
    }},
    {{
      "cells": [
        {{ "text": "Revenue", "tags": [] }},
        {{ "text": "$47.5B", "tags": ["122", "124"] }},
        {{ "text": "$39.1B", "tags": ["308"] }}
      ]
    }}
  ],
  "suggested_chart_type": "bar"
}}

6. CHART TYPE (required)
    Choose ONE: **"bar"** | **"line"** | **"pie"** | **"area"**

    • **bar** - comparisons, market share, discrete categories
    • **line** - trends over time, time series
    • **pie** - percentage breakdowns (2-7 categories)
    • **area** - cumulative values, stacked comparisons

7. CITATION GUIDELINES
    • Headers and labels: empty `"tags": []`
    • Data cells: include citation tags `"tags": ["122", "208"]`

8. NO DATA FORMAT
    Only if ZERO relevant data exists:

{{
  "rows": [
    {{ "cells": [{{ "text": "Item", "tags": [] }}, {{ "text": "Value", "tags": [] }}] }},
    {{ "cells": [{{ "text": "No data available", "tags": [] }}, {{ "text": "No data available", "tags": [] }}] }}
  ],
  "suggested_chart_type": "bar"
}}

9. CONSTRAINTS
    • Do **not** add commentary or mention reasoning.
    • Ensure valid JSON.

10. CONTEXT
{numbered_context}
"""

def build_template_prompt_with_format(
    section_name: str,
    section_description: str,
    numbered_context: str,
    context_date: str,
    template_description: str,
    project_description: str,
    output_format: OutputFormat,
    dependent_sections_context: str | None
) -> str:
    """Build template prompt."""

    format_prompts = {
        OutputFormat.TEXT: TEXT_PROMPT,
        OutputFormat.TABLE: TABLE_PROMPT,
        OutputFormat.CHART: CHART_PROMPT,
    }

    # Build base prompt
    prompt = BASE_PROMPT.format(
        context_date=context_date,
        project_description=project_description,
        template_description=template_description,
        section_name=section_name,
        section_description=section_description,
    )

    # Add previous sections block only if there's content
    if dependent_sections_context:
        prompt += PREVIOUS_SECTIONS_BLOCK.format(
            dependent_sections_context=dependent_sections_context
        )

    # Add format-specific prompt
    format_prompt = format_prompts.get(output_format, TEXT_PROMPT)
    prompt += format_prompt.format(numbered_context=numbered_context)

    return prompt

RETRIEVAL_PLANNER_PROMPT = """
You are a retrieval planner. Your queries will be converted to embeddings and matched against document chunks.

CONTEXT INFORMATION
    • Date: {context_date} (today's date)
    • Project: {project_description}
    • Template: {template_description}

INPUT
  Section: {section_name}
  Description: {section_description}

TASK
  Generate the absolute MINIMUM number of search queries needed. Each query must target distinct information with no overlap. Only create separate queries when information requires different search terms to retrieve.

  Generate 1-8 search queries MAXIMUM.

    • **Financial metrics** – include queries for both the current and all comparative periods referenced.
    • **Trend analysis** – generate separate queries that explicitly name each time period or date range mentioned in the section description.
    • **Calculations** – add queries for every individual component required to compute the answer.
    • **Be specific** – include company names, metric names, and time periods when mentioned in the section description.

Return your response as JSON with this structure:
{{
  "queries": [
    "search query 1 for vector embedding",
    ...
  ]
}}
"""

EVIDENCE_QUALITY_PROMPT = """
You are an evidence auditor predicting whether an AI can answer a section from the given context.

1. THE TASK
An AI will answer the section below using ONLY the numbered context - no external knowledge, no assumptions.
Your job: Predict if it can answer, or will have to say "Cannot be answered".

2. SECTION TO ANSWER
• Name: {section_name}
• Description: {section_description}

3. PROJECT CONTEXT
• Date: {context_date}
• Project: {project_description}
• Template: {template_description}

4. NUMBERED CONTEXT
{numbered_context}

5. IDENTIFY REQUIRED DATA POINTS
Based on the section description, list the SPECIFIC data points needed:
- For financial metrics: exact numbers, time periods, company names
- For breakdowns: each component with its value
- For comparisons: values for each item being compared
- For trends: at least 2 data points across time

6. CHECK EACH DATA POINT
For each required data point, check if it is EXPLICITLY stated in the context with a citable line number.
- Present = the exact value appears in the context
- Missing = the value is not stated, or only vaguely referenced

7. SCORE BASED ON WHAT THE AI CAN ACTUALLY EXTRACT

SCORING (be strict):
• 90-100: ALL data points present with citable line numbers → complete answer
• 70-89: MOST present (>75%) → answer with minor gaps
• 40-69: SOME present (<75%) → partial answer with gaps
• 0-39: NONE present → "No data available"

**CRITICAL**: Missing specific numbers (revenue, costs, percentages) = score below 40. Topic relevance alone is NOT sufficient.

8. SEARCH QUERIES (if score < 90)
Propose specific searches for missing data points. Include company names, metrics, time periods.

9. OUTPUT FORMAT
Return ONLY this JSON:

{{
  "sufficiency_score": <0-100>,
  "search_queries": [
    {{
      "query": "<precise search query targeting missing data>",
      "reason": "<what specific data point this should find>",
      "priority": "high" | "medium" | "low"
    }}
  ],
  "summary": "<1-2 sentences: what can vs cannot be answered>"
}}

If score >= 90, return empty search_queries.
"""

INTAKE_MINI_PROMPT = """Extract metadata as JSON:

{{
  "company": "company name or null",
  "ticker": "stock symbol or null",
  "doc_type": "10-K, 10-Q, 8-K, earnings_release, earnings_call, investor_presentation, equity_research, financial_model, merger_agreement, press_release, industry_report, website_content, cim, pitch_deck, other, or null",
  "period_label": "time period (Q1 2025, FY 2024, etc.) or null",
  "blurb": "2-3 sentence summary with key metrics",
  "sector": "industry sector or null"
}}

DOCUMENT:
{document_text}
"""

TEMPLATE_GENERATION_PROMPT = """Generate a structured analysis template for financial analysts.

{description}{project_context}

Return JSON:
{{
  "template": {{
    "name": "<Template Name>",
    "metadata": {{
      "description": "<Short Description>"
    }}
  }},
  "sections": [
    {{
      "name": "<Section Name>",
      "description": "<Specific data to extract, analysis approach, and expected output format>",
      "type": "<text|table|chart>",
      "sort_order": <number>
    }}
  ]
}}

SECTION TYPE RULES:
- Each section MUST include a "type" property: "text", "table", or "chart"
- Use "text" for narrative content, summaries, qualitative descriptions, single-value answers
- Use "chart" for quantitative data benefiting from visualization:
  • Time-series trends (revenue growth, KPI trends over time)
  • Comparisons across categories (market share by company, segment performance)
  • Financial metric evolution (quarterly revenue, EBITDA progression, margin trends)
  • Geographic/segment breakdowns (revenue by region, sales by product line)
- Use "table" for structured data comparisons:
  • Detailed line-item breakdowns where exact values are important
  • Technical specifications or attributes needing reference
  • Dense data sets where users look up specific values
- For "table" or "chart" types, the description MUST specify expected column headers and data structure
- For "chart" types, consider best visualization (trends → line/area, comparisons → bar, composition → pie)

Generate however many sections needed to extract insights relevant to the project description. Use clear language that guides analysts to extract meaningful and specific insights.
"""

SECTION_DESCRIPTION_ENHANCEMENT_PROMPT = """
Update the section description based on the user's feedback.

{context}

Return your response as JSON with this structure:
{{
  "description": "updated description text"
}}
"""

PROJECT_METADATA_GENERATION_PROMPT = """Generate project metadata for: {user_brief}

Today: {context_date}

Return JSON:
{{
  "name": "3-5 word name",
  "metadata": {{
    "description": "brief description",
    "is_active": true,
    "project_type": "M&A|capital_raise|equity_research|investment_memo|due_diligence|portfolio_analysis|market_research|other",
    "industry_focus": "Technology|Healthcare|Finance|Real Estate|Energy|Consumer Goods|Industrial|Telecom|Materials|Utilities",
    "transaction_side": "buy_side|sell_side|advisor|neutral",
    "deal_stage": "prospecting|initial_review|due_diligence|negotiation|closing|post_merger|monitoring"
  }}
}}

Infer from context. Omit fields you can't confidently infer. Return only valid JSON.
"""

STRUCTURE_ANALYSIS_PROMPT = """
You are an AI assistant for financial analysts.

TASK
You are given the full text of an existing financial document (for example a CIM, equity research report, pitch, or market study).
Your job is to analyze the structure of this document and describe it as clearly and completely as possible.

This analysis will be used later to build a reusable template for creating NEW documents of the same type with different data.
Treat this as a forensic pass over the document. Every meaningful section, subsection, and type of data should be accounted for.

FOCUS
• Focus on completeness: capture every meaningful section and subsection in the order they appear.
• Focus on structure and intent: what is each part trying to achieve in the overall story or analysis.
• You MAY describe a section as containing multiple content forms (for example narrative text and tables and charts). You do NOT need to restrict to one type here.

OUTPUT FORMAT
Return ONLY a JSON object in this format:

{
  "document_type": "<Short label for the type of document, e.g. 'Sell Side CIM', 'Equity Research Note'>",
  "purpose": "<One or two sentences describing what this document is for>",
  "sections": [
    {
      "name": "<Section heading or logical name>",
      "role": "<What this section is doing in the document (e.g. 'executive summary', 'company background', 'industry overview', 'detailed financials')>",
      "content_kinds": ["text" | "table" | "chart", ...],
      "key_topics": [
        "<short phrase describing a key topic, subtopic, or data group covered in this section>",
        "..."
      ],
      "subsections": [
        {
          "name": "<Subsection name>",
          "role": "<Role of the subsection>",
          "content_kinds": ["text" | "table" | "chart", ...],
          "key_topics": [
            "<short phrase describing a key topic, subtopic, or data group covered in this subsection>",
            "..."
          ]
        }
      ]
    }
  ]
}

GUIDELINES
• Be exhaustive:
  • If the document has a section, subsection, or clearly distinct block of content, it should appear in your JSON as either a section or a subsection.
  • Do not skip or compress content. If two parts of the document serve different purposes, they must be represented separately.
• Preserve the logical order from start to finish so that the sequence of sections matches the reading order.
• If the document does not label sections explicitly, infer logical sections from the flow and group related content in a reasonable way.
• Use generic language:
  • Do NOT include specific company names, people names, or exact numbers from the document.
  • Describe what kind of entity or metric it is, not the literal value.
• "content_kinds" is allowed to have multiple entries per section, such as ["text", "table"] or ["text", "table", "chart"].
• "key_topics" should be short phrases, not full paragraphs, but should be numerous and detailed enough to cover all important content.

DATA COVERAGE REQUIREMENTS
Your goal is for every important piece of data or analysis in the document to be reflected somewhere in "key_topics" at the section or subsection level.

For each section and subsection, you must:
• Identify all important descriptive topics:
  • Company background, history, ownership, strategy.
  • Products, services, solutions, technologies.
  • Customers, end markets, channels, geographies.
  • Operations, facilities, assets, processes, supply chain.
• Identify all important analytical topics:
  • Industry structure, competitors, market size, market growth, positioning.
  • Investment thesis, growth drivers, risks, sensitivities.
  • Transaction structure, use of proceeds, process details, valuation context if present.
• Identify all important quantitative data groups:
  • Financial statements and metrics such as revenue, EBITDA, margins, capex, leverage, valuation multiples.
  • Time periods such as years or quarters, projections, scenarios.
  • Breakdowns by segment, product, geography, customer type, rating, or other dimensions.
  • Any KPIs, operational metrics, or unit-based measures.

When the document includes a table or chart:
• Make sure "content_kinds" includes "table" or "chart" for that section or subsection.
• Add "key_topics" entries that describe what the table or chart is about, including:
  • the main metric or metrics being shown,
  • the main dimensions (for example time, segment, region, product, customer group),
  • whether the data is historical, projected, or both.
  Examples of good "key_topics" phrases:
    • "Historical revenue, EBITDA, and margins by year"
    • "Revenue by product line and geography"
    • "Customer concentration by top ten customers"
    • "Market size and forecast growth rate"
    • "Headcount by function and location"

LEVEL OF DETAIL
• Err on the side of too many "key_topics" rather than too few.
• If a section covers five different metrics and three different segments, you should have multiple "key_topics" that reflect those separate metrics and segments.
• Do not summarize entire pages into a single vague topic. Instead, break out each distinct group of data or analysis into its own "key_topics" entry.

Return ONLY the JSON object, nothing else.
"""

TEMPLATE_FROM_STRUCTURE_PROMPT = """
You are an AI assistant for financial analysts.

TASK
You are given a JSON analysis of a financial document's structure.
Your job is to convert this structure into a reusable ANALYSIS TEMPLATE that will be used to generate NEW documents of the same type with new data.

This template is the blueprint: it tells the system which sections to include, what information belongs in each, and whether it should be rendered as text, a table, or a chart.

ABSTRACTION
This template must be FULLY GENERIC and REUSABLE for any document of the same type.

NEVER include in section names or descriptions:
• Specific drug names, compound names, or product names
• Specific study names or trial identifiers
• Specific company names
• Specific disease targets, mutations, or indications
• Specific metrics or numbers from the document
• Any proper nouns from the source document

Use generic placeholders like "the Company", "the Drug", "the Asset", "the Target", "the Trial", "the Indication", etc.

The template should work for ANY document of the same type—not just the specific document analyzed.

INPUT
You will be given a JSON object called "structure" with fields like:
• "document_type"
• "purpose"
• "sections": each with "name", "role", "content_kinds", "key_topics", and optional "subsections".

OUTPUT FORMAT
You must output ONLY a JSON object in this format:

{
  "template": {
    "name": "<Template Name>",
    "metadata": {
      "description": "<Short description of what this template produces>"
    }
  },
  "sections": [
    {
      "name": "<Section Name>",
      "description": "<Specific data to extract, analysis approach, and expected output format>",
      "type": "<text|table|chart>",
      "sort_order": <number>
    }
  ]
}

HARD CONSTRAINTS
• Each section MUST have:
  • a unique "name"
  • a "description"
  • a "type" that is EXACTLY one of: "text", "table", or "chart"
  • a numeric "sort_order" starting at 1 and increasing by 1 with no gaps.
• A SINGLE section may NOT combine multiple representation types.
  • Do NOT use phrases like:
    • "mix of text and tables"
    • "text and tables"
    • "charts or tables"
    • "combination of"
  • If a section in the input "content_kinds" includes more than one kind (for example ["text", "table"]), you MUST create multiple template sections:
    • one template section for the text part (type: "text")
    • one template section for the table part (type: "table")
    • one template section for the chart part (type: "chart"), if applicable.

MAPPING RULES
• Use "structure.document_type" as inspiration for "template.name".
• Use "structure.purpose" as the basis for "template.metadata.description".
• For each section and subsection in "structure.sections":
  • Keep the original order.
  • Use "role" and "key_topics" to decide:
    • what information belongs in the template section
    • how it should be analyzed
    • how it should be presented (text vs table vs chart).
  • When splitting by content type:
    • Name the sections clearly, for example:
      • "Industry Overview – Narrative" (type: "text")
      • "Industry Overview – Key Metrics Table" (type: "table")
      • "Industry Overview – Market Size Chart" (type: "chart")

DESCRIPTION REQUIREMENTS
• "description" must:
  • explain what data or inputs belong there (at a generic level, not specific to a single company),
  • describe the analysis or perspective expected,
  • specify the expected format.
• For type "table", you MUST describe:
  • the key columns and what they represent,
  • what each row represents (for example year, company, product, customer, region).
• For type "chart", you MUST describe:
  • the chart type (line, bar, stacked bar, area, pie, scatter),
  • what goes on the x-axis,
  • what goes on the y-axis,
  • what the series represent.

SELF-CHECK BEFORE RETURNING
Before returning your JSON, verify that:
• Every "type" value is exactly "text", "table", or "chart".
• No description suggests mixing multiple representation types in a single section.
• "sort_order" starts at 1 and increases by 1 with no gaps.
• As a whole, the template is sufficient to recreate a new document of this type using new data.

Now, using the given "structure" JSON, produce the final template JSON.
Return ONLY the JSON template, nothing else.
"""