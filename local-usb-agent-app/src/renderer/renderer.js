// Load i18n module
let i18n = null;

async function initI18n() {
  if (window.agent && window.agent.getTranslations) {
    const locale = await window.agent.getLocale();
    const data = await window.agent.getTranslations(locale);
    i18n = {
      t: (key, params) => {
        const keys = key.split('.');
        let value = data.translations;
        for (const k of keys) {
          if (value && typeof value === 'object' && k in value) {
            value = value[k];
          } else {
            return key;
          }
        }
        if (typeof value !== 'string') return key;
        if (params && Object.keys(params).length > 0) {
          return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
            return params[paramKey] !== undefined ? String(params[paramKey]) : match;
          });
        }
        return value;
      },
      getLocale: () => data.locale
    };
    
    // Listen for locale changes
    window.agent.onLocaleChanged(async (payload) => {
      const newData = await window.agent.getTranslations(payload.locale);
      i18n = {
        t: (key, params) => {
          const keys = key.split('.');
          let value = newData.translations;
          for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
              value = value[k];
            } else {
              return key;
            }
          }
          if (typeof value !== 'string') return key;
          if (params && Object.keys(params).length > 0) {
            return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
              return params[paramKey] !== undefined ? String(params[paramKey]) : match;
            });
          }
          return value;
        },
        getLocale: () => newData.locale
      };
      updateUI();
    });
  }
}

function t(key, params) {
  return i18n ? i18n.t(key, params) : key;
}

const statusChip = document.getElementById('status-chip');
const statusMeta = document.getElementById('status-meta');
const shopIdInput = document.getElementById('shop-id');
const serverPortInput = document.getElementById('server-port');
const autostartToggle = document.getElementById('autostart-toggle');
const allowSelfSignedToggle = document.getElementById('allow-self-signed');
const backgroundModeToggle = document.getElementById('background-mode-toggle');
const autoTestOnAttachToggle = document.getElementById('auto-test-on-attach');
const deviceTable = document.getElementById('device-table');
const logViewer = document.getElementById('log-viewer');
const logPathLabel = document.getElementById('log-path');
const updatesFeedUrlInput = document.getElementById('updates-feed-url');
const updatesChannelSelect = document.getElementById('updates-channel');
const updatesAutoDownloadToggle = document.getElementById('updates-auto-download');
const restartButton = document.getElementById('btn-restart-app');
const quitButton = document.getElementById('btn-quit-app');
const versionBadge = document.getElementById('version-badge');
const updateStatusChip = document.getElementById('update-status');
const updateMessage = document.getElementById('update-message');
const updateLastChecked = document.getElementById('update-last-checked');
const updateProgressBlock = document.getElementById('update-progress');
const updateProgressFill = document.getElementById('update-progress-fill');
const updateProgressLabel = document.getElementById('update-progress-label');
const updateReleaseNotes = document.getElementById('update-release-notes');
const updateReleaseContent = document.getElementById('update-release-content');
const telemetryStatusChip = document.getElementById('telemetry-status-chip');
const telemetryLastSync = document.getElementById('telemetry-last-sync');
const telemetryMessage = document.getElementById('telemetry-message');
const telemetryNextSync = document.getElementById('telemetry-next-sync');
const telemetryEnabledToggle = document.getElementById('telemetry-enabled');
const telemetryIncludeLogsToggle = document.getElementById('telemetry-include-logs');
const telemetryEndpointInput = document.getElementById('telemetry-endpoint');
const telemetryIntervalInput = document.getElementById('telemetry-interval');
const telemetryLogPreview = document.getElementById('telemetry-log-preview');
const telemetryLogContent = document.getElementById('telemetry-log-content');
const historySummary = document.getElementById('history-summary');
const historyTableBody = document.getElementById('history-table-body');
const hotplugEventsContainer = document.getElementById('hotplug-events');
const languageSelect = document.getElementById('language-select');

const DEFAULT_UPDATE_FEED_URL = 'https://pa.easyify.uk/updates/local-usb-agent';
const HOTPLUG_HIGHLIGHT_MS = 15000;

const saveButton = document.getElementById('btn-save-config');
const refreshButton = document.getElementById('btn-refresh');
const refreshDevicesButton = document.getElementById('btn-refresh-devices');
const refreshLogsButton = document.getElementById('btn-refresh-logs');
const checkUpdateButton = document.getElementById('btn-check-update');
const installUpdateButton = document.getElementById('btn-install-update');
const sendHeartbeatButton = document.getElementById('btn-send-heartbeat');
const refreshHistoryButton = document.getElementById('btn-refresh-history');
const clearHistoryButton = document.getElementById('btn-clear-history');
const onboardingBackdrop = document.getElementById('onboarding-backdrop');
const onboardingTitle = document.getElementById('onboarding-title');
const onboardingSubtitle = document.getElementById('onboarding-subtitle');
const onboardingBody = document.getElementById('onboarding-body');
const btnOnboardingSkip = document.getElementById('btn-onboarding-skip');
const btnOnboardingPrev = document.getElementById('btn-onboarding-prev');
const btnOnboardingNext = document.getElementById('btn-onboarding-next');

let currentDevices = [];
let currentConfig = {};
let currentUpdateState = {};
let currentTelemetryState = {};
let printerMappings = {};
let printHistory = [];
let currentTcpPrinters = [];
const hotplugEvents = [];
const hotplugMarkers = new Map();
const onboardingState = {
  data: null,
  visible: false,
  currentStep: 0
};

function getDefaultPrinterMapping() {
  const entries = Object.entries(printerMappings || {});
  const found = entries.find(([, value]) => value?.isDefault);
  if (!found) return null;
  const [key, value] = found;
  return {
    key,
    alias: value.alias || '',
    role: value.role || '',
    lastTest: value.lastTest || null
  };
}

