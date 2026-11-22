-- ============================================================
-- SICAKAP v2.0 - DEFINITIVE RBAC & ISOLASI KELAS MIGRATION
-- Mematuhi 100% Aturan .agent/rules/rbac-sicakap.md
-- Eksekusi di SQL Editor Dashboard Supabase
-- ============================================================

-- ============================================================
-- 1. DROP SEMUA POLICY LAMA SECARA DINAMIS (ANTI ERROR 42710)
-- ============================================================
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN (
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END $$;

-- ============================================================
-- 2. EXTENSION & ENUM TYPES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('superadmin', 'admin_sekolah', 'proktor', 'guru', 'siswa');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.exam_status AS ENUM ('draft', 'scheduled', 'active', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.session_status AS ENUM ('not_started', 'in_progress', 'submitted', 'locked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 3. PASTIKAN STRUKTUR TABEL & KOLOM KELAS ADA SEBELUM POLICY
--    (MENCEGAH ERROR 42703: column "kelas" does not exist)
-- ============================================================

-- A. TABEL SCHOOLS
CREATE TABLE IF NOT EXISTS public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  npsn VARCHAR(16) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  jenjang VARCHAR(10) NOT NULL DEFAULT 'SD',
  kabupaten TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  approval_status TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS nss TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS alamat TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS kepala_sekolah TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS nip_kepsek TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS tahun_pelajaran TEXT DEFAULT '2026/2027';
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS semester TEXT DEFAULT 'Semester Ganjil';
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS nama_pemda TEXT DEFAULT 'PEMERINTAH KABUPATEN / KOTA';
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS nama_dinas TEXT DEFAULT 'DINAS PENDIDIKAN DAN KEBUDAYAAN';
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS logo_kabupaten_url TEXT;

-- B. TABEL PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL,
  role public.app_role NOT NULL DEFAULT 'siswa',
  full_name TEXT NOT NULL,
  identifier VARCHAR(50),
  class_name TEXT,
  kelas TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS kelas TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS class_name TEXT;

-- C. TABEL EXAMS
CREATE TABLE IF NOT EXISTS public.exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  grade_level TEXT,
  kelas TEXT DEFAULT 'Kelas 5',
  duration_minutes INT NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  token_code VARCHAR(10),
  token_expires_at TIMESTAMPTZ,
  shuffle_questions BOOLEAN NOT NULL DEFAULT true,
  shuffle_options BOOLEAN NOT NULL DEFAULT true,
  max_tab_switches INT NOT NULL DEFAULT 3,
  status public.exam_status NOT NULL DEFAULT 'draft',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS kelas TEXT DEFAULT 'Kelas 5';
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS grade_level TEXT;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS nama_ulangan TEXT;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS jam_mulai TEXT DEFAULT '08:00';
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- D. TABEL QUESTIONS
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  kelas TEXT,
  order_no INT NOT NULL DEFAULT 1,
  type TEXT NOT NULL DEFAULT 'single',
  competency TEXT,
  stimulus TEXT,
  media_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  prompt TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  points NUMERIC(6,2) NOT NULL DEFAULT 1.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS kelas TEXT;

-- E. TABEL QUESTION_KEYS
CREATE TABLE IF NOT EXISTS public.question_keys (
  question_id UUID PRIMARY KEY REFERENCES public.questions(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  answer_key JSONB NOT NULL,
  rubric_note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.question_keys ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;

-- F. TABEL EXAM_SESSIONS
CREATE TABLE IF NOT EXISTS public.exam_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kelas TEXT,
  status public.session_status NOT NULL DEFAULT 'not_started',
  server_started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  extra_minutes INT NOT NULL DEFAULT 0,
  device_token UUID DEFAULT gen_random_uuid(),
  violation_count INT NOT NULL DEFAULT 0,
  score NUMERIC(6,2),
  receipt_number VARCHAR(40) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id)
);

ALTER TABLE public.exam_sessions ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.exam_sessions ADD COLUMN IF NOT EXISTS kelas TEXT;

-- G. TABEL EXAM_RESULTS
CREATE TABLE IF NOT EXISTS public.exam_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kelas TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'Asesmen CBT SD',
  score NUMERIC(6,2) NOT NULL DEFAULT 0.00,
  total_questions INT NOT NULL DEFAULT 0,
  correct_count INT NOT NULL DEFAULT 0,
  wrong_count INT NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id)
);

ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS kelas TEXT;

-- H. TABEL STUDENT_ANSWERS
CREATE TABLE IF NOT EXISTS public.student_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  answer_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  is_correct BOOLEAN,
  earned_points NUMERIC(6,2) DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, question_id)
);

ALTER TABLE public.student_answers ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;

-- I. TABEL PROCTOR_LOGS
CREATE TABLE IF NOT EXISTS public.proctor_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type VARCHAR(40) NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.proctor_logs ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;

-- ============================================================
-- 4. SINKRONISASI & BACKFILL DATA LAMA
-- ============================================================
DO $$
BEGIN
    UPDATE public.profiles SET kelas = class_name WHERE kelas IS NULL AND class_name IS NOT NULL;
    UPDATE public.profiles SET class_name = kelas WHERE class_name IS NULL AND kelas IS NOT NULL;
    UPDATE public.exams SET grade_level = kelas WHERE grade_level IS NULL AND kelas IS NOT NULL;
    UPDATE public.questions SET kelas = 'Kelas 5' WHERE kelas IS NULL;
    UPDATE public.exam_sessions SET kelas = 'Kelas 5' WHERE kelas IS NULL;
