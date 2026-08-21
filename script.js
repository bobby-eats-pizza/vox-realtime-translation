const languages = {
  zh: { code: 'CHN', name: 'Chinese', locale: 'zh-CN' },
  en: { code: 'ENG', name: 'English', locale: 'en-US' },
  es: { code: 'ESP', name: 'Spanish', locale: 'es-ES' },
  fr: { code: 'FRA', name: 'French', locale: 'fr-FR' }
};

const starters = [
  { from: 'en', to: 'zh', text: '' },
  { from: 'zh', to: 'en', text: '' },
  { from: 'en', to: 'es', text: '' },
  { from: 'es', to: 'fr', text: '' }
];

const grid = document.querySelector('.translation-grid');
const toast = document.querySelector('.toast');
const debounceTimers = new WeakMap();
const requestVersions = new WeakMap();
const translatorCache = new Map();

function languageOptions(selected) {
  return Object.entries(languages).map(([id, lang]) =>
    `<option value="${id}" ${id === selected ? 'selected' : ''}>${lang.code} — ${lang.name}</option>`
  ).join('');
}

function createWindow(config, index) {
  return `<article class="translator-window" data-index="${index}">
    <div class="window-head">
      <label class="language-pick"><small>From</small><select class="from-language" aria-label="Window ${index + 1} source language">${languageOptions(config.from)}</select></label>
      <button class="swap" aria-label="Swap languages" title="Swap languages">⇄</button>
      <label class="language-pick"><small>To</small><select class="to-language" aria-label="Window ${index + 1} target language">${languageOptions(config.to)}</select></label>
    </div>
    <div class="window-body">
      <div class="input-side">
        <textarea maxlength="500" aria-label="Text to translate" placeholder="Start writing…">${escapeHtml(config.text)}</textarea>
        <div class="side-foot"><span class="count">${config.text.length} / 500</span><span>Live</span></div>
      </div>
      <div class="output-side">
        <div class="output placeholder" aria-live="polite">Translation appears here.</div>
        <div class="side-foot"><span class="window-status">Ready</span><div class="card-actions">
          <button class="icon-button speak" aria-label="Listen" title="Listen"><svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Zm4 5a4 4 0 0 1 0 4m2.5-6.5a7 7 0 0 1 0 9"/></svg></button>
          <button class="icon-button copy" aria-label="Copy" title="Copy"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="1"/><path d="M16 8V5H5v11h3"/></svg></button>
        </div></div>
      </div>
    </div>
  </article>`;
}

async function translateWindow(window) {
  const text = window.querySelector('textarea').value.trim();
  const from = window.querySelector('.from-language').value;
  const to = window.querySelector('.to-language').value;
  const output = window.querySelector('.output');
  const status = window.querySelector('.window-status');
  const version = (requestVersions.get(window) || 0) + 1;
  requestVersions.set(window, version);
  if (!text) { setState(output, status, 'Write something first.', 'error'); return; }
  if (from === to) { setState(output, status, text, ''); status.textContent = 'Same language'; return; }
  setState(output, status, 'Finding the right words…', 'loading');
  try {
    const result = await translateText(text, from, to, status);
    if (requestVersions.get(window) !== version) return;
    setState(output, status, result.text, '');
    status.textContent = result.method;
  } catch (error) {
    if (requestVersions.get(window) !== version) return;
    setState(output, status, 'Translation is temporarily unavailable.', 'error');
    status.textContent = 'Try again';
    console.error(error);
  }
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
  return { text: decodeHtml(data.responseData.translatedText), method: 'Live translation' };
}

async function getTranslator(from, to, status) {
  const key = `${from}:${to}`;
  if (translatorCache.has(key)) return translatorCache.get(key);
  const availability = await Translator.availability({ sourceLanguage: from, targetLanguage: to });
  if (availability === 'unavailable') throw new Error('MODEL_UNAVAILABLE');
  const creation = Translator.create({
    sourceLanguage: from,
    targetLanguage: to,
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', event => {
        status.textContent = `Downloading model ${Math.round(event.loaded * 100)}%`;
      });
    }
  });
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

function setState(output, status, message, state) {
  output.textContent = message;
  output.className = `output ${state}`;
  status.textContent = state === 'loading' ? 'Translating' : state === 'error' ? 'Unavailable' : 'Ready';
  status.className = `window-status ${state}`;
}

grid.addEventListener('click', async event => {
  const translator = event.target.closest('.translator-window');
  if (!translator) return;
  if (event.target.closest('.swap')) {
    const from = translator.querySelector('.from-language');
    const to = translator.querySelector('.to-language');
    [from.value, to.value] = [to.value, from.value];
    const output = translator.querySelector('.output');
    if (!output.classList.contains('placeholder') && !output.classList.contains('error')) {
      translator.querySelector('textarea').value = output.textContent;
      translator.querySelector('.count').textContent = `${output.textContent.length} / 500`;
      setState(output, translator.querySelector('.window-status'), 'Translation appears here.', 'placeholder');
    }
    queueTranslation(translator, 0);
  }
  const outputText = translator.querySelector('.output').textContent;
  if (event.target.closest('.copy')) {
    try { await navigator.clipboard.writeText(outputText); } catch {}
    toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 1500);
  }
  if (event.target.closest('.speak') && 'speechSynthesis' in window) {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(outputText);
    utterance.lang = languages[translator.querySelector('.to-language').value].locale;
    speechSynthesis.speak(utterance);
  }
});

grid.addEventListener('input', event => {
  if (!event.target.matches('textarea')) return;
  const translator = event.target.closest('.translator-window');
  translator.querySelector('.count').textContent = `${event.target.value.length} / 500`;
  queueTranslation(translator);
});

grid.addEventListener('change', event => {
  if (event.target.matches('.from-language, .to-language')) queueTranslation(event.target.closest('.translator-window'), 0);
});

function escapeHtml(value) { const el = document.createElement('div'); el.textContent = value; return el.innerHTML; }
function decodeHtml(value) { const el = document.createElement('textarea'); el.innerHTML = value; return el.value; }
document.querySelector('.theme').addEventListener('click', () => document.body.classList.toggle('dark'));
grid.innerHTML = starters.map(createWindow).join('');
