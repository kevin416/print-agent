const statusChip = document.getElementById('status-chip');
const statusMeta = document.getElementById('status-meta');
const shopIdInput = document.getElementById('shop-id');
const serverPortInput = document.getElementById('server-port');
const autostartToggle = document.getElementById('autostart-toggle');
const allowSelfSignedToggle = document.getElementById('allow-self-signed');
const deviceTable = document.getElementById('device-table');
const logViewer = document.getElementById('log-viewer');
const logPathLabel = document.getElementById('log-path');
const updatesFeedUrlInput = document.getElementById('updates-feed-url');
const updatesChannelSelect = document.getElementById('updates-channel');
const updatesAutoDownloadToggle = document.getElementById('updates-auto-download');
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

const DEFAULT_UPDATE_FEED_URL = 'https://pa.easyify.uk/updates/local-usb-agent';

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

const onboardingSteps = [
  {
    id: 'welcome',
    title: '欢迎使用本地打印 Agent',
    subtitle: '我们会引导你完成基础配置与测试，确保门店打印顺畅。',
    render: () =>
      `<p>整个流程大约 2~3 分钟，请按提示操作：</p>
       <ul>
         <li>绑定分店 Shop ID</li>
         <li>选择默认打印机并完成测试</li>
         <li>开启远程监控心跳，便于总部了解代理状态</li>
       </ul>
       <p>准备好了就点击「继续」。</p>`,
    validate: () => true
  },
  {
    id: 'shop',
    title: '配置分店 Shop ID',
    subtitle: '绑定 manager_next 的公司/分店 ID，方便系统识别。',
    render: () => {
      const value = shopIdInput.value.trim();
      return `
        <p>在上方「基础配置」区域输入分店 Shop ID（通常与 manager_next 的 companyId 对应）。</p>
        <ul>
          <li>当前输入：<strong>${value || '尚未填写'}</strong></li>
          <li>填写完成后点击右上角的「保存配置」。</li>
        </ul>
      `;
    },
    validate: () => Boolean(shopIdInput.value.trim()),
    onBeforeNext: async () => {
      await saveConfig();
    }
  },
  {
    id: 'default-printer',
    title: '设置默认打印机',
    subtitle: '为门店选择一台默认使用的 USB 打印机。',
    render: () => {
      const mapping = getDefaultPrinterMapping();
      return `
        <p>在「USB 设备映射」列表中，为需要使用的打印机勾选「默认」并填写备注/用途。</p>
        <ul>
          <li>提示：可以根据用途选择 Kitchen / FrontDesk / Receipt 等角色。</li>
          <li>当前默认打印机：<strong>${mapping ? mapping.key : '尚未选择'}</strong></li>
        </ul>
      `;
    },
    validate: () => Boolean(getDefaultPrinterMapping())
  },
  {
    id: 'test-print',
    title: '完成测试打印',
    subtitle: '确认默认打印机可以正常出纸。',
    render: () => {
      const success = hasSuccessfulTest();
      return `
        <p>点击设备列表中的「测试打印」按钮（或托盘菜单里的「测试默认打印机」），确保打印机能正常出纸。</p>
        <ul>
          <li>建议使用纸张观察是否打印出“测试打印任务”内容。</li>
          <li>当前状态：<strong>${success ? '已检测到成功测试 ✅' : '尚未检测到成功测试'}</strong></li>
        </ul>
      `;
    },
    validate: () => hasSuccessfulTest()
  },
  {
    id: 'telemetry',
    title: '开启远程监控',
    subtitle: '让总部及时了解门店代理状态，快速支援。',
    render: () => `
        <p>在「远程监控」中勾选「启用心跳上报」与「上传日志尾部」，确认上报地址正确。</p>
        <ul>
          <li>完成后可点击「立即同步」查看是否显示为「在线」。</li>
          <li>当前状态：<strong>${telemetryEnabledToggle.checked ? '已开启 ✅' : '尚未开启'}</strong></li>
        </ul>
      `,
    validate: () => telemetryEnabledToggle.checked,
    onBeforeNext: async () => {
      await saveConfig();
    }
  }
];