function hasSuccessfulTest() {
  if (!Array.isArray(printHistory)) return false;
  return printHistory.some((item) => item && item.status === 'success');
}

function getOnboardingSteps() {
  return [
    {
      id: 'welcome',
      title: t('onboarding.steps.welcome.title'),
      subtitle: t('onboarding.steps.welcome.subtitle'),
      render: () => t('onboarding.steps.welcome.content'),
      validate: () => true
    },
    {
      id: 'shop',
      title: t('onboarding.steps.shop.title'),
      subtitle: t('onboarding.steps.shop.subtitle'),
      render: () => {
        const value = shopIdInput.value.trim();
        return t('onboarding.steps.shop.content', { value: value || t('common.notSet') });
      },
      validate: () => Boolean(shopIdInput.value.trim()),
      onBeforeNext: async () => {
        await saveConfig();
      }
    },
    {
      id: 'default-printer',
      title: t('onboarding.steps.defaultPrinter.title'),
      subtitle: t('onboarding.steps.defaultPrinter.subtitle'),
      render: () => {
        const mapping = getDefaultPrinterMapping();
        return t('onboarding.steps.defaultPrinter.content', { printer: mapping ? mapping.key : t('common.notSelected') });
      },
      validate: () => Boolean(getDefaultPrinterMapping())
    },
    {
      id: 'test-print',
      title: t('onboarding.steps.testPrint.title'),
      subtitle: t('onboarding.steps.testPrint.subtitle'),
      render: () => {
        const success = hasSuccessfulTest();
        const statusText = success ? t('common.ok') + ' ✅' : t('common.notConfigured');
        return t('onboarding.steps.testPrint.content', { status: statusText });
      },
      validate: () => hasSuccessfulTest()
    },
    {
      id: 'telemetry',
      title: t('onboarding.steps.telemetry.title'),
      subtitle: t('onboarding.steps.telemetry.subtitle'),
      render: () => {
        const statusText = telemetryEnabledToggle.checked ? t('common.ok') + ' ✅' : t('common.notConfigured');
        return t('onboarding.steps.telemetry.content', { status: statusText });
      },
      validate: () => telemetryEnabledToggle.checked,
      onBeforeNext: async () => {
        await saveConfig();
      }
    }
  ];
}

function renderOnboardingContent() {
  if (!onboardingState.visible) return;
  const steps = getOnboardingSteps();
  const step = steps[onboardingState.currentStep];
  const body = step.render ? step.render() : step.body || '';
  onboardingBody.innerHTML = body;
}

function renderOnboardingStep() {
  if (!onboardingState.visible) return;
  const steps = getOnboardingSteps();
  const step = steps[onboardingState.currentStep];
  onboardingTitle.textContent = step.title;
  onboardingSubtitle.textContent = step.subtitle || '';
  btnOnboardingPrev.style.display = onboardingState.currentStep > 0 ? 'inline-flex' : 'none';
  btnOnboardingNext.textContent =
    onboardingState.currentStep === steps.length - 1 ? t('onboarding.finish') : t('onboarding.next');
  renderOnboardingContent();
  updateOnboardingUI();
}

function updateOnboardingUI(options = {}) {
  if (!onboardingState.visible) return;
  if (options.rerender) {
    renderOnboardingContent();
  }
  const steps = getOnboardingSteps();
  const step = steps[onboardingState.currentStep];
  const valid = step.validate ? step.validate() : true;
  btnOnboardingNext.disabled = !valid;
}

function openOnboarding() {
  if (onboardingState.visible) {
    renderOnboardingStep();
    return;
  }
  onboardingBackdrop.classList.remove('onboarding-hidden');
  onboardingState.visible = true;
  renderOnboardingStep();
}

function closeOnboarding() {
  onboardingBackdrop.classList.add('onboarding-hidden');
  onboardingState.visible = false;
}

async function goToOnboardingStep(index, options = {}) {
  const steps = getOnboardingSteps();
  const target = Math.max(0, Math.min(steps.length - 1, index));
  onboardingState.currentStep = target;
  if (!options.skipPersist) {
    await window.agent.updateOnboarding({ lastStep: target });
  }
  if (onboardingState.visible) {
    renderOnboardingStep();
  }
}

async function completeOnboarding(skipped = false) {
  await window.agent.updateOnboarding({
    completed: true,
    skipped,
    lastStep: onboardingState.currentStep,
    seenVersion: currentUpdateState.currentVersion || currentUpdateState.version || null
  });
  closeOnboarding();
}

function handleOnboardingData(data) {
  onboardingState.data = data || {};
  const completed = data?.completed;
  if (completed) {
    closeOnboarding();
    return;
  }
  const steps = getOnboardingSteps();
  const targetStep = Math.max(0, Math.min(steps.length - 1, data?.lastStep || 0));
  onboardingState.currentStep = targetStep;
  openOnboarding();
}

const printerRoles = ['Kitchen', 'FrontDesk', 'Bar', 'Receipt', 'Label', 'Custom'];

function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildUsbKey(vendorId, productId) {
  return `usb:${Number(vendorId)}:${Number(productId)}`;
}

function buildLegacyKey(vendorId, productId) {
  return `${Number(vendorId)}:${Number(productId)}`;
}

function getDeviceKey(device) {
  return buildUsbKey(device.vendorId, device.productId);
}

function getMappingForDevice(device) {
  const usbKey = buildUsbKey(device.vendorId, device.productId);
  const legacyKey = buildLegacyKey(device.vendorId, device.productId);
  return printerMappings[usbKey] || printerMappings[legacyKey] || {};
}

async function refreshPrinterMappings() {
  const { mappings, history } = await window.agent.getPrinterMappings();
  printerMappings = mappings || {};
  printHistory = history || [];
  renderDevices();
  renderPrintHistory();
  renderHotplugEvents();
  updateOnboardingUI({ rerender: true });
}

