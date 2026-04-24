"""AI service — LEGO set identification and eBay listing generation.
Supports Anthropic (Claude) and OpenAI (GPT-4o) as interchangeable providers.
"""
from __future__ import annotations

import json
import logging
import re

logger = logging.getLogger(__name__)

# ── Shared helpers ────────────────────────────────────────────────────────────

def _parse_json(text: str) -> dict:
    """Extract JSON from a response that may be wrapped in markdown fences."""
    text = text.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if m:
        text = m.group(1).strip()
    return json.loads(text)


# ── Provider clients ──────────────────────────────────────────────────────────

def _anthropic_client(api_key: str):
    try:
        from anthropic import Anthropic
        return Anthropic(api_key=api_key)
    except ImportError:
        raise RuntimeError("anthropic package not installed — run: pip install anthropic")


def _openai_client(api_key: str):
    try:
        from openai import OpenAI
        return OpenAI(api_key=api_key)
    except ImportError:
        raise RuntimeError("openai package not installed — run: pip install openai>=1.50.0")


# ── Set identification ────────────────────────────────────────────────────────

_IDENTIFY_PROMPT_BASE = """\
You are a world-class LEGO expert and set identifier. Carefully examine the image.

Your goal is to identify the specific LEGO set shown. Analyse these clues in priority order:

1. MINIFIGURES (highest confidence signal)
   - Name every minifigure you can see — their outfit, helmet, face print, accessories
   - Exclusive or rare minifigures (e.g. a specific Sith lord, a named character variant, \
a unique colour uniform) appear in only one or very few sets — if you spot one, your \
confidence should be HIGH (0.85+)
   - List which minifigures you identified in the notes field

2. SET NUMBER
   - Printed on the box, instruction booklet cover, or stickers visible in the image

3. DISTINCTIVE BUILD FEATURES
   - Unique shapes, colour schemes, or structural elements specific to one set
   - Scale, piece count estimate, any printed tiles or special parts

4. TEXT / BRANDING
   - Any text, logos, ship names, location names visible in the image

IMPORTANT: Always provide your best guess. Do NOT return empty fields unless the image \
contains no LEGO content whatsoever. If you can see LEGO content, give your closest match.

{theme_line}Return ONLY a valid JSON object — no markdown, no extra text:
{{"set_number": "75192", "set_name": "Millennium Falcon", "confidence": 0.85, \
"notes": "Identified Han Solo and Chewbacca minifigures with correct torso prints; \
distinctive dish and mandibles visible"}}

set_number: official LEGO set number, digits only, no -1 suffix.
set_name: full official name.
confidence: 0.0–1.0. Boost toward 0.9+ when an exclusive minifigure pins down the set.
notes: list which minifigures you spotted and other specific visual clues used.\
"""


def _build_identify_prompt(theme_hint: str = "", context_hint: str = "") -> str:
    hints: list[str] = []
    if theme_hint:
        hints.append(f"Theme: '{theme_hint}'")
    if context_hint:
        hints.append(f"Additional context from seller: \"{context_hint}\"")
    theme_line = ("Seller hints — use these to narrow your search:\n" +
                  "\n".join(f"  • {h}" for h in hints) + "\n\n") if hints else ""
    return _IDENTIFY_PROMPT_BASE.format(theme_line=theme_line)


def _identify_anthropic(image_b64: str, media_type: str, api_key: str, model: str,
                         theme_hint: str = "", context_hint: str = "") -> dict:
    client = _anthropic_client(api_key)
    response = client.messages.create(
        model=model,
        max_tokens=400,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_b64}},
                {"type": "text", "text": _build_identify_prompt(theme_hint, context_hint)},
            ],
        }],
    )
    return _parse_json(response.content[0].text)


def _identify_openai(image_b64: str, media_type: str, api_key: str, model: str,
                      theme_hint: str = "", context_hint: str = "") -> dict:
    client = _openai_client(api_key)
    response = client.chat.completions.create(
        model=model,
        max_tokens=400,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{image_b64}", "detail": "high"}},
                {"type": "text", "text": _build_identify_prompt(theme_hint, context_hint)},
            ],
        }],
    )
    return _parse_json(response.choices[0].message.content)


def identify_lego_set(image_b64: str, media_type: str, api_key: str,
                       provider: str = "openai", model: str = "gpt-4o-mini",
                       theme_hint: str = "", context_hint: str = "") -> dict:
    """Identify a LEGO set from a base64 image using the selected AI provider."""
    if provider == "anthropic":
        return _identify_anthropic(image_b64, media_type, api_key, model, theme_hint, context_hint)
    return _identify_openai(image_b64, media_type, api_key, model, theme_hint, context_hint)


# ── eBay listing generation ───────────────────────────────────────────────────

def _enforce_title_limit(result: dict) -> dict:
    """Hard-clamp the title to 80 characters at the last word boundary."""
    title = result.get("title", "")
    if len(title) > 80:
        truncated = title[:80]
        last_space = truncated.rfind(" ")
        result["title"] = (truncated[:last_space].rstrip() if last_space > 60 else truncated).rstrip()
    return result


