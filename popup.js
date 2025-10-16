const translations = {
  en: {
    appTitle: '🕵️ Lie Detector',
    status: 'Status',
    extension: 'Extension',
    apiKey: 'API Key',
    enterKey: 'Enter your Gemini API Key',
    save: 'Save',
    clearCache: 'Clear Cache',
    statistics: 'Statistics',
    checks: 'Checks',
    misleading: 'Misleading',
    saved: 'Saved successfully',
    cleared: 'Cache cleared',
    enterApiKey: 'Please enter API key',
    disabled: 'Extension disabled',
    enabled: 'Extension enabled'
  },
  ar: {
    appTitle: '🕵️ كاشف الهبد',
    status: 'الحالة',
    extension: 'الإضافة',
    apiKey: 'مفتاح API',
    enterKey: 'أدخل مفتاح Gemini API',
    save: 'حفظ',
    clearCache: 'مسح الذاكرة',
    statistics: 'الإحصائيات',
    checks: 'الفحوصات',
    misleading: 'مضللة',
    saved: 'تم الحفظ بنجاح',
    cleared: 'تم مسح الذاكرة',
    enterApiKey: 'الرجاء إدخال مفتاح API',
    disabled: 'تم تعطيل الإضافة',
    enabled: 'تم تفعيل الإضافة'
  },
  tr: {
    appTitle: '🕵️ Yalan Dedektörü',
    status: 'Durum',
    extension: 'Uzantı',
    apiKey: 'API Anahtarı',
    enterKey: 'Gemini API Anahtarınızı girin',
    save: 'Kaydet',
    clearCache: 'Önbelleği Temizle',
    statistics: 'İstatistikler',
    checks: 'Kontroller',
    misleading: 'Yanıltıcı',
    saved: 'Başarıyla kaydedildi',
    cleared: 'Önbellek temizlendi',
    enterApiKey: 'Lütfen API anahtarını girin',
    disabled: 'Uzantı devre dışı',
    enabled: 'Uzantı etkin'
  }
};

let currentLang = 'en';

function updateLanguage(lang) {
  currentLang = lang;
  document.getElementById('appTitle').textContent = translations[lang].appTitle;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[lang][key]) {
      if (el.tagName === 'INPUT') {
        el.placeholder = translations[lang][key];
      } else {
        el.textContent = translations[lang][key];
      }
    }
  });
  chrome.storage.local.set({ language: lang });
}

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updateLanguage(btn.dataset.lang);
  });
});

const extensionToggle = document.getElementById('extensionToggle');
extensionToggle.addEventListener('click', async () => {
  const isActive = extensionToggle.classList.toggle('active');
  await chrome.storage.local.set({ extensionEnabled: isActive });
  showStatus(translations[currentLang][isActive ? 'enabled' : 'disabled'], 'success');
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.reload(tabs[0].id);
  });
});

document.getElementById('saveKey').addEventListener('click', async () => {
  const apiKey = document.getElementById('apiKey').value.trim();
  
  if (!apiKey) {
    showStatus(translations[currentLang].enterApiKey, 'error');
    return;
  }
  
  await chrome.storage.local.set({ geminiApiKey: apiKey });
  showStatus(translations[currentLang].saved, 'success');
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.reload(tabs[0].id);
  });
});

document.getElementById('clearCache').addEventListener('click', async () => {
  await chrome.storage.local.remove(['textCache', 'checksCount', 'misleadingCount']);
  document.getElementById('checksCount').textContent = '0';
  document.getElementById('misleadingCount').textContent = '0';
  showStatus(translations[currentLang].cleared, 'success');
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.reload(tabs[0].id);
  });
});

function showStatus(message, type) {
  const status = document.getElementById('status');
  status.className = `status ${type}`;
  status.textContent = message;
  setTimeout(() => status.textContent = '', 3000);
}

chrome.storage.local.get(['geminiApiKey', 'extensionEnabled', 'language', 'checksCount', 'misleadingCount'], (result) => {
  if (result.geminiApiKey) {
    document.getElementById('apiKey').value = result.geminiApiKey;
  }
  
  if (result.extensionEnabled === false) {
    extensionToggle.classList.remove('active');
  }
  
  if (result.language) {
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-lang="${result.language}"]`).classList.add('active');
    updateLanguage(result.language);
  }
  
  document.getElementById('checksCount').textContent = result.checksCount || 0;
  document.getElementById('misleadingCount').textContent = result.misleadingCount || 0;
});
