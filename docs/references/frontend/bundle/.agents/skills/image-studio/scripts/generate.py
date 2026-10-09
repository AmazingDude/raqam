#!/usr/bin/env python3
"""Image Studio: provider-agnostic image generation with presets, batches, refs, manifest.
Stdlib only. API calls follow the providers' documented REST shapes; verify model names for your account."""
import argparse, base64, json, mimetypes, os, struct, sys, urllib.request, urllib.error
from pathlib import Path

HERE = Path(__file__).resolve().parent
PRESETS = json.loads((HERE.parent / "references" / "presets.json").read_text())

OPENAI_SIZES = {"1:1": "1024x1024", "3:2": "1536x1024", "16:9": "1536x1024", "4:3": "1536x1024",
                "2:3": "1024x1536", "9:16": "1024x1536", "3:4": "1024x1536"}
FAL_SIZES = {"1:1": "square_hd", "3:2": "landscape_4_3", "4:3": "landscape_4_3", "16:9": "landscape_16_9",
             "2:3": "portrait_4_3", "3:4": "portrait_4_3", "9:16": "portrait_16_9"}

def build_prompt(prompt, preset):
    if preset:
        if preset not in PRESETS:
            sys.exit(f"Unknown preset '{preset}'. Use --list-presets.")
        return f"{prompt}. Style: {PRESETS[preset]}"
    return prompt

def http_json(url, payload, headers, timeout=180):
    req = urllib.request.Request(url, json.dumps(payload).encode(), {"Content-Type": "application/json", **headers})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"API error {e.code}: {e.read().decode(errors='replace')[:500]}")

def download(url):
    with urllib.request.urlopen(url, timeout=180) as r:
        return r.read()

def data_uri(path):
    mime = mimetypes.guess_type(path)[0] or "image/png"
    return f"data:{mime};base64," + base64.b64encode(Path(path).read_bytes()).decode()

def png_size(data):
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    return (None, None)

def gen_openai(a, prompt):
    key = os.environ.get("OPENAI_API_KEY") or sys.exit("OPENAI_API_KEY is not set.")
    if a.ref:
        sys.exit("--ref is not supported with --provider openai in this script. Use --provider fal.")
    body = {"model": a.model or "gpt-image-1", "prompt": prompt, "n": a.n,
            "size": OPENAI_SIZES[a.aspect], "quality": a.quality}
    res = http_json("https://api.openai.com/v1/images/generations", body, {"Authorization": f"Bearer {key}"})
    return [base64.b64decode(d["b64_json"]) for d in res["data"]]

def gen_fal(a, prompt):
    key = os.environ.get("FAL_KEY") or sys.exit("FAL_KEY is not set.")
    model = a.model or ("fal-ai/flux-pro/kontext" if a.ref else "fal-ai/flux/dev")
    body = {"prompt": prompt, "num_images": a.n}
    if a.ref:
        body["image_url"] = data_uri(a.ref[0])
    else:
        body["image_size"] = FAL_SIZES[a.aspect]
    res = http_json(f"https://fal.run/{model}", body, {"Authorization": f"Key {key}"})
    return [download(i["url"]) for i in res["images"]]

def next_index(out, name):
    i = 1
    while list(out.glob(f"{name}-{i}.*")):
        i += 1
    return i

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("prompt", nargs="?")
    p.add_argument("--preset"); p.add_argument("--list-presets", action="store_true")
    p.add_argument("--aspect", default="1:1", choices=sorted(OPENAI_SIZES))
    p.add_argument("--n", type=int, default=1, choices=range(1, 5))
    p.add_argument("--ref", action="append", default=[])
    p.add_argument("--provider", default="openai", choices=["openai", "fal"])
    p.add_argument("--model"); p.add_argument("--quality", default="medium", choices=["low", "medium", "high"])
    p.add_argument("--out", default="generated"); p.add_argument("--name", default="image")
    p.add_argument("--dry-run", action="store_true")
    a = p.parse_args()

    if a.list_presets:
        for k, v in PRESETS.items(): print(f"{k}: {v}")
        return
    if not a.prompt: p.error("prompt is required")
    prompt = build_prompt(a.prompt, a.preset)
    if a.dry_run:
        print(json.dumps({"provider": a.provider, "model": a.model, "aspect": a.aspect, "n": a.n,
                          "refs": a.ref, "prompt": prompt}, indent=2)); return

    images = (gen_openai if a.provider == "openai" else gen_fal)(a, prompt)
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    mf_path = out / "manifest.json"
    manifest = json.loads(mf_path.read_text()) if mf_path.exists() else []
    start = next_index(out, a.name)
    for off, data in enumerate(images):
        f = out / f"{a.name}-{start + off}.png"
        f.write_bytes(data)
        w, h = png_size(data)
        manifest.append({"file": f.name, "prompt": prompt, "alt": a.prompt[:120], "width": w,
                         "height": h, "aspect": a.aspect, "provider": a.provider, "preset": a.preset})
        print(f)
    mf_path.write_text(json.dumps(manifest, indent=2))

if __name__ == "__main__":
    main()
