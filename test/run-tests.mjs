import { build } from "esbuild";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";

const testDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(testDir, "..");
const outfile = join(tmpdir(), `worker-${Date.now()}.mjs`);

await build({
  entryPoints: [resolve(rootDir, "src", "index.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
});

const testFile = resolve(rootDir, "test", "spec.mjs");
const child = spawn(process.execPath, ["--test", testFile], {
  stdio: "inherit",
  env: {
    ...process.env,
    WORKER_MODULE_PATH: outfile,
  },
});

const [code] = await once(child, "exit");

await rm(outfile, { force: true });

if (code !== 0) {
  process.exit(code ?? 1);
}