END $$;

-- ============================================================
-- 5. INDEX COMPOSITE ISOLASI KELAS (PERFORMA TINGGI 100+ SISWA)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_school_kelas_role ON public.profiles(school_id, kelas, role);
CREATE INDEX IF NOT EXISTS idx_exams_school_kelas ON public.exams(school_id, kelas, status);
CREATE INDEX IF NOT EXISTS idx_questions_school_kelas ON public.questions(school_id, kelas, exam_id);
CREATE INDEX IF NOT EXISTS idx_sessions_school_kelas ON public.exam_sessions(school_id, kelas, status);
CREATE INDEX IF NOT EXISTS idx_results_school_kelas ON public.exam_results(school_id, kelas, exam_id);
CREATE INDEX IF NOT EXISTS idx_answers_session ON public.student_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_logs_session ON public.proctor_logs(session_id, created_at DESC);

-- ============================================================
-- 6. HELPER FUNCTIONS AMAN DARI RLS RECURSION
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_kelas()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(kelas, class_name) FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ============================================================
-- 7. TRIGGER PROTEKSI METADATA SKOR
-- ============================================================
CREATE OR REPLACE FUNCTION public.protect_exam_session_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.get_my_role() = 'siswa' THEN
    IF NEW.score IS DISTINCT FROM OLD.score
       OR NEW.extra_minutes IS DISTINCT FROM OLD.extra_minutes
       OR NEW.server_started_at IS DISTINCT FROM OLD.server_started_at
       OR NEW.receipt_number IS DISTINCT FROM OLD.receipt_number
       OR NEW.device_token IS DISTINCT FROM OLD.device_token THEN
      RAISE EXCEPTION 'Akses ditolak: siswa tidak diizinkan mengubah metadata ujian.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_session_fields ON public.exam_sessions;
CREATE TRIGGER trg_protect_session_fields
  BEFORE UPDATE ON public.exam_sessions
  FOR EACH ROW EXECUTE FUNCTION public.protect_exam_session_fields();

CREATE OR REPLACE FUNCTION public.protect_school_status_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.get_my_role() != 'superadmin' THEN
    IF NEW.is_active IS DISTINCT FROM OLD.is_active
       OR NEW.approval_status IS DISTINCT FROM OLD.approval_status
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
      RAISE EXCEPTION 'Akses ditolak: Hanya Superadmin yang berhak mengubah status aktivasi atau approval sekolah.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_school_status ON public.schools;
CREATE TRIGGER trg_protect_school_status
  BEFORE UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.protect_school_status_fields();

-- ============================================================
-- 8. AKTIFKAN ROW LEVEL SECURITY (RLS) DI SELURUH TABEL
-- ============================================================
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proctor_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 9. PENERAPAN POLICY BARU (100% SESUAI RBAC-SICAKAP.MD)
-- ============================================================

-- A. SCHOOLS: Superadmin All, Member Read Own, Admin Update Own
CREATE POLICY "superadmin_all_schools" ON public.schools
  FOR ALL USING (public.get_my_role() = 'superadmin');

CREATE POLICY "school_members_read_own_school" ON public.schools
  FOR SELECT USING (id = public.get_my_school_id());

CREATE POLICY "admin_update_own_school" ON public.schools
  FOR UPDATE USING (
    id = public.get_my_school_id() AND public.get_my_role() = 'admin_sekolah'
  ) WITH CHECK (
    id = public.get_my_school_id() AND public.get_my_role() = 'admin_sekolah'
  );

-- B. PROFILES
CREATE POLICY "users_read_own_profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "superadmin_read_all_profiles" ON public.profiles
  FOR SELECT USING (public.get_my_role() = 'superadmin');


CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role::text = public.get_my_role());

CREATE POLICY "admin_manage_school_profiles" ON public.profiles
  FOR ALL USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'admin_sekolah'
    AND role::text <> 'superadmin'
  )
  WITH CHECK (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'admin_sekolah'
    AND role::text <> 'superadmin'
  );

CREATE POLICY "guru_manage_class_students" ON public.profiles
  FOR ALL USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'guru'
    AND role::text = 'siswa'
    AND (COALESCE(kelas, class_name) = public.get_my_kelas())
  )
  WITH CHECK (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'guru'
    AND role::text = 'siswa'
    AND (COALESCE(kelas, class_name) = public.get_my_kelas())
  );

-- C. EXAMS (PAKET UJIAN)
CREATE POLICY "admin_manage_school_exams" ON public.exams
  FOR ALL USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'admin_sekolah'
  )
  WITH CHECK (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'admin_sekolah'
  );

CREATE POLICY "guru_manage_class_exams" ON public.exams
  FOR ALL USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'guru'
    AND (kelas = public.get_my_kelas() OR grade_level = public.get_my_kelas())
  )
  WITH CHECK (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'guru'
    AND (kelas = public.get_my_kelas() OR grade_level = public.get_my_kelas())
  );

