import { SettingRecord } from "../types";
import { renderAdminLayout } from "../components/layout";
import { escapeAttribute, escapeHtml } from "../utils/html";

interface SettingsPageProps {
  settings: SettingRecord[];
}

const SCOPE_LABELS: Record<string, string> = {
  bot: "Telegram-бот",
  portal: "Клиентский портал",
  reports: "Отчёты",
  billing: "Биллинг",
  system: "Система",
};

const displayValue = (value: SettingRecord["value"]): string => {
  if (value === null) {
    return '<span class="muted">null</span>';
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return '<span class="muted">пустая строка</span>';
    }
    return `<code class="inline">${escapeHtml(trimmed)}</code>`;
  }
  try {
    return `<code class="inline">${escapeHtml(JSON.stringify(value))}</code>`;
  } catch (error) {
    return '<span class="muted">[ошибка сериализации]</span>';
  }
};

const serializeValue = (value: SettingRecord["value"]): string => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return "";
  }
};

export const renderSettingsPage = ({ settings }: SettingsPageProps): string => {
  const rows = settings
    .map((setting) => {
      const valueText = serializeValue(setting.value);
      const scopeLabel = SCOPE_LABELS[setting.scope] || setting.scope;
      return `
        <tr data-key="${escapeAttribute(setting.key)}" data-scope="${escapeAttribute(setting.scope)}">
          <td><strong>${escapeHtml(setting.key)}</strong></td>
          <td>${escapeHtml(scopeLabel)}</td>
          <td>${displayValue(setting.value)}</td>
          <td>${escapeHtml(new Date(setting.updatedAt).toLocaleString("ru-RU"))}</td>
          <td>
            <button class="btn btn-secondary" data-action="edit" data-value="${escapeAttribute(valueText)}">Редактировать</button>
          </td>
        </tr>
      `;
    })
    .join("\n");

  const body = `
    <section class="card">
      <h2>Создать или обновить настройку</h2>
      <form id="settingForm" class="form-grid">
        <div class="field">
          <label for="settingKey">Ключ</label>
          <input id="settingKey" name="key" type="text" required placeholder="reports.autoSend" />
        </div>
        <div class="field">
          <label for="settingScope">Область</label>
          <select id="settingScope" name="scope">
            <option value="system">Система</option>
            <option value="bot">Telegram-бот</option>
            <option value="portal">Клиентский портал</option>
            <option value="reports">Отчёты</option>
            <option value="billing">Биллинг</option>
          </select>
        </div>
        <div class="field span-2">
          <label for="settingValue">Значение (JSON или текст)</label>
          <textarea id="settingValue" name="value" rows="6" placeholder='"ru" или { "hour": 9 }'></textarea>
          <p class="muted">Пустое значение сохранит <code>null</code>. Если текст не является валидным JSON, сохранится строка.</p>
        </div>
        <div class="actions">
          <button class="btn btn-primary" type="submit">Сохранить</button>
          <button class="btn btn-secondary" type="button" id="resetSettingForm">Очистить форму</button>
        </div>
      </form>
    </section>
    <section class="card">
      <h2>Текущие настройки (${settings.length})</h2>
      <div class="muted">Настройки синхронизируются через R2 и доступны в API <code>/api/settings</code>.</div>
      <div class="table-wrapper">
        <table id="settingsTable">
          <thead>
            <tr>
              <th>Ключ</th>
              <th>Область</th>
              <th>Значение</th>
              <th>Обновлено</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="5" class="muted">Настройки ещё не заданы</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;

  const styles = `
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    .form-grid .span-2 { grid-column: span 2; }
    @media (max-width: 720px) { .form-grid .span-2 { grid-column: span 1; } }
    .field { display: flex; flex-direction: column; gap: 6px; }
    label { font-weight: 600; font-size: 14px; }
    input, select, textarea { padding: 10px 12px; border-radius: 8px; border: 1px solid #cbd2d9; font-size: 14px; }
    input:focus, select:focus, textarea:focus { outline: 2px solid #1f75fe44; border-color: #1f75fe; }
    textarea { font-family: "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    .inline { background: #f0f4f8; padding: 2px 6px; border-radius: 4px; font-size: 13px; display: inline-block; }
    .table-wrapper { overflow-x: auto; }
  `;

  const scripts = `
    const form = document.getElementById('settingForm');
    const resetBtn = document.getElementById('resetSettingForm');
    const keyInput = document.getElementById('settingKey') as HTMLInputElement | null;
    const scopeSelect = document.getElementById('settingScope') as HTMLSelectElement | null;
    const valueInput = document.getElementById('settingValue') as HTMLTextAreaElement | null;

    const resetForm = () => {
      if (keyInput) keyInput.value = '';
      if (scopeSelect) scopeSelect.value = 'system';
      if (valueInput) valueInput.value = '';
      if (keyInput) keyInput.focus();
    };

    resetBtn?.addEventListener('click', () => resetForm());

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!keyInput || !scopeSelect || !valueInput) {
        return;
      }
      const key = keyInput.value.trim();
      const scope = scopeSelect.value;
      const rawValue = valueInput.value;
      let value: unknown = null;
      const trimmed = rawValue.trim();
      if (trimmed) {
        try {
          value = JSON.parse(trimmed);
        } catch (error) {
          value = rawValue;
        }
      }
      try {
        const response = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key, scope, value }),
        });
        const data = await response.json();
        if (!data.ok) {
          throw new Error(data.error || 'ошибка сохранения');
        }
        window.location.reload();
      } catch (error) {
        alert('Не удалось сохранить настройку: ' + (error && error.message ? error.message : error));
      }
    });

    const table = document.getElementById('settingsTable');
    table?.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (!(target instanceof HTMLButtonElement)) {
        return;
      }
      const row = target.closest('tr');
      if (!row || !keyInput || !scopeSelect || !valueInput) {
        return;
      }
      if (target.dataset.action !== 'edit') {
        return;
      }
      const key = row.getAttribute('data-key');
      const scope = row.getAttribute('data-scope');
      const value = target.getAttribute('data-value') ?? '';
      keyInput.value = key || '';
      scopeSelect.value = scope || 'system';
      valueInput.value = value;
      keyInput.focus();
    });
  `;

  return renderAdminLayout({
    title: "Настройки Targetbot",
    body,
    styles,
    scripts,
    activeNav: "settings",
  });
};
