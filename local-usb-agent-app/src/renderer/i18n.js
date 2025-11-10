// Renderer process i18n module
// Loads translations from main process via IPC

let currentLocale = 'zh-CN';
let translations = {};

async function loadTranslations(locale) {
  if (window.agent && window.agent.getTranslations) {
    const data = await window.agent.getTranslations(locale);
    currentLocale = data.locale;
    translations = data.translations;
    return data;
  }
  // Fallback: load from JSON files if available
  try {
    const response = await fetch(`../i18n/${locale}.json`);
    const data = await response.json();
    currentLocale = locale;
    translations = data;
    return { locale, translations: data };
  } catch (error) {
    console.error('Failed to load translations:', error);
    return { locale: 'zh-CN', translations: {} };
  }
}

function t(key, params = {}) {
  const keys = key.split('.');
  let value = translations;
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return key; // Return key if translation not found
    }
  }
  
  if (typeof value !== 'string') {
    return key;
  }
  
  // Replace parameters
  if (params && Object.keys(params).length > 0) {
    return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
      return params[paramKey] !== undefined ? String(params[paramKey]) : match;
    });
  }
  
  return value;
}

function getLocale() {
  return currentLocale;
}

function setLocale(locale) {
  currentLocale = locale;
  return loadTranslations(locale);
}

// Export for use in renderer.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { t, getLocale, setLocale, loadTranslations };
} else {
  window.i18n = { t, getLocale, setLocale, loadTranslations };
}

