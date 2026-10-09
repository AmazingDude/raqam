---
name: image-studio
description: Generate, vary, and organize AI images (hero art, product shots, avatars, icons, textures, mood boards, consistent characters) from the command line with a Higgsfield-style workflow of presets, batch variations, and reference images. Use this skill whenever the user asks to generate, create, make, or draw an image, illustration, photo, banner, logo concept, or visual asset, or when a frontend task needs imagery and no real assets exist, even if they never say "image generation".
---

# Image Studio

A provider-agnostic image generation workflow. It replaces a hosted tool like Higgsfield with a local script that calls an image API (OpenAI or fal.ai), applies reusable style presets, produces batches, and records everything in a manifest the frontend can read.

## Setup (once)

Set at least one key in the environment. Never write keys into files or commit them.

- `OPENAI_API_KEY` for `--provider openai` (default model `gpt-image-1`)
- `FAL_KEY` for `--provider fal` (default `fal-ai/flux/dev`; with `--ref` it switches to `fal-ai/flux-pro/kontext`)

Override the model any time with `--model <id>`, since hosted model names change. Requires Python 3.9+ and no third-party packages.

## Workflow

1. **Clarify the brief in one line**: subject, use (hero, card, avatar), aspect ratio, style. Do not interrogate; pick sensible defaults and state them.
2. **Pick a preset** from `references/presets.json` (list them with `python scripts/generate.py --list-presets`). Read `references/prompting.md` only if the first results are weak.
3. **Generate a small batch first**: `--n 3` at default quality. Look at the results before spending on more.
4. **Iterate with one change at a time** (subject, lighting, or camera, not all three).
5. **Lock a character or product look** by passing a chosen result as `--ref path.png` in later calls.
6. **Report** file paths and the exact prompt used. Prompts are saved in `manifest.json`.

## Commands

```bash
python .agents/skills/image-studio/scripts/generate.py \
  "a ceramic coffee mug on a walnut desk, morning window light" \
  --preset product-studio --aspect 3:2 --n 3 --out public/generated --name hero-mug

# keep the same subject, change the scene
python .agents/skills/image-studio/scripts/generate.py \
  "same mug, now on a marble cafe counter" --ref public/generated/hero-mug-1.png \
  --provider fal --out public/generated --name mug-cafe
```

Flags: `--preset`, `--aspect` (1:1, 3:2, 2:3, 16:9, 9:16, 4:3, 3:4), `--n` (1-4), `--ref` (repeatable), `--provider`, `--model`, `--quality` (low|medium|high, OpenAI), `--out`, `--name`, `--dry-run` (print the final prompt and request, no API call).

## Rules

- Always run `--dry-run` first if the key is not confirmed to be set, and tell the user which env var is missing instead of failing silently.
- Save into the project's asset folder (`public/generated/` for web apps) and never overwrite existing files; the script auto-numbers.
- No real people, celebrities, logos of existing brands, or copyrighted characters in prompts. Decline and offer an original alternative.
- Write alt text for every image you hand to the frontend (the script stores a draft `alt` in the manifest; improve it).
- Images with legible text are unreliable. Prefer adding headlines in HTML/CSS over baking text into the image.
- Cost control: default to `--n 3` at medium quality, and ask before running more than 8 images in one task.

## Handing off to the frontend

`manifest.json` in the output folder lists `file`, `prompt`, `alt`, `width`, `height`, `aspect`. When building UI, read it, import the files, set `width`/`height` attributes to prevent layout shift, and use the `alt` text. The `frontend-craft` skill expects this.

## Video note

This skill covers still images. For short motion, generate a strong still here, then animate it with CSS/Lottie, or use a dedicated video provider outside this skill.
