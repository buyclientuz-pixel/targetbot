import { register } from "node:module";
import { pathToFileURL } from "node:url";

const baseUrl = pathToFileURL(`${process.cwd()}/`);
register(new URL("./scripts/ts-loader.mjs", baseUrl).href, baseUrl);
