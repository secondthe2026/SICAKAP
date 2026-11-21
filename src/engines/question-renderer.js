import DOMPurify from 'dompurify';
import renderMathInElement from 'katex/contrib/auto-render';
import 'katex/dist/katex.min.css';

const TYPE_LABELS = {
  single: 'Pilihan Ganda (Pilih 1 Jawaban Benar)',
  multiple: 'Pilihan Ganda Kompleks (Boleh Pilih Lebih dari 1)',
  true_false_table: 'Benar / Salah Majemuk (Tentukan Tiap Pernyataan)',
  matching: 'Menjodohkan (Pasangkan Pernyataan Kiri & Kanan)',
  short_answer: 'Isian Singkat (Ketik Jawaban dengan Tepat)',
};

function sanitizeHtml(html = '') {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'sup', 'sub', 'span', 'div', 'img'],
    ALLOWED_ATTR: ['class', 'src', 'alt', 'colspan', 'rowspan'],
  });
}

function renderMath(container) {
  renderMathInElement(container, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '$', right: '$', display: false },
    ],
    throwOnError: false,
  });
}

function renderMediaList(mediaUrls = []) {
  if (!Array.isArray(mediaUrls) || mediaUrls.length === 0) return '';

  return mediaUrls
    .map((m) => {
      if (m.type === 'image' && m.url) {
        const safeUrl = DOMPurify.sanitize(m.url);
        const caption = DOMPurify.sanitize(m.caption || '');
        return `
          <figure class="my-3 rounded-xl border border-slate-200 bg-white p-2 text-center">
            <img src="${safeUrl}" alt="${caption || 'Gambar Stimulus'}"
                 data-zoom-img="${safeUrl}"
                 class="mx-auto max-h-64 w-auto cursor-zoom-in rounded-lg object-contain" loading="lazy" />
            ${caption ? `<figcaption class="mt-1.5 text-xs text-slate-500">${caption}</figcaption>` : ''}
          </figure>`;
      }
      if (m.type === 'audio' && m.url) {
        const safeUrl = DOMPurify.sanitize(m.url);
        return `
          <div class="my-3 flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3">
            <span class="text-xs font-semibold text-indigo-800">Audio Soal:</span>
            <audio controls controlsList="nodownload" preload="metadata" class="h-9 flex-1">
              <source src="${safeUrl}" />
              Browser tidak mendukung pemutar audio.
            </audio>
          </div>`;
      }
      return '';
    })
    .join('');
}

/**
 * Render satu soal lengkap ke container target dan sambungkan event jawaban ke CBTEngine.
 */
export function renderQuestion({ container, question, savedAnswer = {}, onChange }) {
  const typeLabel = TYPE_LABELS[question.type] || 'Soal Asesmen';

  container.innerHTML = `
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
          ${DOMPurify.sanitize(typeLabel)}
        </span>
        ${question.competency ? `<span class="text-xs text-slate-500">${DOMPurify.sanitize(question.competency)}</span>` : ''}
      </div>

      ${question.stimulus || (question.media_urls && question.media_urls.length) ? `
        <div class="stimulus-box rounded-2xl border border-slate-200 bg-slate-50 p-4 leading-relaxed text-slate-800">
          ${renderMediaList(question.media_urls)}
          ${question.stimulus ? `<div class="prose-stimulus">${sanitizeHtml(question.stimulus)}</div>` : ''}
        </div>
      ` : ''}

      <div class="prompt-box font-semibold leading-relaxed text-slate-900">
        ${sanitizeHtml(question.prompt)}
      </div>

      <div id="akm-answer-zone" class="space-y-2.5 pt-1"></div>
    </div>
  `;

  const answerZone = container.querySelector('#akm-answer-zone');
  renderAnswerInput(answerZone, question, savedAnswer, onChange);

  // Render rumus pecahan / matematika ($ \frac{4}{12} $)
  renderMath(container);

  // Lightbox klik gambar stimulus agar siswa SD bisa memperbesar ilustrasi/grafik
  container.querySelectorAll('[data-zoom-img]').forEach((img) => {
    img.addEventListener('click', () => openImageLightbox(img.dataset.zoomImg));
  });
}

