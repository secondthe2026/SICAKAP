// ==============================================================
// GENERATOR SOAL SD AI (KURIKULUM MERDEKA - PILIHAN GANDA A-D)
// Integrasi Google Gemini API & Supabase Cloud Persistence
// ==============================================================

let aiGeneratedQuestionsList = [];
let aiActiveQuestionCount = 5;

function openModalAiGenerator() {
  const isGuru = window.location.pathname.includes('guru') || (window.__SICAKAP_USER__?.profile?.role === 'guru');
  const activeKelas = window.__ACTIVE_GURU_KELAS__ || window.__SICAKAP_USER__?.profile?.kelas || window.__SICAKAP_USER__?.profile?.class_name || 'Kelas 5';
  const gradeNum = String(activeKelas).replace(/[^0-9]/g, '') || '5';

  const kelasSelect = document.getElementById('ai-gen-kelas');
  const kelasBadge = document.getElementById('ai-gen-kelas-badge');

  if (kelasSelect) {
    if (isGuru) {
      kelasSelect.value = gradeNum;
      kelasSelect.disabled = true;
      kelasSelect.classList.add('bg-slate-100', 'cursor-not-allowed', 'pointer-events-none');
      if (kelasBadge) kelasBadge.textContent = `🔒 Terkunci (${activeKelas})`;
    } else {
      kelasSelect.disabled = false;
      kelasSelect.classList.remove('bg-slate-100', 'cursor-not-allowed', 'pointer-events-none');
      if (kelasBadge) kelasBadge.textContent = 'Bebas Pilih';
    }
  }

  // Pre-fill subject if active filter is specific
  const currentMapelFilter = window.activeFilterMapel;
  const mapelSelect = document.getElementById('ai-gen-mapel');
  if (mapelSelect && currentMapelFilter && currentMapelFilter !== 'ALL') {
    for (let i = 0; i < mapelSelect.options.length; i++) {
      if (mapelSelect.options[i].value.includes(currentMapelFilter) || currentMapelFilter.includes(mapelSelect.options[i].value)) {
        mapelSelect.selectedIndex = i;
        break;
      }
    }
  }

  const modal = document.getElementById('modal-ai-generator-soal');
  if (modal) modal.classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

function setAiQuickTopic(topic) {
  const input = document.getElementById('ai-gen-topik');
  if (input) {
    input.value = topic;
    input.focus();
  }
}

function setAiQuestionCount(cnt) {
  aiActiveQuestionCount = cnt;
  const hiddenInput = document.getElementById('ai-gen-jumlah');
  if (hiddenInput) hiddenInput.value = cnt;

  [5, 10, 15, 20].forEach(n => {
    const btn = document.getElementById(`btn-count-${n}`);
    if (btn) {
      if (n === cnt) {
        btn.className = 'py-2 rounded-xl border-2 border-purple-600 bg-purple-50 text-purple-900 font-black text-xs transition cursor-pointer';
      } else {
        btn.className = 'py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-xs hover:bg-slate-100 transition cursor-pointer';
      }
    }
  });
}

async function executeGenerateAiQuestions() {
  const mapel = document.getElementById('ai-gen-mapel')?.value || 'Matematika SD';
  const kelas = document.getElementById('ai-gen-kelas')?.value || '5';
  const topik = document.getElementById('ai-gen-topik')?.value.trim();
  const materiReferensi = document.getElementById('ai-gen-referensi')?.value.trim() || '';
  const jumlah = parseInt(document.getElementById('ai-gen-jumlah')?.value) || aiActiveQuestionCount || 5;
  const tingkatKesulitan = document.getElementById('ai-gen-kesulitan')?.value || 'Campuran Proporsional';

  if (!topik) {
    alert('Mohon masukkan Topik / Materi Pokok soal.');
    document.getElementById('ai-gen-topik')?.focus();
    return;
  }

  const btnGen = document.getElementById('btn-run-ai-generate');
  const btnText = document.getElementById('btn-text-ai-generate');
  const emptyState = document.getElementById('ai-preview-empty-state');
  const loadingState = document.getElementById('ai-preview-loading-state');
  const renderedCards = document.getElementById('ai-preview-rendered-cards');

  if (btnGen) btnGen.disabled = true;
  if (btnText) btnText.innerHTML = '<span class="inline-block animate-spin mr-1.5">⏳</span> Merumuskan Soal SD...';
  if (emptyState) emptyState.classList.add('hidden');
  if (renderedCards) renderedCards.classList.add('hidden');
  if (loadingState) loadingState.classList.remove('hidden');

  try {
    const { data: sessionData } = await window.supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error('Sesi login telah berakhir. Silakan muat ulang halaman.');

    const res = await fetch('/api/questions/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        mapel,
        kelas,
        topik,
        materiReferensi,
        jumlah,
        tingkatKesulitan
      })
    });

    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.error || 'Gagal menghasilkan butir soal dari AI.');
    }

    aiGeneratedQuestionsList = (json.questions || []).map(q => ({
      ...q,
      selected: true,
      isEditing: false
    }));

    renderAiPreviewCards();
    if (window.showToast) window.showToast(`✨ Berhasil merumuskan ${aiGeneratedQuestionsList.length} butir soal pilihan ganda!`);
  } catch (err) {
    console.error('[AI Generate Error]:', err);
    alert(`Gagal membuat soal otomatis: ${err.message}`);
    if (window.showToast) window.showToast(`❌ ${err.message}`);
    if (emptyState) emptyState.classList.remove('hidden');
  } finally {
    if (btnGen) btnGen.disabled = false;
    if (btnText) btnText.innerHTML = 'Buat Soal Otomatis';
    if (loadingState) loadingState.classList.add('hidden');
    if (window.lucide) window.lucide.createIcons();
  }
}

