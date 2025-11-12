interface LayoutOptions {
  title: string;
  body: string;
  styles?: string;
  scripts?: string;
  nav?: string;
}

const baseNavLinks: { href: string; label: string; id: string }[] = [
  { href: "/admin", label: "Панель", id: "dashboard" },
  { href: "/admin/projects/new", label: "Новый проект", id: "projects" },
  { href: "/admin/payments", label: "Платежи", id: "payments" },
  { href: "/admin/users", label: "Пользователи", id: "users" },
  { href: "/admin/settings", label: "Настройки", id: "settings" },
];

const renderNav = (active?: string, navOverride?: string): string => {
  if (typeof navOverride === "string") {
    return navOverride;
  }
  if (!active) {
    return "";
  }
  const links = baseNavLinks
    .map((link) => {
      const isActive = link.id === active;
      return `<a class="nav-link${isActive ? " active" : ""}" href="${link.href}">${link.label}</a>`;
    })
    .join("");
  return `<nav class="top-nav">${links}</nav>`;
};

export const renderLayout = ({ title, body, styles = "", scripts = "", nav }: LayoutOptions): string => {
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: "Inter", system-ui, sans-serif; margin: 0; padding: 0; background: #f5f7fb; color: #1f2933; }
      header { background: #1f75fe; color: #fff; padding: 16px 24px; }
      main { padding: 24px; max-width: 1200px; margin: 0 auto; }
      h1 { margin-top: 0; font-size: 28px; }
      h2 { margin-top: 32px; font-size: 20px; }
      table { border-collapse: collapse; width: 100%; margin-top: 16px; background: #fff; }
      th, td { border: 1px solid #d9e2ec; padding: 10px 12px; text-align: left; }
      th { background: #f0f4f8; font-weight: 600; }
      .badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 12px; font-size: 12px; font-weight: 600; }
      .badge.success { background: #def7ec; color: #03543f; }
      .badge.warning { background: #fdf6b2; color: #723b13; }
      .badge.error { background: #fde2e1; color: #9b1c1c; }
      .card { background: #fff; border-radius: 12px; padding: 20px; margin-bottom: 24px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); }
      .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
      .btn { display: inline-flex; align-items: center; justify-content: center; padding: 10px 16px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; text-decoration: none; }
      .btn-primary { background: #1f75fe; color: #fff; }
      .btn-secondary { background: #e4ebf5; color: #1f2933; }
      .btn-danger { background: #f05252; color: #fff; }
      .btn.active { background: #1f75fe; color: #fff; }
      .btn .count { margin-left: 8px; padding: 2px 8px; border-radius: 999px; background: rgba(15, 23, 42, 0.08); font-size: 12px; font-weight: 600; }
      .btn.active .count { background: rgba(255, 255, 255, 0.24); color: #fff; }
      .grid { display: grid; gap: 16px; }
      .grid.two { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
      .muted { color: #627d98; font-size: 13px; margin-top: 6px; }
      .empty-state { margin-top: 16px; font-size: 14px; color: #627d98; text-align: center; }
      .hidden { display: none !important; }
      .alert { padding: 12px 16px; border-radius: 10px; font-weight: 600; margin-bottom: 18px; }
      .alert.success { background: #def7ec; color: #03543f; }
      .alert.error { background: #fde2e1; color: #9b1c1c; }
      .alert.info { background: #dceefb; color: #0b69a3; }
      .tabs { display: flex; gap: 12px; margin-top: 16px; }
      .tabs a { padding: 8px 14px; border-radius: 8px; background: #e4ebf5; color: #1f2933; text-decoration: none; font-weight: 600; }
      .tabs a.active { background: #1f75fe; color: #fff; }
      .top-nav { display: flex; gap: 12px; padding: 12px 24px; background: #163d7a; }
      .top-nav .nav-link { color: rgba(255,255,255,0.85); text-decoration: none; font-weight: 600; padding: 6px 12px; border-radius: 8px; }
      .top-nav .nav-link:hover { background: rgba(255,255,255,0.12); }
      .top-nav .nav-link.active { background: #fff; color: #163d7a; }
      ${styles}
    </style>
  </head>
  <body>
    <header>
      <h1>${title}</h1>
    </header>
    ${renderNav(undefined, nav)}
    <main>
      ${body}
    </main>
    <script>
      ${scripts}
    </script>
  </body>
</html>`;
};

interface AdminLayoutOptions extends Omit<LayoutOptions, "nav"> {
  activeNav?: "dashboard" | "projects" | "payments" | "users" | "settings";
}

export const renderAdminLayout = ({ activeNav, ...options }: AdminLayoutOptions): string => {
  const nav = renderNav(activeNav);
  return renderLayout({ ...options, nav });
};
