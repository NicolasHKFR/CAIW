import asyncio
import base64
import json
import logging
import os
import uuid
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

DEFAULT_NEGATIVE = "blurry, low quality, distorted, bad proportions, worst quality, monochrome, draft, text, watermark, low resolution, cartoon, sketch, ugly, deformed"

WORKFLOW_DIR = None


def _node_id(start: int = 1) -> int:
    if not hasattr(_node_id, "_counter"):
        _node_id._counter = start
    nid = _node_id._counter
    _node_id._counter += 1
    return nid


def _reset_counter(start: int = 1):
    _node_id._counter = start


def _build_txt2img_workflow(
    prompt: str,
    negative_prompt: str = "",
    width: int = 512,
    height: int = 512,
    steps: int = 20,
    cfg: float = 7.5,
    model: str = "",
    seed: int = -1,
    batch_size: int = 1,
    filename_prefix: str = "caiw",
) -> dict:
    _reset_counter()
    ckpt = str(_node_id())
    clip_pos = str(_node_id())
    clip_neg = str(_node_id())
    latent = str(_node_id())
    sampler = str(_node_id())
    vae_dec = str(_node_id())
    save = str(_node_id())

    workflow = {}
    workflow[ckpt] = {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {"ckpt_name": model},
    }
    workflow[clip_pos] = {
        "class_type": "CLIPTextEncode",
        "inputs": {"text": prompt, "clip": [ckpt, 1]},
    }
    workflow[clip_neg] = {
        "class_type": "CLIPTextEncode",
        "inputs": {"text": negative_prompt or DEFAULT_NEGATIVE, "clip": [ckpt, 1]},
    }
    workflow[latent] = {
        "class_type": "EmptyLatentImage",
        "inputs": {"width": width, "height": height, "batch_size": batch_size},
    }
    workflow[sampler] = {
        "class_type": "KSampler",
        "inputs": {
            "seed": seed if seed >= 0 else _random_seed(),
            "steps": steps,
            "cfg": cfg,
            "sampler_name": "euler",
            "scheduler": "normal",
            "denoise": 1.0,
            "model": [ckpt, 0],
            "positive": [clip_pos, 0],
            "negative": [clip_neg, 0],
            "latent_image": [latent, 0],
        },
    }
    workflow[vae_dec] = {
        "class_type": "VAEDecode",
        "inputs": {"samples": [sampler, 0], "vae": [ckpt, 2]},
    }
    workflow[save] = {
        "class_type": "SaveImage",
        "inputs": {"filename_prefix": filename_prefix, "images": [vae_dec, 0]},
    }
    return workflow


def _build_controlnet_workflow(
    prompt: str,
    negative_prompt: str = "",
    width: int = 640,
    height: int = 448,
    steps: int = 20,
    cfg: float = 7.0,
    model: str = "",
    seed: int = -1,
    control_image_path: str = "",
    filename_prefix: str = "caiw",
) -> dict:
    _reset_counter()
    ckpt = str(_node_id())
    clip_pos = str(_node_id())
    clip_neg = str(_node_id())
    latent = str(_node_id())
    load_img = str(_node_id())
    cnet_loader = str(_node_id())
    cnet_apply = str(_node_id())
    sampler = str(_node_id())
    vae_dec = str(_node_id())
    save = str(_node_id())

    workflow = {}
    workflow[ckpt] = {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {"ckpt_name": model},
    }
    workflow[clip_pos] = {
        "class_type": "CLIPTextEncode",
        "inputs": {"text": prompt, "clip": [ckpt, 1]},
    }
    workflow[clip_neg] = {
        "class_type": "CLIPTextEncode",
        "inputs": {"text": negative_prompt or DEFAULT_NEGATIVE, "clip": [ckpt, 1]},
    }
    workflow[latent] = {
        "class_type": "EmptyLatentImage",
        "inputs": {"width": width, "height": height, "batch_size": 1},
    }
    workflow[load_img] = {
        "class_type": "LoadImage",
        "inputs": {"image": control_image_path},
    }
    workflow[cnet_loader] = {
        "class_type": "ControlNetLoader",
        "inputs": {"control_net_name": settings.sd_controlnet_model},
    }
    workflow[cnet_apply] = {
        "class_type": "ControlNetApply",
        "inputs": {
            "conditioning": [clip_pos, 0],
            "control_net": [cnet_loader, 0],
            "image": [load_img, 0],
            "strength": 1.0,
        },
    }
    workflow[sampler] = {
        "class_type": "KSampler",
        "inputs": {
            "seed": seed if seed >= 0 else _random_seed(),
            "steps": steps,
            "cfg": cfg,
            "sampler_name": "euler",
            "scheduler": "normal",
            "denoise": 1.0,
            "model": [ckpt, 0],
            "positive": [cnet_apply, 0],
            "negative": [clip_neg, 0],
            "latent_image": [latent, 0],
        },
    }
    workflow[vae_dec] = {
        "class_type": "VAEDecode",
        "inputs": {"samples": [sampler, 0], "vae": [ckpt, 2]},
    }
    workflow[save] = {
        "class_type": "SaveImage",
        "inputs": {"filename_prefix": filename_prefix, "images": [vae_dec, 0]},
    }
    return workflow


def _random_seed() -> int:
    return uuid.uuid4().int & 0xFFFFFFFFFFFFFFFF