CREATE POLICY "siswa_read_class_active_exams" ON public.exams
  FOR SELECT USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'siswa'
    AND (kelas = public.get_my_kelas() OR grade_level = public.get_my_kelas())
    AND status::text = 'active'
  );

-- D. QUESTIONS (ISOLASI MUTLAK PER KELAS GURU)
CREATE POLICY "admin_manage_questions" ON public.questions
  FOR ALL USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'admin_sekolah'
  )
  WITH CHECK (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'admin_sekolah'
  );

CREATE POLICY "guru_manage_class_questions" ON public.questions
  FOR ALL USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'guru'
    AND (kelas = public.get_my_kelas())
  )
  WITH CHECK (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'guru'
    AND (kelas = public.get_my_kelas())
  );

CREATE POLICY "siswa_read_active_exam_questions" ON public.questions
  FOR SELECT USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'siswa'
    AND EXISTS (
      SELECT 1 FROM public.exam_sessions s
      WHERE s.exam_id = questions.exam_id
        AND s.student_id = auth.uid()
        AND s.status::text = 'in_progress'
    )
  );

-- E. QUESTION_KEYS (KUNCI JAWABAN TERISOLASI)
CREATE POLICY "admin_manage_keys" ON public.question_keys
  FOR ALL USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'admin_sekolah'
  );

CREATE POLICY "guru_manage_class_keys" ON public.question_keys
  FOR ALL USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'guru'
    AND EXISTS (
      SELECT 1 FROM public.questions q
      WHERE q.id = question_keys.question_id
        AND (q.kelas = public.get_my_kelas())
    )
  );

-- F. EXAM_SESSIONS (MONITORING RUANG UJIAN)
CREATE POLICY "admin_manage_sessions" ON public.exam_sessions
  FOR ALL USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'admin_sekolah'
  );

CREATE POLICY "proktor_manage_sessions" ON public.exam_sessions
  FOR ALL USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'proktor'
  );

CREATE POLICY "guru_manage_class_sessions" ON public.exam_sessions
  FOR ALL USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'guru'
    AND (kelas = public.get_my_kelas())
  )
  WITH CHECK (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'guru'
    AND (kelas = public.get_my_kelas())
  );

CREATE POLICY "siswa_read_own_session" ON public.exam_sessions
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "siswa_update_own_active_session" ON public.exam_sessions
  FOR UPDATE USING (
    student_id = auth.uid()
    AND status::text = 'in_progress'
  );

-- G. EXAM_RESULTS (REKAP NILAI)
CREATE POLICY "admin_manage_results" ON public.exam_results
  FOR ALL USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'admin_sekolah'
  );

CREATE POLICY "guru_manage_class_results" ON public.exam_results
  FOR ALL USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'guru'
    AND (kelas = public.get_my_kelas())
  );

CREATE POLICY "siswa_read_own_result" ON public.exam_results
  FOR SELECT USING (student_id = auth.uid());

-- H. STUDENT_ANSWERS (JAWABAN SISWA)
CREATE POLICY "admin_read_answers" ON public.student_answers
  FOR SELECT USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'admin_sekolah'
  );

CREATE POLICY "guru_read_class_answers" ON public.student_answers
  FOR SELECT USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'guru'
    AND EXISTS (
      SELECT 1 FROM public.exam_sessions s
      WHERE s.id = student_answers.session_id
        AND s.kelas = public.get_my_kelas()
    )
  );

CREATE POLICY "siswa_upsert_answers_while_in_progress" ON public.student_answers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.exam_sessions s
      WHERE s.id = student_answers.session_id
        AND s.student_id = auth.uid()
        AND s.status::text = 'in_progress'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.exam_sessions s
      WHERE s.id = student_answers.session_id
        AND s.student_id = auth.uid()
        AND s.status::text = 'in_progress'
    )
  );

-- I. PROCTOR_LOGS (LOG PELANGGARAN)
CREATE POLICY "admin_manage_logs" ON public.proctor_logs
  FOR ALL USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'admin_sekolah'
  );

CREATE POLICY "proktor_manage_logs" ON public.proctor_logs
  FOR ALL USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'proktor'
  );

CREATE POLICY "guru_read_class_logs" ON public.proctor_logs
  FOR SELECT USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'guru'
    AND EXISTS (
      SELECT 1 FROM public.exam_sessions s
      WHERE s.id = proctor_logs.session_id
        AND s.kelas = public.get_my_kelas()
    )
  );

CREATE POLICY "siswa_insert_own_violation_log" ON public.proctor_logs
  FOR INSERT WITH CHECK (
    school_id = public.get_my_school_id()
    AND actor_id = auth.uid()
    AND event_type::text IN ('TAB_SWITCH', 'EXIT_FULLSCREEN')
  );

-- ============================================================
-- 10. INDEX & RPC KHUSUS LOGIN SISWA NISN (ANTI AUTO-LOGOUT GURU)
-- ============================================================

-- Index unik cepat untuk pencarian NISN
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_siswa_nisn ON public.profiles(identifier) WHERE role = 'siswa';

