"""Export endpoints (charts, etc.)."""

import logging
from datetime import datetime
from io import BytesIO
from typing import Any, Dict, Optional

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from recognizers_number_with_unit import NumberWithUnitRecognizer, Culture
import xlsxwriter

from auth import get_user_from_request
from core.config import COLOR_SCHEMES
from core.exceptions import ValidationError, InternalServerError, StudioError
from schemas import ChartExportRequest

logger = logging.getLogger(__name__)
router = APIRouter()

# Currency parser for numeric values
_currency_model = NumberWithUnitRecognizer(Culture.English).get_currency_model()


def _parse_numeric_value(text: str) -> Optional[float]:
    """Parse numeric value using Microsoft's recognizers library."""
    if not text:
        return None
    results = _currency_model.parse(text.strip())
    if results:
        return float(results[0].resolution["value"])
    return None


def _col_to_excel(col: int) -> str:
    """Convert 0-based column index to Excel column letter (A, B, ..., Z, AA, AB, ...)."""
    result = ""
    while col >= 0:
        result = chr(65 + (col % 26)) + result
        col = col // 26 - 1
    return result


@router.post("/charts")
async def export_chart(request_body: ChartExportRequest, request: Request):
    """
    Generate Excel file with native chart using xlsxwriter.
    Returns binary Excel file with embedded native chart.
    """
    try:
        user = get_user_from_request(request)
        user_id = user["user_id"]
        user_email = user["user_email"]

        logger.info(
            "AUDIT: User %s (%s) exported chart. SectionId=%s, SectionName=%s, ChartType=%s",
            user_email,
            user_id,
            request_body.section_id,
            request_body.section_name,
            request_body.chart_type,
        )
        logger.info(f"Exporting chart for section: {request_body.section_name}")

        # Create Excel file in memory
        output = BytesIO()
        workbook = xlsxwriter.Workbook(output, {"in_memory": True})
        worksheet = workbook.add_worksheet("Chart Data")

        # Parse table data
        rows = request_body.table_data["rows"]
        if not rows or len(rows) < 2:
            raise ValidationError("Insufficient table data for chart")

        header_row = rows[0]
        data_rows = rows[1:]

        # Get headers from first row
        headers = [cell["text"] for cell in header_row["cells"]]

        # Write title
        title_format = workbook.add_format({"bold": True, "font_size": 14})
        worksheet.write(0, 0, request_body.section_name, title_format)

        # Write table data starting at row 2
        header_format = workbook.add_format(
            {"bold": True, "bg_color": "#F0F0F0", "border": 1}
        )
        data_format = workbook.add_format({"border": 1})

        # Header row at row 2
        for col_idx, header in enumerate(headers):
            worksheet.write(2, col_idx, header, header_format)

        # Data rows starting at row 3
        for row_idx, row in enumerate(data_rows):
            cells = row["cells"]
            for col_idx, cell in enumerate(cells):
                text = cell["text"]
                parsed = _parse_numeric_value(text)
                if parsed is not None:
                    worksheet.write(3 + row_idx, col_idx, parsed, data_format)
                else:
                    worksheet.write(3 + row_idx, col_idx, text, data_format)

        # Set column widths
        for col_idx in range(len(headers)):
            worksheet.set_column(col_idx, col_idx, 15)

        # Get chart configuration
        chart_config = request_body.chart_config

        chart_type_map = {
            "bar": "column",
            "line": "line",
            "pie": "pie",
            "area": "area",
        }
        excel_chart_type = chart_type_map[request_body.chart_type]

        chart = workbook.add_chart({"type": excel_chart_type})

        # Extract x-axis and y-axes from config
        x_axis = chart_config["xAxis"]
        y_axes = chart_config["yAxes"]

        x_col = headers.index(x_axis)

        color_scheme_name = request_body.advanced_settings["colorScheme"]
        colors = COLOR_SCHEMES[color_scheme_name]

        # Add series for each y-axis
        for idx, y_axis in enumerate(y_axes):
            try:
                y_col = headers.index(y_axis)
                x_col_letter = _col_to_excel(x_col)
                y_col_letter = _col_to_excel(y_col)
                series_color = colors[idx % len(colors)].replace("#", "")

                series_config: Dict[str, Any] = {
                    "name": f"='Chart Data'!${y_col_letter}$3",
                    "categories": (
                        f"='Chart Data'!${x_col_letter}$4:"
                        f"${x_col_letter}${4 + len(data_rows) - 1}"
                    ),
                    "values": (
                        f"='Chart Data'!${y_col_letter}$4:"
                        f"${y_col_letter}${4 + len(data_rows) - 1}"
                    ),
                }

                if excel_chart_type == "pie":
                    points = []
                    for i in range(len(data_rows)):
                        point_color = colors[i % len(colors)].replace("#", "")
                        points.append({"fill": {"color": point_color}})
                    series_config["points"] = points
                else:
                    if excel_chart_type == "line":
                        series_config["line"] = {"color": series_color, "width": 2}
                    else:
                        series_config["fill"] = {"color": series_color}

                chart.add_series(series_config)
            except ValueError:
                continue

        chart.set_title({"name": request_body.section_name})
        chart.set_x_axis({"name": x_axis})
        chart.set_style(10)

        chart_row = 3 + len(data_rows) + 2
        worksheet.insert_chart(chart_row, 0, chart, {"x_scale": 1.5, "y_scale": 1.5})

        workbook.close()
        output.seek(0)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"chart-{request_body.section_id}-{timestamp}.xlsx"

        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except StudioError:
        raise
    except Exception as e:
        raise InternalServerError(f"Failed to export chart: {str(e)}")
