/**
 * Vendors the MediaPipe runtime into public/ so the exhibit needs no network at
 * demo time. The wasm comes from node_modules; the model is a one-time download.
 * Runs automatically after npm install.
 */
import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wasmOut = join(root, "public", "mediapipe", "wasm");
const modelOut = join(root, "public", "mediapipe", "models", "hand_landmarker.task");
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

async function exists(path) {
  try {
    const info = await stat(path);
    return info.size > 0;
  } catch {
    return false;
  }
}

await mkdir(wasmOut, { recursive: true });
await mkdir(dirname(modelOut), { recursive: true });

const wasmSource = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
if (await exists(wasmSource)) {
  await cp(wasmSource, wasmOut, { recursive: true });
  console.log("Vendored MediaPipe wasm from node_modules.");
} else {
  console.warn("@mediapipe/tasks-vision is not installed; skipping wasm.");
}

if (await exists(modelOut)) {
  console.log("Hand landmarker model already present.");
} else {
  try {
    const response = await fetch(MODEL_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await writeFile(modelOut, Buffer.from(await response.arrayBuffer()));
    console.log("Downloaded hand landmarker model.");
  } catch (error) {
    // Mouse input is the demo's backbone; a failed model download must not
    // fail the install.
    console.warn(
      `Could not download the hand landmarker model (${error.message}). ` +
        "Hand tracking will be unavailable; the mouse exhibit is unaffected. " +
        "Re-run: npm run assets:vendor",
    );
  }
}