-- RPC: Buat akun auth & profil siswa tanpa auto-logout guru
CREATE OR REPLACE FUNCTION public.admin_create_student(
  p_nisn TEXT,
  p_full_name TEXT,
  p_password TEXT,
  p_kelas TEXT,
  p_school_id UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_clean_nisn TEXT;
  v_internal_email TEXT;
  v_target_school_id UUID;
  v_caller_role TEXT;
  v_caller_school_id UUID;
  v_caller_kelas TEXT;
  v_user_id UUID;
  v_encrypted_pwd TEXT;
  v_effective_kelas TEXT;
BEGIN
  -- 1. Bersihkan NISN
  v_clean_nisn := regexp_replace(trim(p_nisn), '\s+', '', 'g');
  IF length(v_clean_nisn) < 4 THEN
    RAISE EXCEPTION 'NISN minimal 4 digit angka';
  END IF;

  v_internal_email := v_clean_nisn || '@siswa.sicakap.local';

  -- 2. Ambil peran & scope pemanggil
  v_caller_role := public.get_my_role();
  v_caller_school_id := public.get_my_school_id();
  v_caller_kelas := public.get_my_kelas();

  IF v_caller_role NOT IN ('superadmin', 'admin_sekolah', 'guru') THEN
    RAISE EXCEPTION 'Hanya Guru atau Admin yang berhak mendaftarkan siswa';
  END IF;

  IF v_caller_role = 'guru' THEN
    v_target_school_id := v_caller_school_id;
    v_effective_kelas := coalesce(v_caller_kelas, p_kelas);
  ELSE
    v_target_school_id := coalesce(p_school_id, v_caller_school_id);
    v_effective_kelas := p_kelas;
  END IF;

  IF v_target_school_id IS NULL THEN
    RAISE EXCEPTION 'ID Sekolah tidak boleh kosong';
  END IF;

  -- 3. Cek apakah user sudah ada di auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_internal_email LIMIT 1;
  v_encrypted_pwd := crypt(p_password, gen_salt('bf'));

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      role,
      confirmation_token
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      v_internal_email,
      v_encrypted_pwd,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', p_full_name, 'role', 'siswa', 'identifier', v_clean_nisn, 'kelas', v_effective_kelas),
      now(),
      now(),
      'authenticated',
      encode(gen_random_bytes(32), 'hex')
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      v_user_id::text,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_internal_email),
      'email',
      v_user_id::text,
      now(),
      now(),
      now()
    ) ON CONFLICT (provider, provider_id) DO NOTHING;
  ELSE
    UPDATE auth.users
    SET encrypted_password = v_encrypted_pwd,
        raw_user_meta_data = jsonb_build_object('full_name', p_full_name, 'role', 'siswa', 'identifier', v_clean_nisn, 'kelas', v_effective_kelas),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  -- 4. Upsert profil publik
  INSERT INTO public.profiles (
    id,
    school_id,
    role,
    full_name,
    identifier,
    kelas,
    class_name,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    v_target_school_id,
    'siswa'::public.app_role,
    p_full_name,
    v_clean_nisn,
    v_effective_kelas,
    v_effective_kelas,
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    school_id = EXCLUDED.school_id,
    full_name = EXCLUDED.full_name,
    identifier = EXCLUDED.identifier,
    kelas = EXCLUDED.kelas,
    class_name = EXCLUDED.class_name,
    is_active = true,
    updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'nisn', v_clean_nisn,
    'full_name', p_full_name,
    'kelas', v_effective_kelas,
    'school_id', v_target_school_id
  );
END;
$$;

-- RPC: Reset password siswa tanpa login ulang
CREATE OR REPLACE FUNCTION public.admin_reset_student_password(
  p_nisn TEXT,
  p_new_password TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_clean_nisn TEXT;
  v_internal_email TEXT;
  v_user_id UUID;
  v_encrypted_pwd TEXT;
  v_caller_role TEXT;
  v_caller_school_id UUID;
  v_caller_kelas TEXT;
  v_target_profile RECORD;
BEGIN
  v_clean_nisn := regexp_replace(trim(p_nisn), '\s+', '', 'g');
  v_internal_email := v_clean_nisn || '@siswa.sicakap.local';

  v_caller_role := public.get_my_role();
  v_caller_school_id := public.get_my_school_id();
  v_caller_kelas := public.get_my_kelas();

  IF v_caller_role NOT IN ('superadmin', 'admin_sekolah', 'guru') THEN
    RAISE EXCEPTION 'Hanya Guru atau Admin yang berhak mereset kata sandi siswa';
  END IF;

  SELECT * INTO v_target_profile FROM public.profiles WHERE identifier = v_clean_nisn AND role = 'siswa' LIMIT 1;
  IF v_target_profile IS NULL THEN
    RAISE EXCEPTION 'Siswa dengan NISN % tidak ditemukan', v_clean_nisn;
  END IF;

  IF v_caller_role = 'admin_sekolah' AND v_target_profile.school_id <> v_caller_school_id THEN
    RAISE EXCEPTION 'Tidak berhak mereset password siswa sekolah lain';
  END IF;

  IF v_caller_role = 'guru' AND (v_target_profile.school_id <> v_caller_school_id OR (v_target_profile.kelas <> v_caller_kelas AND v_target_profile.class_name <> v_caller_kelas)) THEN
    RAISE EXCEPTION 'Guru hanya boleh mereset password siswa di kelasnya sendiri';
  END IF;

  v_user_id := v_target_profile.id;
  v_encrypted_pwd := crypt(p_new_password, gen_salt('bf'));

  UPDATE auth.users
  SET encrypted_password = v_encrypted_pwd,
      updated_at = now()
  WHERE id = v_user_id OR email = v_internal_email;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'nisn', v_clean_nisn
  );