function renderAnswerInput(zone, question, savedAnswer, onChange) {
  const opts = question.options;

  // 1. PILIHAN GANDA TUNGGAL
  if (question.type === 'single') {
    const selected = savedAnswer?.selected || '';
    zone.innerHTML = (Array.isArray(opts) ? opts : [])
      .map((opt) => {
        const checked = selected === opt.key;
        return `
          <label class="akm-option flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3.5 transition ${
            checked ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300'
          }">
            <input type="radio" name="q_${question.id}" value="${opt.key}" ${checked ? 'checked' : ''}
                   class="mt-1 h-5 w-5 accent-blue-600" />
            <span class="font-bold text-blue-700">${DOMPurify.sanitize(opt.key)}.</span>
            <div class="flex-1">
              <span>${sanitizeHtml(opt.text)}</span>
              ${opt.image_url ? `<img src="${DOMPurify.sanitize(opt.image_url)}" class="mt-2 max-h-36 rounded-lg border" />` : ''}
            </div>
          </label>`;
      })
      .join('');

    zone.querySelectorAll('input[type="radio"]').forEach((el) => {
      el.addEventListener('change', (e) => {
        onChange({ selected: e.target.value });
        renderAnswerInput(zone, question, { selected: e.target.value }, onChange);
        renderMath(zone);
      });
    });
    return;
  }

  // 2. PILIHAN GANDA KOMPLEKS (MULTI-SELECT)
  if (question.type === 'multiple') {
    const selectedSet = new Set(Array.isArray(savedAnswer?.selected) ? savedAnswer.selected : []);
    zone.innerHTML = (Array.isArray(opts) ? opts : [])
      .map((opt) => {
        const checked = selectedSet.has(opt.key);
        return `
          <label class="akm-option flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3.5 transition ${
            checked ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-300'
          }">
            <input type="checkbox" value="${opt.key}" ${checked ? 'checked' : ''}
                   class="mt-1 h-5 w-5 rounded accent-emerald-600" />
            <span class="font-bold text-emerald-700">${DOMPurify.sanitize(opt.key)}.</span>
            <div class="flex-1">${sanitizeHtml(opt.text)}</div>
          </label>`;
      })
      .join('');

    zone.querySelectorAll('input[type="checkbox"]').forEach((el) => {
      el.addEventListener('change', () => {
        const selected = Array.from(zone.querySelectorAll('input:checked')).map((c) => c.value);
        onChange({ selected });
        renderAnswerInput(zone, question, { selected }, onChange);
        renderMath(zone);
      });
    });
    return;
  }

  // 3. BENAR / SALAH MAJEMUK (TABEL)
  if (question.type === 'true_false_table') {
    const [trueLabel = 'Benar', falseLabel = 'Salah'] = opts?.labels || [];
    const rows = Array.isArray(opts?.rows) ? opts.rows : [];
    const currentMap = { ...(savedAnswer?.answers || {}) };

    zone.innerHTML = `
      <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table class="w-full text-left">
          <thead class="bg-slate-100 text-slate-700">
            <tr>
              <th class="p-3">Pernyataan</th>
              <th class="w-24 p-3 text-center">${DOMPurify.sanitize(trueLabel)}</th>
              <th class="w-24 p-3 text-center">${DOMPurify.sanitize(falseLabel)}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200">
            ${rows.map((r) => `
              <tr>
                <td class="p-3">${sanitizeHtml(r.statement)}</td>
                <td class="p-3 text-center">
                  <input type="radio" name="tf_${question.id}_${r.id}" data-row="${r.id}" value="true"
                         ${currentMap[r.id] === true ? 'checked' : ''} class="h-5 w-5 accent-blue-600 cursor-pointer" />
                </td>
                <td class="p-3 text-center">
                  <input type="radio" name="tf_${question.id}_${r.id}" data-row="${r.id}" value="false"
                         ${currentMap[r.id] === false ? 'checked' : ''} class="h-5 w-5 accent-rose-600 cursor-pointer" />
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    zone.querySelectorAll('input[type="radio"]').forEach((el) => {
      el.addEventListener('change', (e) => {
        currentMap[e.target.dataset.row] = e.target.value === 'true';
        onChange({ answers: { ...currentMap } });
      });
    });
    return;
  }

  // 4. MENJODOHKAN (DROPDOWN PASANGAN RAMAH LAYAR SENTUH / CHROMEBOOK)
  if (question.type === 'matching') {
    const leftItems = Array.isArray(opts?.left) ? opts.left : [];
    const rightItems = Array.isArray(opts?.right) ? opts.right : [];
    const currentPairs = { ...(savedAnswer?.pairs || {}) };

    zone.innerHTML = `
      <div class="space-y-3">
        ${leftItems.map((l, idx) => `
          <div class="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-start gap-2.5 sm:w-1/2">
              <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">${idx + 1}</span>
              <div>${sanitizeHtml(l.text)}</div>
            </div>
            <div class="sm:w-1/2">
              <select data-left="${l.id}" class="w-full rounded-lg border-2 border-slate-300 bg-slate-50 px-3 py-2.5 font-medium focus:border-blue-600 focus:bg-white focus:outline-none">
                <option value="">-- Pilih Pasangan --</option>
                ${rightItems.map((r) => `
                  <option value="${r.id}" ${currentPairs[l.id] === r.id ? 'selected' : ''}>
                    ${DOMPurify.sanitize(r.text)}
                  </option>`).join('')}
              </select>
            </div>
          </div>`).join('')}
      </div>`;

    zone.querySelectorAll('select[data-left]').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        const leftId = e.target.dataset.left;
        if (e.target.value) currentPairs[leftId] = e.target.value;
        else delete currentPairs[leftId];
        onChange({ pairs: { ...currentPairs } });
      });
    });
    return;
  }

  // 5. ISIAN SINGKAT
  if (question.type === 'short_answer') {
    const val = savedAnswer?.text || '';
    const placeholder = DOMPurify.sanitize(opts?.placeholder || 'Ketik jawaban singkat di sini...');
    const inputMode = opts?.input_mode === 'numeric' ? 'decimal' : 'text';

    zone.innerHTML = `
      <div class="rounded-xl border border-slate-200 bg-white p-4">
        <label class="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Jawaban Kamu:</label>
        <input type="text" id="short-answer-input" inputmode="${inputMode}"
               value="${DOMPurify.sanitize(val)}" placeholder="${placeholder}"
               autocomplete="off" spellcheck="false"
               class="w-full rounded-xl border-2 border-slate-300 px-4 py-3 font-semibold text-slate-900 focus:border-blue-600 focus:outline-none" />
      </div>`;

    let debounceTimer;
    zone.querySelector('#short-answer-input').addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        onChange({ text: e.target.value });
      }, 250);
    });
  }
}

function openImageLightbox(src) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm';
  modal.innerHTML = `
    <div class="relative max-h-[90vh] max-w-4xl">
      <button type="button" aria-label="Tutup gambar"
              class="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white font-bold text-slate-800 shadow-lg cursor-pointer">✕</button>
      <img src="${src}" class="max-h-[85vh] w-auto rounded-xl bg-white p-2 shadow-2xl" />
    </div>`;
  modal.addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);
}

