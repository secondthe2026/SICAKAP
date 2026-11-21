/**
 * SI-CAKAP SD - Central Data Store Service (src/services/data-store.js)
 * Production Supabase Data Layer with Strict School Isolation (school_id)
 */
import { supabase } from '../lib/supabase.js';

export const DataStore = {
  // Direct client accessor
  get client() {
    return supabase;
  },

  // Fallback to local DB if available
  get db() {
    return typeof window !== 'undefined' ? window.SicakapDB : null;
  },

  // Helper to extract active school_id from authenticated session
  getActiveSchoolId() {
    if (typeof window !== 'undefined' && window.__SICAKAP_USER__?.profile?.school_id) {
      return window.__SICAKAP_USER__.profile.school_id;
    }
    return null;
  },

  // Helper to extract active user role
  getActiveUserRole() {
    if (typeof window !== 'undefined' && window.__SICAKAP_USER__?.profile?.role) {
      return window.__SICAKAP_USER__.profile.role;
    }
    return null;
  },

  // Helper to extract active user assigned class (Isolasi Kelas)
  getActiveUserKelas() {
    if (typeof window !== 'undefined') {
      const p = window.__SICAKAP_USER__?.profile;
      return p?.kelas || p?.class_name || null;
    }
    return null;
  },

  // ==========================================
  // 1. SCHOOLS (SEKOLAH)
  // ==========================================
  async fetchSchools() {
    const { data, error } = await supabase
      .from('schools')
      .select('*')
      .order('name', { ascending: true });
    if (error) {
      console.warn('[DataStore] fetchSchools error:', error);
      return [];
    }
    return data || [];
  },

  async fetchSchoolById(schoolId) {
    const { data, error } = await supabase
      .from('schools')
      .select('*')
      .eq('id', schoolId)
      .single();
    if (error) {
      console.warn('[DataStore] fetchSchoolById error:', error);
      return null;
    }
    return data;
  },

  async fetchSchoolByNpsn(npsn) {
    const { data, error } = await supabase
      .from('schools')
      .select('*')
      .eq('npsn', npsn)
      .single();
    if (error) {
      console.warn('[DataStore] fetchSchoolByNpsn error:', error);
      return null;
    }
    return data;
  },

  async registerSchool({ npsn, name, jenjang = 'SD', kabupaten = '' }) {
    const { data, error } = await supabase
      .from('schools')
      .insert([{ npsn, name, jenjang, kabupaten, is_active: true }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ==========================================
  // 2. PROFILES (PENGGUNA: SISWA, GURU, PROKTOR, ADMIN)
  // ==========================================
  async fetchProfiles({ schoolId = null, role = null, className = null, kelas = null } = {}) {
    const userRole = this.getActiveUserRole();
    const userKelas = this.getActiveUserKelas();
    const targetSchool = schoolId || this.getActiveSchoolId();
    let query = supabase.from('profiles').select('*, schools(npsn, name)');

    if (targetSchool) {
      query = query.eq('school_id', targetSchool);
    }
    if (role) {
      query = query.eq('role', role);
    }

    // Isolasi Kelas Guru: Guru HANYA bisa membaca siswa di kelasnya sendiri
    const effectiveKelas = (userRole === 'guru' && userKelas) ? userKelas : (kelas || className);
    if (effectiveKelas) {
      query = query.or(`kelas.eq."${effectiveKelas}",class_name.eq."${effectiveKelas}"`);
    }

    const { data, error } = await query.order('full_name', { ascending: true });
    if (error) {
      console.warn('[DataStore] fetchProfiles error:', error);
      return [];
    }
    return data || [];
  },

  async fetchSiswaBySchool(schoolId = null) {
    return this.fetchProfiles({ schoolId, role: 'siswa' });
  },

  async fetchGuruBySchool(schoolId = null) {
    return this.fetchProfiles({ schoolId, role: 'guru' });
  },

  async createProfile(profileData) {
    const userRole = this.getActiveUserRole();
    const userKelas = this.getActiveUserKelas();
    const payload = {
      ...profileData,
      school_id: profileData.school_id || this.getActiveSchoolId(),
    };

    // Isolasi Kelas: Guru membuat siswa otomatis terkunci di kelasnya sendiri
    if (userRole === 'guru' && userKelas) {
      payload.role = 'siswa';
      payload.kelas = userKelas;
      payload.class_name = userKelas;
    } else {
      if (payload.kelas && !payload.class_name) payload.class_name = payload.kelas;
      if (payload.class_name && !payload.kelas) payload.kelas = payload.class_name;
    }

    const { data, error } = await supabase
      .from('profiles')
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateProfile(id, updates) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ==========================================
  // 3. EXAMS (PAKET UJIAN / ASESMEN)
  // ==========================================
  async fetchExams({ schoolId = null, status = null, kelas = null } = {}) {
    const userRole = this.getActiveUserRole();
    const userKelas = this.getActiveUserKelas();
    const targetSchool = schoolId || this.getActiveSchoolId();
    let query = supabase.from('exams').select('*');

    if (targetSchool) {
      query = query.eq('school_id', targetSchool);
    }
    if (status) {
      query = query.eq('status', status);
    }

    // Isolasi Kelas: Guru & Siswa hanya dapat melihat paket ujian kelasnya
    const effectiveKelas = (['guru', 'siswa'].includes(userRole) && userKelas) ? userKelas : kelas;
    if (effectiveKelas) {
      query = query.or(`kelas.eq."${effectiveKelas}",grade_level.eq."${effectiveKelas}"`);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      console.warn('[DataStore] fetchExams error:', error);
      return [];
    }
    return data || [];
  },

  async fetchExamById(examId) {
    const { data, error } = await supabase
      .from('exams')
      .select('*')
      .eq('id', examId)
      .single();
    if (error) {
      console.warn('[DataStore] fetchExamById error:', error);
      return null;
    }
    return data;
  },

  async createExam(examData) {
    const userRole = this.getActiveUserRole();
    const userKelas = this.getActiveUserKelas();
    const payload = {
      ...examData,
      school_id: examData.school_id || this.getActiveSchoolId(),
    };

    // Isolasi Kelas: Guru otomatis menetapkan kelas ujian sesuai penugasan
    if (userRole === 'guru' && userKelas) {
      payload.kelas = userKelas;
      payload.grade_level = userKelas;
    }

    const { data, error } = await supabase
      .from('exams')
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateExam(examId, updates) {
    const { data, error } = await supabase
      .from('exams')
      .update(updates)
      .eq('id', examId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ==========================================
  // 4. QUESTIONS (SOAL PUBLIK - TANPA KUNCI)
  // ==========================================
  async fetchQuestionsByExam(examId, schoolId = null) {
    const userRole = this.getActiveUserRole();
    const userKelas = this.getActiveUserKelas();
    const targetSchool = schoolId || this.getActiveSchoolId();
    let query = supabase
      .from('questions')
      .select('id, exam_id, school_id, kelas, order_no, type, competency, stimulus, media_urls, prompt, options, points')
      .eq('exam_id', examId);

    if (targetSchool) {
      query = query.eq('school_id', targetSchool);
    }
    if (userRole === 'guru' && userKelas) {
      query = query.eq('kelas', userKelas);
    }

    const { data, error } = await query.order('order_no', { ascending: true });
    if (error) {
      console.warn('[DataStore] fetchQuestionsByExam error:', error);
      return [];
    }
    return data || [];
  },

  async createQuestion(questionData) {
    const userRole = this.getActiveUserRole();
    const userKelas = this.getActiveUserKelas();
    const payload = {
      ...questionData,
      school_id: questionData.school_id || this.getActiveSchoolId(),
    };

    // Isolasi Kelas pada butir soal
    if (userRole === 'guru' && userKelas) {
      payload.kelas = userKelas;
    }

    const { data, error } = await supabase
      .from('questions')
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ==========================================
  // 5. EXAM SESSIONS (SESI UJIAN SISWA)
  // ==========================================
  async fetchSessionsByExam(examId, schoolId = null, kelas = null) {
    const userRole = this.getActiveUserRole();
    const userKelas = this.getActiveUserKelas();
    const targetSchool = schoolId || this.getActiveSchoolId();
    let query = supabase
      .from('exam_sessions')
      .select('*, profiles(full_name, identifier, class_name, kelas)')
      .eq('exam_id', examId);

    if (targetSchool) {
      query = query.eq('school_id', targetSchool);
    }

    const effectiveKelas = (userRole === 'guru' && userKelas) ? userKelas : kelas;
    if (effectiveKelas) {
      query = query.eq('kelas', effectiveKelas);
    }

    const { data, error } = await query.order('created_at', { ascending: true });
    if (error) {
      console.warn('[DataStore] fetchSessionsByExam error:', error);
      return [];
    }
    return data || [];
  },

  async fetchSessionByStudent(examId, studentId) {
    const { data, error } = await supabase
      .from('exam_sessions')
      .select('*')
      .eq('exam_id', examId)
      .eq('student_id', studentId)
      .single();
    if (error) {
      return null;
    }
    return data;
  },

  async upsertExamSession(sessionData) {
    const payload = {
      ...sessionData,
      school_id: sessionData.school_id || this.getActiveSchoolId(),
    };
    const { data, error } = await supabase
      .from('exam_sessions')
      .upsert(payload, { onConflict: 'exam_id, student_id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ==========================================
  // 6. STUDENT ANSWERS & PROCTOR LOGS
  // ==========================================
  async saveStudentAnswer({ sessionId, questionId, schoolId = null, answerPayload = {}, isFlagged = false }) {
    const targetSchool = schoolId || this.getActiveSchoolId();
    const payload = {
      session_id: sessionId,
      question_id: questionId,
      school_id: targetSchool,
      answer_payload: answerPayload,
      is_flagged: isFlagged,
    };

    const { data, error } = await supabase
      .from('student_answers')
      .upsert(payload, { onConflict: 'session_id, question_id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async fetchAnswersBySession(sessionId) {
    const { data, error } = await supabase
      .from('student_answers')
      .select('*')
      .eq('session_id', sessionId);
    if (error) {
      console.warn('[DataStore] fetchAnswersBySession error:', error);
      return [];
    }
    return data || [];
  },

  async logProctorEvent({ sessionId, eventType, details = {}, schoolId = null, actorId = null }) {
    const targetSchool = schoolId || this.getActiveSchoolId();
    const payload = {
      session_id: sessionId,
      school_id: targetSchool,
      actor_id: actorId,
      event_type: eventType,
      details: details,
    };
    const { data, error } = await supabase
      .from('proctor_logs')
      .insert([payload])
      .select()
      .single();
    if (error) {
      console.warn('[DataStore] logProctorEvent error:', error);
      return null;
    }
    return data;
  },

  // ==========================================
  // 7. BACKWARD COMPATIBILITY ADAPTERS
  // ==========================================
  getSiswa() {
    return window.SicakapDB ? window.SicakapDB.getSiswa() : [];
  },
  getGuru() {
    return window.SicakapDB ? window.SicakapDB.getGuru() : [];
  },
  getJadwal() {
    return window.SicakapDB ? window.SicakapDB.getJadwal() : [];
  },
  getRombel() {
    return window.SicakapDB ? window.SicakapDB.getRombel() : [];
  },
  getMapel() {
    return window.SicakapDB ? window.SicakapDB.getMapel() : [];
  },
  getSoal() {
    return window.SicakapDB ? window.SicakapDB.getSoal() : [];
  }
};

if (typeof window !== 'undefined') {
  window.DataStore = DataStore;
}

export default DataStore;
