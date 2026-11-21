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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- A. SCHOOLS: Superadmin Only untuk Approval
CREATE POLICY "superadmin_all_schools" ON public.schools
  FOR ALL USING (public.get_my_role() = 'superadmin');

CREATE POLICY "school_members_read_own_school" ON public.schools
  FOR SELECT USING (id = public.get_my_school_id());

-- B. PROFILES
CREATE POLICY "users_read_own_profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());

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
