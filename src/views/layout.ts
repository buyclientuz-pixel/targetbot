import { escapeHtml, joinHtml } from "../utils/html";

interface LayoutOptions {
  title: string;
  sidebar?: string;
  scripts?: string;
}

export const renderLayout = (content: string, options: LayoutOptions): string => {
  const head = joinHtml([
    '<!DOCTYPE html>',
    '<html lang="ru" class="h-full bg-slate-900">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(options.title)}</title>`,
    '<script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>',
    '<style>',
    ':root { color-scheme: dark; }',
    '.accent { color: #00B87C; }',
    '</style>',
    '</head>',
    '<body class="min-h-screen bg-slate-900 text-slate-100">',
    '<div class="min-h-screen flex flex-col md:flex-row">',
    options.sidebar
      ? `<aside class="w-full md:w-64 bg-slate-950 border-b md:border-b-0 md:border-r border-slate-800">${options.sidebar}</aside>`
      : '',
    '<main class="flex-1">',
    '<div class="mx-auto max-w-6xl p-6">',
    content,
    '</div>',
    '</main>',
    '</div>',
    options.scripts || '',
    '</body></html>',
  ]);

  return head;
};