END;
$$;

-- Berikan izin eksekusi RPC ke pengguna terautentikasi dan anon
GRANT EXECUTE ON FUNCTION public.admin_create_student TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_student_password TO authenticated, anon;

-- ============================================================
-- 11. TABEL KREDENSIAL SEKOLAH (KHUSUS SUPERADMIN - ANTI LEAK)
-- Mematuhi Spesifikasi Isolasi: Terpisah dari Tabel Umum
-- ============================================================

CREATE TABLE IF NOT EXISTS public.school_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID UNIQUE NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_email TEXT NOT NULL,
  initial_password TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.school_credentials ENABLE ROW LEVEL SECURITY;

-- RLS: HANYA Superadmin yang memiliki akses baca, tulis, ubah, dan hapus
DROP POLICY IF EXISTS "superadmin_only_credentials" ON public.school_credentials;
CREATE POLICY "superadmin_only_credentials" ON public.school_credentials
  FOR ALL
  USING (public.get_my_role() = 'superadmin')
  WITH CHECK (public.get_my_role() = 'superadmin');

-- RPC: Pendaftaran Sekolah & Pembuatan Akun Admin Sekolah
CREATE OR REPLACE FUNCTION public.register_school_and_admin(
  p_name TEXT,
  p_npsn TEXT,
  p_jenjang TEXT,
  p_kabupaten TEXT DEFAULT NULL,
  p_admin_email TEXT DEFAULT NULL,
  p_password TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_school_id UUID;
  v_user_id UUID;
  v_clean_npsn TEXT;
  v_clean_email TEXT;
  v_encrypted_pwd TEXT;
  v_caller_role TEXT;
  v_final_is_active BOOLEAN;
BEGIN
  v_clean_npsn := regexp_replace(trim(p_npsn), '\s+', '', 'g');
  v_clean_email := lower(trim(p_admin_email));
  v_caller_role := public.get_my_role();

  -- Jika bukan superadmin, status wajib false (menunggu persetujuan superadmin)
  IF v_caller_role = 'superadmin' THEN
    v_final_is_active := coalesce(p_is_active, true);
  ELSE
    v_final_is_active := false;
  END IF;

  -- 1. Cek duplikasi NPSN
  SELECT id INTO v_school_id FROM public.schools WHERE npsn = v_clean_npsn LIMIT 1;
  IF v_school_id IS NOT NULL THEN
    RAISE EXCEPTION 'Sekolah dengan NPSN % sudah terdaftar', v_clean_npsn;
  END IF;

  v_school_id := gen_random_uuid();
  INSERT INTO public.schools (id, name, npsn, jenjang, kabupaten, is_active, created_at, updated_at)
  VALUES (v_school_id, trim(p_name), v_clean_npsn, coalesce(p_jenjang, 'SD'), p_kabupaten, v_final_is_active, now(), now());

  -- 2. Buat User Auth untuk Admin Sekolah jika email & password diberikan
  IF v_clean_email IS NOT NULL AND p_password IS NOT NULL AND length(trim(p_password)) >= 6 THEN
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_clean_email LIMIT 1;
    v_encrypted_pwd := crypt(p_password, gen_salt('bf'));

    IF v_user_id IS NULL THEN
      v_user_id := gen_random_uuid();
      INSERT INTO auth.users (
        id, instance_id, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, confirmation_token
      ) VALUES (
        v_user_id, '00000000-0000-0000-0000-000000000000', v_clean_email, v_encrypted_pwd, now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', 'Admin ' || trim(p_name), 'role', 'admin_sekolah', 'identifier', v_clean_npsn, 'school_id', v_school_id),
        now(), now(), 'authenticated', encode(gen_random_bytes(32), 'hex')
      );

      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        v_user_id::text, v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', v_clean_email),
        'email', v_user_id::text, now(), now(), now()
      ) ON CONFLICT (provider, provider_id) DO NOTHING;
    ELSE
      UPDATE auth.users
      SET encrypted_password = v_encrypted_pwd,
          raw_user_meta_data = jsonb_build_object('full_name', 'Admin ' || trim(p_name), 'role', 'admin_sekolah', 'identifier', v_clean_npsn, 'school_id', v_school_id),
          updated_at = now()
      WHERE id = v_user_id;
    END IF;

    -- 3. Upsert profiles
    INSERT INTO public.profiles (
      id, school_id, role, full_name, identifier, is_active, created_at, updated_at
    ) VALUES (
      v_user_id, v_school_id, 'admin_sekolah'::public.app_role, 'Admin ' || trim(p_name), v_clean_npsn, v_final_is_active, now(), now()
    )
    ON CONFLICT (id) DO UPDATE SET
      school_id = EXCLUDED.school_id,
      role = EXCLUDED.role,
      full_name = EXCLUDED.full_name,
      identifier = EXCLUDED.identifier,
      is_active = EXCLUDED.is_active,
      updated_at = now();

    -- 4. Simpan ke public.school_credentials
    INSERT INTO public.school_credentials (
      school_id, admin_user_id, admin_email, initial_password, created_at, updated_at
    ) VALUES (
      v_school_id, v_user_id, v_clean_email, trim(p_password), now(), now()
    )
    ON CONFLICT (school_id) DO UPDATE SET
      admin_user_id = EXCLUDED.admin_user_id,
      admin_email = EXCLUDED.admin_email,
      initial_password = EXCLUDED.initial_password,
      updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'school_id', v_school_id,
    'admin_user_id', v_user_id,
    'admin_email', v_clean_email,
    'is_active', v_final_is_active
  );