def _build_listing_prompt(set_data: dict, prefs: dict) -> str:
    completeness = prefs.get("completeness", "complete")  # "complete" | "partial" | "incomplete"
    has_manual   = prefs.get("includes_instructions", True)
    has_figs     = prefs.get("includes_figures", True)
    smoke_free   = prefs.get("smoke_free_home", False)
    clean_set    = prefs.get("clean_set", False)

    # ── Condition tokens ───────────────────────────────────────────────────
    if completeness == "complete":
        cond_token   = "Complete"
        condition_desc = "Complete — all pieces present and verified"
    elif completeness == "partial":
        cond_token   = "99% Complete"
        condition_desc = "99% Complete — may be missing a very small number of minor pieces"
    else:  # incomplete
        cond_token   = "Incomplete"
        condition_desc = "Incomplete — some pieces are missing"

    attrs: list[str] = []
    if smoke_free:
        attrs.append("From a smoke-free home")
    if clean_set:
        attrs.append("Clean, well-maintained set")
    attrs.append("Includes original instruction manual" if has_manual else "No instruction manual included")
    attrs.append("All minifigures included" if has_figs else "Minifigures NOT included")

    minifigs    = set_data.get("num_minifigures") or set_data.get("minifig_count") or 0
    minifig_str = str(minifigs) if minifigs else "Unknown"
    pieces      = set_data.get("piece_count") or set_data.get("num_parts", "")
    year        = set_data.get("year", "")
    theme       = set_data.get("theme") or ""
    name        = set_data.get("name", "")
    set_no      = set_data.get("set_number", "")

    # ── Short tokens for the 80-char title ────────────────────────────────
    manual_token = "w/ Manual"     if has_manual else "No Manual"
    figs_token   = (f"w/ {minifigs} Minifigs" if minifigs else "w/ Figs") if has_figs else "No Figs"
    clean_token  = "Clean"         if clean_set  else ""
    smoke_token  = "Smoke-Free"    if smoke_free else ""
    extras = " ".join(t for t in [clean_token, smoke_token] if t)

    return f"""You are an expert eBay seller specialising in LEGO sets. \
Generate a keyword-optimised eBay listing for the set below.

SET DETAILS
Set Number : {set_no}
Name       : {name}
Year       : {year}
Theme      : {theme or "LEGO"}
Pieces     : {pieces}
Minifigs   : {minifig_str}

SELLER ATTRIBUTES
{chr(10).join(f"• {a}" for a in attrs)}
Condition  : {condition_desc}

OUTPUT FORMAT — return ONLY a JSON object with exactly TWO keys: "title" and "description".

"title" — eBay title rules:
  • HARD LIMIT: 80 characters. NEVER exceed this. eBay rejects longer titles.
  • Goal: pack as close to 80 as possible. Count every character before finalising.
  • Pack keywords in this priority order (use all that fit, abbreviate if needed):
      1. LEGO
      2. Theme: {theme}
      3. Set number: {set_no}
      4. Set name: {name}
      5. Year: {year}
      6. Piece count: {pieces}pcs
      7. Condition: {cond_token}
      8. Manual: {manual_token}
      9. Figures: {figs_token}
      10. Extras: {extras or "(none)"}
  • Abbreviations: "pcs", "w/", "&", drop articles ("the"/"a").
  • Worked example (74 chars — try to use the remaining 6 on extras):
      "LEGO Star Wars 75154 TIE Striker 2016 543pcs Complete w/ Manual & Figs"

"description" — Full eBay description in clean HTML. \
No shipping, no payment, no dispatch info. \
Use this exact structure:
  <h2>About This Set</h2> — 2–3 sentences of enthusiastic retail-style copy \
highlighting play features, display value, or collector appeal
  <h2>Set Details</h2> — HTML table: Set Number | Name | Year | Theme | \
Piece Count | Minifigures | Condition
  <h2>What's Included</h2> — <ul> of seller attribute bullets

Return ONLY the raw JSON object. No markdown fences. No extra text."""


def _generate_anthropic(set_data: dict, prefs: dict, api_key: str, model: str) -> dict:
    client = _anthropic_client(api_key)
    response = client.messages.create(
        model=model,
        max_tokens=2500,
        messages=[{"role": "user", "content": _build_listing_prompt(set_data, prefs)}],
    )
    return _enforce_title_limit(_parse_json(response.content[0].text))


def _generate_openai(set_data: dict, prefs: dict, api_key: str, model: str) -> dict:
    client = _openai_client(api_key)
    response = client.chat.completions.create(
        model=model,
        max_tokens=2500,
        messages=[{"role": "user", "content": _build_listing_prompt(set_data, prefs)}],
    )
    return _enforce_title_limit(_parse_json(response.choices[0].message.content))


def generate_ebay_listing(set_data: dict, prefs: dict, api_key: str,
                           provider: str = "openai", model: str = "gpt-4o-mini") -> dict:
    """Generate an optimised eBay listing using the selected AI provider."""
    if provider == "anthropic":
        return _generate_anthropic(set_data, prefs, api_key, model)
    return _generate_openai(set_data, prefs, api_key, model)
