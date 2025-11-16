// @ts-nocheck

const adminClientFactory = () => {
  try {
    const STORAGE_KEY = 'targetbot.admin.key';
    const WORKER_URL = "WORKER_URL_PLACEHOLDER";
    const apiHost = WORKER_URL && WORKER_URL.length ? WORKER_URL.trim() : '';
    const hasScheme = apiHost.startsWith('http://') || apiHost.startsWith('https://');
    const isAbsoluteHost = !!apiHost && !apiHost.startsWith('/');
    const baseHost = hasScheme ? apiHost.replace(/\/$/, '') : apiHost ? `https://${apiHost.replace(/\/$/, '')}` : '';
    const API_BASE = isAbsoluteHost && baseHost ? `${baseHost}/api/admin` : '/api/admin';
    const navButtons = Array.from(document.querySelectorAll('[data-nav]'));
    const sections = Array.from(document.querySelectorAll('[data-section]'));
    const refreshButtons = Array.from(document.querySelectorAll('[data-action="refresh"]'));
    const logoutButtons = Array.from(document.querySelectorAll('[data-action="logout"]'));
    const state = {
      key: localStorage.getItem(STORAGE_KEY),
      view: 'projects',
      projects: [],
      selectedProjectId: null,
      selectedProject: null,
    };
    const els = {
      app: document.querySelector('[data-app]'),
      navButtons,
      sections,
      status: document.querySelector('[data-status]'),
      viewTitle: document.querySelector('[data-view-title]'),
      loginPanel: document.querySelector('[data-login-panel]'),
      loginForm: document.querySelector('[data-login-form]'),
      loginInput: document.querySelector('[data-admin-key]'),
      logoutButtons,
      refreshButtons,
    projectsBody: document.querySelector('[data-projects-body]'),
    projectDetail: document.querySelector('[data-project-detail]'),
    projectDetailTitle: document.querySelector('[data-project-detail-title]'),
    projectDetailMeta: document.querySelector('[data-project-detail-meta]'),
    leadsTable: document.querySelector('[data-leads-body]'),
    campaignsTable: document.querySelector('[data-campaigns-body]'),
    paymentsTable: document.querySelector('[data-payments-body]'),
    paymentForm: document.querySelector('[data-payment-form]'),
    projectCreateForm: document.querySelector('[data-project-create]'),
    settingsForm: document.querySelector('[data-settings-form]'),
    analyticsTotals: document.querySelector('[data-analytics-totals]'),
    analyticsProjects: document.querySelector('[data-analytics-projects]'),
    analyticsCampaigns: document.querySelector('[data-analytics-campaigns]'),
    financeTotals: document.querySelector('[data-finance-totals]'),
    financeProjects: document.querySelector('[data-finance-projects]'),
    usersTable: document.querySelector('[data-users-body]'),
    metaTable: document.querySelector('[data-meta-body]'),
    webhookInfo: document.querySelector('[data-webhook-info]'),
    webhookButton: document.querySelector('[data-webhook-reset]'),
    settingsInfo: document.querySelector('[data-settings-info]'),
  };

    const setStatus = (message) => {
      if (els.status) {
        els.status.textContent = message;
      }
    };

    const showLogin = () => {
      els.loginPanel?.classList.add('admin-login--visible');
      setStatus('Введите ключ администратора');
      els.loginInput?.focus();
    };

    const hideLogin = () => {
      els.loginPanel?.classList.remove('admin-login--visible');
    };

    const handleUnauthorized = (message = 'Необходимо ввести ключ администратора') => {
      localStorage.removeItem(STORAGE_KEY);
      state.key = null;
      setStatus(message);
      showLogin();
    };

    const request = async (path, options = {}) => {
      if (!state.key) {
        handleUnauthorized();
        throw new Error('Требуется ключ администратора');
      }
      const response = await fetch(`${API_BASE}${path}`, {
        ...options,
      headers: {
        'content-type': 'application/json',
        'x-admin-key': state.key,
        ...(options.headers ?? {}),
      },
    });
    let payload = null;
    try {
      payload = await response.clone().json();
    } catch {
      payload = null;
    }
    if (response.status === 401) {
      handleUnauthorized();
      throw new Error('Неверный ключ администратора');
    }
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error ?? `Ошибка ${response.status}`);
    }
    return payload.data;
  };

    const highlightNav = (view) => {
      els.navButtons.forEach((button) => {
        if (button.dataset.nav === view) {
          button.classList.add('admin-nav__item--active');
        } else {
          button.classList.remove('admin-nav__item--active');
        }
      });
    };
    const showSection = (view) => {
      els.sections.forEach((section) => {
        section.toggleAttribute('hidden', section.dataset.section !== view);
      });
    };

    const formatCurrency = (value, currency) => {
      if (!currency) {
        return `${value ?? 0}`;
      }
    try {
      return new Intl.NumberFormat('ru-RU', { style: 'currency', currency }).format(value ?? 0);
    } catch {
      return `${value ?? 0} ${currency}`;
    }
  };

    const renderProjects = (projects) => {
      state.projects = projects;
      if (!els.projectsBody) {
        return;
      }
    els.projectsBody.innerHTML = '';
    projects.forEach((project) => {
      const tr = document.createElement('tr');
      tr.dataset.projectRow = project.id;
      tr.innerHTML = `
        <td>${project.name}</td>
        <td>${project.adAccountId ?? '—'}</td>
        <td>${project.chatTitle ?? project.chatId ?? '—'}</td>
        <td>${project.currency}</td>
        <td>${project.kpiLabel}</td>
        <td>${project.createdAt ? new Date(project.createdAt).toLocaleDateString('ru-RU') : '—'}</td>
        <td>${project.status === 'active' ? 'Активен' : 'Ожидает'}</td>
        <td>${project.leadsToday} / ${project.leadsTotal}</td>
        <td>
          <div class="admin-actions">
            <button type="button" class="admin-btn admin-btn--ghost" data-project-action="open" data-project-id="${project.id}">Открыть</button>
            <button type="button" class="admin-btn admin-btn--ghost" data-project-action="refresh" data-project-id="${project.id}">Обновить</button>
            <button type="button" class="admin-btn admin-btn--danger" data-project-action="delete" data-project-id="${project.id}">Удалить</button>
          </div>
        </td>
      `;
      if (project.id === state.selectedProjectId) {
        tr.classList.add('is-selected');
      }
      els.projectsBody?.appendChild(tr);
    });
  };

    const renderLeads = (leads) => {
      if (!els.leadsTable) {
        return;
      }
    els.leadsTable.innerHTML = '';
    leads.leads.forEach((lead) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${lead.name}</td>
        <td>${lead.phone}</td>
        <td>${lead.type ?? '—'}</td>
        <td>${new Date(lead.createdAt).toLocaleString('ru-RU')}</td>
        <td>${lead.campaignName}</td>
        <td>${lead.status}</td>
      `;
      els.leadsTable?.appendChild(tr);
    });
  };

    const renderCampaigns = (campaigns) => {
      if (!els.campaignsTable) {
        return;
      }
    els.campaignsTable.innerHTML = '';
    campaigns.campaigns.forEach((campaign) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${campaign.name}</td>
        <td>${campaign.objective}</td>
        <td>${campaign.status ?? '—'}</td>
        <td>${campaign.kpiType ?? '—'}</td>
        <td>${campaign.spend ?? 0}</td>
        <td>${campaign.leads ?? campaign.messages ?? 0}</td>
        <td>${campaign.clicks ?? 0}</td>
      `;
      els.campaignsTable?.appendChild(tr);
    });
  };

    const renderPayments = (billing, payments) => {
      if (!els.paymentsTable) {
        return;
      }
    els.paymentsTable.innerHTML = '';
    payments.forEach((payment) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${payment.periodFrom} → ${payment.periodTo}</td>
        <td>${formatCurrency(payment.amount, payment.currency)}</td>
        <td>${payment.status}</td>
        <td>${payment.paidAt ? new Date(payment.paidAt).toLocaleString('ru-RU') : '—'}</td>
        <td>${payment.comment ?? '—'}</td>
      `;
      els.paymentsTable?.appendChild(tr);
    });
    const subtitle = document.querySelector('[data-payments-subtitle]');
    if (subtitle) {
      subtitle.textContent = `Следующий платёж: ${billing?.nextPaymentDate ?? '—'} | Автобиллинг: ${billing?.autobilling ? 'вкл' : 'выкл'}`;
    }
  };

    const fillSettingsForm = (detail) => {
      if (!els.settingsForm || !detail) {
        return;
      }
    els.settingsForm.elements.kpiMode.value = detail.project.settings.kpi.mode;
    els.settingsForm.elements.kpiType.value = detail.project.settings.kpi.type;
    els.settingsForm.elements.kpiLabel.value = detail.project.settings.kpi.label;
    els.settingsForm.elements.alertsEnabled.checked = detail.alerts.enabled;
    els.settingsForm.elements.alertsChannel.value = detail.alerts.channel;
    els.settingsForm.elements.alertLead.checked = detail.alerts.types.leadInQueue;
    els.settingsForm.elements.alertPause.checked = detail.alerts.types.pause24h;
    els.settingsForm.elements.alertPayment.checked = detail.alerts.types.paymentReminder;
    els.settingsForm.elements.autoreportsEnabled.checked = detail.autoreports.enabled;
    els.settingsForm.elements.autoreportsTime.value = detail.autoreports.time;
    els.settingsForm.elements.autoreportsSendTo.value = detail.autoreports.sendTo;
  };
    const clearProjectDetailTables = () => {
      if (els.leadsTable) {
        els.leadsTable.innerHTML = '';
      }
    if (els.campaignsTable) {
      els.campaignsTable.innerHTML = '';
    }
    if (els.paymentsTable) {
      els.paymentsTable.innerHTML = '';
    }
  };
    const renderProjectDetail = (detail) => {
      state.selectedProject = detail;
      if (!detail || !els.projectDetail) {
        els.projectDetail?.setAttribute('hidden', '');
        clearProjectDetailTables();
        return;
      }
    els.projectDetail.removeAttribute('hidden');
    els.projectDetailTitle.textContent = detail.project.name;
    const stats = detail.campaigns.summary;
    const leads = `${detail.leads.stats.today} / ${detail.leads.stats.total}`;
    const cpa = stats.leads ? (stats.spend ?? 0) / Math.max(stats.leads, 1) : null;
    els.projectDetailMeta.textContent = `${detail.project.adAccountId ?? 'Без аккаунта'} • CPA: ${cpa ? cpa.toFixed(2) : '—'} • Лиды ${leads}`;
    renderLeads(detail.leads);
    renderCampaigns(detail.campaigns);
    renderPayments(detail.billing, detail.payments.payments ?? []);
    fillSettingsForm(detail);
  };

    const loadProjects = async () => {
      try {
        setStatus('Загружаем проекты...');
        const data = await request('/projects');
      const list = data.projects ?? [];
      renderProjects(list);
      if (list.length === 0) {
        state.selectedProjectId = null;
        renderProjectDetail(null);
      } else {
        const exists = list.some((project) => project.id === state.selectedProjectId);
        const targetId = exists ? state.selectedProjectId : list[0].id;
        if (targetId) {
          state.selectedProjectId = targetId;
          await selectProject(targetId);
        }
      }
      setStatus('Проекты загружены');
    } catch (error) {
      setStatus(error.message);
    }
  };

    const refreshProject = async (projectId) => {
      try {
        await request(`/projects/${projectId}/refresh`, { method: 'POST' });
        await selectProject(projectId);
        setStatus('Данные проекта обновлены');
      } catch (error) {
        setStatus(error.message);
      }
    };

    const deleteProject = async (projectId) => {
      if (!window.confirm('Удалить проект и связанные данные?')) {
        return;
      }
    try {
      await request(`/projects/${projectId}`, { method: 'DELETE' });
      state.selectedProjectId = null;
      await loadProjects();
      setStatus('Проект удалён');
    } catch (error) {
      setStatus(error.message);
    }
  };

    const handleProjectTableClick = (event) => {
      const button = event.target.closest('[data-project-action]');
      if (button) {
        event.stopPropagation();
      const projectId = button.dataset.projectId;
      if (!projectId) {
        return;
      }
      const action = button.dataset.projectAction;
      if (action === 'open') {
        void selectProject(projectId);
      } else if (action === 'refresh') {
        void refreshProject(projectId);
      } else if (action === 'delete') {
        void deleteProject(projectId);
      }
      return;
    }
    const row = event.target.closest('[data-project-row]');
    if (row?.dataset.projectRow) {
      void selectProject(row.dataset.projectRow);
    }
  };

    const selectProject = async (projectId) => {
      state.selectedProjectId = projectId;
      try {
        const detail = await request(`/projects/${projectId}`);
        renderProjectDetail(detail);
      } catch (error) {
        setStatus(error.message);
      }
    };

    const submitProjectCreate = async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
    const payload = {
      id: form.elements.projectId.value.trim(),
      name: form.elements.projectName.value.trim(),
      ownerTelegramId: Number(form.elements.ownerId.value),
      adsAccountId: form.elements.adAccountId.value.trim() || null,
    };
    if (!payload.id || !payload.name || !Number.isFinite(payload.ownerTelegramId)) {
      setStatus('Укажите корректный ID проекта и владельца');
      return;
    }
    try {
      await request('/projects', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      form.reset();
      state.selectedProjectId = payload.id;
      await loadProjects();
      setStatus('Проект создан');
    } catch (error) {
      setStatus(error.message);
    }
  };

    const loadAnalytics = async () => {
      try {
        const data = await request('/analytics');
      if (els.analyticsTotals) {
        const totals = Object.entries(data.totals.spendByCurrency ?? {})
          .map(([currency, spend]) => `${currency}: ${spend.toFixed(2)}`)
          .join(' · ');
        els.analyticsTotals.textContent = `Расходы: ${totals || '—'} | Лиды: ${data.totals.leads} | Сообщения: ${data.totals.messages}`;
      }
      if (els.analyticsProjects) {
        els.analyticsProjects.innerHTML = '';
        data.topProjects.forEach((project) => {
          const li = document.createElement('li');
          li.textContent = `${project.name}: ${project.leads} лидов • ${project.spend.toFixed(2)} $`;
          els.analyticsProjects.appendChild(li);
        });
      }
      if (els.analyticsCampaigns) {
        els.analyticsCampaigns.innerHTML = '';
        data.topCampaigns.forEach((campaign) => {
          const li = document.createElement('li');
          li.textContent = `${campaign.name}: KPI ${campaign.kpi} • ${campaign.spend.toFixed(2)} $`;
          els.analyticsCampaigns.appendChild(li);
        });
      }
      setStatus('Аналитика обновлена');
    } catch (error) {
      setStatus(error.message);
    }
  };

    const loadFinance = async () => {
      try {
        const data = await request('/finance');
      if (els.financeTotals) {
        const totals = Object.entries(data.totals.spendByCurrency ?? {})
          .map(([currency, spend]) => `${currency}: ${spend.toFixed(2)}`)
          .join(' · ');
        els.financeTotals.textContent = `Тарифы: ${totals || '—'}`;
      }
      if (els.financeProjects) {
        els.financeProjects.innerHTML = '';
        data.projects.forEach((project) => {
          const li = document.createElement('li');
          li.textContent = `${project.name}: ${formatCurrency(project.tariff, project.currency)} | Следующий платёж ${project.nextPaymentDate ?? '—'}`;
          els.financeProjects.appendChild(li);
        });
      }
      setStatus('Финансы обновлены');
    } catch (error) {
      setStatus(error.message);
    }
  };

    const loadUsers = async () => {
      try {
        const data = await request('/users');
      if (!els.usersTable) {
        return;
      }
      els.usersTable.innerHTML = '';
      data.users.forEach((user) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${user.userId}</td>
          <td>${user.projectCount}</td>
          <td>${user.language}</td>
          <td>${user.timezone}</td>
          <td>${user.projects.join(', ') || '—'}</td>
        `;
        els.usersTable.appendChild(tr);
      });
    } catch (error) {
      setStatus(error.message);
    }
  };
    const loadMetaAccounts = async () => {
      try {
        const data = await request('/meta/accounts');
      if (!els.metaTable) {
        return;
      }
      els.metaTable.innerHTML = '';
      data.accounts.forEach((account) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${account.userId}</td>
          <td>${new Date(account.expiresAt).toLocaleString('ru-RU')}</td>
          <td>${account.adAccounts.map((item) => `${item.name} (${item.id})`).join(', ')}</td>
        `;
        els.metaTable.appendChild(tr);
      });
    } catch (error) {
      setStatus(error.message);
    }
  };

    const loadWebhookStatus = async () => {
      try {
        const data = await request('/webhook-status');
      if (els.webhookInfo) {
        els.webhookInfo.textContent = `Текущий URL: ${data.info?.url ?? '—'} | Ожидаемый: ${data.expectedUrl ?? '—'}`;
      }
    } catch (error) {
      setStatus(error.message);
    }
  };

    const submitPayment = async (event) => {
      event.preventDefault();
      if (!state.selectedProjectId) {
        return;
      }
    const form = event.currentTarget;
    const payload = {
      amount: Number(form.elements.amount.value),
      currency: form.elements.currency.value,
      periodFrom: form.elements.periodFrom.value,
      periodTo: form.elements.periodTo.value,
      paidAt: form.elements.paidAt.value || null,
      status: form.elements.status.value,
      comment: form.elements.comment.value || null,
    };
    try {
      await request(`/projects/${state.selectedProjectId}/payments/add`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await selectProject(state.selectedProjectId);
      form.reset();
      setStatus('Платёж сохранён');
    } catch (error) {
      setStatus(error.message);
    }
  };

    const submitSettings = async (event) => {
      event.preventDefault();
      if (!state.selectedProjectId) {
        return;
      }
    const form = event.currentTarget;
    const payload = {
      kpi: {
        mode: form.elements.kpiMode.value,
        type: form.elements.kpiType.value,
        label: form.elements.kpiLabel.value,
      },
      alerts: {
        enabled: form.elements.alertsEnabled.checked,
        channel: form.elements.alertsChannel.value,
        types: {
          leadInQueue: form.elements.alertLead.checked,
          pause24h: form.elements.alertPause.checked,
          paymentReminder: form.elements.alertPayment.checked,
        },
      },
      autoreports: {
        enabled: form.elements.autoreportsEnabled.checked,
        time: form.elements.autoreportsTime.value,
        sendTo: form.elements.autoreportsSendTo.value,
      },
    };
    try {
      await request(`/projects/${state.selectedProjectId}/settings`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setStatus('Настройки обновлены');
    } catch (error) {
      setStatus(error.message);
    }
  };

    const resetWebhook = async () => {
      try {
        await request('/webhook-reset', { method: 'POST' });
      await loadWebhookStatus();
      setStatus('Webhook обновлён');
    } catch (error) {
      setStatus(error.message);
    }
  };

    const setView = async (view) => {
      state.view = view;
      highlightNav(view);
      showSection(view);
    if (els.viewTitle) {
      const label = document.querySelector(`[data-nav="${view}"]`)?.textContent ?? 'Админка';
      els.viewTitle.textContent = label;
    }
    switch (view) {
      case 'projects':
        await loadProjects();
        break;
      case 'analytics':
        await loadAnalytics();
        break;
      case 'finance':
        await loadFinance();
        break;
      case 'users':
        await loadUsers();
        break;
      case 'meta':
        await loadMetaAccounts();
        break;
      case 'webhooks':
        await loadWebhookStatus();
        break;
      default:
        break;
    }
  };

    const safeSetView = (view) => {
      if (!view) {
        return;
      }
      void setView(view).catch((error) => setStatus(error.message));
    };

    els.navButtons.forEach((button) => {
      button.addEventListener('click', () => safeSetView(button.dataset.nav));
    });

    els.refreshButtons.forEach((button) => {
      button.addEventListener('click', () => safeSetView(state.view));
    });

    els.logoutButtons.forEach((button) => {
      button.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_KEY);
        state.key = null;
        handleUnauthorized('Ключ очищен');
      });
    });
    els.loginForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const key = els.loginInput?.value.trim();
      if (!key) {
        return;
      }
      localStorage.setItem(STORAGE_KEY, key);
      state.key = key;
      hideLogin();
      safeSetView('projects');
    });

    els.projectsBody?.addEventListener('click', handleProjectTableClick);
    els.projectCreateForm?.addEventListener('submit', submitProjectCreate);
    els.paymentForm?.addEventListener('submit', submitPayment);
    els.settingsForm?.addEventListener('submit', submitSettings);
    els.webhookButton?.addEventListener('click', resetWebhook);

    if (els.settingsInfo && WORKER_URL) {
      els.settingsInfo.textContent = `WORKER_URL: ${WORKER_URL}`;
    }

    const boot = () => {
      if (!state.key) {
        showLogin();
      } else {
        hideLogin();
        safeSetView('projects');
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
      boot();
    }
  } catch (error) {
    console.error('[admin] Failed to bootstrap dashboard', error);
    const status = document.querySelector('[data-status]');
    if (status) {
      status.textContent = `UI ошибка: ${(error && error.message) || 'см. консоль'}`;
    }
    document.querySelector('[data-login-panel]')?.classList.add('admin-login--visible');
  }
};

export const buildAdminClientScript = (workerUrl: string | null): string => {
  const workerUrlJson = JSON.stringify(workerUrl ?? "");
  const script = adminClientFactory
    .toString()
    .replace(/"WORKER_URL_PLACEHOLDER"/g, workerUrlJson);
  return `(${script})();`;
};
