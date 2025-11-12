import { PaymentRecord, PaymentStatus, ProjectRecord } from "../types";
import { renderAdminLayout } from "../components/layout";
import { escapeAttribute, escapeHtml } from "../utils/html";

interface PaymentsPageProps {
  payments: PaymentRecord[];
  projects: ProjectRecord[];
  activeProjectId?: string | null;
}

const STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Ожидает оплаты",
  active: "Активен",
  overdue: "Просрочен",
  cancelled: "Отменён",
};

const formatCurrency = (amount: number, currency: string): string => {
  try {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(amount);
  } catch (error) {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

const formatDate = (value?: string | null): string => {
  if (!value) {
    return "—";
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return escapeHtml(value);
  }
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
};

const projectLabel = (projects: ProjectRecord[], projectId: string): string => {
  const project = projects.find((entry) => entry.id === projectId);
  if (!project) {
    return projectId;
  }
  return `${project.name} · ${projectId}`;
};

const buildProjectOptions = (projects: ProjectRecord[], activeProjectId?: string | null): string => {
  const options = projects.map((project) => {
    const label = `${project.name}${project.adAccountId ? ` · ${project.adAccountId}` : ""}`;
    const selected = project.id === activeProjectId ? "selected" : "";
    return `<option value="${escapeAttribute(project.id)}" ${selected}>${escapeHtml(label)}</option>`;
  });
  return ['<option value="">— выберите проект —</option>', ...options].join("\n");
};

const buildStatusOptions = (current: PaymentStatus): string => {
  return (Object.keys(STATUS_LABELS) as PaymentStatus[])
    .map((status) => {
      const selected = status === current ? "selected" : "";
      return `<option value="${status}" ${selected}>${escapeHtml(STATUS_LABELS[status])}</option>`;
    })
    .join("\n");
};

const paymentRow = (payment: PaymentRecord, projects: ProjectRecord[]): string => {
  const amount = `${payment.amount.toFixed(2)} ${escapeHtml(payment.currency)}`;
  const amountFormatted = formatCurrency(payment.amount, payment.currency);
  const paidAt = payment.paidAt ? formatDate(payment.paidAt) : "—";
  return `
    <tr data-id="${escapeAttribute(payment.id)}">
      <td>${escapeHtml(projectLabel(projects, payment.projectId))}</td>
      <td>${escapeHtml(amountFormatted || amount)}</td>
      <td>${formatDate(payment.periodStart)} — ${formatDate(payment.periodEnd)}</td>
      <td>
        <select data-role="status">
          ${buildStatusOptions(payment.status)}
        </select>
      </td>
      <td>${paidAt}</td>
      <td>${payment.notes ? escapeHtml(payment.notes) : "—"}</td>
      <td class="actions">
        <button class="btn btn-secondary" data-action="update">Сохранить</button>
        <button class="btn btn-danger" data-action="delete">Удалить</button>
      </td>
    </tr>
  `;
};

export const renderPaymentsPage = ({ payments, projects, activeProjectId }: PaymentsPageProps): string => {
  const sortedPayments = [...payments].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const rows = sortedPayments.map((payment) => paymentRow(payment, projects)).join("\n");
  const body = `
    <section class="card">
      <h2>Создать оплату</h2>
      <form id="createPayment" class="form-grid">
        <div class="field">
          <label for="projectId">Проект</label>
          <select id="projectId" name="projectId" required>
            ${buildProjectOptions(projects, activeProjectId)}
          </select>
        </div>
        <div class="field">
          <label for="amount">Сумма</label>
          <input id="amount" name="amount" type="number" min="0" step="0.01" required />
        </div>
        <div class="field">
          <label for="currency">Валюта</label>
          <input id="currency" name="currency" type="text" value="USD" maxlength="3" required />
        </div>
        <div class="field">
          <label for="periodStart">Начало периода</label>
          <input id="periodStart" name="periodStart" type="date" required />
        </div>
        <div class="field">
          <label for="periodEnd">Конец периода</label>
          <input id="periodEnd" name="periodEnd" type="date" required />
        </div>
        <div class="field">
          <label for="status">Статус</label>
          <select id="status" name="status" required>
            ${buildStatusOptions("pending")}
          </select>
        </div>
        <div class="field">
          <label for="paidAt">Оплачен</label>
          <input id="paidAt" name="paidAt" type="date" />
        </div>
        <div class="field" style="grid-column: 1 / -1;">
          <label for="notes">Заметки</label>
          <textarea id="notes" name="notes" rows="2" placeholder="Комментарий или ссылка на счет"></textarea>
        </div>
        <div class="actions" style="grid-column: 1 / -1;">
          <button class="btn btn-primary" type="submit">Сохранить</button>
          <a class="btn btn-secondary" href="/admin">Назад</a>
        </div>
      </form>
    </section>
    <section class="card">
      <h2>История оплат</h2>
      <table id="paymentsTable">
        <thead>
          <tr>
            <th>Проект</th>
            <th>Сумма</th>
            <th>Период</th>
            <th>Статус</th>
            <th>Оплачен</th>
            <th>Заметки</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="7" class="muted">Записей оплат пока нет.</td></tr>'}
        </tbody>
      </table>
    </section>
  `;

  const scripts = `
    (function () {
      const toIso = (value) => {
        if (!value) return undefined;
        const date = new Date(value + 'T00:00:00Z');
        if (Number.isNaN(date.getTime())) return undefined;
        return date.toISOString();
      };

      const form = document.getElementById('createPayment');
      if (form instanceof HTMLFormElement) {
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const data = new FormData(form);
          const payload = {
            projectId: data.get('projectId') || undefined,
            amount: data.get('amount') || undefined,
            currency: (data.get('currency') || '').toString().toUpperCase(),
            status: data.get('status') || undefined,
            periodStart: toIso(data.get('periodStart')),
            periodEnd: toIso(data.get('periodEnd')),
            paidAt: data.get('paidAt') ? toIso(data.get('paidAt')) : null,
            notes: data.get('notes') || undefined,
          };
          try {
            const response = await fetch('/api/payments', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            });
            const json = await response.json();
            if (!json.ok) {
              alert('Не удалось сохранить оплату: ' + (json.error || 'ошибка'));
              return;
            }
            window.location.reload();
          } catch (error) {
            alert('Ошибка сети: ' + (error && error.message ? error.message : error));
          }
        });
      }

      const table = document.getElementById('paymentsTable');
      if (!(table instanceof HTMLTableElement)) {
        return;
      }

      table.addEventListener('click', async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLButtonElement)) {
          return;
        }
        const action = target.getAttribute('data-action');
        const row = target.closest('tr');
        if (!row) {
          return;
        }
        const id = row.getAttribute('data-id');
        if (!id) {
          return;
        }

        if (action === 'delete') {
          if (!confirm('Удалить оплату?')) return;
          target.setAttribute('disabled', 'true');
          try {
            const response = await fetch('/api/payments/' + id, { method: 'DELETE' });
            const json = await response.json();
            if (!json.ok) {
              alert('Не удалось удалить оплату: ' + (json.error || 'ошибка'));
              target.removeAttribute('disabled');
              return;
            }
            row.remove();
          } catch (error) {
            alert('Ошибка сети: ' + (error && error.message ? error.message : error));
            target.removeAttribute('disabled');
          }
          return;
        }

        if (action === 'update') {
          const statusSelect = row.querySelector('[data-role="status"]');
          if (!(statusSelect instanceof HTMLSelectElement)) {
            return;
          }
          target.setAttribute('disabled', 'true');
          try {
            const response = await fetch('/api/payments/' + id, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ status: statusSelect.value }),
            });
            const json = await response.json();
            if (!json.ok) {
              alert('Не удалось обновить оплату: ' + (json.error || 'ошибка'));
              target.removeAttribute('disabled');
              return;
            }
            alert('Статус оплаты обновлён.');
          } catch (error) {
            alert('Ошибка сети: ' + (error && error.message ? error.message : error));
          } finally {
            target.removeAttribute('disabled');
          }
        }
      });
    })();
  `;

  const styles = `
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    input, select, textarea { padding: 10px 12px; border-radius: 8px; border: 1px solid #cbd2d9; font-size: 14px; }
    input:focus, select:focus, textarea:focus { outline: 2px solid #1f75fe44; border-color: #1f75fe; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #e5e9f0; text-align: left; padding: 10px 12px; }
    tbody tr:hover { background: #f8fafc; }
    td.actions { white-space: nowrap; }
    td.actions .btn { margin-right: 6px; }
  `;

  return renderAdminLayout({ title: "Оплаты проектов", body, scripts, styles, activeNav: "payments" });
};

