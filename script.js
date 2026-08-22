const languages = {
  zh: { code: 'CHN', name: 'Chinese', locale: 'zh-CN' },
  en: { code: 'ENG', name: 'English', locale: 'en-US' },
  es: { code: 'ESP', name: 'Spanish', locale: 'es-ES' },
  fr: { code: 'FRA', name: 'French', locale: 'fr-FR' }
};

const defaultWorkspaces = [
  { from: 'auto', to: 'zh' },
  { from: 'auto', to: 'en' },
  { from: 'auto', to: 'es' },
  { from: 'auto', to: 'fr' }
];

const initialParams = new URLSearchParams(location.search);
const validSources = new Set(['auto', ...Object.keys(languages)]);
const validTargets = new Set(Object.keys(languages));
const starters = defaultWorkspaces.map((defaults, index) => ({
  from: validSources.has(initialParams.get(`from${index + 1}`)) ? initialParams.get(`from${index + 1}`) : defaults.from,
  to: validTargets.has(initialParams.get(`to${index + 1}`)) ? initialParams.get(`to${index + 1}`) : defaults.to,
  text: (initialParams.get(`text${index + 1}`) || '').slice(0, 500)
}));
const initialTab = Math.min(3, Math.max(0, Number(initialParams.get('tab')) || 0));

const grid = document.querySelector('.translation-grid');
const toast = document.querySelector('.toast');
const themeButton = document.querySelector('.theme');
const themeMeta = document.querySelector('meta[name="theme-color"]');
const debounceTimers = new WeakMap();
const requestVersions = new WeakMap();
const translatorCache = new Map();
let detectorPromise;
let urlSyncTimer;

function languageCode(id) {
  return id === 'auto' ? 'AUTO' : languages[id].code;
}

function languageButtons(selected, side, index) {
  const choices = Object.entries(languages).map(([id, language]) => [id, language.name]);
  if (side === 'from') choices.unshift(['auto', 'Detect language']);

  return `<div class="language-options ${side}-options" role="radiogroup" aria-label="Workspace ${index + 1} ${side === 'from' ? 'source' : 'target'} language">
    ${choices.map(([id, label]) => `<button class="language-option ${id === selected ? 'active' : ''}" type="button" role="radio" aria-checked="${id === selected}" data-side="${side}" data-language="${id}">${label}</button>`).join('')}
  </div>`;
}

function createWindow(config, index) {
  return `<article class="translator-window" id="translator-panel-${index}" data-index="${index}" role="tabpanel" aria-labelledby="translator-tab-${index}" ${index ? 'hidden' : ''}>
    <div class="window-head">
      <div class="window-meta"><div class="window-title"><span>0${index + 1}</span><strong>Workspace</strong></div><button class="clear-one" type="button" aria-label="Clear workspace ${index + 1}">Clear workspace</button></div>
      <div class="language-controls">
        ${languageButtons(config.from, 'from', index)}
        <button class="swap" type="button" aria-label="Swap source and target languages" title="Swap languages"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h12m0 0-3-3m3 3-3 3M17 17H5m0 0 3-3m-3 3 3 3"/></svg></button>
        ${languageButtons(config.to, 'to', index)}
      </div>
    </div>
    <div class="window-body">
      <div class="input-side"><span class="field-label">Original</span><textarea maxlength="500" aria-label="Workspace ${index + 1} text input" placeholder="Start writing…" spellcheck="true">${escapeHtml(config.text)}</textarea><div class="side-foot"><span class="count">${config.text.length} / 500</span><div class="input-actions"><span class="live-label">Live</span><button class="icon-button speak-input" type="button" aria-label="Listen to original text" title="Listen to original" ${config.text ? '' : 'disabled'}><svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Zm4 5a4 4 0 0 1 0 4m2.5-6.5a7 7 0 0 1 0 9"/></svg></button></div></div></div>
      <div class="output-side"><span class="field-label">Translation</span><div class="output placeholder" aria-live="polite">Your translation will appear here.</div><div class="side-foot"><span class="window-status">Ready</span><div class="card-actions"><button class="icon-button speak-output" type="button" aria-label="Listen to translation" title="Listen to translation" disabled><svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Zm4 5a4 4 0 0 1 0 4m2.5-6.5a7 7 0 0 1 0 9"/></svg></button><button class="icon-button copy" type="button" aria-label="Copy translation" title="Copy" disabled><svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="1"/><path d="M16 8V5H5v11h3"/></svg></button></div></div></div>
    </div>
  </article>`;
}