function renderAiPreviewCards() {
  const container = document.getElementById('ai-preview-rendered-cards');
  const emptyState = document.getElementById('ai-preview-empty-state');
  const countBadge = document.getElementById('ai-preview-count-badge');
  const btnSave = document.getElementById('btn-save-ai-to-bank');
  const labelSelected = document.getElementById('ai-selected-count-label');

  if (!container) return;

  if (aiGeneratedQuestionsList.length === 0) {
    container.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
    if (countBadge) countBadge.textContent = '0 Soal';
    if (btnSave) btnSave.disabled = true;
    if (labelSelected) labelSelected.textContent = '0 dari 0 butir soal terpilih';
    return;
  }

  container.classList.remove('hidden');
  if (emptyState) emptyState.classList.add('hidden');

  const selectedCount = aiGeneratedQuestionsList.filter(q => q.selected).length;
  if (countBadge) countBadge.textContent = `${aiGeneratedQuestionsList.length} Soal`;
  if (btnSave) btnSave.disabled = (selectedCount === 0);
  if (labelSelected) labelSelected.textContent = `${selectedCount} dari ${aiGeneratedQuestionsList.length} butir soal terpilih`;

  container.innerHTML = aiGeneratedQuestionsList.map((q, idx) => {
    let cogBadge = 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (q.levelKognitif === 'HOTS') cogBadge = 'bg-rose-100 text-rose-800 border-rose-200';
    else if (q.levelKognitif === 'MOTS') cogBadge = 'bg-amber-100 text-amber-800 border-amber-200';

    if (q.isEditing) {
      // Inline Edit Mode
      return `
        <div class="p-4 rounded-2xl bg-white border-2 border-indigo-300 shadow-md space-y-3 text-xs" id="ai-card-${idx}">
          <div class="flex items-center justify-between pb-2 border-b border-slate-100">
            <span class="font-black text-indigo-700">✏️ Edit Butir Soal #${idx + 1}</span>
            <span class="text-[10px] text-slate-400">Pilihan Ganda A-D</span>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Pertanyaan Soal:</label>
            <textarea id="ai-edit-prompt-${idx}" rows="2" class="w-full p-2.5 rounded-xl border border-slate-200 font-bold text-slate-900 bg-slate-50">${q.pertanyaan}</textarea>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Stimulus / Wacana (Opsional):</label>
            <input type="text" id="ai-edit-stimulus-${idx}" value="${q.stimulus || q.wacana || ''}" class="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-medium text-slate-800 bg-slate-50" />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label class="block font-bold text-slate-600 mb-0.5">Opsi A:</label>
              <input type="text" id="ai-edit-opsi-a-${idx}" value="${q.opsi?.[0]?.text || ''}" class="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-medium text-slate-800 bg-white" />
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-0.5">Opsi B:</label>
              <input type="text" id="ai-edit-opsi-b-${idx}" value="${q.opsi?.[1]?.text || ''}" class="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-medium text-slate-800 bg-white" />
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-0.5">Opsi C:</label>
              <input type="text" id="ai-edit-opsi-c-${idx}" value="${q.opsi?.[2]?.text || ''}" class="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-medium text-slate-800 bg-white" />
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-0.5">Opsi D:</label>
              <input type="text" id="ai-edit-opsi-d-${idx}" value="${q.opsi?.[3]?.text || ''}" class="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-medium text-slate-800 bg-white" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-bold text-slate-700 mb-0.5">🔑 Kunci Jawaban Benar:</label>
              <select id="ai-edit-kunci-${idx}" class="w-full px-3 py-1.5 rounded-xl border border-emerald-300 font-black text-emerald-900 bg-emerald-50">
                <option value="A" ${q.kunci === 'A' ? 'selected' : ''}>Opsi A</option>
                <option value="B" ${q.kunci === 'B' ? 'selected' : ''}>Opsi B</option>
                <option value="C" ${q.kunci === 'C' ? 'selected' : ''}>Opsi C</option>
                <option value="D" ${q.kunci === 'D' ? 'selected' : ''}>Opsi D</option>
              </select>
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-0.5">Level Kognitif:</label>
              <select id="ai-edit-level-${idx}" class="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-bold text-slate-800 bg-white">
                <option value="LOTS" ${q.levelKognitif === 'LOTS' ? 'selected' : ''}>LOTS (Pemahaman)</option>
                <option value="MOTS" ${q.levelKognitif === 'MOTS' ? 'selected' : ''}>MOTS (Aplikasi)</option>
                <option value="HOTS" ${q.levelKognitif === 'HOTS' ? 'selected' : ''}>HOTS (Penalaran)</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-0.5">Pembahasan Soal:</label>
            <input type="text" id="ai-edit-pembahasan-${idx}" value="${q.pembahasan || ''}" class="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-medium text-slate-800 bg-slate-50" />
          </div>

          <div class="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
            <button type="button" onclick="cancelAiInlineEdit(${idx})" class="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer">Batal</button>
            <button type="button" onclick="saveAiInlineEdit(${idx})" class="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black cursor-pointer">Simpan Edit</button>
          </div>
        </div>
      `;
    }

    // Normal View Mode
    return `
      <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3 transition ${q.selected ? 'ring-2 ring-purple-400/50 bg-white' : 'opacity-60 bg-slate-50/50'}" id="ai-card-${idx}">
        <!-- Top Bar: Checkbox + Badges + Actions -->
        <div class="flex items-start justify-between gap-2 pb-2 border-b border-slate-100">
          <div class="flex items-center gap-2">
            <input type="checkbox" id="ai-check-${idx}" ${q.selected ? 'checked' : ''} onchange="toggleAiQuestionCheck(${idx}, this.checked)" class="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer" />
            <span class="font-black text-slate-800 text-xs">No. ${idx + 1}</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-black border ${cogBadge}">
              ${q.levelKognitif}
            </span>
            <span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
              ${q.mapel}
            </span>
          </div>
          <div class="flex items-center gap-1">
            <button type="button" onclick="openAiInlineEdit(${idx})" class="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition cursor-pointer" title="Edit Cepat">
              ✏️
            </button>
            <button type="button" onclick="deleteAiQuestion(${idx})" class="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition cursor-pointer" title="Hapus Soal">
              🗑️
            </button>
          </div>
        </div>

        <!-- Stimulus / Wacana if any -->
        ${q.stimulus || q.wacana ? `
          <div class="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 text-[11px] text-amber-950 font-medium leading-relaxed">
            <span class="font-bold text-amber-900 block">📖 Cerita / Stimulus:</span>
            <span>${q.stimulus || q.wacana}</span>
          </div>
        ` : ''}

        <!-- Pertanyaan -->
        <p class="font-bold text-xs sm:text-sm text-slate-900 leading-snug">
          ${q.pertanyaan}
        </p>

        <!-- Opsi A - D -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
          ${(q.opsi || []).map(opt => {
            const isKunci = String(q.kunci).trim().toUpperCase() === String(opt.key).trim().toUpperCase();
            return `
              <div class="px-3 py-2 rounded-xl border flex items-center gap-2 ${isKunci ? 'bg-emerald-50 border-emerald-300 font-black text-emerald-950 ring-1 ring-emerald-200' : 'bg-slate-50 border-slate-200 text-slate-700'}">
                <span class="w-5 h-5 rounded-lg ${isKunci ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'} flex items-center justify-center font-black text-[10px] shrink-0">
                  ${opt.key}
                </span>
                <span class="leading-tight">${opt.text}</span>
                ${isKunci ? '<span class="ml-auto text-[9px] font-black text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded">✓ Kunci</span>' : ''}
              </div>
            `;
          }).join('')}
        </div>

        <!-- Pembahasan -->
        ${q.pembahasan ? `
          <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 space-y-0.5">
            <span class="font-bold text-slate-700 block">💡 Pembahasan:</span>
            <p class="leading-relaxed">${q.pembahasan}</p>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

function toggleAiQuestionCheck(idx, checked) {
  if (aiGeneratedQuestionsList[idx]) {
    aiGeneratedQuestionsList[idx].selected = checked;
    renderAiPreviewCards();
  }
}

function toggleAiSelectAll(selectAll) {
  aiGeneratedQuestionsList.forEach(q => q.selected = selectAll);
  renderAiPreviewCards();
}

function openAiInlineEdit(idx) {
  if (aiGeneratedQuestionsList[idx]) {
    aiGeneratedQuestionsList[idx].isEditing = true;
    renderAiPreviewCards();
  }
}

function cancelAiInlineEdit(idx) {
  if (aiGeneratedQuestionsList[idx]) {
    aiGeneratedQuestionsList[idx].isEditing = false;
    renderAiPreviewCards();
  }
}

function saveAiInlineEdit(idx) {
  const q = aiGeneratedQuestionsList[idx];
  if (!q) return;

  const promptVal = document.getElementById(`ai-edit-prompt-${idx}`)?.value.trim();
  const stimVal = document.getElementById(`ai-edit-stimulus-${idx}`)?.value.trim();
  const aVal = document.getElementById(`ai-edit-opsi-a-${idx}`)?.value.trim();
  const bVal = document.getElementById(`ai-edit-opsi-b-${idx}`)?.value.trim();
  const cVal = document.getElementById(`ai-edit-opsi-c-${idx}`)?.value.trim();
  const dVal = document.getElementById(`ai-edit-opsi-d-${idx}`)?.value.trim();
  const kunciVal = document.getElementById(`ai-edit-kunci-${idx}`)?.value;
  const levelVal = document.getElementById(`ai-edit-level-${idx}`)?.value;
  const pembVal = document.getElementById(`ai-edit-pembahasan-${idx}`)?.value.trim();

  if (promptVal) q.pertanyaan = promptVal;
  q.stimulus = stimVal || '';
  q.wacana = stimVal || '';
  q.opsi = [
    { key: 'A', text: aVal || q.opsi?.[0]?.text || 'Opsi A' },
    { key: 'B', text: bVal || q.opsi?.[1]?.text || 'Opsi B' },
    { key: 'C', text: cVal || q.opsi?.[2]?.text || 'Opsi C' },
    { key: 'D', text: dVal || q.opsi?.[3]?.text || 'Opsi D' },
  ];
  if (kunciVal) q.kunci = kunciVal;
  if (levelVal) q.levelKognitif = levelVal;
  q.pembahasan = pembVal || '';
  q.isEditing = false;

  renderAiPreviewCards();
}

function deleteAiQuestion(idx) {
  aiGeneratedQuestionsList.splice(idx, 1);
  renderAiPreviewCards();
}

async function saveSelectedAiQuestionsToBank() {
  const selected = aiGeneratedQuestionsList.filter(q => q.selected);
  if (selected.length === 0) {
    alert('Pilih minimal 1 butir soal untuk disimpan ke Bank Soal.');
    return;
  }

  const btnSave = document.getElementById('btn-save-ai-to-bank');
  const labelSave = document.getElementById('btn-label-save-ai');

  if (btnSave) btnSave.disabled = true;
  if (labelSave) labelSave.innerHTML = '<span class="inline-block animate-spin mr-1.5">⏳</span> Menyimpan ke Supabase Cloud...';

  try {
    const { data: sessionData } = await window.supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error('Sesi login telah berakhir. Silakan login kembali.');

    // 1. Simpan ke database Supabase via serverless API
    const res = await fetch('/api/questions/save-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        questions: selected
      })
    });

    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.error || 'Gagal menyimpan butir soal ke database.');
    }

    const savedItems = json.savedQuestions || selected;

    // 2. Simpan juga ke SicakapDB lokal
    if (window.SicakapDB && window.SicakapDB.bulkAddSoal) {
      window.SicakapDB.bulkAddSoal(savedItems);
    }

    // 3. Trigger cloud sync dari Supabase
    const schoolId = window.SicakapDB?.getActiveSchoolId();
    if (schoolId && window.SicakapDB?.syncFromCloud) {
      await window.SicakapDB.syncFromCloud(schoolId);
    }

    // 4. Tutup modal & Refresh daftar soal
    if (typeof closeModal === 'function') closeModal('modal-ai-generator-soal');
    if (typeof renderBankSoal === 'function') renderBankSoal();
    if (typeof initGuruData === 'function') initGuruData();
    if (typeof initAdminData === 'function') initAdminData();

    if (window.showToast) {
      window.showToast(`🎉 Sukses! ${savedItems.length} butir soal pilihan ganda berhasil disimpan ke Bank Soal SD!`);
    }

    // Reset list
    aiGeneratedQuestionsList = [];
    renderAiPreviewCards();
  } catch (err) {
    console.error('[Save AI Questions Error]:', err);
    alert(`Gagal menyimpan soal: ${err.message}`);
    if (window.showToast) window.showToast(`❌ Gagal: ${err.message}`);
  } finally {
    if (btnSave) btnSave.disabled = false;
    if (labelSave) labelSave.textContent = 'Simpan Soal Terpilih ke Bank Soal';
  }
}

// Bind to window
window.openModalAiGenerator = openModalAiGenerator;
window.setAiQuickTopic = setAiQuickTopic;
window.setAiQuestionCount = setAiQuestionCount;
window.executeGenerateAiQuestions = executeGenerateAiQuestions;
window.renderAiPreviewCards = renderAiPreviewCards;
window.toggleAiQuestionCheck = toggleAiQuestionCheck;
window.toggleAiSelectAll = toggleAiSelectAll;
window.openAiInlineEdit = openAiInlineEdit;
window.cancelAiInlineEdit = cancelAiInlineEdit;
window.saveAiInlineEdit = saveAiInlineEdit;
window.deleteAiQuestion = deleteAiQuestion;
window.saveSelectedAiQuestionsToBank = saveSelectedAiQuestionsToBank;