END;
$$;

-- RPC: Reset Password Admin Sekolah oleh Superadmin
CREATE OR REPLACE FUNCTION public.superadmin_reset_school_password(
  p_school_id UUID,
  p_new_password TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  v_encrypted_pwd TEXT;
BEGIN
  IF public.get_my_role() <> 'superadmin' THEN
    RAISE EXCEPTION 'Hanya Superadmin yang berhak mereset password admin sekolah';
  END IF;

  IF length(trim(p_new_password)) < 6 THEN
    RAISE EXCEPTION 'Password minimal 6 karakter';
  END IF;

  SELECT admin_user_id, admin_email INTO v_user_id, v_email
  FROM public.school_credentials
  WHERE school_id = p_school_id
  LIMIT 1;

  IF v_user_id IS NULL THEN
    SELECT id, identifier INTO v_user_id, v_email
    FROM public.profiles
    WHERE school_id = p_school_id AND role = 'admin_sekolah'
    LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Akun admin sekolah untuk ID % tidak ditemukan', p_school_id;
  END IF;

  v_encrypted_pwd := crypt(p_new_password, gen_salt('bf'));

  UPDATE auth.users
  SET encrypted_password = v_encrypted_pwd,
      updated_at = now()
  WHERE id = v_user_id;

  INSERT INTO public.school_credentials (
    school_id, admin_user_id, admin_email, initial_password, created_at, updated_at
  ) VALUES (
    p_school_id, v_user_id, coalesce(v_email, 'admin@sekolah.sch.id'), trim(p_new_password), now(), now()
  )
  ON CONFLICT (school_id) DO UPDATE SET
    initial_password = trim(p_new_password),
    updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'school_id', p_school_id,
    'message', 'Password admin sekolah berhasil direset'
  );
END;
$$;

