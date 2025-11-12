import { UserRecord } from "../types";
import { renderLayout } from "../components/layout";

export const renderUsersPage = (users: UserRecord[]): string => {
  const rows = users
    .map(
      (user) => `
        <tr data-id="${user.id}">
          <td>${user.id}</td>
          <td>${user.name}</td>
          <td>${user.username || "—"}</td>
          <td>${user.role}</td>
          <td>${new Date(user.createdAt).toLocaleString("ru-RU")}</td>
          <td>
            <select class="role-select">
              <option value="client" ${user.role === "client" ? "selected" : ""}>client</option>
              <option value="manager" ${user.role === "manager" ? "selected" : ""}>manager</option>
              <option value="admin" ${user.role === "admin" ? "selected" : ""}>admin</option>
            </select>
            <button class="btn btn-danger delete-user" type="button">Удалить</button>
          </td>
        </tr>
      `,
    )
    .join("\n");

  const body = `
    <section class="card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h2>Пользователи</h2>
        <button class="btn btn-primary" id="refreshUsers">Обновить</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Имя</th>
            <th>Username</th>
            <th>Роль</th>
            <th>Дата регистрации</th>
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
    const refresh = document.getElementById('refreshUsers');
    if (refresh) {
      refresh.addEventListener('click', () => window.location.reload());
    }

    document.querySelectorAll('.role-select').forEach((select) => {
      select.addEventListener('change', async (event) => {
        const row = (event.target as HTMLSelectElement).closest('tr');
        if (!row) return;
        const id = row.getAttribute('data-id');
        const role = (event.target as HTMLSelectElement).value;
        const response = await fetch('/api/users/' + id, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ role }),
        });
        const data = await response.json();
        if (!data.ok) {
          alert('Не удалось обновить роль: ' + data.error);
          window.location.reload();
        }
      });
    });

    document.querySelectorAll('.delete-user').forEach((button) => {
      button.addEventListener('click', async (event) => {
        const row = (event.target as HTMLButtonElement).closest('tr');
        if (!row) return;
        const id = row.getAttribute('data-id');
        if (!confirm('Удалить пользователя?')) return;
        const response = await fetch('/api/users/' + id, { method: 'DELETE' });
        const data = await response.json();
        if (data.ok) {
          row.remove();
        } else {
          alert('Ошибка удаления: ' + data.error);
        }
      });
    });
  `;

  return renderLayout({ title: "Targetbot — пользователи", body, scripts });
};
