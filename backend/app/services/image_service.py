import base64
import io
import logging
import os
import uuid
from typing import Optional

import aiofiles
from PIL import Image, ImageDraw

from app.core.config import settings
from app.services.comfy_api import generate_txt2img, generate_controlnet_img2img

logger = logging.getLogger(__name__)


def extract_furniture_crops(definition_json: dict, render_path: str, assets_dir: str) -> list[dict]:
    rooms = definition_json.get("rooms", [])
    if not rooms or not os.path.isfile(render_path):
        return []

    xs = [r.get("x", 0) for r in rooms]
    ys = [r.get("y", 0) for r in rooms]
    xe = [r.get("x", 0) + r.get("w", 1) for r in rooms]
    ye = [r.get("y", 0) + r.get("h", 1) for r in rooms]
    min_x, min_y = min(xs), min(ys)
    max_x, max_y = max(xe), max(ye)
    scale = 30
    padding = 20
    svg_w = int((max_x - min_x) * scale) + padding * 2
    svg_h = int((max_y - min_y) * scale) + padding * 2

    catalog_dir = os.path.join(assets_dir, "catalog")
    os.makedirs(catalog_dir, exist_ok=True)

    items = []
    with Image.open(render_path) as img:
        img_w, img_h = img.size

        for room in rooms:
            room_type = room.get("type", "room")
            for furniture in room.get("furniture", []):
                name = furniture.get("name", "furniture")
                f_id = furniture.get("id", f"{name}_{len(items)}")
                fw = furniture.get("width", 1)
                fh = furniture.get("length", 1)

                svg_fx = (room.get("x", 0) + furniture.get("x", 0)) * scale + padding
                svg_fy = (room.get("y", 0) + furniture.get("y", 0)) * scale + padding
                svg_fw = fw * scale
                svg_fh = fh * scale

                r_x = max(0, int(svg_fx / svg_w * img_w))
                r_y = max(0, int(svg_fy / svg_h * img_h))
                r_w = max(1, int(svg_fw / svg_w * img_w))
                r_h = max(1, int(svg_fh / svg_h * img_h))

                crop = img.crop((r_x, r_y, r_x + r_w, r_y + r_h))
                crop_path = os.path.join(catalog_dir, f"{f_id}.png")
                crop.save(crop_path)
                logger.info("[IMG] Extracted crop: %s → %s (%dx%d)", name, crop_path, r_w, r_h)

                items.append({
                "name": name,
                "default_width": fw,
                "default_length": fh,
                "typical_room_type": room_type,
                "image_path": crop_path,
            })

    return items


