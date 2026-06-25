import html
import json
import logging
import os
import io
import tempfile

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.database import Project, Design
from app.services.image_service import generate_floor_plan_svg

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/export", tags=["export"])


def _build_rooms_table(definition: dict) -> str:
    rows = ""
    for r in definition.get("rooms", []):
        rid = html.escape(r.get("id", ""))
        rtype = html.escape(r.get("type", ""))
        rows += f"""<tr><td style="padding:4px;border:1px solid #ccc;">{rid}</td><td style="padding:4px;border:1px solid #ccc;">{rtype}</td><td style="padding:4px;border:1px solid #ccc;">{r.get('targetArea', 0)}m²</td><td style="padding:4px;border:1px solid #ccc;">{r.get('w', 0):.1f}×{r.get('h', 0):.1f}m</td></tr>\n"""
    return rows


def _build_materials_html(definition: dict) -> str:
    if not definition.get("materials"):
        return ""
    buf = "<hr/><h3>Material Suggestions</h3><ul>"
    for m in definition["materials"]:
        cost = m.get("estimatedCostPerM2", 0)
        unit = m.get("unit", "m²")
        desc = html.escape(m.get("description", ""))
        name = html.escape(m.get("name", ""))
        buf += f"<li><strong>{name}</strong>: {desc} (est. ${cost:.0f}/{unit})</li>"
    buf += "</ul>"
    return buf


@router.get("/projects/{project_id}/versions/{version}/pdf")
async def export_pdf(project_id: str, version: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Design).where(
            Design.project_id == project_id, Design.version == version
        )
    )
    design = result.scalar_one_or_none()
    if not design:
        raise HTTPException(status_code=404, detail="Design not found")

    definition = json.loads(design.json_definition)
    svg_content = generate_floor_plan_svg(definition)

    btype = definition.get("buildingType", "N/A")
    style = definition.get("style", "N/A")
    area = definition.get("totalSurfaceArea", "N/A")

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;font-family:sans-serif;">
<h1 style="text-align:center;color:#333;">Floor Plan v{version}</h1>
<div style="text-align:center;"><p>Building: {html.escape(btype)} | Style: {html.escape(style)} | Area: {area}m²</p></div>
<div style="text-align:center;">{svg_content}</div>
<hr style="margin:20px 0;" />
<h3>Rooms</h3>
<table style="width:100%;border-collapse:collapse;">
<tr style="background:#f0f0f0;"><th style="padding:4px;border:1px solid #ccc;">Room</th><th style="padding:4px;border:1px solid #ccc;">Type</th><th style="padding:4px;border:1px solid #ccc;">Area</th><th style="padding:4px;border:1px solid #ccc;">Size</th></tr>
{_build_rooms_table(definition)}
</table>
{_build_materials_html(definition)}
</body></html>"""

    try:
        import reportlab
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer, Image

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4,
                                rightMargin=20*mm, leftMargin=20*mm,
                                topMargin=20*mm, bottomMargin=20*mm)
        styles = getSampleStyleSheet()
        story = []

        story.append(Paragraph(f"Floor Plan v{version}", styles['Title']))
        story.append(Spacer(1, 6*mm))
        info = f"Building: {btype} | Style: {style} | Area: {area}m&sup2;"
        story.append(Paragraph(info, styles['Normal']))
        story.append(Spacer(1, 6*mm))

        with tempfile.NamedTemporaryFile(suffix=".svg", delete=False, mode="w") as f:
            f.write(svg_content)
            svg_path = f.name

        try:
            from svglib.svglib import svg2rlg
            drawing = svg2rlg(svg_path)
            if drawing:
                max_w = 170 * mm
                if drawing.width > max_w:
                    s = max_w / drawing.width
                    drawing.width *= s
                    drawing.height *= s
                story.append(Image(svg_path, width=drawing.width, height=drawing.height))
        except ImportError:
            story.append(Paragraph("[Floor plan SVG preview requires svglib]", styles['Normal']))
        finally:
            if os.path.isfile(svg_path):
                os.unlink(svg_path)

        story.append(Spacer(1, 6*mm))
        story.append(Paragraph("Rooms", styles['Heading2']))

        table_data = [["Room", "Type", "Area", "Size"]]
        for r in definition.get("rooms", []):
            table_data.append([
                r.get('id', ''), r.get('type', ''),
                f"{r.get('targetArea', 0)}m²",
                f"{r.get('w', 0):.1f}×{r.get('h', 0):.1f}m",
            ])
        t = Table(table_data, colWidths=[60*mm, 50*mm, 30*mm, 40*mm])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(t)

        if definition.get("materials"):
            story.append(Spacer(1, 4*mm))
            story.append(Paragraph("Material Suggestions", styles['Heading2']))
            for m in definition["materials"]:
                cost = m.get("estimatedCostPerM2", 0)
                unit = m.get("unit", "m²")
                desc = m.get("description", "")
                story.append(Paragraph(
                    f"<strong>{m.get('name', '')}</strong>: {desc} "
                    f"(est. ${cost:.0f}/{unit})",
                    styles['Normal']
                ))

        doc.build(story)
        pdf_bytes = buf.getvalue()

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"inline; filename=floorplan_v{version}.pdf"},
        )
    except ImportError:
        logger.info("[EXPORT] reportlab not available, falling back to HTML")
        return Response(
            content=html,
            media_type="text/html",
            headers={"Content-Disposition": f"inline; filename=floorplan_v{version}.html"},
        )
    except Exception as e:
        logger.error("[EXPORT] PDF generation failed: %s", e, exc_info=True)
        return Response(
            content=html,
            media_type="text/html",
            headers={"Content-Disposition": f"inline; filename=floorplan_v{version}.html"},
        )
