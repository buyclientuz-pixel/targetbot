import { MetaAdAccount, ProjectRecord, UserRecord } from "../types";
import { renderAdminLayout } from "../components/layout";
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
  const unlinkButton =
    mode === "edit" && (project?.chatId || project?.telegramChatId)
      ? '<button class="btn btn-secondary" type="button" id="unlinkChat">Отвязать от чата</button>'
      : "";
  const deleteButton =
    mode === "edit"
      ? '<button class="btn btn-danger" type="button" id="deleteProject">Удалить</button>'
      : "";
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
          ${unlinkButton}
          ${deleteButton}
        </div>
      </form>
    </section>
  `;

  const scripts = `
    const form = document.getElementById('projectForm');
    const projectId = '${project?.id ?? ""}';
    const projectApiBase = '/projects';

    const showCleanupPrompt = (errorMessage: string): Promise<boolean> => {
      return new Promise((resolve) => {
        let settled = false;
        const backdrop = document.createElement('div');
        const finish = (result: boolean) => {
          if (settled) {
            return;
          }
          settled = true;
          if (backdrop.parentElement) {
            backdrop.parentElement.removeChild(backdrop);
          }
          resolve(result);
        };
        backdrop.className = 'modal-backdrop';
        const card = document.createElement('div');
        card.className = 'modal-card';
        const title = document.createElement('h3');
        title.textContent = 'Удалить невозможно';
        const description = document.createElement('p');
        description.textContent = 'Проект содержит связанные данные.';
        const details = document.createElement('p');
        details.className = 'muted';
        details.textContent = errorMessage;
        const actions = document.createElement('div');
        actions.className = 'modal-actions';
        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'btn btn-danger';
        confirmBtn.textContent = 'Очистить связанные данные';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = 'Отмена';
        confirmBtn.addEventListener('click', () => finish(true));
        cancelBtn.addEventListener('click', () => finish(false));
        backdrop.addEventListener('click', (event) => {
          if (event.target === backdrop) {
            finish(false);
          }
        });
        actions.appendChild(confirmBtn);
        actions.appendChild(cancelBtn);
        card.appendChild(title);
        card.appendChild(description);
        card.appendChild(details);
        card.appendChild(actions);
        backdrop.appendChild(card);
        document.body.appendChild(backdrop);
      });
    };

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
          if (data.ok || data.success) {
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
        if (!projectId) {
          alert('Проект не найден');
          return;
        }
        const deleteProject = async (): Promise<void> => {
          const response = await fetch(projectApiBase + '/' + projectId, { method: 'DELETE' });
          let data: Record<string, unknown> | null = null;
          try {
            data = await response.json();
          } catch (error) {
            data = null;
          }
          if (response.ok && (data?.ok || data?.success)) {
            alert('Проект удалён');
            window.location.href = '/projects';
            return;
          }
          const message = (data?.error as string) || response.statusText || 'Не удалось удалить проект';
          const wantsCleanup = await showCleanupPrompt(message);
          if (!wantsCleanup) {
            alert(message);
            return;
          }
          const cleanupResponse = await fetch(projectApiBase + '/' + projectId + '/cleanup', { method: 'POST' });
          let cleanupData: Record<string, unknown> | null = null;
          try {
            cleanupData = await cleanupResponse.json();
          } catch (error) {
            cleanupData = null;
          }
          if (!cleanupResponse.ok || !cleanupData?.ok) {
            throw new Error((cleanupData?.error as string) || cleanupResponse.statusText || 'Не удалось очистить проект');
          }
          await deleteProject();
        };
        try {
          await deleteProject();
        } catch (error) {
          alert('Не удалось удалить проект: ' + (error as Error).message);
        }
      });
    }
    const unlinkBtn = document.getElementById('unlinkChat');
    if (unlinkBtn) {
      unlinkBtn.addEventListener('click', async () => {
        if (!projectId) {
          alert('Проект не найден');
          return;
        }
        if (!confirm('Отвязать чат и тему от проекта?')) {
          return;
        }
        try {
          const response = await fetch(projectApiBase + '/' + projectId + '/unlink-chat', { method: 'POST' });
          let data: Record<string, unknown> | null = null;
          try {
            data = await response.json();
          } catch (error) {
            data = null;
          }
          if (response.ok && data?.ok) {
            alert('Чат отвязан');
            window.location.reload();
          } else {
            alert('Не удалось отвязать чат: ' + ((data?.error as string) || response.statusText || 'Ошибка'));
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
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      padding: 16px;
    }
    .modal-card {
      background: #fff;
      border-radius: 16px;
      padding: 24px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
    }
    .modal-card h3 { margin: 0 0 8px; font-size: 20px; }
    .modal-card p { margin: 0 0 12px; }
    .modal-card .muted { color: #64748b; font-size: 14px; }
    .modal-actions { display: flex; gap: 12px; justify-content: flex-end; flex-wrap: wrap; }
  `;

  return renderAdminLayout({ title, body, scripts, styles, activeNav: "projects" });
};
