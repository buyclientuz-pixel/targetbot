import { LeadRecord, ProjectRecord } from "../types";
import { renderLayout } from "../components/layout";

interface PortalViewProps {
  project: ProjectRecord;
  leads: LeadRecord[];
}

const leadRow = (lead: LeadRecord): string => {
  const action =
    lead.status === "done"
      ? `<button class="btn btn-secondary" data-action="new" data-id="${lead.id}">↩️</button>`
      : `<button class="btn btn-primary" data-action="done" data-id="${lead.id}">✔</button>`;
  return `
    <tr>
      <td>${lead.name}</td>
      <td>${lead.phone || "—"}</td>
      <td>${lead.source}</td>
      <td>${new Date(lead.createdAt).toLocaleString("ru-RU")}</td>
      <td>${lead.status}</td>
      <td>${action}</td>
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

  const scripts = `
    document.querySelectorAll('#leadsTable button').forEach((button) => {
      button.addEventListener('click', async (event) => {
        const target = event.target as HTMLButtonElement;
        const id = target.getAttribute('data-id');
        const action = target.getAttribute('data-action');
        if (!id || !action) return;
        target.setAttribute('disabled', 'true');
        try {
          const response = await fetch('/api/leads/' + id, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status: action === 'done' ? 'done' : 'new', projectId: '${project.id}' }),
          });
          const data = await response.json();
          if (!data.ok) {
            alert('Ошибка обновления статуса: ' + data.error);
          } else {
            window.location.reload();
          }
        } catch (error) {
          alert('Ошибка сети: ' + error.message);
        }
      });
    });
  `;

  return renderLayout({ title: `Портал — ${project.name}`, body, scripts });
};