function createTabs() {
  return `<div class="workspace-tabs" role="tablist" aria-label="Translation workspaces">${starters.map((item, index) => `<button class="workspace-tab ${index === 0 ? 'active' : ''}" id="translator-tab-${index}" type="button" role="tab" aria-selected="${index === 0}" aria-controls="translator-panel-${index}" data-tab="${index}"><span>0${index + 1}</span><strong>${languageCode(item.from)} → ${languageCode(item.to)}</strong><small>Workspace ${index + 1}</small></button>`).join('')}</div>`;
}

function getLanguage(translator, side) {
  return translator.querySelector(`.${side}-options .language-option.active`).dataset.language;
}

function setLanguage(translator, side, language) {
  translator.querySelectorAll(`.${side}-options .language-option`).forEach(button => {
    const active = button.dataset.language === language;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });
}

function activateTab(index, focus = true) {
  grid.querySelectorAll('.workspace-tab').forEach((tab, tabIndex) => {
    const active = tabIndex === index;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  grid.querySelectorAll('.translator-window').forEach((panel, panelIndex) => {
    panel.hidden = panelIndex !== index;
  });
  if (focus) grid.querySelector(`[data-tab="${index}"]`).focus();
  scheduleUrlSync();
}

function scheduleUrlSync() {
  clearTimeout(urlSyncTimer);
  urlSyncTimer = setTimeout(syncUrl, 180);
}

function syncUrl() {
  const params = new URLSearchParams();
  const activeTab = grid.querySelector('.workspace-tab.active');
  params.set('tab', activeTab?.dataset.tab || '0');
  grid.querySelectorAll('.translator-window').forEach((translator, index) => {
    params.set(`from${index + 1}`, getLanguage(translator, 'from'));
    params.set(`to${index + 1}`, getLanguage(translator, 'to'));
    const text = translator.querySelector('textarea').value;
    if (text) params.set(`text${index + 1}`, text);
  });
  const url = new URL(location.href);
  url.search = params.toString();
  url.hash = '';
  history.replaceState(null, '', url);
}

function updateTabLabel(translator) {
  const index = Number(translator.dataset.index);
  const from = getLanguage(translator, 'from');
  const to = getLanguage(translator, 'to');
  grid.querySelector(`[data-tab="${index}"] strong`).textContent = `${languageCode(from)} → ${languageCode(to)}`;
}

async function translateWindow(translator) {
  const text = translator.querySelector('textarea').value.trim();
  const selectedFrom = getLanguage(translator, 'from');
  const to = getLanguage(translator, 'to');
  const status = translator.querySelector('.window-status');
  const version = (requestVersions.get(translator) || 0) + 1;
  requestVersions.set(translator, version);

  if (!text) {
    showEmpty(translator);
    return;
  }

  setState(translator, selectedFrom === 'auto' ? 'Detecting the language…' : 'Finding the right words…', 'loading', selectedFrom === 'auto' ? 'Detecting' : 'Translating');
  try {
    const from = selectedFrom === 'auto' ? await detectLanguage(text) : selectedFrom;
    if (requestVersions.get(translator) !== version) return;
    if (from === to) {
      setState(translator, text, '', selectedFrom === 'auto' ? `Detected ${languages[from].name}` : 'Same language');
      return;
    }
    const result = await translateText(text, from, to, status);
    if (requestVersions.get(translator) !== version) return;
    setState(translator, result.text, '', selectedFrom === 'auto' ? `${languages[from].code} detected · ${result.method}` : result.method);
  } catch (error) {
    if (requestVersions.get(translator) !== version) return;
    setState(translator, 'Translation is temporarily unavailable.', 'error', 'Try again');
    console.error(error);
  }
}

async function detectLanguage(text) {
  if ('LanguageDetector' in self && window.isSecureContext) {
    try {
      detectorPromise ??= LanguageDetector.create();
      const detector = await detectorPromise;
      const results = await detector.detect(text);
      for (const result of results) {
        const code = result.detectedLanguage.toLowerCase().split('-')[0];
        if (languages[code]) return code;
      }
    } catch (error) {
      console.info('Browser language detection unavailable; using local detection.', error);
    }
  }
  return detectLocally(text);
}

function detectLocally(text) {
  if (/[\u3400-\u9fff]/u.test(text)) return 'zh';
  const normalized = ` ${text.toLowerCase()} `;
  const scores = { en: 0, es: 0, fr: 0 };
  const markers = {
    es: [' el ', ' los ', ' las ', ' por ', ' para ', ' una ', ' un ', ' está ', ' como ', '¿', '¡', 'ñ', 'ción'],
    fr: [' le ', ' les ', ' des ', ' du ', ' pour ', ' une ', ' est ', ' avec ', ' dans ', ' mais ', 'ç', 'œ', 'é', 'è', 'ê', 'à'],
    en: [' the ', ' and ', ' is ', ' are ', ' to ', ' of ', ' for ', ' with ', ' this ', ' that ', ' a ']
  };
  Object.entries(markers).forEach(([language, words]) => words.forEach(word => {
    if (normalized.includes(word)) scores[language] += word.length > 3 ? 2 : 1;
  }));
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return ranked[0][1] > 0 ? ranked[0][0] : 'en';
}

async function translateText(text, from, to, status) {
  if ('Translator' in self && window.isSecureContext) {
    try {
      const translator = await getTranslator(from, to, status);
      return { text: await translator.translate(text), method: 'On-device' };
    } catch (error) {
      console.info('On-device translation unavailable; using cloud fallback.', error);
    }
  }
  status.textContent = 'Translating';
  const params = new URLSearchParams({ q: text, langpair: `${from}|${to}`, mt: '1' });
  const response = await fetch(`https://api.mymemory.translated.net/get?${params}`);
  if (!response.ok) throw new Error(`Translation service returned ${response.status}`);
  const data = await response.json();
  if (data.responseStatus !== 200 || !data.responseData?.translatedText) throw new Error(data.responseDetails || 'No translation returned');
  return { text: decodeHtml(data.responseData.translatedText), method: 'Cloud translation' };
}

async function getTranslator(from, to, status) {
  const key = `${from}:${to}`;
  if (translatorCache.has(key)) return translatorCache.get(key);
  const availability = await Translator.availability({ sourceLanguage: from, targetLanguage: to });
  if (availability === 'unavailable') throw new Error('MODEL_UNAVAILABLE');
  const creation = Translator.create({ sourceLanguage: from, targetLanguage: to, monitor(monitor) { monitor.addEventListener('downloadprogress', event => { status.textContent = `Downloading ${Math.round(event.loaded * 100)}%`; }); } });
  translatorCache.set(key, creation);
  try {
    const translator = await creation;
    translatorCache.set(key, translator);
    return translator;
  } catch (error) {
    translatorCache.delete(key);
    throw error;
  }
}

function queueTranslation(translator, delay = 450) {
  clearTimeout(debounceTimers.get(translator));
  debounceTimers.set(translator, setTimeout(() => translateWindow(translator), delay));
}

function setState(translator, message, state, label) {
  const output = translator.querySelector('.output');
  const status = translator.querySelector('.window-status');
  output.textContent = message;
  output.className = `output ${state}`.trim();
  status.textContent = label;
  status.className = `window-status ${state}`.trim();
  translator.querySelectorAll('.card-actions button').forEach(button => { button.disabled = Boolean(state); });
}

function showEmpty(translator) {
  setState(translator, 'Your translation will appear here.', 'placeholder', 'Ready');
}

function clearTranslator(translator) {
  translator.querySelector('textarea').value = '';
  translator.querySelector('.count').textContent = '0 / 500';
  translator.querySelector('.speak-input').disabled = true;
  requestVersions.set(translator, (requestVersions.get(translator) || 0) + 1);
  showEmpty(translator);
  scheduleUrlSync();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1600);
}

grid.addEventListener('click', async event => {
  const tab = event.target.closest('.workspace-tab');
  if (tab) { activateTab(Number(tab.dataset.tab)); return; }
  const translator = event.target.closest('.translator-window');
  if (!translator) return;

  const languageOption = event.target.closest('.language-option');
  if (languageOption) {
    setLanguage(translator, languageOption.dataset.side, languageOption.dataset.language);
    updateTabLabel(translator);
    queueTranslation(translator, 0);
    scheduleUrlSync();
    return;
  }
  if (event.target.closest('.clear-one')) {
    clearTranslator(translator);
    translator.querySelector('textarea').focus();
    return;
  }
  if (event.target.closest('.swap')) {
    const oldFrom = getLanguage(translator, 'from');
    const oldTo = getLanguage(translator, 'to');
    setLanguage(translator, 'from', oldTo);
    setLanguage(translator, 'to', oldFrom === 'auto' ? (oldTo === 'en' ? 'zh' : 'en') : oldFrom);
    updateTabLabel(translator);
    const output = translator.querySelector('.output');
    if (![...output.classList].some(name => ['placeholder', 'error', 'loading'].includes(name))) {
      translator.querySelector('textarea').value = output.textContent;
      translator.querySelector('.count').textContent = `${output.textContent.length} / 500`;
    }
    showEmpty(translator);
    queueTranslation(translator, 0);
    scheduleUrlSync();
  }

  if (event.target.closest('.speak-input') && 'speechSynthesis' in window) {
    const inputText = translator.querySelector('textarea').value.trim();
    if (!inputText) return;
    const selectedLanguage = getLanguage(translator, 'from');
    const spokenLanguage = selectedLanguage === 'auto' ? await detectLanguage(inputText) : selectedLanguage;
    speakText(inputText, languages[spokenLanguage].locale);
    return;
  }

  const outputText = translator.querySelector('.output').textContent;
  if (event.target.closest('.copy')) {
    try { await navigator.clipboard.writeText(outputText); showToast('Translation copied'); }
    catch { showToast('Copy unavailable'); }
  }
  if (event.target.closest('.speak-output') && 'speechSynthesis' in window) {
    speakText(outputText, languages[getLanguage(translator, 'to')].locale);
  }
});

grid.addEventListener('input', event => {
  if (!event.target.matches('textarea')) return;
  const translator = event.target.closest('.translator-window');
  translator.querySelector('.count').textContent = `${event.target.value.length} / 500`;
  translator.querySelector('.speak-input').disabled = !event.target.value.trim();
  scheduleUrlSync();
  if (!event.target.value.trim()) showEmpty(translator);
  else queueTranslation(translator);
});

grid.addEventListener('keydown', event => {
  const languageOption = event.target.closest('.language-option');
  if (languageOption && ['ArrowRight', 'ArrowLeft'].includes(event.key)) {
    event.preventDefault();
    const translator = languageOption.closest('.translator-window');
    const options = [...languageOption.parentElement.querySelectorAll('.language-option')];
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const next = options[(options.indexOf(languageOption) + direction + options.length) % options.length];
    setLanguage(translator, next.dataset.side, next.dataset.language);
    updateTabLabel(translator);
    next.focus();
    queueTranslation(translator, 0);
    scheduleUrlSync();
    return;
  }
  if (!event.target.matches('.workspace-tab')) return;
  const current = Number(event.target.dataset.tab);
  if (event.key === 'ArrowRight') { event.preventDefault(); activateTab((current + 1) % starters.length); }
  if (event.key === 'ArrowLeft') { event.preventDefault(); activateTab((current - 1 + starters.length) % starters.length); }
});

document.querySelector('.clear-all').addEventListener('click', () => {
  grid.querySelectorAll('.translator-window').forEach(clearTranslator);
  showToast('All workspaces cleared');
});

function applyTheme(theme) {
  const dark = theme === 'dark';
  document.body.classList.toggle('dark', dark);
  themeButton.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  themeMeta.setAttribute('content', dark ? '#101612' : '#f2efe6');
  localStorage.setItem('vox-theme', theme);
}

themeButton.addEventListener('click', () => applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark'));

function decodeHtml(value) {
  const element = document.createElement('textarea');
  element.innerHTML = value;
  return element.value;
}

function escapeHtml(value) {
  const element = document.createElement('div');
  element.textContent = value;
  return element.innerHTML;
}

function speakText(text, locale) {
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = locale;
  speechSynthesis.speak(utterance);
}

const savedTheme = localStorage.getItem('vox-theme');
const preferredTheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
applyTheme(savedTheme || preferredTheme);
grid.innerHTML = createTabs() + `<div class="tab-panels">${starters.map(createWindow).join('')}</div>`;
activateTab(initialTab, false);
grid.querySelectorAll('.translator-window').forEach((translator, index) => {
  if (starters[index].text) queueTranslation(translator, 300 + index * 120);
});
