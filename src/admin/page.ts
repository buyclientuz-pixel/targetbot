import html from "./index.html?raw";
import style from "./style.css?raw";
import apiScript from "./api.js?raw";
import mainScript from "./script.js?raw";

const page = html
  .replace("/*STYLE_PLACEHOLDER*/", style)
  .replace("/*SCRIPT_PLACEHOLDER*/", `${apiScript}\n${mainScript}`);

export function renderAdminPage() {
  return new Response(page, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
