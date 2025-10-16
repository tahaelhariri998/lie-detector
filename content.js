let apiKey = null;
let chatHistory = new Map();
let textCache = new Map();
let activeIndicators = new Set();
let currentText = null;
let processedTexts = new Set();
let userLanguage = 'en';

const MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash'];

const UI_TEXTS = {
  en: {
    checkButton: '🔍 Do you want to verify this information?',
    resultTitle: '🔍 Check Result',
    copyButton: '📋 Copy Text',
    copied: '✓ Copied',
    chatPlaceholder: 'Ask for more...',
    checking: 'Checking...'
  },
  ar: {
    checkButton: '🔍 هل تريد التأكد من هذه المعلومات؟',
    resultTitle: '🔍 نتيجة الفحص',
    copyButton: '📋 نسخ النص',
    copied: '✓ تم النسخ',
    chatPlaceholder: 'اسأل عن المزيد...',
    checking: 'جاري الفحص...'
  },
  tr: {
    checkButton: '🔍 Bu bilgiyi doğrulamak ister misiniz?',
    resultTitle: '🔍 Kontrol Sonucu',
    copyButton: '📋 Metni Kopyala',
    copied: '✓ Kopyalandı',
    chatPlaceholder: 'Daha fazla sor...',
    checking: 'Kontrol ediliyor...'
  }
};

