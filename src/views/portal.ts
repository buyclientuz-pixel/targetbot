import { LeadRecord, ProjectRecord } from "../types";
import { renderLayout } from "../components/layout";

interface PortalViewProps {
  project: ProjectRecord;
  leads: LeadRecord[];
}

const statusBadge = (status: LeadRecord["status"]): string => {
  const meta =
    status === "done"
      ? { label: "Завершён", variant: "success" }
      : { label: "Новый", variant: "warning" };
  return `<span class="badge ${meta.variant}">${meta.label}</span>`;
};

const leadRow = (lead: LeadRecord): string => {
  const action =
    lead.status === "done"
      ? `<button class="btn btn-secondary" data-action="new" data-id="${lead.id}">↩️</button>`
      : `<button class="btn btn-primary" data-action="done" data-id="${lead.id}">✔</button>`;
  return `
    <tr data-status="${lead.status}">
      <td>${lead.name}</td>
      <td>${lead.phone || "—"}</td>
      <td>${lead.source}</td>
      <td>${new Date(lead.createdAt).toLocaleString("ru-RU")}</td>
      <td data-role="status">${statusBadge(lead.status)}</td>
      <td data-role="action">${action}</td>
    </tr>
  `;
};

export const renderPortal = ({ project, leads }: PortalViewProps): string => {
  const rows = leads.map(leadRow).join("\n");
  const body = `
    <section class="card">
      <h2>${project.name}</h2>
      <p class="muted">Чат: ${project.telegramLink || project.telegramChatId || "—"}</p>
      <p class="muted">Рекламный кабинет: ${project.adAccountId || "—"}</p>
    </section>
    <section class="card">
      <h2>Лиды</h2>
      <div class="actions" id="leadFilters">
        <button class="btn btn-secondary active" data-filter="all">Все</button>
        <button class="btn btn-secondary" data-filter="new">Новые</button>
        <button class="btn btn-secondary" data-filter="done">Завершённые</button>
      </div>
      <table id="leadsTable">
        <thead>
          <tr>
            <th>Имя</th>
            <th>Телефон</th>
            <th>Источник</th>
            <th>Дата</th>
            <th>Статус</th>
            <th>Действие</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </section>
  `;

  const projectIdLiteral = JSON.stringify(project.id);

  const scripts = `
    (function () {
      const statusMap = {
        new: { label: 'Новый', badge: 'warning', action: { target: 'done', text: '✔', className: 'btn-primary' } },
        done: { label: 'Завершён', badge: 'success', action: { target: 'new', text: '↩️', className: 'btn-secondary' } },
      };

      const filters = Array.from(document.querySelectorAll('#leadFilters button'));
      const rows = Array.from(document.querySelectorAll('#leadsTable tbody tr'));
      let activeFilter = 'all';

      const applyFilter = () => {
        rows.forEach((row) => {
          const status = row.getAttribute('data-status');
          const visible = activeFilter === 'all' || status === activeFilter;
          row.style.display = visible ? '' : 'none';
        });
      };

      filters.forEach((button) => {
        button.addEventListener('click', () => {
          filters.forEach((btn) => btn.classList.remove('active'));
          button.classList.add('active');
          activeFilter = button.getAttribute('data-filter') || 'all';
          applyFilter();
        });
      });

      const updateRow = (row, status) => {
        const meta = statusMap[status];
        if (!meta) return;
        row.setAttribute('data-status', status);
        const statusCell = row.querySelector('[data-role="status"]');
        if (statusCell) {
          statusCell.innerHTML = '<span class="badge ' + meta.badge + '">' + meta.label + '</span>';
        }
        const actionCell = row.querySelector('[data-role="action"]');
        const button = actionCell ? actionCell.querySelector('button') : null;
        if (button) {
          button.classList.remove('btn-primary', 'btn-secondary');
          button.classList.add(meta.action.className);
          button.setAttribute('data-action', meta.action.target);
          button.textContent = meta.action.text;
        }
      };

      document.querySelectorAll('#leadsTable button').forEach((button) => {
        button.addEventListener('click', async (event) => {
          const target = event.currentTarget;
          if (!(target instanceof HTMLButtonElement)) return;
          const row = target.closest('tr');
          const id = target.getAttribute('data-id');
          const action = target.getAttribute('data-action');
          if (!row || !id || !action) return;
          target.setAttribute('disabled', 'true');
          try {
            const response = await fetch('/api/leads/' + id, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ status: action === 'done' ? 'done' : 'new', projectId: ${projectIdLiteral} }),
            });
            const data = await response.json();
            if (!data.ok || !data.data || (data.data.status !== 'new' && data.data.status !== 'done')) {
              alert('Ошибка обновления статуса: ' + (data.error || 'неизвестная ошибка'));
              return;
            }
            updateRow(row, data.data.status);
            applyFilter();
          } catch (error) {
            const message = error && error.message ? error.message : String(error);
            alert('Ошибка сети: ' + message);
          } finally {
            target.removeAttribute('disabled');
          }
        });
      });

      applyFilter();
    })();
  `;

  return renderLayout({ title: `Портал — ${project.name}`, body, scripts });
};
