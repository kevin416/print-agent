const { app } = require('electron');

function getAutoLaunchEnabled() {
  try {
    const settings = app.getLoginItemSettings();
    return Boolean(settings.openAtLogin);
  } catch (err) {
    return false;
  }
}

function setAutoLaunchEnabled(enabled) {
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, path: app.getPath('exe') });
  } catch (err) {
    // ignore
  }
}

module.exports = {
  getAutoLaunchEnabled,
  setAutoLaunchEnabled
};