function cleanText(text) {
  if (!text) return '';
  
  const div = document.createElement('div');
  div.innerHTML = text;
  let cleaned = div.textContent || div.innerText;
  
  // إزالة JSON structures
  cleaned = cleaned.replace(/\{\s*&quot;[\s\S]*?&quot;\s*\}/g, '');
  cleaned = cleaned.replace(/\{\s*"[^}]*"isMisleading"[^}]*\}/g, '');
  cleaned = cleaned.replace(/^\{[\s\S]*?"report"\s*:\s*"/, '');
  cleaned = cleaned.replace(/"\s*\}\s*$/, '');
  
  // إزالة HTML entities
  cleaned = cleaned.replace(/&quot;/g, '"');
  cleaned = cleaned.replace(/&amp;/g, '&');
  cleaned = cleaned.replace(/&lt;/g, '<');
  cleaned = cleaned.replace(/&gt;/g, '>');
  
  // إزالة markdown
  cleaned = cleaned.replace(/\*\*/g, '');
  cleaned = cleaned.replace(/#{1,6}\s/g, '');
  cleaned = cleaned.replace(/`/g, '');
  
  return cleaned.trim();
}

let extensionEnabled = true;

chrome.storage.local.get(['geminiApiKey', 'extensionEnabled', 'language'], (result) => {
  if (result.geminiApiKey) {
    apiKey = result.geminiApiKey;
  }
  if (result.extensionEnabled !== undefined) {
    extensionEnabled = result.extensionEnabled;
  }
  if (result.language) {
    userLanguage = result.language;
  }
});

document.addEventListener('mouseup', handleTextSelection);

function handleTextSelection(e) {
  if (!extensionEnabled) return;
  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    if (text && selection.rangeCount > 0) {
      if (processedTexts.has(text)) return;
      
      const range = selection.getRangeAt(0);
      
      if (textCache.has(text)) {
        showCachedResult(text, range);
      } else {
        showCheckButton(text, range, selection);
      }
    }
  }, 10);
}

function handleClick(e) {
  if (e.target.closest('.fact-check-btn') || e.target.closest('.fact-check-indicator') || e.target.closest('.fact-check-modal')) return;
  
  const selectors = [
    'article', 'main', '[role="main"]', '.post', '.article', '.content',
    '[data-testid="tweet"]',
    '[data-ad-preview="message"]',
    '.message-in', '.message-out'
  ];
  
  let container = e.target.closest(selectors.join(','));
  
  if (!container) {
    let current = e.target;
    while (current && current !== document.body) {
      const text = current.textContent?.trim();
      const wordCount = text?.split(/\s+/).filter(w => w.length > 0).length || 0;
      if (wordCount >= 50) {
        container = current;
        break;
      }
      current = current.parentElement;
    }
  }
  
  const target = container || e.target;
  const text = target.textContent?.trim();
  
  if (text) {
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    if (wordCount >= 15 && wordCount <= 500) {
      if (processedTexts.has(text)) return;
      
      const rect = target.getBoundingClientRect();
      
      if (textCache.has(text)) {
        showCachedResult(text, rect);
      } else {
        showCheckButton(text, rect, null);
      }
    }
  }
}

function showCachedResult(text, range) {
  if (currentText === text) {
    const existing = Array.from(activeIndicators).find(ind => chatHistory.get(ind)?.[0]?.text === text);
    if (existing) return;
  }
  
  removeAllIndicators();
  currentText = text;
  
  const cached = textCache.get(text);
  const indicator = createFloatingIndicator(range);
  indicator.className = 'fact-check-indicator ' + (cached.isMisleading ? 'warning' : 'safe');
  indicator.innerHTML = cached.isMisleading ? '<span class="icon-warning">⚠️</span>' : '<span class="icon-safe">✓</span>';
  
  indicator.onclick = (e) => {
    e.stopPropagation();
    const existingModal = document.querySelector('.fact-check-modal');
    if (existingModal) {
      existingModal.remove();
    } else {
      showModal(indicator, text);
    }
  };
  
  chatHistory.set(indicator, [{
    role: 'user',
    text: text
  }, {
    role: 'assistant',
    text: cached.report
  }]);
}

function showCheckButton(text, range, selection) {
  if (textCache.has(text)) {
    showCachedResult(text, range);
    return;
  }
  
  processedTexts.add(text);
  
  const existing = document.querySelector('.fact-check-btn');
  if (existing) existing.remove();
  
  const rects = range.getClientRects();
  const rect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
  const btn = document.createElement('button');
  btn.className = 'fact-check-btn';
  btn.innerHTML = UI_TEXTS[userLanguage].checkButton;
  btn.style.cssText = `position: fixed; top: ${rect.bottom + 10}px; left: ${rect.left}px; z-index: 999999; padding: 8px 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 20px; cursor: pointer; font-size: 13px; font-weight: 600; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); transition: all 0.3s ease; pointer-events: auto;`;
  
  btn.onmouseenter = () => btn.style.transform = 'translateY(-2px)';
  btn.onmouseleave = () => btn.style.transform = 'translateY(0)';
  
  btn.onmousedown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  };
  
  btn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    btn.remove();
    if (selection) selection.removeAllRanges();
    removeAllIndicators();
    currentText = text;
    const indicator = createFloatingIndicator(range);
    checkWithGemini(text, indicator);
    return false;
  };
  
  document.body.appendChild(btn);
  
  const removeBtn = () => {
    if (btn.parentNode) {
      btn.remove();
      processedTexts.delete(text);
    }
  };
  
  setTimeout(removeBtn, 10000);
  
  setTimeout(() => {
    document.addEventListener('mousedown', (e) => {
      if (!btn.contains(e.target)) {
        removeBtn();
      }
    }, { once: true });
  }, 100);
}

function removeAllIndicators() {
  activeIndicators.forEach(indicator => {
    if (indicator.parentNode) indicator.remove();
  });
  activeIndicators.clear();
}

function createFloatingIndicator(range) {
  const wrapper = document.createElement('span');
  wrapper.style.cssText = 'display: inline-flex; align-items: center; margin: 0 6px; padding: 3px 6px; background: transparent; border-radius: 14px; vertical-align: middle;';
  
  const indicator = document.createElement('span');
  indicator.className = 'fact-check-indicator checking';
  indicator.innerHTML = '<div class="spinner"></div>';
  
  wrapper.appendChild(indicator);
  
  range.collapse(false);
  range.insertNode(wrapper);
  
  activeIndicators.add(wrapper);
  return indicator;
}

function isElementVisible(el) {
  const rect = el.getBoundingClientRect();
  return (
    rect.top < window.innerHeight + 100 &&
    rect.bottom > -100 &&
    rect.left < window.innerWidth + 100 &&
    rect.right > -100
  );
}

async function checkWithGemini(text, indicator, modelIndex = 0) {
  if (!apiKey) return;
  
  if (modelIndex >= MODELS.length) return;
  const model = MODELS[modelIndex];
  
  const isArabic = /[\u0600-\u06FF]/.test(text);
  const lang = isArabic ? 'ar' : 'en';
  
  const prompt = lang === 'ar' 
    ? `النص المراد تحليله:
"${text}"

مهم: حلل هذا النص وابحث عن معلومات مضللة. يجب أن يكون التقرير باللغة العربية فقط بدون رموز markdown.

أجب فقط بهذا JSON:
{"isMisleading": true/false, "report": "التقرير بالعربية"}`
    : `Text to analyze:
"${text}"

Task: Analyze this text for misinformation. The report MUST be in English only, without markdown symbols.

Respond only with this JSON:
{"isMisleading": true/false, "report": "Report in English"}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        tools: [{ google_search: {} }]
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
      
      if ((errorMsg.includes('overloaded') || errorMsg.includes('quota') || response.status === 429 || response.status === 503) && modelIndex < MODELS.length - 1) {
        const retryMatch = errorMsg.match(/(\d+\.?\d*)s/);
        const delay = retryMatch ? parseFloat(retryMatch[1]) * 1000 : 2000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return checkWithGemini(text, indicator, modelIndex + 1);
      }
      
      throw new Error(errorMsg);
    }
    
    const data = await response.json();
    
    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error('استجابة غير صالحة من Gemini');
    }
    
    let result = data.candidates[0].content.parts[0].text;
    result = result.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    // فك تشفير HTML entities أولاً
    const decodeDiv = document.createElement('div');
    decodeDiv.innerHTML = result;
    result = decodeDiv.textContent || decodeDiv.innerText;
    
    let analysis;
    try {
      // استخراج JSON من النص
      let jsonStr = result;
      const jsonStart = result.indexOf('{');
      const jsonEnd = result.lastIndexOf('}');
      
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonStr = result.substring(jsonStart, jsonEnd + 1);
      }
      
      analysis = JSON.parse(jsonStr);
      
      // التأكد من قيمة isMisleading
      if (typeof analysis.isMisleading !== 'boolean') {
        analysis.isMisleading = analysis.isMisleading === 'true' || analysis.isMisleading === true;
      }
      
      if (analysis.report) {
        // فك تشفير HTML entities في التقرير
        const reportDiv = document.createElement('div');
        reportDiv.innerHTML = analysis.report;
        analysis.report = (reportDiv.textContent || reportDiv.innerText)
          .replace(/\*\*/g, '')
          .replace(/#{1,6}\s/g, '')
          .replace(/\*/g, '')
          .replace(/`/g, '')
          .replace(/\[المرجع \d+[،\s\d]*\]/g, '')
          .trim();
      }
    } catch (e) {
      // إذا فشل التحليل، استخدم النص كاملاً
      analysis = { isMisleading: false, report: cleanText(result) };
    }
    
    // التحقق النهائي من isMisleading
    analysis.isMisleading = analysis.isMisleading === true;
    
    textCache.set(text, analysis);
    
    chrome.storage.local.get(['checksCount', 'misleadingCount'], (result) => {
      const checks = (result.checksCount || 0) + 1;
      const misleading = (result.misleadingCount || 0) + (analysis.isMisleading ? 1 : 0);
      chrome.storage.local.set({ checksCount: checks, misleadingCount: misleading });
    });
    
    indicator.className = 'fact-check-indicator ' + (analysis.isMisleading ? 'warning' : 'safe');
    indicator.innerHTML = analysis.isMisleading ? '<span class="icon-warning">⚠️</span>' : '<span class="icon-safe">✓</span>';
    
    indicator.onclick = (e) => {
      e.stopPropagation();
      const existingModal = document.querySelector('.fact-check-modal');
      if (existingModal) {
        existingModal.remove();
      } else {
        showModal(indicator, text);
      }
    };
    
    chatHistory.set(indicator, [{
      role: 'user',
      text: text
    }, {
      role: 'assistant',
      text: analysis.report
    }]);
    
  } catch (error) {
    indicator.className = 'fact-check-indicator error';
    indicator.innerHTML = '<span class="icon-error">?</span>';
    
    indicator.onclick = (e) => {
      e.stopPropagation();
      const existingModal = document.querySelector('.fact-check-modal');
      if (existingModal) {
        existingModal.remove();
      } else {
        showModal(indicator, text);
      }
    };
    chatHistory.set(indicator, [{
      role: 'user',
      text: text
    }, {
      role: 'assistant',
      text: `خطأ: ${error.message}`
    }]);
  }
}

function showModal(indicator, originalText) {
  const existingModal = document.querySelector('.fact-check-modal');
  if (existingModal) existingModal.remove();
  
  const modal = document.createElement('div');
  modal.className = 'fact-check-modal';
  modal.dir = userLanguage === 'ar' ? 'rtl' : 'ltr';
  
  const history = chatHistory.get(indicator) || [];
  let lastResponse = history.length > 1 ? history[history.length - 1].text : UI_TEXTS[userLanguage].checking;
  lastResponse = cleanText(lastResponse);
  
  modal.innerHTML = `
    <div class="modal-header">
      <h4>${UI_TEXTS[userLanguage].resultTitle}</h4>
      <button class="close-btn">×</button>
    </div>
    <div class="modal-body">
      <div class="result"></div>
      <button class="copy-btn" style="margin: 10px 0; padding: 6px 12px; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 12px;">${UI_TEXTS[userLanguage].copyButton}</button>
      <div class="chat-section">
        <div class="chat-messages"></div>
        <div class="chat-input-wrapper">
          <input type="text" class="chat-input" placeholder="${UI_TEXTS[userLanguage].chatPlaceholder}" dir="${userLanguage === 'ar' ? 'rtl' : 'ltr'}">
          <button class="chat-send">→</button>
        </div>
      </div>
    </div>
  `;
  
  modal.querySelector('.result').textContent = lastResponse;
  
  modal.querySelector('.copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(lastResponse).then(() => {
      const btn = modal.querySelector('.copy-btn');
      btn.textContent = UI_TEXTS[userLanguage].copied;
      setTimeout(() => btn.textContent = UI_TEXTS[userLanguage].copyButton, 2000);
    });
  });
  
  modal.style.cssText = `position: fixed; z-index: 999999;`;
  document.body.appendChild(modal);
  
  const updatePosition = () => {
    const rect = indicator.getBoundingClientRect();
    const modalWidth = 400;
    const modalHeight = 300;
    
    let top = rect.bottom + 10;
    let left = rect.left;
    
    if (left + modalWidth > window.innerWidth) {
      left = window.innerWidth - modalWidth - 20;
    }
    if (top + modalHeight > window.innerHeight) {
      top = rect.top - modalHeight - 10;
    }
    
    modal.style.top = top + 'px';
    modal.style.left = left + 'px';
  };
  
  updatePosition();
  
  const scrollListener = () => updatePosition();
  window.addEventListener('scroll', scrollListener, true);
  window.addEventListener('resize', scrollListener);
  
  const closeModal = () => {
    modal.remove();
    window.removeEventListener('scroll', scrollListener, true);
    window.removeEventListener('resize', scrollListener);
    clickListener && document.removeEventListener('click', clickListener);
  };
  
  modal.querySelector('.close-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    closeModal();
  });
  
  const clickListener = (e) => {
    if (!modal.contains(e.target) && !indicator.contains(e.target)) {
      closeModal();
    }
  };
  
  setTimeout(() => {
    document.addEventListener('click', clickListener);
  }, 100);
  
  const chatInput = modal.querySelector('.chat-input');
  const chatSend = modal.querySelector('.chat-send');
  const chatMessages = modal.querySelector('.chat-messages');
  
  const sendMessage = async () => {
    const message = chatInput.value.trim();
    if (!message) return;
    
    chatInput.value = '';
    
    const userMsg = document.createElement('div');
    userMsg.className = 'user-message';
    userMsg.textContent = message;
    chatMessages.appendChild(userMsg);
    
    const response = await continueChat(indicator, message, originalText);
    const cleanedResponse = cleanText(response);
    
    const aiMsg = document.createElement('div');
    aiMsg.className = 'ai-message';
    aiMsg.textContent = cleanedResponse;
    chatMessages.appendChild(aiMsg);
    
    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋';
    copyBtn.style.cssText = 'margin-left: 5px; padding: 2px 6px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 10px;';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(cleanedResponse).then(() => {
        copyBtn.textContent = '✓';
        setTimeout(() => copyBtn.textContent = '📋', 2000);
      });
    };
    aiMsg.appendChild(copyBtn);
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
  };
  
  chatSend.addEventListener('click', sendMessage);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
}

async function continueChat(indicator, message, originalText, modelIndex = 0) {
  if (!apiKey) return 'لم يتم تعيين مفتاح API';
  
  if (modelIndex >= MODELS.length) return 'جميع النماذج غير متاحة';
  const model = MODELS[modelIndex];
  
  const history = chatHistory.get(indicator) || [];
  history.push({ role: 'user', text: message });
  
  const contents = history.map(h => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.text }]
  }));
  
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        contents,
        tools: [{ google_search: {} }]
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      const errorMsg = errorData.error?.message || `خطأ HTTP ${response.status}`;
      
      if ((errorMsg.includes('overloaded') || errorMsg.includes('quota') || response.status === 429 || response.status === 503) && modelIndex < MODELS.length - 1) {
        const retryMatch = errorMsg.match(/(\d+\.?\d*)s/);
        const delay = retryMatch ? parseFloat(retryMatch[1]) * 1000 : 2000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return continueChat(indicator, message, originalText, modelIndex + 1);
      }
      
      throw new Error(errorMsg);
    }
    
    const data = await response.json();
    
    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error('استجابة غير صالحة من Gemini');
    }
    
    let result = data.candidates[0].content.parts[0].text;
    
    // فك تشفير HTML entities
    const decodeDiv = document.createElement('div');
    decodeDiv.innerHTML = result;
    result = decodeDiv.textContent || decodeDiv.innerText;
    
    history.push({ role: 'assistant', text: result });
    chatHistory.set(indicator, history);
    
    return result;
  } catch (error) {
    return `خطأ: ${error.message}`;
  }
}