async function refreshStatus() {
  const data = await window.agent.getStatus();
  currentConfig = data.config || {};
  currentConfig.preferences = currentConfig.preferences || {};
  currentDevices = data.devices || [];
  currentTcpPrinters = data.tcpPrinters || [];
  currentUpdateState = data.update || currentUpdateState;
  currentTelemetryState = data.telemetry || currentTelemetryState;
  printerMappings = data.printerMappings || printerMappings;
  printHistory = data.printHistory || printHistory;
  renderStatus(data);
  renderDevices();
  renderUpdateState(currentUpdateState);
  renderTelemetryState(currentTelemetryState);
  renderPrintHistory();
  handleOnboardingData(data.onboarding);
  updateOnboardingUI({ rerender: true });
}

function renderStatus({ config, devices, server, autoLaunch, update, telemetry }) {
  const online = server.running;
  statusChip.textContent = online ? t('status.running') : t('status.stopped');
  statusChip.classList.toggle('status-online', online);
  statusChip.classList.toggle('status-offline', !online);
  const tcpCount = Array.isArray(currentTcpPrinters) ? currentTcpPrinters.length : 0;
  statusMeta.textContent = `${t('common.httpService', { port: server.port })} · ${t('common.usbDevices', { count: devices.length })} · ${t('common.tcpPrinters', { count: tcpCount })} · ${t('config.autostart')} ${autoLaunch ? t('common.autoStartEnabled') : t('common.autoStartDisabled')}`;

  shopIdInput.value = config.shopId || '';
  serverPortInput.value = config.server?.port || 40713;
  autostartToggle.checked = Boolean(autoLaunch);
  allowSelfSignedToggle.checked = Boolean(config.preferences?.allowSelfSigned);
  if (backgroundModeToggle) {
    backgroundModeToggle.checked = config.preferences?.runInBackground !== false;
  }
  if (autoTestOnAttachToggle) {
    autoTestOnAttachToggle.checked = Boolean(config.preferences?.autoTestOnAttach);
  }
  renderUpdateConfig(config.updates || {}, update || currentUpdateState);
  renderTelemetryConfig(config.telemetry || {}, telemetry || currentTelemetryState);
  updateOnboardingUI({ rerender: true });
}

function renderUpdateConfig(updateConfig, updateState) {
  const feedUrl = updateConfig.feedUrl || DEFAULT_UPDATE_FEED_URL;
  updatesFeedUrlInput.value = feedUrl;
  updatesChannelSelect.value = updateConfig.channel || 'stable';
  updatesAutoDownloadToggle.checked = updateConfig.autoDownload !== false;
  currentConfig.updates = {
    ...updateConfig,
    feedUrl
  };
  renderUpdateState(updateState || currentUpdateState);
}

function renderTelemetryConfig(telemetryConfig, telemetryState) {
  telemetryEnabledToggle.checked = telemetryConfig.enabled !== false;
  telemetryIncludeLogsToggle.checked = telemetryConfig.includeLogs !== false;
  telemetryEndpointInput.value = telemetryConfig.endpoint || '';
  telemetryIntervalInput.value = telemetryConfig.intervalSeconds || 30;
  currentConfig.telemetry = telemetryConfig;
  renderTelemetryState(telemetryState || currentTelemetryState);
}

function formatTimestamp(isoString) {
  if (!isoString) {
    return '--';
  }
  try {
    const date = new Date(isoString);
    return date.toLocaleString();
  } catch (error) {
    return isoString;
  }
}

function renderUpdateState(update = {}) {
  currentUpdateState = update;
  const status = update.status || (update.enabled ? 'idle' : 'disabled');
  const statusLabelMap = {
    idle: t('updates.status.idle'),
    disabled: t('updates.status.disabled'),
    checking: t('updates.status.checking'),
    available: t('updates.status.available'),
    downloading: t('updates.status.downloading'),
    downloaded: t('updates.status.downloaded'),
    error: t('updates.status.error'),
    development: t('updates.status.development')
  };
  const statusClassOnline = ['available', 'downloading', 'downloaded'];
  const statusClassOffline = ['error', 'disabled'];

  versionBadge.textContent = t('updates.version', { version: update.currentVersion || '0.0.0' });
  updateStatusChip.classList.remove('status-online', 'status-offline');
  updateStatusChip.textContent = statusLabelMap[status] || status;
  updateStatusChip.classList.toggle('status-online', statusClassOnline.includes(status));
  updateStatusChip.classList.toggle('status-offline', statusClassOffline.includes(status));

  const message =
    update.message ||
    (status === 'disabled'
      ? t('updates.message.disabled')
      : status === 'development'
        ? t('updates.message.development')
        : t('updates.message.notChecked'));
  updateMessage.textContent = message;
  updateLastChecked.textContent = update.lastCheckedAt ? t('updates.lastChecked', { time: formatTimestamp(update.lastCheckedAt) }) : t('updates.lastChecked', { time: '--' });

  const showProgress = status === 'downloading' && update.progress;
  updateProgressBlock.style.display = showProgress ? 'block' : 'none';
  if (showProgress) {
    const percent = Math.max(0, Math.min(100, update.progress.percent || 0));
    updateProgressFill.style.width = `${percent.toFixed(1)}%`;
    const transferredMb = update.progress.transferred ? (update.progress.transferred / 1024 / 1024).toFixed(1) : '0';
    const totalMb = update.progress.total ? (update.progress.total / 1024 / 1024).toFixed(1) : '0';
    updateProgressLabel.textContent = t('updates.progressPercent', { percent: percent.toFixed(1), transferred: transferredMb, total: totalMb });
  }

  const releaseNotes = update.releaseNotes || update.releaseName;
  updateReleaseNotes.style.display = releaseNotes ? 'block' : 'none';
  updateReleaseContent.textContent =
    typeof releaseNotes === 'string' ? releaseNotes : JSON.stringify(releaseNotes, null, 2);

  installUpdateButton.disabled = status !== 'downloaded';
}