function renderOnboardingContent() {
  if (!onboardingState.visible) return;
  const step = onboardingSteps[onboardingState.currentStep];
  const body = step.render ? step.render() : step.body || '';
  onboardingBody.innerHTML = body;
}

function renderOnboardingStep() {
  if (!onboardingState.visible) return;
  const step = onboardingSteps[onboardingState.currentStep];
  onboardingTitle.textContent = step.title;
  onboardingSubtitle.textContent = step.subtitle || '';
  btnOnboardingPrev.style.display = onboardingState.currentStep > 0 ? 'inline-flex' : 'none';
  btnOnboardingNext.textContent =
    onboardingState.currentStep === onboardingSteps.length - 1 ? '完成' : '继续';
  renderOnboardingContent();
  updateOnboardingUI();
}

function updateOnboardingUI(options = {}) {
  if (!onboardingState.visible) return;
  if (options.rerender) {
    renderOnboardingContent();
  }
  const step = onboardingSteps[onboardingState.currentStep];
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
  const target = Math.max(0, Math.min(onboardingSteps.length - 1, index));
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
  const targetStep = Math.max(0, Math.min(onboardingSteps.length - 1, data?.lastStep || 0));
  onboardingState.currentStep = targetStep;
  openOnboarding();
}

const printerRoles = ['Kitchen', 'FrontDesk', 'Bar', 'Receipt', 'Label', 'Custom'];

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
  updateOnboardingUI({ rerender: true });
}

async function refreshStatus() {
  const data = await window.agent.getStatus();
  currentConfig = data.config || {};
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
  statusChip.textContent = online ? '运行中' : '未启动';
  statusChip.classList.toggle('status-online', online);
  statusChip.classList.toggle('status-offline', !online);
  const tcpCount = Array.isArray(currentTcpPrinters) ? currentTcpPrinters.length : 0;
  statusMeta.textContent = `HTTP 服务端口 ${server.port} · USB 设备 ${devices.length} 台 · TCP 打印机 ${tcpCount} 台 · 自动启动 ${autoLaunch ? '已开启' : '未开启'}`;

  shopIdInput.value = config.shopId || '';
  serverPortInput.value = config.server?.port || 40713;
  autostartToggle.checked = Boolean(autoLaunch);
  allowSelfSignedToggle.checked = Boolean(config.preferences?.allowSelfSigned);
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
    idle: '待命',
    disabled: '未启用',
    checking: '正在检查',
    available: '发现更新',
    downloading: '下载中',
    downloaded: '可安装',
    error: '出错',
    development: '开发模式'
  };
  const statusClassOnline = ['available', 'downloading', 'downloaded'];
  const statusClassOffline = ['error', 'disabled'];

  versionBadge.textContent = `v${update.currentVersion || '0.0.0'}`;
  updateStatusChip.classList.remove('status-online', 'status-offline');
  updateStatusChip.textContent = statusLabelMap[status] || status;
  updateStatusChip.classList.toggle('status-online', statusClassOnline.includes(status));
  updateStatusChip.classList.toggle('status-offline', statusClassOffline.includes(status));

  const message =
    update.message ||
    (status === 'disabled'
      ? '未设置更新源，关闭自动更新'
      : status === 'development'
        ? '开发模式下不执行更新'
        : '尚未检查更新');
  updateMessage.textContent = message;
  updateLastChecked.textContent = update.lastCheckedAt ? `最近检查：${formatTimestamp(update.lastCheckedAt)}` : '最近检查：--';

  const showProgress = status === 'downloading' && update.progress;
  updateProgressBlock.style.display = showProgress ? 'block' : 'none';
  if (showProgress) {
    const percent = Math.max(0, Math.min(100, update.progress.percent || 0));
    updateProgressFill.style.width = `${percent.toFixed(1)}%`;
    const transferredMb = update.progress.transferred ? (update.progress.transferred / 1024 / 1024).toFixed(1) : '0';
    const totalMb = update.progress.total ? (update.progress.total / 1024 / 1024).toFixed(1) : '0';
    updateProgressLabel.textContent = `下载进度 ${percent.toFixed(1)}% (${transferredMb} / ${totalMb} MB)`;
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
  if (diff < 0) return '刚刚';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return new Date(isoString).toLocaleString();
}