async def get_available_models() -> list[str]:
    endpoint = settings.image_endpoint.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{endpoint}/object_info/CheckpointLoaderSimple")
            resp.raise_for_status()
            data = resp.json()
            ckpt_raw = data.get("CheckpointLoaderSimple", {}).get("input", {}).get("required", {}).get("ckpt_name", [])
            if isinstance(ckpt_raw, list) and len(ckpt_raw) > 0 and isinstance(ckpt_raw[0], list):
                return ckpt_raw[0]
            if isinstance(ckpt_raw, list) and ckpt_raw:
                return ckpt_raw
    except Exception as e:
        logger.debug("[COMFY] ComfyUI API unreachable (%s), falling back to filesystem", e)

    try:
        import glob
        patterns = ["*.safetensors", "*.ckpt", "*.pt"]
        checkpoint_dirs = _get_checkpoint_dirs()
        models = []
        for d in checkpoint_dirs:
            for p in patterns:
                models.extend(os.path.basename(f) for f in glob.glob(os.path.join(d, p)))
        if models:
            return sorted(set(models))
    except Exception as e:
        logger.debug("[COMFY] Filesystem model scan failed: %s", e)

    return []


def _get_checkpoint_dirs() -> list[str]:
    dirs = []
    base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    comfy_ckpt = os.path.join(base, "ComfyUI", "models", "checkpoints")
    if os.path.isdir(comfy_ckpt):
        dirs.append(comfy_ckpt)
    ext_path = os.path.join("D:\\allai", "SDModels")
    if os.path.isdir(ext_path):
        dirs.append(ext_path)
    return dirs


async def find_suitable_model() -> str:
    models = await get_available_models()
    if not models:
        return ""
    preferred = [m for m in models if "xl" not in m.lower() and "turbo" not in m.lower()]
    if preferred:
        return preferred[0]
    return models[0]


async def generate_txt2img(
    prompt: str,
    negative_prompt: str = "",
    width: int = 512,
    height: int = 512,
    steps: int = 20,
    cfg: float = 7.5,
    model: str = "",
    batch_size: int = 1,
) -> list[bytes]:
    if not model:
        model = await find_suitable_model()
    prefix = f"caiw_{uuid.uuid4().hex[:8]}"

    workflow = _build_txt2img_workflow(
        prompt=prompt,
        negative_prompt=negative_prompt,
        width=width,
        height=height,
        steps=steps,
        cfg=cfg,
        model=model,
        batch_size=batch_size,
        filename_prefix=prefix,
    )

    prompt_id = await _queue_prompt(workflow)
    return await _wait_for_output_files(prompt_id, prefix)


async def generate_controlnet_img2img(
    prompt: str,
    negative_prompt: str = "",
    width: int = 640,
    height: int = 448,
    steps: int = 20,
    cfg: float = 7.0,
    model: str = "",
    control_image_path: str = "",
) -> list[bytes]:
    if not model:
        model = await find_suitable_model()
    prefix = f"caiw_{uuid.uuid4().hex[:8]}"

    workflow = _build_controlnet_workflow(
        prompt=prompt,
        negative_prompt=negative_prompt,
        width=width,
        height=height,
        steps=steps,
        cfg=cfg,
        model=model,
        control_image_path=control_image_path,
        filename_prefix=prefix,
    )

    prompt_id = await _queue_prompt(workflow)
    return await _wait_for_output_files(prompt_id, prefix)


async def _queue_prompt(workflow: dict) -> str:
    endpoint = settings.image_endpoint.rstrip("/")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{endpoint}/prompt", json={"prompt": workflow})
        resp.raise_for_status()
        result = resp.json()
        prompt_id = result["prompt_id"]
        logger.info("[COMFY] Queued prompt %s", prompt_id)
        return prompt_id


async def _wait_for_output_files(prompt_id: str, prefix: str, poll_interval: float = 0.5, max_polls: int = 600) -> list[bytes]:
    endpoint = settings.image_endpoint.rstrip("/")
    for attempt in range(max_polls):
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(f"{endpoint}/history/{prompt_id}")
                if resp.status_code == 200:
                    data = resp.json()
                    if prompt_id in data:
                        entry = data[prompt_id]
                        outputs = entry.get("outputs", {})
                        if outputs:
                            images = []
                            for node_id, node_data in outputs.items():
                                for img_info in node_data.get("images", []):
                                    subfolder = img_info.get("subfolder", "")
                                    filename = img_info["filename"]
                                    img_resp = await client.get(
                                        f"{endpoint}/view",
                                        params={
                                            "filename": filename,
                                            "subfolder": subfolder,
                                            "type": img_info.get("type", "output"),
                                        },
                                    )
                                    img_resp.raise_for_status()
                                    images.append(img_resp.content)
                            logger.info("[COMFY] Got %d output images for %s", len(images), prompt_id)
                            return images
                        status = entry.get("status", {})
                        if status.get("status_str") == "error":
                            error_msg = entry.get("error", {}).get("message", "unknown error")
                            raise RuntimeError(f"ComfyUI generation failed: {error_msg}")
        except httpx.TimeoutException:
            pass
        except Exception as e:
            if "RuntimeError" in type(e).__name__:
                raise
            logger.debug("[COMFY] Poll attempt %d: %s", attempt, e)
        await asyncio.sleep(poll_interval)
    raise TimeoutError(f"ComfyUI generation timed out for prompt {prompt_id}")
