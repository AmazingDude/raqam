import { open, mkdir, writeFile } from 'node:fs/promises';
import { imageDataUrl, MAX_IMAGE_BYTES, PROMPT_VERSION, proofClient, REQUEST_TIMEOUT_MS, runProofCase } from './feasibility-support.ts';

const HELP = `Usage: npm run test:ai:live -- [--dry-run] [--save] <image1.png> [image2.jpg] [image3.png]
Loads ignored .env.local using Node. Live mode requires GROQ_API_KEY and GROQ_VISION_MODEL.
Only the explicitly supplied images are sent to Groq; use synthetic/non-private receipts.
--dry-run validates images without network access or credentials.
--save writes extracted fields to ignored artifacts/ai-live/feasibility.json (overwrites prior proof).
Maximum: 3 PNG/JPEG images, 4 MiB each, one request per image, 30 seconds per request, zero retries.
RQ-02 needs three fresh cases: clean, changed layout, and unclear/missing fields.
Schema validity is not measured extraction accuracy.`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') { console.log(HELP); return; }
  const dryRun = args.includes('--dry-run');
  const save = args.includes('--save');
  if (args.some(arg => arg.startsWith('--') && arg !== '--dry-run' && arg !== '--save')) {
    throw new Error('unknown_option; use --help');
  }
  const paths = args.filter(arg => !arg.startsWith('--'));
  if (paths.length < 1 || paths.length > 3) throw new Error('supply_1_to_3_images; use --help');
  // Validate all local inputs before the first provider request. Do not print paths/content.
  const images: string[] = [];
  for (const path of paths) {
    const file = await open(path, 'r');
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size < 1 || stat.size > MAX_IMAGE_BYTES) throw new Error('invalid_image_size');
      const bytes = Buffer.alloc(MAX_IMAGE_BYTES + 1);
      let length = 0;
      while (length < bytes.length) {
        const read = await file.read(bytes, length, bytes.length - length, null);
        if (read.bytesRead === 0) break;
        length += read.bytesRead;
      }
      images.push(imageDataUrl(bytes.subarray(0, length)));
    } finally { await file.close(); }
  }
  if (dryRun) {
    console.log(JSON.stringify({ mode: 'dry_run', validInputs: images.length, providerRequests: 0 }));
    return;
  }
  const apiKey = process.env.GROQ_API_KEY?.trim();
  const model = process.env.GROQ_VISION_MODEL?.trim();
  const missing = [!apiKey && 'GROQ_API_KEY', !model && 'GROQ_VISION_MODEL'].filter(Boolean);
  if (missing.length) throw new Error(`missing_configuration: ${missing.join(', ')}`);
  const client = proofClient(apiKey!);
  const cases = [];
  // Serial, bounded to at most three single-attempt requests (90 seconds total request budget).
  for (const [index, image] of images.entries()) {
    const result = await runProofCase(client, model!, image);
    cases.push({ case: index + 1, ...result });
    console.log(JSON.stringify({ case: index + 1, outcome: result.outcome, elapsedMs: result.elapsedMs }));
  }
  const schemaValid = cases.filter(item => item.outcome === 'schema_valid').length;
  if (save) {
    await mkdir('artifacts/ai-live', { recursive: true });
    await writeFile('artifacts/ai-live/feasibility.json', JSON.stringify({
      model, promptVersion: PROMPT_VERSION, measuredAt: new Date().toISOString(),
      timeoutMs: REQUEST_TIMEOUT_MS, maxRetries: 0, cases,
    }, null, 2) + '\n', { mode: 0o600 });
  }
  console.log(JSON.stringify({ mode: 'live', schemaValid, total: cases.length, accuracyMeasured: false, saved: save }));
  if (schemaValid !== cases.length) process.exitCode = 1;
}

main().catch(error => {
  // Emit only our allowlisted diagnostics; filesystem/provider errors can contain private values.
  const message = error instanceof Error ? error.message : '';
  const safe = /^(unknown_option|supply_1_to_3_images|invalid_image_size|unsupported_image|missing_configuration:)/.test(message);
  console.error(safe ? message : 'proof_failed; check local inputs/configuration without sharing secrets');
  process.exitCode = 1;
});
