import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

async function collectTsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTsFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

async function run() {
  const files = await collectTsFiles("src/api");
  if (!files.length) {
    console.log("No API TypeScript files found");
    return;
  }
  for (const file of files) {
    await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["--experimental-strip-types", "--check", file],
        { stdio: "inherit" },
      );
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Type check failed for ${file}`));
        }
      });
      child.on("error", reject);
    });
  }
  console.log(`Checked ${files.length} API files`);
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