function renderTelemetryState(state = {}) {
  currentTelemetryState = state;
  const status = state.status || 'disabled';
  const statusLabel = {
    disabled: '未启用',
    idle: '待命',
    waiting: '等待配置',
    sending: '发送中',
    online: '在线',
    error: '异常'
  }[status] || status;

  telemetryStatusChip.classList.remove('status-online', 'status-offline');
  telemetryStatusChip.textContent = statusLabel;
  const isOnline = status === 'online';
  const isError = status === 'error';
  telemetryStatusChip.classList.toggle('status-online', isOnline);
  telemetryStatusChip.classList.toggle('status-offline', isError || status === 'disabled');

  telemetryMessage.textContent = state.message || '尚未开启心跳上报。';
  telemetryLastSync.textContent = state.lastSuccessAt
    ? `最后成功：${formatRelativeTime(state.lastSuccessAt)}`
    : '最后成功：--';
  telemetryNextSync.textContent = state.nextPlannedAt ? `下次心跳：${formatRelativeTime(state.nextPlannedAt)}` : '下次心跳：--';

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
    td.textContent = '未检测到 USB 设备';
    emptyRow.appendChild(td);
    deviceTable.appendChild(emptyRow);
    updateOnboardingUI({ rerender: true });
    return;
  }
  currentDevices.forEach((device) => {
    const tr = document.createElement('tr');
    const key = getDeviceKey(device);
    const mapping = getMappingForDevice(device);
    const aliasValue =
      mapping.alias ||
      (currentConfig.printers || []).find((p) => p.vendorId === device.vendorId && p.productId === device.productId)?.alias ||
      '';

    tr.innerHTML = `
      <td>${device.deviceName}</td>
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
    aliasInput.placeholder = '备注、位置等';
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
    testButton.textContent = '测试打印';
    const actionsCell = tr.querySelector('.actions-cell');
    actionsCell.appendChild(testButton);

    const statusCell = tr.querySelector('.status-cell');
    function renderStatusCell(map) {
      const lastTest = map.lastTest;
      if (!lastTest) {
        statusCell.innerHTML = '<span class="muted">未测试</span>';
        return;
      }
      const statusClass = lastTest.status === 'success' ? 'history-status-success' : 'history-status-error';
      statusCell.innerHTML = `
        <div class="${statusClass}">${lastTest.status === 'success' ? '成功' : '失败'}</div>
        <div class="muted">${formatRelativeTime(lastTest.timestamp)}</div>
        <div class="muted" style="max-width:180px;">${lastTest.message || ''}</div>
      `;
    }
    renderStatusCell(mapping);

    testButton.addEventListener('click', async () => {
      testButton.disabled = true;
      testButton.textContent = '测试中...';
      const result = await window.agent.testUsbDevice({
        vendorId: device.vendorId,
        productId: device.productId,
        alias: aliasInput.value,
        role: roleSelect.value
      });
      if (result?.ok) {
        statusCell.innerHTML = `
          <div class="history-status-success">成功</div>
          <div class="muted">${new Date().toLocaleTimeString()}</div>
          <div class="muted">测试打印成功</div>
        `;
      } else {
        statusCell.innerHTML = `
          <div class="history-status-error">失败</div>
          <div class="muted">${result?.error || '打印失败'}</div>
        `;
      }
      setTimeout(() => {
        testButton.disabled = false;
        testButton.textContent = '测试打印';
      }, 1000);
    });

    deviceTable.appendChild(tr);
  });
  updateOnboardingUI({ rerender: true });
}

function renderPrintHistory() {
  if (!historyTableBody || !historySummary) return;
  historySummary.textContent = `最近 ${printHistory.length} 条记录`;

  if (!printHistory.length) {
    historyTableBody.innerHTML =
      '<tr><td colspan="5" style="color:#64748b;text-align:center;padding:16px;">暂无测试记录</td></tr>';
    updateOnboardingUI({ rerender: true });
    return;
  }

  historyTableBody.innerHTML = printHistory
    .slice(0, 50)
    .map((record) => {
      const statusClass = record.status === 'success' ? 'history-status-success' : 'history-status-error';
      const deviceLabel =
        record.connectionType === 'tcp'
          ? `${record.ip || record.host || '未知地址'}:${record.port || 9100} · TCP`
          : `VID_0x${Number(record.vendorId || 0).toString(16)} · PID_0x${Number(record.productId || 0).toString(16)} · USB`;
      const aliasLabel = [record.alias || '', record.role || ''].filter(Boolean).join(' / ') || '--';
      return `
        <tr>
          <td>${formatTimestamp(record.timestamp)}</td>
          <td>${deviceLabel}</td>
          <td>${aliasLabel}</td>
          <td class="${statusClass}">${record.status === 'success' ? '成功' : '失败'}</td>
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
      allowSelfSigned: allowSelfSignedToggle.checked
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
  await refreshStatus();
}

async function refreshDevices() {
  currentDevices = await window.agent.refreshDevices();
  await refreshPrinterMappings();
}

async function refreshLogs() {
  const { logPath, recent } = await window.agent.getLogs();
  logPathLabel.textContent = `日志文件：${logPath}`;
  logViewer.textContent = recent && recent.length ? recent.join('\n') : '尚无日志';
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
checkUpdateButton.addEventListener('click', async () => {
  updateStatusChip.textContent = '正在检查';
  updateStatusChip.classList.remove('status-offline');
  updateStatusChip.classList.add('status-online');
  const result = await window.agent.checkUpdates();
  if (!result?.started) {
    updateMessage.textContent = result?.reason
      ? `无法检查更新：${result.reason}`
      : '无法启动检查，请确认已经配置更新源。';
  }
});
installUpdateButton.addEventListener('click', async () => {
  const result = await window.agent.installUpdate();
  if (!result?.ok) {
    updateMessage.textContent = '当前没有可安装的更新，请先检查并下载。';
  }
});
window.agent.onUpdateStatus((payload) => renderUpdateState(payload));
sendHeartbeatButton.addEventListener('click', async () => {
  telemetryStatusChip.textContent = '发送中';
  telemetryStatusChip.classList.add('status-online');
  telemetryStatusChip.classList.remove('status-offline');
  const result = await window.agent.sendTelemetry();
  if (!result?.sent) {
    telemetryMessage.textContent =
      result?.error || result?.reason ? `发送失败：${result.error || result.reason}` : '发送失败';
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
  updateOnboardingUI({ rerender: true });
});
window.agent.onPrintHistoryUpdated((payload) => {
  printHistory = payload?.history || printHistory;
  renderPrintHistory();
  updateOnboardingUI({ rerender: true });
});
window.agent.onOnboardingUpdated((payload) => {
  handleOnboardingData(payload);
});
shopIdInput.addEventListener('input', () => updateOnboardingUI({ rerender: true }));
telemetryEnabledToggle.addEventListener('change', () => updateOnboardingUI({ rerender: true }));
btnOnboardingSkip.addEventListener('click', async () => {
  if (!confirm('确定要跳过引导吗？可以稍后在设置中重新打开。')) return;
  await completeOnboarding(true);
});
btnOnboardingPrev.addEventListener('click', () => {
  if (onboardingState.currentStep > 0) {
    goToOnboardingStep(onboardingState.currentStep - 1);
  }
});
btnOnboardingNext.addEventListener('click', async () => {
  const step = onboardingSteps[onboardingState.currentStep];
  if (step.onBeforeNext) {
    const result = await step.onBeforeNext();
    if (result === false) {
      updateOnboardingUI({ rerender: true });
      return;
    }
  }
  if (onboardingState.currentStep === onboardingSteps.length - 1) {
    await completeOnboarding(false);
  } else {
    await goToOnboardingStep(onboardingState.currentStep + 1);
  }
});

refreshStatus().then(() => {
  renderPrintHistory();
  refreshLogs();
});
