const PREF_KEY = 'sicakap_a11y_prefs';
const FONT_CLASSES = ['font-size-small', 'font-size-normal', 'font-size-large'];

export function initExamAccessibility() {
  const saved = loadPrefs();
  applyFontSize(saved.fontSize || 'font-size-normal');
  applyContrast(Boolean(saved.highContrast));

  document.querySelectorAll('[data-font-size]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.fontSize; // 'font-size-small' | 'font-size-normal' | 'font-size-large'
      applyFontSize(target);
      savePrefs({ ...loadPrefs(), fontSize: target });
    });
  });

  const contrastBtn = document.querySelector('[data-action="toggle-contrast"]');
  if (contrastBtn) {
    contrastBtn.addEventListener('click', () => {
      const next = !document.body.classList.contains('high-contrast');
      applyContrast(next);
      savePrefs({ ...loadPrefs(), highContrast: next });
    });
  }
}

function applyFontSize(className) {
  if (!FONT_CLASSES.includes(className)) return;
  document.body.classList.remove(...FONT_CLASSES);
  document.body.classList.add(className);

  document.querySelectorAll('[data-font-size]').forEach((btn) => {
    const active = btn.dataset.fontSize === className;
    btn.setAttribute('aria-pressed', String(active));
    btn.classList.toggle('bg-blue-600', active);
    btn.classList.toggle('text-white', active);
  });
}

function applyContrast(enabled) {
  document.body.classList.toggle('high-contrast', enabled);
  const btn = document.querySelector('[data-action="toggle-contrast"]');
  if (btn) btn.setAttribute('aria-pressed', String(enabled));
}

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY)) || {};
  } catch {
    return {};
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    // Abaikan jika storage dibatasi
  }
}

/** Cek apakah payload jawaban sudah diisi siswa sesuai tipe soalnya */
export function hasFilledAnswer(type, payload) {
  if (!payload) return false;
  switch (type) {
    case 'single':
      return Boolean(payload.selected);
    case 'multiple':
      return Array.isArray(payload.selected) && payload.selected.length > 0;
    case 'true_false_table':
      return payload.answers && Object.keys(payload.answers).length > 0;
    case 'matching':
      return payload.pairs && Object.keys(payload.pairs).length > 0;
    case 'short_answer':
      return Boolean(String(payload.text || '').trim());
    default:
      return false;
  }
}

/** Render peta navigasi nomor soal responsif (sidebar desktop & drawer Chromebook/tablet) */
export function renderQuestionNav({ container, questions, currentIndex, allAnswers, onSelect }) {
  if (!container) return;

  container.innerHTML = questions
    .map((q, idx) => {
      const entry = allAnswers[q.id];
      const answered = hasFilledAnswer(q.type, entry?.answer_payload);
      const flagged = Boolean(entry?.is_flagged);
      const isCurrent = idx === currentIndex;

      let stateClass = 'bg-slate-100 text-slate-700 border-slate-300'; // Belum dijawab
      if (flagged) stateClass = 'bg-amber-400 text-slate-950 border-amber-600 font-bold'; // Ragu-ragu
      else if (answered) stateClass = 'bg-emerald-600 text-white border-emerald-700 font-bold'; // Terjawab

      const activeRing = isCurrent ? 'ring-2 ring-blue-600 ring-offset-2 scale-105' : '';

      return `
        <button type="button" data-nav-idx="${idx}"
                class="flex h-11 w-full items-center justify-center rounded-xl border text-sm transition cursor-pointer ${stateClass} ${activeRing}"
                aria-label="Soal nomor ${idx + 1}${flagged ? ', ragu-ragu' : answered ? ', sudah dijawab' : ''}">
          ${idx + 1}
        </button>`;
    })
    .join('');

  container.querySelectorAll('[data-nav-idx]').forEach((btn) => {
    btn.addEventListener('click', () => onSelect(Number(btn.dataset.navIdx)));
  });
}