-- RPC: Bersihkan Catatan Password Awal oleh Superadmin (initial_password = NULL)
CREATE OR REPLACE FUNCTION public.superadmin_clear_school_password(
  p_school_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  IF public.get_my_role() <> 'superadmin' THEN
    RAISE EXCEPTION 'Hanya Superadmin yang berhak membersihkan catatan password';
  END IF;

  UPDATE public.school_credentials
  SET initial_password = NULL,
      updated_at = now()
  WHERE school_id = p_school_id;

  RETURN jsonb_build_object(
    'success', true,
    'school_id', p_school_id,
    'message', 'Catatan password berhasil dibersihkan'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_school_and_admin TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_reset_school_password TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_clear_school_password TO authenticated;

-- ============================================================
-- 12. KOLOM APPROVAL & RPC CEK STATUS PENDAFTARAN SEKOLAH
-- ============================================================

ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS nss TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS alamat TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS kepala_sekolah TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS nip_kepsek TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS tahun_pelajaran TEXT DEFAULT '2026/2027';
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS semester TEXT DEFAULT 'Semester Ganjil';
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS nama_pemda TEXT DEFAULT 'PEMERINTAH KABUPATEN / KOTA';
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS nama_dinas TEXT DEFAULT 'DINAS PENDIDIKAN DAN KEBUDAYAAN';
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS logo_kabupaten_url TEXT;

-- Backfill sekolah aktif yang sudah ada
UPDATE public.schools
SET approval_status = 'approved',
    approved_at = coalesce(approved_at, updated_at, now())
WHERE is_active = true AND approval_status = 'pending';

-- RPC: Cek Status Pendaftaran Sekolah (Publik & Non-Sensitif)
CREATE OR REPLACE FUNCTION public.check_school_registration_status(
  p_query TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_clean_query TEXT;
  v_school RECORD;
BEGIN
  v_clean_query := lower(regexp_replace(trim(p_query), '\s+', '', 'g'));

  IF length(v_clean_query) = 0 THEN
    RETURN jsonb_build_object('found', false, 'message', 'Kata kunci pencarian tidak boleh kosong');
  END IF;

  -- 1. Cari via NPSN di tabel schools
  SELECT id, name, npsn, jenjang, kabupaten, is_active, approval_status, rejection_reason, created_at, approved_at
  INTO v_school
  FROM public.schools
  WHERE lower(npsn) = v_clean_query
  LIMIT 1;

  -- 2. Jika tidak ditemukan dan input berupa email, cari via admin_email di school_credentials
  IF v_school.id IS NULL AND p_query LIKE '%@%' THEN
    SELECT s.id, s.name, s.npsn, s.jenjang, s.kabupaten, s.is_active, s.approval_status, s.rejection_reason, s.created_at, s.approved_at
    INTO v_school
    FROM public.schools s
    JOIN public.school_credentials sc ON sc.school_id = s.id
    WHERE lower(sc.admin_email) = lower(trim(p_query))
    LIMIT 1;
  END IF;

  IF v_school.id IS NULL THEN
    RETURN jsonb_build_object(
      'found', false,
      'message', 'Pendaftaran sekolah dengan NPSN atau Email tersebut tidak ditemukan.'
    );
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'school_name', v_school.name,
    'npsn', v_school.npsn,
    'jenjang', coalesce(v_school.jenjang, 'SD'),
    'kabupaten', coalesce(v_school.kabupaten, '-'),
    'approval_status', coalesce(v_school.approval_status, CASE WHEN v_school.is_active THEN 'approved' ELSE 'pending' END),
    'is_active', coalesce(v_school.is_active, false),
    'rejection_reason', v_school.rejection_reason,
    'created_at', v_school.created_at,
    'approved_at', v_school.approved_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_school_registration_status TO authenticated, anon;

-- ============================================================================
-- PROFIL SEKOLAH & KOP RESMI DOKUMEN (KABUPATEN, DINAS, LOGO RESMI)
-- ============================================================================
ALTER TABLE public.schools 
ADD COLUMN IF NOT EXISTS nama_pemda TEXT DEFAULT 'PEMERINTAH KABUPATEN HULU SUNGAI TENGAH',
ADD COLUMN IF NOT EXISTS nama_dinas TEXT DEFAULT 'DINAS PENDIDIKAN',
ADD COLUMN IF NOT EXISTS logo_kabupaten_url TEXT,
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS nss TEXT,
ADD COLUMN IF NOT EXISTS alamat TEXT,
ADD COLUMN IF NOT EXISTS kepala_sekolah TEXT,
ADD COLUMN IF NOT EXISTS nip_kepsek TEXT,
ADD COLUMN IF NOT EXISTS tahun_pelajaran TEXT DEFAULT '2026/2027',
ADD COLUMN IF NOT EXISTS semester TEXT DEFAULT 'Semester Ganjil';

-- ============================================================================
-- PERSISTENSI DATA PRODUKSI (CLASSES / ROMBEL & PROFILES ENHANCEMENT)
-- ============================================================================
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS nip TEXT,
ADD COLUMN IF NOT EXISTS subject TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS initial_password TEXT;

CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grade_level TEXT NOT NULL DEFAULT '1',
  phase TEXT DEFAULT 'Fase A',
  homeroom_teacher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  student_count INT DEFAULT 0,
  academic_year TEXT DEFAULT '2026/2027',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_school_class_name UNIQUE (school_id, name)
);

CREATE INDEX IF NOT EXISTS idx_classes_school_id ON public.classes(school_id);
CREATE INDEX IF NOT EXISTS idx_classes_grade_level ON public.classes(grade_level);

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'classes' AND policyname = 'school_members_read_classes') THEN
        CREATE POLICY "school_members_read_classes" ON public.classes
          FOR SELECT USING (
            school_id = public.get_my_school_id()
            OR public.get_my_role() = 'superadmin'
          );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'classes' AND policyname = 'admin_manage_classes') THEN
        CREATE POLICY "admin_manage_classes" ON public.classes
          FOR ALL USING (
            school_id = public.get_my_school_id()
            AND public.get_my_role() = 'admin_sekolah'
          )
          WITH CHECK (
            school_id = public.get_my_school_id()
            AND public.get_my_role() = 'admin_sekolah'
          );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'classes' AND policyname = 'superadmin_manage_classes') THEN
        CREATE POLICY "superadmin_manage_classes" ON public.classes
          FOR ALL USING (public.get_my_role() = 'superadmin')
          WITH CHECK (public.get_my_role() = 'superadmin');
    END IF;

    -- Proteksi RLS Aditif Siswa: Memulai & Mengirim Ujian Sendiri
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'exam_sessions' AND policyname = 'siswa_insert_own_session') THEN
        CREATE POLICY "siswa_insert_own_session" ON public.exam_sessions
          FOR INSERT WITH CHECK (
            student_id = auth.uid()
            AND school_id = public.get_my_school_id()
          );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'exam_results' AND policyname = 'siswa_insert_own_result') THEN
        CREATE POLICY "siswa_insert_own_result" ON public.exam_results
          FOR INSERT WITH CHECK (
            student_id = auth.uid()
            AND school_id = public.get_my_school_id()
          );
    END IF;

    -- Pastikan RLS SELECT untuk admin_sekolah pada seluruh profil di sekolahnya
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'profiles' 
          AND policyname = 'admin_sekolah_select_profiles'
    ) THEN
        CREATE POLICY "admin_sekolah_select_profiles" ON public.profiles
          FOR SELECT USING (
            school_id = public.get_my_school_id() 
            AND public.get_my_role() = 'admin_sekolah'
          );
    END IF;

    -- Pastikan RLS ALL untuk admin_sekolah mengelola profil di sekolahnya (non-superadmin)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'profiles' 
          AND policyname = 'admin_sekolah_manage_profiles'
    ) THEN
        CREATE POLICY "admin_sekolah_manage_profiles" ON public.profiles
          FOR ALL USING (
            school_id = public.get_my_school_id() 
            AND public.get_my_role() = 'admin_sekolah'
            AND role::text <> 'superadmin'
          )
          WITH CHECK (
            school_id = public.get_my_school_id() 
            AND public.get_my_role() = 'admin_sekolah'
            AND role::text <> 'superadmin'
          );
    END IF;
