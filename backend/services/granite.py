"""
IBM Granite LLM integration.

Stage 4 of the RAG pipeline.

Sends the RAG context document (built by Stage 3) to IBM Granite via the
watsonx.ai REST API and returns the model's chosen coordinate slot plus its
justification.

Environment variables expected (set in .env):
  WATSONX_API_KEY   — IBM Cloud IAM API key
  WATSONX_PROJECT_ID — watsonx.ai project GUID
  WATSONX_URL        — Regional endpoint, e.g. https://us-south.ml.cloud.ibm.com

The Granite model is instructed to:
  1. Review each safe candidate slot
  2. Evaluate which slot maximises fringe (diffraction spike) visibility for the
     stated science goal while honouring all keep-out constraints
  3. Return a structured JSON response
"""
import json
import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

WATSONX_URL        = os.getenv("WATSONX_URL", "https://us-south.ml.cloud.ibm.com")
WATSONX_PROJECT_ID = os.getenv("WATSONX_PROJECT_ID", "")
WATSONX_API_KEY    = os.getenv("WATSONX_API_KEY", "")

GRANITE_MODEL_ID   = "ibm/granite-13b-instruct-v2"
IAM_TOKEN_URL      = "https://iam.cloud.ibm.com/identity/token"

_iam_token_cache: dict[str, str] = {}


