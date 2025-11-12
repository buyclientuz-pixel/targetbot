import { MetaAdAccount, ProjectRecord, UserRecord } from "../types";
import { renderLayout } from "../components/layout";
import { escapeAttribute, escapeHtml } from "../utils/html";

interface ProjectFormProps {
  mode: "create" | "edit";
  project?: ProjectRecord;
  users: UserRecord[];
  accounts: MetaAdAccount[];
}

const option = (value: string, label: string, selected: boolean): string =>
  `<option value="${escapeAttribute(value)}" ${selected ? "selected" : ""}>${escapeHtml(label)}</option>`;

const userOptions = (users: UserRecord[], selectedId?: string): string => {
  if (!users.length) {
    return '<option value="">Нет пользователей</option>';
  }
  return ['<option value="">— выберите пользователя —</option>']
    .concat(users.map((user) => option(user.id, `${user.name} (${user.role})`, user.id === selectedId)))
    .join("\n");
};

const accountOptions = (accounts: MetaAdAccount[], selectedId?: string): string => {
  const items = ['<option value="">— не привязан —</option>'];
  for (const account of accounts) {
    const statusSuffix = account.status
      ? ` (${account.status}${account.statusCode !== undefined ? ` · код ${account.statusCode}` : ""})`
      : "";
    const label = `${account.name}${account.id ? ` · ${account.id}` : ""}${statusSuffix}`;
    if (account.id) {
      items.push(option(account.id, label, account.id === selectedId));
    } else {
      items.push(`<option disabled>${escapeHtml(label)}</option>`);
    }
  }
  return items.join("\n");
};

const valueAttr = (value: unknown): string => escapeAttribute(value ?? "");

export const renderProjectForm = ({ mode, project, users, accounts }: ProjectFormProps): string => {
  const title =
    mode === "create"
      ? "Создать проект"
      : `Редактировать проект — ${escapeHtml(project?.name || "")}`;
  const submitLabel = mode === "create" ? "Создать" : "Сохранить";
  const submitMethod = mode === "create" ? "POST" : "PATCH";
  const submitEndpoint =
    mode === "create"
      ? "/api/projects"
      : project?.id
      ? `/api/projects/${project.id}`
      : "/api/projects";
  const body = `
    <section class="card">
      <form id="projectForm" class="form-grid">
        <div class="field">
          <label for="name">Название проекта</label>
          <input id="name" name="name" type="text" value="${valueAttr(project?.name)}" required />
        </div>
        <div class="field">
          <label for="userId">Владелец (user)</label>
          <select id="userId" name="userId" required>
            ${userOptions(users, project?.userId)}
          </select>
        </div>
        <div class="field">
          <label for="telegramChatId">ID Telegram-чата</label>
          <input
            id="telegramChatId"
            name="telegramChatId"
            type="text"
            value="${valueAttr(project?.telegramChatId)}"
            placeholder="-1001234567890"
          />
        </div>
        <div class="field">
          <label for="telegramThreadId">ID темы (опционально)</label>
          <input
            id="telegramThreadId"
            name="telegramThreadId"
            type="number"
            value="${valueAttr(project?.telegramThreadId)}"
            min="0"
          />
        </div>
        <div class="field">
          <label for="telegramLink">Ссылка на чат</label>
          <input
            id="telegramLink"
            name="telegramLink"
            type="url"
            value="${valueAttr(project?.telegramLink)}"
            placeholder="https://t.me/+..."
          />
        </div>
        <div class="field">
          <label for="adAccountId">Рекламный кабинет</label>
          <select id="adAccountId" name="adAccountId">
            ${accountOptions(accounts, project?.adAccountId)}
          </select>
        </div>
        <div class="actions" style="margin-top:24px;">
          <button class="btn btn-primary" type="submit">${submitLabel}</button>
          <a class="btn btn-secondary" href="/admin">Отмена</a>
          ${
            mode === "edit"
              ? '<button class="btn btn-danger" type="button" id="deleteProject">Удалить</button>'
              : ""
          }
        </div>
      </form>
    </section>
  `;

  const scripts = `
    const form = document.getElementById('projectForm');
    if (form) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(form as HTMLFormElement);
        const payload: Record<string, unknown> = {};
        formData.forEach((value, key) => {
          if (value === '') {
            return;
          }
          if (key === 'telegramThreadId') {
            payload[key] = Number(value);
          } else {
            payload[key] = value;
          }
        });
        const method = '${submitMethod}';
        const endpoint = '${submitEndpoint}';
        try {
          const response = await fetch(endpoint, {
            method,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await response.json();
          if (data.ok) {
            window.location.href = '/admin';
          } else {
            alert('Не удалось сохранить проект: ' + (data.error || 'Ошибка'));
          }
        } catch (error) {
          alert('Ошибка сети: ' + (error as Error).message);
        }
      });
    }
    const deleteBtn = document.getElementById('deleteProject');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (!confirm('Удалить проект безвозвратно?')) return;
        const projectId = '${project?.id ?? ""}';
        if (!projectId) {
          alert('Проект не найден');
          return;
        }
        try {
          const response = await fetch('/api/projects/' + projectId, { method: 'DELETE' });
          const data = await response.json();
          if (data.ok) {
            window.location.href = '/admin';
          } else {
            alert('Не удалось удалить проект: ' + (data.error || 'Ошибка'));
          }
        } catch (error) {
          alert('Ошибка сети: ' + (error as Error).message);
        }
      });
    }
  `;

  const styles = `
    .form-grid { display: grid; gap: 16px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    label { font-weight: 600; font-size: 14px; }
    input, select { padding: 10px 12px; border-radius: 8px; border: 1px solid #cbd2d9; font-size: 14px; }
    input:focus, select:focus { outline: 2px solid #1f75fe44; border-color: #1f75fe; }
  `;

  return renderLayout({ title, body, scripts, styles });
};
