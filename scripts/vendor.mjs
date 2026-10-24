// Copies the hand-tracking library into static/vendor and downloads the hand model,
// so the app runs fully offline. The model is checked against a pinned SHA-256.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'static', 'vendor', 'mediapipe');
const pkg = join(root, 'node_modules', '@mediapipe', 'tasks-vision');

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const MODEL_SHA256 = 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1';

mkdirSync(join(out, 'wasm'), { recursive: true });
copyFileSync(join(pkg, 'vision_bundle.mjs'), join(out, 'vision_bundle.mjs'));
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) {
  copyFileSync(join(pkg, 'wasm', f), join(out, 'wasm', f));
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const model = join(out, 'hand_landmarker.task');
if (!existsSync(model) || sha(readFileSync(model)) !== MODEL_SHA256) {
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`Model download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha(buf) !== MODEL_SHA256) throw new Error('Model checksum mismatch, refusing to use it');
  writeFileSync(model, buf);
}
console.log('vendor: mediapipe ready');
