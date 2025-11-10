const fs = require('fs');
const path = require('path');

const LANGUAGES = {
  'zh-CN': require('./zh-CN.json'),
  'en-US': require('./en-US.json')
};

const DEFAULT_LANGUAGE = 'zh-CN';

class I18n {
  constructor(locale = DEFAULT_LANGUAGE) {
    this.locale = locale;
    this.translations = LANGUAGES[locale] || LANGUAGES[DEFAULT_LANGUAGE];
  }

  setLocale(locale) {
    if (LANGUAGES[locale]) {
      this.locale = locale;
      this.translations = LANGUAGES[locale];
      return true;
    }
    return false;
  }

  t(key, params = {}) {
    const keys = key.split('.');
    let value = this.translations;
    
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

  getLocale() {
    return this.locale;
  }

  getAvailableLocales() {
    return Object.keys(LANGUAGES);
  }
}

// Create singleton instance
let i18nInstance = null;

function getI18n(locale) {
  if (!i18nInstance) {
    i18nInstance = new I18n(locale);
  } else if (locale) {
    i18nInstance.setLocale(locale);
  }
  return i18nInstance;
}

module.exports = {
  I18n,
  getI18n,
  DEFAULT_LANGUAGE,
  LANGUAGES
};

