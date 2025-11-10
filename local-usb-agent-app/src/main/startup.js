const { app, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const isWindows = process.platform === 'win32';

function getWindowsStartupShortcutPath() {
  const startupDir = path.join(
    app.getPath('appData'),
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Startup'
  );
  return path.join(startupDir, `${app.getName()}.lnk`);
}

function getAutoLaunchEnabled() {
  try {
    if (isWindows) {
      const shortcutPath = getWindowsStartupShortcutPath();
      return fs.existsSync(shortcutPath);
    }
    const settings = app.getLoginItemSettings();
    return Boolean(settings.openAtLogin);
  } catch (err) {
    return false;
  }
}

function setAutoLaunchEnabled(enabled) {
  try {
    if (isWindows) {
      const shortcutPath = getWindowsStartupShortcutPath();
      if (enabled) {
        fs.mkdirSync(path.dirname(shortcutPath), { recursive: true });
        shell.writeShortcutLink(shortcutPath, 'create', {
          target: process.execPath,
          cwd: path.dirname(process.execPath),
          args: ['--hidden']
        });
      } else if (fs.existsSync(shortcutPath)) {
        fs.unlinkSync(shortcutPath);
      }
      return;
    }
    app.setLoginItemSettings({ openAtLogin: enabled, path: app.getPath('exe') });
  } catch (err) {
    // ignore
  }
}

module.exports = {
  getAutoLaunchEnabled,
  setAutoLaunchEnabled
};