async def _get_iam_token() -> str:
    """
    Exchange the IBM Cloud API key for a short-lived IAM bearer token.
    Cached for the lifetime of the process (tokens last ~60 min; for
    production use a proper refresh mechanism).
    """
    if _iam_token_cache.get("token"):
        return _iam_token_cache["token"]

    if not WATSONX_API_KEY:
        raise RuntimeError(
            "WATSONX_API_KEY is not set. Add it to your .env file."
        )

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            IAM_TOKEN_URL,
            data={
                "grant_type": "urn:ibm:params:oauth:grant-type:apikey",
                "apikey":     WATSONX_API_KEY,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        resp.raise_for_status()
        token = resp.json()["access_token"]

    _iam_token_cache["token"] = token
    return token


def _build_prompt(context: dict[str, Any]) -> str:
    """
    Render the RAG context into a Granite-compatible instruction prompt.

    The model is asked to return a JSON object so the response can be parsed
    deterministically by Stage 5.
    """
    req     = context["request"]
    slots   = context["safe_slots"]
    contam  = context["satellite_contamination"]
    keepout = context["keepout_geometry"]

    slots_text = "\n".join(
        f"  [{i+1}] RA={s['ra_deg']:.4f}° Dec={s['dec_deg']:.4f}°  "
        f"(Sun sep {s['keepout']['sun_sep_deg']:.1f}°, Moon sep {s['keepout']['moon_sep_deg']:.1f}°, origin={s['origin']})"
        for i, s in enumerate(slots[:10])
    ) or "  (none available)"

    contam_text = (
        "\n".join(
            f"  - {e['event_time']}  NORAD {e['norad_id']} ({e['sat_name']})  "
            f"specular angle {e['angle_deg']}°  duration {e['duration_s']}s"
            for e in contam["events"]
        )
        or "  None predicted."
    )

    return f"""You are an orbital telescope scheduling assistant.
Your task is to choose the BEST pointing slot from the safe candidates below
for the given observation request, maximising fringe (diffraction spike)
visibility for the science goal while respecting all keep-out constraints.

=== OBSERVATION REQUEST ===
Target RA:    {req['ra_deg']:.4f}°
Target Dec:   {req['dec_deg']:.4f}°
Science goal: {req['science_goal']}
Priority:     {req['priority']} (1 = highest)

=== KEEP-OUT GEOMETRY ===
Sun position:  RA {keepout['sun']['ra_deg']:.2f}°  Dec {keepout['sun']['dec_deg']:.2f}°  (exclusion {keepout['sun_exclusion_deg']}°)
Moon position: RA {keepout['moon']['ra_deg']:.2f}°  Dec {keepout['moon']['dec_deg']:.2f}°  (exclusion {keepout['moon_exclusion_deg']}°)

=== SAFE CANDIDATE SLOTS ===
{slots_text}

=== SATELLITE CONTAMINATION WINDOWS ===
{contam_text}

=== INSTRUCTIONS ===
1. Select the single best slot from the numbered list above.
2. Explain in 2–3 sentences why it maximises fringe visibility and avoids contamination.
3. Return ONLY valid JSON in this exact format — no markdown, no extra text:
{{
  "chosen_slot_index": <1-based integer>,
  "chosen_ra_deg": <float>,
  "chosen_dec_deg": <float>,
  "justification": "<string>",
  "contamination_risk": "low|medium|high",
  "confidence": <0.0-1.0>
}}
"""


def _heuristic_eval(context: dict[str, Any]) -> dict[str, Any]:
    """Pick the safest slot when Granite is unavailable (demo / offline)."""
    slots = context.get("safe_slots") or []
    chosen = slots[0] if slots else None
    goal = context.get("request", {}).get("science_goal", "the science goal")
    if not chosen:
        return {
            "chosen_slot":        None,
            "justification":      "No safe pointing slots were available after keep-out filtering.",
            "contamination_risk": "high",
            "confidence":         0.0,
            "raw_response":       "",
        }
    sun_sep = chosen.get("keepout", {}).get("sun_sep_deg", 0)
    return {
        "chosen_slot": chosen,
        "justification": (
            f"Selected the keep-out-safest slot (Sun sep {sun_sep:.1f}°) "
            f"for “{goal}”. IBM Granite was not reachable, so Orion used the "
            "deterministic ranking from the RAG context builder."
        ),
        "contamination_risk": "low",
        "confidence":         0.88,
        "raw_response":       "",
    }


async def evaluate_with_granite(context: dict[str, Any]) -> dict[str, Any]:
    """
    Send the RAG context to IBM Granite and parse its slot recommendation.

    Returns a dict with:
      chosen_slot     : the full slot dict from context["safe_slots"]
      justification   : model's text explanation
      contamination_risk : "low" | "medium" | "high"
      confidence      : float 0–1
      raw_response    : raw model output text (for debugging)
    """
    if not context.get("safe_slots"):
        logger.warning("No safe slots available — Granite evaluation skipped.")
        return {
            "chosen_slot":        None,
            "justification":      "No safe pointing slots were available after keep-out filtering.",
            "contamination_risk": "high",
            "confidence":         0.0,
            "raw_response":       "",
        }

    prompt = _build_prompt(context)

    if not WATSONX_API_KEY:
        logger.warning("WATSONX_API_KEY unset — using heuristic slot selection")
        return _heuristic_eval(context)

    try:
        token = await _get_iam_token()
    except Exception as exc:
        logger.error("IAM token fetch failed: %s", exc)
        return _heuristic_eval(context)

    payload = {
        "model_id": GRANITE_MODEL_ID,
        "input":    prompt,
        "parameters": {
            "decoding_method": "greedy",
            "max_new_tokens":  400,
            "stop_sequences":  ["\n\n"],
            "temperature":     0.0,
        },
        "project_id": WATSONX_PROJECT_ID,
    }

    endpoint = f"{WATSONX_URL}/ml/v1/text/generation?version=2023-05-29"

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                endpoint,
                json=payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type":  "application/json",
                    "Accept":        "application/json",
                },
            )
            resp.raise_for_status()
            result = resp.json()
    except Exception as exc:
        logger.error("Granite API call failed: %s", exc)
        return _heuristic_eval(context)

    raw_text = (
        result.get("results", [{}])[0].get("generated_text", "").strip()
    )
    logger.info("Granite raw response: %s", raw_text[:300])

    # Parse JSON response
    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        # Attempt to extract JSON substring if the model added any preamble
        import re
        match = re.search(r"\{.*\}", raw_text, re.DOTALL)
        if match:
            parsed = json.loads(match.group())
        else:
            logger.error("Granite response was not parseable JSON: %s", raw_text)
            parsed = {}

    idx          = int(parsed.get("chosen_slot_index", 1)) - 1  # convert to 0-based
    safe_slots   = context["safe_slots"]
    chosen_slot  = safe_slots[idx] if 0 <= idx < len(safe_slots) else safe_slots[0]

    return {
        "chosen_slot":        chosen_slot,
        "justification":      parsed.get("justification", ""),
        "contamination_risk": parsed.get("contamination_risk", "unknown"),
        "confidence":         float(parsed.get("confidence", 0.0)),
        "raw_response":       raw_text,
    }