def generate_floor_plan_svg(definition_json: dict) -> str:
    rooms = definition_json.get("rooms", [])
    if not rooms:
        return "<svg width='400' height='400' xmlns='http://www.w3.org/2000/svg'><rect fill='#f0f0f0' width='400' height='400'/></svg>"

    floors: dict[int, list[dict]] = {}
    for r in rooms:
        floor = r.get("floor", 1)
        floors.setdefault(floor, []).append(r)

    scale = 30
    padding = 20
    floor_gap = 40

    max_floor_width = 0
    total_height = 0
    floor_heights: dict[int, tuple[float, float, int]] = {}
    for fnum in sorted(floors.keys()):
        fr = floors[fnum]
        xs = [r.get("x", 0) for r in fr]
        ys = [r.get("y", 0) for r in fr]
        xe = [r.get("x", 0) + r.get("w", 1) for r in fr]
        ye = [r.get("y", 0) + r.get("h", 1) for r in fr]
        fx_min, fy_min = min(xs), min(ys)
        fx_max, fy_max = max(xe), max(ye)
        fw = int((fx_max - fx_min) * scale)
        fh = int((fy_max - fy_min) * scale)
        max_floor_width = max(max_floor_width, fw)
        floor_heights[fnum] = (fx_min, fy_min, fh)
        total_height += fh + floor_gap

    svg_w = int(max_floor_width) + padding * 2 + 60
    svg_h = total_height + padding * 2 - floor_gap + 60

    colors = ["#e8dcc8", "#c8d8e8", "#d4e8c8", "#f0d0d0", "#d0d0f0", "#f0e8c0", "#e0e0e0"]

    lines = [
        f"<svg width='{svg_w}' height='{svg_h}' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {svg_w} {svg_h}'>",
        "<defs>",
        "  <marker id='door' viewBox='0 0 10 10' refX='5' refY='10' markerWidth='4' markerHeight='4' orient='auto'>",
        "    <path d='M 0 0 Q 5 10 10 0' fill='none' stroke='#8B4513' stroke-width='1.5'/>",
        "  </marker>",
        "  <pattern id='wall-hatch' patternUnits='userSpaceOnUse' width='4' height='4'>",
        "    <path d='M 0 0 L 4 4 M 4 0 L 0 4' stroke='#999' stroke-width='0.3' opacity='0.3'/>",
        "  </pattern>",
        "</defs>",
        f"<rect fill='#f8f6f2' width='{svg_w}' height='{svg_h}'/>",
    ]

    floor_y_offset = padding + 30
    for fnum in sorted(floors.keys()):
        fr = floors[fnum]
        fx_min, fy_min, fh = floor_heights[fnum]
        fw = int(max((r.get("x", 0) + r.get("w", 1) for r in fr), default=0) * scale)
        this_offset = floor_y_offset

        label = "Basement" if fnum == 0 else f"Floor {fnum}" if fnum != 1 else "Ground Floor"
        lines.append(f"<text x='{padding}' y='{this_offset - 8}' font-size='12' fill='#333' font-weight='bold' font-family='sans-serif'>{label}</text>")

        walls: list[tuple[int, int, int, int, bool]] = []

        for r in fr:
            rx = int(r.get("x", 0) * scale) + padding
            ry = int(r.get("y", 0) * scale) + this_offset
            rw = int(r.get("w", 1) * scale)
            rh = int(r.get("h", 1) * scale)
            color = colors[hash(r.get("id", "")) % len(colors)]

            lines.append(f"<rect x='{rx}' y='{ry}' width='{rw}' height='{rh}' fill='{color}' stroke='none'/>")
            if r.get("type") == "hallway":
                lines.append(f"<rect x='{rx}' y='{ry}' width='{rw}' height='{rh}' fill='url(#wall-hatch)' stroke='none'/>")

            walls.append((rx, ry, rw, 0, False))
            walls.append((rx, ry + rh, rw, 0, False))
            walls.append((rx, ry, 0, rh, False))
            walls.append((rx + rw, ry, 0, rh, False))

            label_x = rx + rw // 2
            label_y = ry + rh // 2 - 6
            lines.append(f"<text x='{label_x}' y='{label_y}' font-size='10' fill='#333' text-anchor='middle' font-family='sans-serif'>{r.get('type', '').replace('_', ' ').title()}</text>")
            dim_label = f"{r.get('w', 0):.1f}×{r.get('h', 0):.1f}m"
            lines.append(f"<text x='{label_x}' y='{label_y + 14}' font-size='8' fill='#666' text-anchor='middle' font-family='sans-serif'>{dim_label}</text>")

            for f in r.get("furniture", []):
                fx = int((r.get("x", 0) + f.get("x", 0)) * scale) + padding
                fy = int((r.get("y", 0) + f.get("y", 0)) * scale) + this_offset
                fw = int(f.get("width", 1) * scale)
                fh = int(f.get("length", 1) * scale)
                lines.append(f"<rect x='{fx}' y='{fy}' width='{fw}' height='{fh}' fill='#8b7355' stroke='#555' stroke-width='1' rx='1'/>")

        dup_walls: set[tuple[int, int, int, int]] = set()
        for wx, wy, ww, wh, _ in walls:
            if ww == 0:
                key = (wx, wy, wx, wy + wh)
            else:
                key = (wx, wy, wx + ww, wy)
            if key in dup_walls:
                continue
            dup_walls.add(key)
            thickness = 3
            if ww == 0:
                lines.append(f"<line x1='{wx - thickness}' y1='{wy}' x2='{wx + thickness}' y2='{wy + wh}' stroke='#555' stroke-width='{thickness * 2}' stroke-linecap='round'/>")
            else:
                lines.append(f"<line x1='{wx}' y1='{wy - thickness}' x2='{wx + ww}' y2='{wy + thickness}' stroke='#555' stroke-width='{thickness * 2}' stroke-linecap='round'/>")

        floor_y_offset += fh + floor_gap + 30

    lines.append("</svg>")
    return "\n".join(lines)


async def generate_images(definition_json: dict, style: str, assets_dir: str) -> tuple[Optional[str], Optional[str]]:
    import os
    import aiofiles

    os.makedirs(assets_dir, exist_ok=True)

    svg_content = generate_floor_plan_svg(definition_json)
    plan_path = os.path.join(assets_dir, "floor_plan.svg")
    async with aiofiles.open(plan_path, "w") as f:
        await f.write(svg_content)

    render_path = None
    if not settings.mock_ai:
        try:
            render_path = await call_sd_api(definition_json, style, assets_dir)
        except Exception as e:
            logger.warning(f"Stable Diffusion generation failed: {e}")

    return plan_path, render_path