END $$;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS nip TEXT,
ADD COLUMN IF NOT EXISTS subject TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS initial_password TEXT;

-- ============================================================================
-- PENGUATAN RLS LENGKAP UNTUK ROLE GURU (ANTI-BLOKIR & OPERASIONAL SEKOLAH)
-- ============================================================================
ALTER TABLE public.questions ALTER COLUMN exam_id DROP NOT NULL;

DO $$
BEGIN
    -- 1. PROFILES: Guru dapat SELECT seluruh profil sekolahnya (guru & siswa)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'guru_select_school_profiles'
    ) THEN
        CREATE POLICY "guru_select_school_profiles" ON public.profiles
          FOR SELECT USING (
            school_id = public.get_my_school_id() 
            AND public.get_my_role() = 'guru'
          );
    END IF;

    -- Guru dapat mengelola data siswa di sekolahnya
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'guru_manage_school_students'
    ) THEN
        CREATE POLICY "guru_manage_school_students" ON public.profiles
          FOR ALL USING (
            school_id = public.get_my_school_id() 
            AND public.get_my_role() = 'guru'
            AND role::text = 'siswa'
          )
          WITH CHECK (
            school_id = public.get_my_school_id() 
            AND public.get_my_role() = 'guru'
            AND role::text = 'siswa'
          );
    END IF;

    -- 2. CLASSES: Guru dapat SELECT & mengelola rombel di sekolahnya
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'classes' AND policyname = 'guru_select_school_classes'
    ) THEN
        CREATE POLICY "guru_select_school_classes" ON public.classes
          FOR SELECT USING (
            school_id = public.get_my_school_id() 
            AND public.get_my_role() = 'guru'
          );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'classes' AND policyname = 'guru_manage_school_classes'
    ) THEN
        CREATE POLICY "guru_manage_school_classes" ON public.classes
          FOR ALL USING (
            school_id = public.get_my_school_id() 
            AND public.get_my_role() = 'guru'
          )
          WITH CHECK (
            school_id = public.get_my_school_id() 
            AND public.get_my_role() = 'guru'
          );
    END IF;

    -- 3. EXAMS: Guru dapat mengelola ujian di sekolahnya
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'exams' AND policyname = 'guru_manage_school_exams'
    ) THEN
        CREATE POLICY "guru_manage_school_exams" ON public.exams
          FOR ALL USING (
            school_id = public.get_my_school_id() 
            AND public.get_my_role() = 'guru'
          )
          WITH CHECK (
            school_id = public.get_my_school_id() 
            AND public.get_my_role() = 'guru'
          );
    END IF;

    -- 4. QUESTIONS & QUESTION_KEYS: Guru dapat mengelola bank soal di sekolahnya
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'questions' AND policyname = 'guru_manage_school_questions'
    ) THEN
        CREATE POLICY "guru_manage_school_questions" ON public.questions
          FOR ALL USING (
            school_id = public.get_my_school_id() 
            AND public.get_my_role() = 'guru'
          )
          WITH CHECK (
            school_id = public.get_my_school_id() 
            AND public.get_my_role() = 'guru'
          );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'question_keys' AND policyname = 'guru_manage_school_question_keys'
    ) THEN
        CREATE POLICY "guru_manage_school_question_keys" ON public.question_keys
          FOR ALL USING (
            school_id = public.get_my_school_id() 
            AND public.get_my_role() = 'guru'
          )
          WITH CHECK (
            school_id = public.get_my_school_id() 
            AND public.get_my_role() = 'guru'
          );
    END IF;

    -- 5. EXAM_SESSIONS: Guru dapat melihat live score dan mereset sesi murid di sekolahnya
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'exam_sessions' AND policyname = 'guru_manage_school_sessions'
    ) THEN
        CREATE POLICY "guru_manage_school_sessions" ON public.exam_sessions
          FOR ALL USING (
            school_id = public.get_my_school_id() 
            AND public.get_my_role() = 'guru'
          )
          WITH CHECK (
            school_id = public.get_my_school_id() 
            AND public.get_my_role() = 'guru'
          );
    END IF;

    -- 6. EXAM_RESULTS: Guru dapat melihat dan mengelola hasil ujian di sekolahnya
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'exam_results' AND policyname = 'guru_manage_school_results'
    ) THEN
        CREATE POLICY "guru_manage_school_results" ON public.exam_results
          FOR ALL USING (
            school_id = public.get_my_school_id() 
            AND public.get_my_role() = 'guru'
          )
          WITH CHECK (
            school_id = public.get_my_school_id() 
            AND public.get_my_role() = 'guru'
          );
    END IF;
END $$;