function formatRelativeTime(isoString) {
  if (!isoString) return '--';
  const target = new Date(isoString).getTime();
  if (Number.isNaN(target)) return isoString;
  const diff = Date.now() - target;
  if (diff < 0) return t('common.justNow', {});
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return t('common.secondsAgo', { count: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('common.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('common.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('common.daysAgo', { count: days });
  return new Date(isoString).toLocaleString();
}

function renderTelemetryState(state = {}) {
  currentTelemetryState = state;
  const status = state.status || 'disabled';
  const statusLabel = {
    disabled: t('telemetry.status.disabled'),
    idle: t('telemetry.status.idle'),
    waiting: t('telemetry.status.waiting'),
    sending: t('telemetry.status.sending'),
    online: t('telemetry.status.online'),
    error: t('telemetry.status.error')
  }[status] || status;

  telemetryStatusChip.classList.remove('status-online', 'status-offline');
  telemetryStatusChip.textContent = statusLabel;
  const isOnline = status === 'online';
  const isError = status === 'error';
  telemetryStatusChip.classList.toggle('status-online', isOnline);
  telemetryStatusChip.classList.toggle('status-offline', isError || status === 'disabled');

  telemetryMessage.textContent = state.message || t('telemetry.message');
  telemetryLastSync.textContent = state.lastSuccessAt
    ? t('telemetry.lastSuccess', { time: formatRelativeTime(state.lastSuccessAt) })
    : t('telemetry.lastSuccess', { time: '--' });
  telemetryNextSync.textContent = state.nextPlannedAt ? t('telemetry.nextSync', { time: formatRelativeTime(state.nextPlannedAt) }) : t('telemetry.nextSync', { time: '--' });

  if (Array.isArray(state.lastLogs) && state.lastLogs.length > 0) {
    telemetryLogPreview.style.display = 'block';
    telemetryLogContent.textContent = state.lastLogs.join('\\n');
  } else {
    telemetryLogPreview.style.display = 'none';
    telemetryLogContent.textContent = '';
  }
  updateOnboardingUI({ rerender: true });
}

function renderDevices() {
  deviceTable.innerHTML = '';
  if (!currentDevices.length) {
    const emptyRow = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 8;
    td.className = 'muted';
    td.textContent = t('devices.noDevices');
    emptyRow.appendChild(td);
    deviceTable.appendChild(emptyRow);
    updateOnboardingUI({ rerender: true });
    return;
  }
  currentDevices.forEach((device) => {
    const tr = document.createElement('tr');
    const key = getDeviceKey(device);
    const mapping = getMappingForDevice(device);
    const marker = hotplugMarkers.get(key) || device.change || null;
    const aliasValue =
      mapping.alias ||
      (currentConfig.printers || []).find((p) => p.vendorId === device.vendorId && p.productId === device.productId)?.alias ||
      '';

    tr.dataset.deviceKey = key;
    if (marker?.type === 'attach') {
      tr.classList.add('row-hotplug-attach');
    }

    const subtitleParts = [];
    if (device.manufacturerName) {
      subtitleParts.push(device.manufacturerName);
    }
    if (device.portPath) {
      subtitleParts.push(`端口 ${device.portPath}`);
    }
    if (device.serialNumber) {
      subtitleParts.push(`SN ${device.serialNumber}`);
    }
    const subtitleHtml = subtitleParts.length
      ? `<div class="device-secondary">${escapeHtml(subtitleParts.join(' · '))}</div>`
      : '';
    const printerWarning =
      device.isPrinter === false
        ? `<div class="device-warning">${t('devices.mayNotBePrinter')}</div>`
        : '';
    const deviceLabel =
      device.productName ||
      device.deviceName ||
      `${t('devices.usbDevice')} (VID 0x${device.vendorId?.toString(16) ?? '--'} · PID 0x${device.productId?.toString(16) ?? '--'})`;

    tr.innerHTML = `
      <td class="device-cell">
        <div class="device-primary">${escapeHtml(deviceLabel)}</div>
        ${subtitleHtml}
        ${printerWarning}
      </td>
      <td>0x${device.vendorId?.toString(16) ?? '--'}</td>
      <td>0x${device.productId?.toString(16) ?? '--'}</td>
      <td class="alias-cell"></td>
      <td class="role-cell"></td>
      <td class="default-cell"></td>
      <td class="actions-cell"></td>
      <td class="status-cell"></td>
    `;

    const aliasInput = document.createElement('input');
    aliasInput.type = 'text';
    aliasInput.value = aliasValue;
    aliasInput.placeholder = t('devices.aliasPlaceholder');
    aliasInput.addEventListener('change', async () => {
      await window.agent.updatePrinterMapping({
        key,
        data: { alias: aliasInput.value }
      });
      const printers = Array.isArray(currentConfig.printers) ? [...currentConfig.printers] : [];
      const existing = printers.find((p) => p.vendorId === device.vendorId && p.productId === device.productId);
      if (existing) {
        existing.alias = aliasInput.value;
      } else {
        printers.push({
          vendorId: device.vendorId,
          productId: device.productId,
          alias: aliasInput.value
        });
      }
      currentConfig.printers = printers;
    });
    tr.querySelector('.alias-cell').appendChild(aliasInput);

    const roleSelect = document.createElement('select');
    printerRoles.forEach((role) => {
      const option = document.createElement('option');
      option.value = role;
      option.textContent = role;
      roleSelect.appendChild(option);
    });
    roleSelect.value = mapping.role || 'Kitchen';
    roleSelect.addEventListener('change', async () => {
      await window.agent.updatePrinterMapping({
        key,
        data: { role: roleSelect.value }
      });
    });
    tr.querySelector('.role-cell').appendChild(roleSelect);

    const defaultToggle = document.createElement('input');
    defaultToggle.type = 'checkbox';
    defaultToggle.checked = Boolean(mapping.isDefault);
    defaultToggle.addEventListener('change', async () => {
      await window.agent.updatePrinterMapping({
        key,
        data: { isDefault: defaultToggle.checked, role: roleSelect.value },
        exclusiveDefault: true
      });
    });
    tr.querySelector('.default-cell').appendChild(defaultToggle);

    const testButton = document.createElement('button');
    testButton.className = 'secondary';
    testButton.textContent = t('devices.testPrint');
    const actionsCell = tr.querySelector('.actions-cell');
    actionsCell.appendChild(testButton);

    const statusCell = tr.querySelector('.status-cell');
    function renderStatusCell(map, eventMarker) {
      const eventHtml = eventMarker
        ? `<div class="status-hotplug status-hotplug-${eventMarker.type}">${
            eventMarker.type === 'attach' ? t('devices.attached') : t('devices.detached')
          }</div>`
        : '';
      const lastTest = map.lastTest;
      if (!lastTest) {
        statusCell.innerHTML = `${eventHtml}<span class="muted">${t('devices.notTested')}</span>`;
        return;
      }
      const statusClass = lastTest.status === 'success' ? 'history-status-success' : 'history-status-error';
      statusCell.innerHTML = `
        ${eventHtml}
        <div class="${statusClass}">${lastTest.status === 'success' ? t('devices.success') : t('devices.failed')}</div>
        <div class="muted">${formatRelativeTime(lastTest.timestamp)}</div>
        <div class="muted" style="max-width:180px;">${lastTest.message || ''}</div>
      `;
    }
    renderStatusCell(mapping, marker);

    testButton.addEventListener('click', async () => {
      testButton.disabled = true;
      testButton.textContent = t('devices.testing');
      const result = await window.agent.testPrinter({
        connectionType: 'usb',
        vendorId: device.vendorId,
        productId: device.productId,
        alias: aliasInput.value,
        role: roleSelect.value
      });
      if (result?.ok) {
        statusCell.innerHTML = `
          <div class="history-status-success">${t('devices.success')}</div>
          <div class="muted">${new Date().toLocaleTimeString()}</div>
          <div class="muted">${t('devices.testPrint')} ${t('devices.success')}</div>
        `;
      } else {
        statusCell.innerHTML = `
          <div class="history-status-error">${t('devices.failed')}</div>
          <div class="muted">${result?.error || t('devices.failed')}</div>
        `;
      }
      setTimeout(() => {
        testButton.disabled = false;
        testButton.textContent = t('devices.testPrint');
      }, 1000);
    });

    deviceTable.appendChild(tr);
  });
  updateOnboardingUI({ rerender: true });
}

function renderHotplugEvents() {
  if (!hotplugEventsContainer) return;
  if (!hotplugEvents.length) {
    hotplugEventsContainer.innerHTML = `<div class="muted">${t('hotplug.noEvents')}</div>`;
    return;
  }
  const items = hotplugEvents.slice(0, 5).map((entry) => {
    const device = entry.device || {};
    const typeLabel =
      entry.type === 'attach' ? t('hotplug.deviceAttached') : entry.type === 'detach' ? t('hotplug.deviceDetached') : t('hotplug.event');
    const productLabel =
      device.productName ||
      device.deviceName ||
      `${t('devices.usbDevice')} (VID 0x${Number(device.vendorId || 0).toString(16)} · PID 0x${Number(device.productId || 0).toString(16)})`;
    const metaParts = [];
    if (device.manufacturerName) {
      metaParts.push(device.manufacturerName);
    }
    if (device.vendorId != null) {
      metaParts.push(`VID 0x${Number(device.vendorId).toString(16)}`);
    }
    if (device.productId != null) {
      metaParts.push(`PID 0x${Number(device.productId).toString(16)}`);
    }
    if (device.portPath) {
      metaParts.push(`${t('hotplug.port')} ${device.portPath}`);
    }
    const meta = metaParts.filter(Boolean).join(' · ');
    let autoTestHtml = '';
    if (entry.autoTest) {
      if (entry.autoTest.status === 'running') {
        autoTestHtml = `<div class="hotplug-meta">${t('hotplug.testing')}</div>`;
      } else {
        const cls = entry.autoTest.status === 'success' ? 'history-status-success' : 'history-status-error';
        const label = entry.autoTest.status === 'success' ? t('hotplug.testSuccess') : `${t('hotplug.testFailed')}：${escapeHtml(entry.autoTest.message || '')}`;
        autoTestHtml = `<div class="hotplug-meta"><span class="${cls}">${label}</span></div>`;
      }
    }
    const actions =
      entry.type === 'attach' && device.vendorId != null && device.productId != null
        ? `<div class="hotplug-actions">
             <button class="secondary hotplug-test-btn" data-vendor="${Number(device.vendorId)}" data-product="${Number(
            device.productId
          )}">${t('hotplug.testPrint')}</button>
           </div>`
        : '';

    return `
      <div class="hotplug-item ${entry.type}">
        <div class="hotplug-header">
          <span>${typeLabel}</span>
          <span class="muted">${formatTimestamp(entry.timestamp)}</span>
        </div>
        <div class="device-primary" style="margin-top:6px;">${escapeHtml(productLabel)}</div>
        <div class="hotplug-meta">${escapeHtml(meta)}</div>
        ${autoTestHtml}
        ${actions}
      </div>
    `;
  });
  hotplugEventsContainer.innerHTML = items.join('');
}

function renderPrintHistory() {
  if (!historyTableBody || !historySummary) return;
  historySummary.textContent = t('history.summary', { count: printHistory.length });

  if (!printHistory.length) {
    historyTableBody.innerHTML =
      `<tr><td colspan="5" style="color:#64748b;text-align:center;padding:16px;">${t('history.noRecords')}</td></tr>`;
    updateOnboardingUI({ rerender: true });
    return;
  }

  historyTableBody.innerHTML = printHistory
    .slice(0, 50)
    .map((record) => {
      const statusClass = record.status === 'success' ? 'history-status-success' : 'history-status-error';
      const deviceLabel =
        record.connectionType === 'tcp'
          ? `${record.ip || record.host || t('history.unknown')}:${record.port || 9100} · TCP`
          : `VID_0x${Number(record.vendorId || 0).toString(16)} · PID_0x${Number(record.productId || 0).toString(16)} · USB`;
      const aliasLabel = [record.alias || '', record.role || ''].filter(Boolean).join(' / ') || '--';
      return `
        <tr>
          <td>${formatTimestamp(record.timestamp)}</td>
          <td>${deviceLabel}</td>
          <td>${aliasLabel}</td>
          <td class="${statusClass}">${record.status === 'success' ? t('history.success') : t('history.failed')}</td>
          <td>${record.message || ''}</td>
        </tr>
      `;
    })
    .join('');
  updateOnboardingUI({ rerender: true });
}

async function saveConfig() {
  const payload = {
    shopId: shopIdInput.value || null,
    server: { port: Number(serverPortInput.value) || 40713 },
    preferences: {
      autoLaunch: autostartToggle.checked,
      allowSelfSigned: allowSelfSignedToggle.checked,
      runInBackground: backgroundModeToggle ? backgroundModeToggle.checked : true,
      autoTestOnAttach: autoTestOnAttachToggle ? autoTestOnAttachToggle.checked : false
    },
    updates: {
      feedUrl: updatesFeedUrlInput.value.trim() || DEFAULT_UPDATE_FEED_URL,
      channel: updatesChannelSelect.value || 'stable',
      autoDownload: updatesAutoDownloadToggle.checked
    },
    telemetry: {
      enabled: telemetryEnabledToggle.checked,
      endpoint: telemetryEndpointInput.value.trim() || null,
      intervalSeconds: Number(telemetryIntervalInput.value) || 30,
      includeLogs: telemetryIncludeLogsToggle.checked
    },
    printers: currentConfig.printers || []
  };
  await window.agent.saveConfig(payload);
  await window.agent.setAutostart(payload.preferences.autoLaunch);
  currentConfig.preferences = {
    ...(currentConfig.preferences || {}),
    ...payload.preferences
  };
  await refreshStatus();
}

function markHotplug(key, marker) {
  if (!key) return;
  hotplugMarkers.set(key, marker);
  setTimeout(() => {
    const stored = hotplugMarkers.get(key);
    if (stored && stored.timestamp === marker.timestamp) {
      hotplugMarkers.delete(key);
      renderDevices();
    }
  }, HOTPLUG_HIGHLIGHT_MS);
}

async function autoTestNewDevice(entry, device) {
  if (!device) return;
  const vendorId = Number(device.vendorId);
  const productId = Number(device.productId);
  if (!Number.isFinite(vendorId) || !Number.isFinite(productId)) {
    return;
  }
  const key = buildUsbKey(vendorId, productId);
  const mapping = printerMappings[key];
  if (!mapping) {
    return;
  }
  entry.autoTest = { status: 'running' };
  renderHotplugEvents();
  try {
    const result = await window.agent.testPrinter({
      connectionType: 'usb',
      vendorId,
      productId,
      alias: mapping.alias || device.productName || device.deviceName || '',
      role: mapping.role || 'Kitchen'
    });
    entry.autoTest = {
      status: result?.ok ? 'success' : 'error',
      message: result?.ok ? '打印成功' : result?.error || '打印失败'
    };
  } catch (error) {
    entry.autoTest = {
      status: 'error',
      message: error?.message || '打印失败'
    };
  }
  renderHotplugEvents();
}

async function handleHotplugEvent(event) {
  if (!event) return;
  const timestampMs =
    typeof event.timestamp === 'number'
      ? event.timestamp
      : event.timestamp
        ? Date.parse(event.timestamp)
        : Date.now();
  const timestampIso = new Date(timestampMs).toISOString();
  const entry = {
    ...event,
    timestamp: timestampIso,
    device: event.device ? { ...event.device } : null
  };
  hotplugEvents.unshift(entry);
  if (hotplugEvents.length > 5) {
    hotplugEvents.length = 5;
  }
  renderHotplugEvents();

  if (event.device?.vendorId != null && event.device?.productId != null) {
    const key = buildUsbKey(event.device.vendorId, event.device.productId);
    markHotplug(key, { type: event.type, timestamp: timestampMs });
  }

  if (
    event.type === 'attach' &&
    event.device?.vendorId != null &&
    event.device?.productId != null &&
    currentConfig?.preferences?.autoTestOnAttach
  ) {
    await autoTestNewDevice(entry, event.device);
  }
}

async function handleHotplugAction(event) {
  const target = event.target.closest('.hotplug-test-btn');
  if (!target) return;
  const vendorId = Number(target.dataset.vendorId);
  const productId = Number(target.dataset.productId);
  if (!Number.isFinite(vendorId) || !Number.isFinite(productId)) return;
  const original = target.textContent;
  target.disabled = true;
  target.textContent = '测试中...';
  const key = buildUsbKey(vendorId, productId);
  const mapping = printerMappings[key] || {};
  try {
    const result = await window.agent.testPrinter({
      connectionType: 'usb',
      vendorId,
      productId,
      alias: mapping.alias || '',
      role: mapping.role || 'Kitchen'
    });
    if (!result?.ok) {
      alert(result?.error || '测试打印失败');
    }
  } catch (error) {
    alert(error?.message || '测试打印失败');
  } finally {
    target.disabled = false;
    target.textContent = original;
  }
}

async function refreshDevices() {
  currentDevices = await window.agent.refreshDevices();
  await refreshPrinterMappings();
}

async function refreshLogs() {
  const { logPath, recent } = await window.agent.getLogs();
  logPathLabel.textContent = t('logs.path', { path: logPath });
  logViewer.textContent = recent && recent.length ? recent.join('\n') : t('logs.noLogs');
}

async function refreshHistory() {
  const { history } = await window.agent.getPrintHistory();
  printHistory = history || [];
  renderPrintHistory();
  updateOnboardingUI({ rerender: true });
}

async function clearHistory() {
  const result = await window.agent.clearPrintHistory();
  if (result?.ok) {
    printHistory = [];
    renderPrintHistory();
    updateOnboardingUI({ rerender: true });
  }
}

saveButton.addEventListener('click', saveConfig);
refreshButton.addEventListener('click', refreshStatus);
refreshDevicesButton.addEventListener('click', refreshDevices);
refreshLogsButton.addEventListener('click', refreshLogs);
window.agent.onDevicesUpdated(() => refreshDevices());
if (backgroundModeToggle) {
  backgroundModeToggle.addEventListener('change', () => {
    currentConfig.preferences = currentConfig.preferences || {};
    currentConfig.preferences.runInBackground = backgroundModeToggle.checked;
  });
}
if (autoTestOnAttachToggle) {
  autoTestOnAttachToggle.addEventListener('change', () => {
    currentConfig.preferences = currentConfig.preferences || {};
    currentConfig.preferences.autoTestOnAttach = autoTestOnAttachToggle.checked;
  });
}
if (hotplugEventsContainer) {
  hotplugEventsContainer.addEventListener('click', handleHotplugAction);
}
if (restartButton) {
  restartButton.addEventListener('click', async () => {
    if (!confirm(t('dialogs.restartConfirm'))) return;
    await window.agent.restartApp();
  });
}
if (quitButton) {
  quitButton.addEventListener('click', async () => {
    if (!confirm(t('dialogs.quitConfirm'))) return;
    await window.agent.quitApp();
  });
}
checkUpdateButton.addEventListener('click', async () => {
  updateStatusChip.textContent = t('updates.status.checking');
  updateStatusChip.classList.remove('status-offline');
  updateStatusChip.classList.add('status-online');
  const result = await window.agent.checkUpdates();
  if (!result?.started) {
    updateMessage.textContent = result?.reason
      ? t('updates.message.cannotCheck', { reason: result.reason })
      : t('updates.message.cannotStartCheck');
  }
});
installUpdateButton.addEventListener('click', async () => {
  const result = await window.agent.installUpdate();
  if (!result?.ok) {
    updateMessage.textContent = t('updates.message.noUpdateAvailable');
  }
});
window.agent.onUpdateStatus((payload) => renderUpdateState(payload));
sendHeartbeatButton.addEventListener('click', async () => {
  telemetryStatusChip.textContent = t('telemetry.status.sending');
  telemetryStatusChip.classList.add('status-online');
  telemetryStatusChip.classList.remove('status-offline');
  const result = await window.agent.sendTelemetry();
  if (!result?.sent) {
    telemetryMessage.textContent =
      result?.error || result?.reason ? t('telemetry.sendFailed', { error: result.error || result.reason }) : t('telemetry.sendFailedGeneric');
  }
});
window.agent.onTelemetryStatus((payload) => {
  renderTelemetryState(payload);
  updateOnboardingUI({ rerender: true });
});
refreshHistoryButton.addEventListener('click', refreshHistory);
clearHistoryButton.addEventListener('click', clearHistory);
window.agent.onPrinterMappingsUpdated((payload) => {
  printerMappings = payload?.mappings || printerMappings;
  renderDevices();
  renderHotplugEvents();
  updateOnboardingUI({ rerender: true });
});
window.agent.onPrintHistoryUpdated((payload) => {
  printHistory = payload?.history || printHistory;
  renderPrintHistory();
  updateOnboardingUI({ rerender: true });
});
window.agent.onUsbHotplug((payload) => {
  handleHotplugEvent(payload);
});
window.agent.onOnboardingUpdated((payload) => {
  handleOnboardingData(payload);
});
shopIdInput.addEventListener('input', () => updateOnboardingUI({ rerender: true }));
telemetryEnabledToggle.addEventListener('change', () => updateOnboardingUI({ rerender: true }));
btnOnboardingSkip.addEventListener('click', async () => {
  if (!confirm(t('onboarding.skipConfirm'))) return;
  await completeOnboarding(true);
});
btnOnboardingPrev.addEventListener('click', () => {
  if (onboardingState.currentStep > 0) {
    goToOnboardingStep(onboardingState.currentStep - 1);
  }
});
btnOnboardingNext.addEventListener('click', async () => {
  const steps = getOnboardingSteps();
  const step = steps[onboardingState.currentStep];
  if (step.onBeforeNext) {
    const result = await step.onBeforeNext();
    if (result === false) {
      updateOnboardingUI({ rerender: true });
      return;
    }
  }
  if (onboardingState.currentStep === steps.length - 1) {
    await completeOnboarding(false);
  } else {
    await goToOnboardingStep(onboardingState.currentStep + 1);
  }
});

// Language switcher
if (languageSelect) {
  languageSelect.addEventListener('change', async (e) => {
    const locale = e.target.value;
    await window.agent.setLocale(locale);
    await updateUI();
  });
}

// Update all UI elements with translations
async function updateUI() {
  if (!i18n) return;
  
  // Update header
  document.querySelector('header strong').textContent = t('app.title');
  if (restartButton) restartButton.textContent = t('header.restart');
  if (quitButton) quitButton.textContent = t('header.quit');
  
  // Update config section
  document.querySelector('#config-card h2').textContent = t('config.title');
  if (saveButton) saveButton.textContent = t('config.save');
  if (refreshButton) refreshButton.textContent = t('config.refresh');
  document.querySelector('label[for="shop-id"]').textContent = t('config.shopId');
  shopIdInput.placeholder = t('config.shopIdPlaceholder');
  document.querySelector('label[for="server-port"]').textContent = t('config.serverPort');
  document.querySelector('label[for="autostart-toggle"]').textContent = t('config.autostart');
  document.querySelector('label[for="allow-self-signed"]').textContent = t('config.allowSelfSigned');
  if (backgroundModeToggle) {
    document.querySelector('label[for="background-mode-toggle"]').textContent = t('config.runInBackground');
  }
  if (autoTestOnAttachToggle) {
    document.querySelector('label[for="auto-test-on-attach"]').textContent = t('config.autoTestOnAttach');
  }
  
  // Update hotplug section
  document.querySelector('#hotplug-card h2').textContent = t('hotplug.title');
  document.querySelector('#hotplug-card .muted').textContent = t('hotplug.recentEvents');
  
  // Update updates section
  document.querySelector('#updater-card h2').textContent = t('updates.title');
  document.querySelector('label[for="updates-feed-url"]').textContent = t('updates.feedUrl');
  updatesFeedUrlInput.placeholder = t('updates.feedUrlPlaceholder');
  document.querySelector('label[for="updates-channel"]').textContent = t('updates.channel');
  updatesChannelSelect.querySelector('option[value="stable"]').textContent = t('updates.channelStable');
  updatesChannelSelect.querySelector('option[value="beta"]').textContent = t('updates.channelBeta');
  document.querySelector('label[for="updates-auto-download"]').textContent = t('updates.autoDownload');
  if (checkUpdateButton) checkUpdateButton.textContent = t('updates.checkUpdate');
  if (installUpdateButton) installUpdateButton.textContent = t('updates.installUpdate');
  document.querySelector('#update-release-notes summary').textContent = t('updates.releaseNotes');
  
  // Update telemetry section
  document.querySelector('#telemetry-card h2').textContent = t('telemetry.title');
  document.querySelector('label[for="telemetry-enabled"]').textContent = t('telemetry.enabled');
  document.querySelector('label[for="telemetry-include-logs"]').textContent = t('telemetry.includeLogs');
  document.querySelector('label[for="telemetry-endpoint"]').textContent = t('telemetry.endpoint');
  telemetryEndpointInput.placeholder = t('telemetry.endpointPlaceholder');
  document.querySelector('label[for="telemetry-interval"]').textContent = t('telemetry.interval');
  if (sendHeartbeatButton) sendHeartbeatButton.textContent = t('telemetry.sendNow');
  document.querySelector('#telemetry-log-preview summary').textContent = t('telemetry.recentLogs');
  
  // Update devices section
  const devicesSection = document.querySelector('section:has(#device-table)');
  if (devicesSection) {
    const devicesHeading = devicesSection.querySelector('h2');
    if (devicesHeading) devicesHeading.textContent = t('devices.title');
    const devicesDesc = devicesSection.querySelector('.muted');
    if (devicesDesc) devicesDesc.textContent = t('devices.description');
  }
  if (refreshDevicesButton) refreshDevicesButton.textContent = t('devices.refresh');
  const deviceTableHeaders = document.querySelectorAll('#device-table thead th');
  if (deviceTableHeaders.length >= 8) {
    deviceTableHeaders[0].textContent = t('devices.device');
    deviceTableHeaders[1].textContent = t('devices.vendorId');
    deviceTableHeaders[2].textContent = t('devices.productId');
    deviceTableHeaders[3].textContent = t('devices.alias');
    deviceTableHeaders[4].textContent = t('devices.role');
    deviceTableHeaders[5].textContent = t('devices.default');
    deviceTableHeaders[6].textContent = t('devices.actions');
    deviceTableHeaders[7].textContent = t('devices.status');
  }
  
  // Update history section
  document.querySelector('#history-card h2').textContent = t('history.title');
  if (refreshHistoryButton) refreshHistoryButton.textContent = t('history.refresh');
  if (clearHistoryButton) clearHistoryButton.textContent = t('history.clear');
  const historyTableHeaders = document.querySelectorAll('.history-table thead th');
  if (historyTableHeaders.length >= 5) {
    historyTableHeaders[0].textContent = t('history.time');
    historyTableHeaders[1].textContent = t('history.device');
    historyTableHeaders[2].textContent = t('history.aliasRole');
    historyTableHeaders[3].textContent = t('history.status');
    historyTableHeaders[4].textContent = t('history.details');
  }
  
  // Update logs section
  const logsSection = document.querySelector('section:has(#log-viewer)');
  if (logsSection) {
    const logsHeading = logsSection.querySelector('h2');
    if (logsHeading) logsHeading.textContent = t('logs.title');
  }
  if (refreshLogsButton) refreshLogsButton.textContent = t('logs.refresh');
  
  // Update onboarding
  if (btnOnboardingSkip) btnOnboardingSkip.textContent = t('onboarding.skip');
  if (btnOnboardingPrev) btnOnboardingPrev.textContent = t('onboarding.prev');
  if (btnOnboardingNext) btnOnboardingNext.textContent = t('onboarding.next');
  
  // Re-render dynamic content
  renderStatus({ config: currentConfig, devices: currentDevices, server: { port: currentConfig.server?.port || 40713, running: true }, autoLaunch: currentConfig.preferences?.autoLaunch, update: currentUpdateState, telemetry: currentTelemetryState });
  renderDevices();
  renderPrintHistory();
  renderHotplugEvents();
  renderOnboardingStep();
}

// Initialize i18n and load UI
initI18n().then(() => {
  refreshStatus().then(() => {
    renderPrintHistory();
    refreshLogs();
    updateUI();
  });
  renderHotplugEvents();
  
  // Load current locale for language selector
  if (languageSelect && window.agent) {
    window.agent.getLocale().then((locale) => {
      languageSelect.value = locale;
    });
  }
});
