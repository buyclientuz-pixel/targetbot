import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const compilerOptions = {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2020,
  esModuleInterop: true,
};

const ensureUrl = (specifier, parentURL) => {
  const base = parentURL ?? pathToFileURL(path.join(process.cwd(), "./")).href;
  return new URL(specifier, base);
};

const tryResolveTs = async (candidateUrl) => {
  const filePath = fileURLToPath(candidateUrl);
  try {
    await access(filePath);
    return candidateUrl.href;
  } catch (error) {
    return null;
  }
};

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const url = ensureUrl(specifier, context.parentURL);
    if (!path.extname(url.pathname)) {
      const withTs = new URL(`${url.href}.ts`);
      const resolvedTs = await tryResolveTs(withTs);
      if (resolvedTs) {
        return { url: resolvedTs, shortCircuit: true };
      }
      const indexTs = new URL(`${url.href}/index.ts`);
      const resolvedIndex = await tryResolveTs(indexTs);
      if (resolvedIndex) {
        return { url: resolvedIndex, shortCircuit: true };
      }
    }
  }
  return defaultResolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  if (url.endsWith(".ts")) {
    const filePath = fileURLToPath(url);
    const source = await readFile(filePath, "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions,
      fileName: filePath,
      reportDiagnostics: false,
    });
    return { format: "module", source: transpiled.outputText, shortCircuit: true };
  }
  return defaultLoad(url, context, defaultLoad);
}