def _generate_floor_plan_png(definition_json: dict, width: int, height: int) -> Image.Image:
    import math
    rooms = definition_json.get("rooms", [])
    img = Image.new("RGB", (width, height), (248, 246, 242))

    if not rooms:
        return img

    draw = ImageDraw.Draw(img)

    xs = [r.get("x", 0) for r in rooms]
    ys = [r.get("y", 0) for r in rooms]
    xe = [r.get("x", 0) + r.get("w", 1) for r in rooms]
    ye = [r.get("y", 0) + r.get("h", 1) for r in rooms]
    min_x, min_y = min(xs), min(ys)
    max_x, max_y = max(xe), max(ye)

    pad = 20
    scale = min(
        (width - pad * 2) / max(max_x - min_x, 1),
        (height - pad * 2) / max(max_y - min_y, 1),
    )

    def to_px(vx: float, vy: float) -> tuple[float, float]:
        return (pad + (vx - min_x) * scale, pad + (vy - min_y) * scale)

    colors = [
        (232, 220, 200), (200, 216, 232), (212, 232, 200),
        (240, 208, 208), (208, 208, 240), (240, 232, 192), (224, 224, 224)
    ]

    walls: list[tuple[int, int, int, int]] = []
    for i, room in enumerate(rooms):
        rx1, ry1 = to_px(room.get("x", 0), room.get("y", 0))
        rx2, ry2 = to_px(room.get("x", 0) + room.get("w", 1), room.get("y", 0) + room.get("h", 1))
        color = colors[i % len(colors)]
        draw.rectangle([int(rx1), int(ry1), int(rx2), int(ry2)], fill=color, outline=None)

        walls.extend([
            (int(rx1), int(ry1), int(rx2), int(ry1)),
            (int(rx1), int(ry2), int(rx2), int(ry2)),
            (int(rx1), int(ry1), int(rx1), int(ry2)),
            (int(rx2), int(ry1), int(rx2), int(ry2)),
        ])

        for f in room.get("furniture", []):
            fx = room.get("x", 0) + f.get("x", 0)
            fy = room.get("y", 0) + f.get("y", 0)
            fx1, fy1 = to_px(fx, fy)
            fx2, fy2 = to_px(fx + f.get("width", 1), fy + f.get("length", 1))
            draw.rectangle([int(fx1), int(fy1), int(fx2), int(fy2)], fill=(139, 115, 85), outline=(85, 85, 85))

    dup: set[tuple[int, int, int, int]] = set()
    for wx, wy, wx2, wy2 in walls:
        key = (wx, wy, wx2, wy2)
        if key in dup:
            continue
        dup.add(key)
        t = 3
        draw.line([(wx, wy - t), (wx2, wy2 + t)], fill=(85, 85, 85), width=t * 2)

    return img


async def call_sd_api(definition_json: dict, style: str, assets_dir: str) -> Optional[str]:
    prompt = f"{style} interior design, minimalist furniture, oak wood flooring, soft atmospheric lighting, highly detailed, photorealistic 8k architectural render"

    try:
        png_img = _generate_floor_plan_png(definition_json, settings.sd_width, settings.sd_height)
        png_path = os.path.join(assets_dir, "floor_plan_input.png")
        png_img.save(png_path)

        import shutil
        comfy_input = settings.comfy_input_dir
        os.makedirs(comfy_input, exist_ok=True)
        control_filename = f"caiw_control_{uuid.uuid4().hex[:8]}.png"
        control_dst = os.path.join(comfy_input, control_filename)
        shutil.copy2(png_path, control_dst)

        images = await generate_controlnet_img2img(
            prompt=prompt,
            negative_prompt="blurry, lowres, distorted walls, bad proportions, worst quality, monochrome, drafts, text",
            width=settings.sd_width,
            height=settings.sd_height,
            steps=settings.sd_steps,
            cfg=7.0,
            control_image_path=control_filename,
        )
        try:
            os.remove(control_dst)
        except Exception:
            pass
    except Exception:
        logger.warning("[SD] ControlNet generation failed, falling back to txt2img")
        images = await generate_txt2img(
            prompt=prompt,
            negative_prompt="blurry, lowres, distorted walls, bad proportions, worst quality, monochrome, drafts, text",
            width=settings.sd_width,
            height=settings.sd_height,
            steps=settings.sd_steps,
            cfg=7.0,
        )

    if images:
        render_path = os.path.join(assets_dir, "render.png")
        async with aiofiles.open(render_path, "wb") as f:
            await f.write(images[0])
        return render_path
    return None
