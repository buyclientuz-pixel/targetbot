// @ts-nocheck

const adminClientFactory = () => {
  try {
    const WORKER_URL = "WORKER_URL_PLACEHOLDER";
    const apiHost = WORKER_URL && WORKER_URL.length ? WORKER_URL.trim() : '';
    const hasScheme = apiHost.startsWith('http://') || apiHost.startsWith('https://');
    const baseHost = hasScheme ? apiHost.replace(/\/$/, '') : apiHost ? `https://${apiHost.replace(/\/$/, '')}` : '';
    const originBase = typeof window !== 'undefined' && window.location ? window.location.origin.replace(/\/$/, '') : '';
    const candidates = [
      originBase ? `${originBase}/api/admin` : null,
      baseHost ? `${baseHost}/api/admin` : null,
      '/api/admin',
    ].filter((value, index, array) => typeof value === 'string' && value && array.indexOf(value) === index);
    let primaryApiBase = (candidates[0] ?? '/api/admin');
    const navButtons = Array.from(document.querySelectorAll('[data-nav]'));
    const sections = Array.from(document.querySelectorAll('[data-section]'));
    const refreshButtons = Array.from(document.querySelectorAll('[data-action="refresh"]'));
    const state = {
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
      refreshButtons,
    projectsBody: document.querySelector('[data-projects-body]'),
    projectDetail: document.querySelector('[data-project-detail]'),
    projectDetailTitle: document.querySelector('[data-project-detail-title]'),
    projectDetailMeta: document.querySelector('[data-project-detail-meta]'),
    portalPanel: document.querySelector('[data-portal-panel]'),
    portalDescription: document.querySelector('[data-portal-description]'),
    portalLink: document.querySelector('[data-portal-link]'),
    portalAuto: document.querySelector('[data-portal-auto]'),
    portalRun: document.querySelector('[data-portal-run]'),
    portalSuccess: document.querySelector('[data-portal-success]'),
    portalError: document.querySelector('[data-portal-error]'),
    portalActions: document.querySelector('[data-portal-actions]'),
    portalCreateButton: document.querySelector('[data-portal-create]'),
    portalToggleButton: document.querySelector('[data-portal-toggle]'),
    portalSyncButton: document.querySelector('[data-portal-sync]'),
    portalDeleteButton: document.querySelector('[data-portal-delete]'),
    portalOpenButton: document.querySelector('[data-portal-open]'),
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
    webhookInfo: document.querySelector('[data-webhook-info]'),
    webhookButton: document.querySelector('[data-webhook-reset]'),
    settingsInfo: document.querySelector('[data-settings-info]'),
  };

    const setStatus = (message) => {
      if (els.status) {
        els.status.textContent = message;
      }
    };

    const request = async (path, options = {}) => {
      const baseOrder = [primaryApiBase, ...candidates.filter((candidate) => candidate !== primaryApiBase)];
      let lastError = null;
      for (const base of baseOrder) {
        try {
          const response = await fetch(`${base}${path}`, {
            ...options,
            headers: {
              'content-type': 'application/json',
              ...(options.headers ?? {}),
            },
          });
          let payload = null;
          try {
            payload = await response.clone().json();
          } catch {
            payload = null;
          }
          if (!response.ok || !payload?.ok) {
            throw new Error(payload?.error ?? `Ошибка ${response.status}`);
          }
          primaryApiBase = base;
          return payload.data;
        } catch (error) {
          lastError = error;
          continue;
        }
      }
      throw lastError ?? new Error('API недоступно');
    };

    const pingAdmin = async () => {
      await request('/ping');
    };

    const formatPortalDateTime = (value) => {
      if (!value) {
        return '—';
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return '—';
      }
      return date.toLocaleString('ru-RU');
    };

    const updatePortalPanel = (detail) => {
      if (!els.portalPanel) {
        return;
      }
      if (!detail) {
        els.portalPanel.classList.add('portal-panel--disabled');
        if (els.portalDescription) {
          els.portalDescription.textContent = 'Выберите проект, чтобы управлять порталом.';
        }
        if (els.portalLink) {
          els.portalLink.textContent = '—';
          els.portalLink.removeAttribute('href');
        }
        [els.portalAuto, els.portalRun, els.portalSuccess, els.portalError].forEach((node) => {
          if (node) {
            node.textContent = '—';
          }
        });
        ['portalCreateButton', 'portalToggleButton', 'portalSyncButton', 'portalDeleteButton', 'portalOpenButton'].forEach((key) => {
          const button = els[key];
          if (button) {
            button.disabled = true;
          }
        });
        return;
      }
      els.portalPanel.classList.remove('portal-panel--disabled');
      const portalUrl = detail.project?.portalUrl ?? '';
      const portalInfo = detail.portal ?? { enabled: false, sync: { lastRunAt: null, lastSuccessAt: null, lastErrorMessage: null } };
      const hasPortal = Boolean(portalUrl);
      if (els.portalDescription) {
        els.portalDescription.textContent = hasPortal
          ? 'Ссылка готова к отправке клиенту.'
          : 'Портал ещё не создан.';
      }
      if (els.portalLink) {
        if (hasPortal) {
          els.portalLink.textContent = portalUrl;
          els.portalLink.setAttribute('href', portalUrl);
        } else {
          els.portalLink.textContent = '—';
          els.portalLink.removeAttribute('href');
        }
      }
      if (els.portalAuto) {
        els.portalAuto.textContent = portalInfo.enabled ? 'Включено' : 'Выключено';
      }
      if (els.portalRun) {
        els.portalRun.textContent = formatPortalDateTime(portalInfo.sync?.lastRunAt ?? null);
      }
      if (els.portalSuccess) {
        els.portalSuccess.textContent = formatPortalDateTime(portalInfo.sync?.lastSuccessAt ?? null);
      }
      if (els.portalError) {
        els.portalError.textContent = portalInfo.sync?.lastErrorMessage ?? '—';
      }
      if (els.portalCreateButton) {
        els.portalCreateButton.disabled = hasPortal;
      }
      if (els.portalToggleButton) {
        els.portalToggleButton.disabled = !hasPortal;
        els.portalToggleButton.textContent = portalInfo.enabled ? 'Остановить автообновление' : 'Включить автообновление';
      }
      if (els.portalSyncButton) {
        els.portalSyncButton.disabled = !hasPortal;
      }
      if (els.portalDeleteButton) {
        els.portalDeleteButton.disabled = !hasPortal;
      }
      if (els.portalOpenButton) {
        els.portalOpenButton.disabled = !hasPortal;
      }
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
        <td>${campaign.objectiveLabel || campaign.objective}</td>
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
    updatePortalPanel(null);
  };
    const portalActionPaths = {
      create: (projectId) => `/projects/${projectId}/portal/create`,
      toggle: (projectId) => `/projects/${projectId}/portal/toggle`,
      sync: (projectId) => `/projects/${projectId}/portal/sync`,
      delete: (projectId) => `/projects/${projectId}/portal`,
    };

    const runPortalAction = async (action) => {
      if (!state.selectedProjectId) {
        setStatus('Сначала выберите проект');
        return;
      }
      if (action === 'open') {
        const portalUrl = state.selectedProject?.project?.portalUrl;
        if (portalUrl) {
          window.open(portalUrl, '_blank', 'noopener,noreferrer');
        } else {
          setStatus('Портал ещё не создан');
        }
        return;
      }
      if (action === 'delete' && !window.confirm('Удалить портал?')) {
        return;
      }
      const resolver = portalActionPaths[action];
      if (!resolver) {
        return;
      }
      try {
        const data = await request(resolver(state.selectedProjectId), {
          method: action === 'delete' ? 'DELETE' : 'POST',
        });
        if (data?.message) {
          setStatus(data.message);
        }
        await selectProject(state.selectedProjectId);
      } catch (error) {
        setStatus(error.message);
      }
    };

    const handlePortalActionsClick = (event) => {
      const button = event.target.closest('[data-portal-action]');
      if (!button) {
        return;
      }
      event.preventDefault();
      const action = button.dataset.portalAction;
      if (!action) {
        return;
      }
      void runPortalAction(action);
    };

    const renderProjectDetail = (detail) => {
      state.selectedProject = detail;
      if (!detail || !els.projectDetail) {
        els.projectDetail?.setAttribute('hidden', '');
        clearProjectDetailTables();
        return;
      }
    els.projectDetail.removeAttribute('hidden');
    updatePortalPanel(detail);
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
        const payload = await request(`/projects/${projectId}`);
        const detail = payload?.project ?? payload;
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

    els.projectsBody?.addEventListener('click', handleProjectTableClick);
    els.portalActions?.addEventListener('click', handlePortalActionsClick);
    els.projectCreateForm?.addEventListener('submit', submitProjectCreate);
    els.paymentForm?.addEventListener('submit', submitPayment);
    els.settingsForm?.addEventListener('submit', submitSettings);
    els.webhookButton?.addEventListener('click', resetWebhook);

    if (els.settingsInfo && WORKER_URL) {
      els.settingsInfo.textContent = `WORKER_URL: ${WORKER_URL}`;
    }

    const boot = async () => {
      try {
        await pingAdmin();
        safeSetView('projects');
      } catch (error) {
        setStatus(error.message);
      }
    };

    const runBoot = () => {
      void boot();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runBoot, { once: true });
    } else {
      runBoot();
    }
  } catch (error) {
    console.error('[admin] Failed to bootstrap dashboard', error);
    const status = document.querySelector('[data-status]');
    if (status) {
      status.textContent = `UI ошибка: ${(error && error.message) || 'см. консоль'}`;
    }
  }
};

export const buildAdminClientScript = (workerUrl: string | null): string => {
  const workerUrlJson = JSON.stringify(workerUrl ?? "");
  const script = adminClientFactory
    .toString()
    .replace(/"WORKER_URL_PLACEHOLDER"/g, workerUrlJson);
  return `(${script})();`;
};
