-- ============================================================
-- SICAKAP - DATABASE SCHEMA (MULTI-SEKOLAH & CBT AKM)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ENUM TYPES
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('superadmin', 'admin_sekolah', 'proktor', 'guru', 'siswa');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.question_type AS ENUM ('single', 'multiple', 'true_false_table', 'matching', 'short_answer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.exam_status AS ENUM ('draft', 'scheduled', 'active', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.session_status AS ENUM ('not_started', 'in_progress', 'submitted', 'locked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. TABEL SEKOLAH (ISOLASI MULTI-SEKOLAH BERBASIS NPSN)
CREATE TABLE IF NOT EXISTS public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  npsn VARCHAR(16) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  jenjang VARCHAR(10) NOT NULL DEFAULT 'SD',
  kabupaten TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. TABEL PROFIL PENGGUNA (TERHUBUNG KE AUTH.USERS)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL,
  role public.app_role NOT NULL DEFAULT 'siswa',
  full_name TEXT NOT NULL,
  identifier VARCHAR(50), -- NISN (siswa) / NIP (guru/proktor/admin)
  class_name VARCHAR(30), -- Misal: "Kelas 5A", "Kelas 6B"
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. TABEL UJIAN / PAKET ASESMEN
CREATE TABLE IF NOT EXISTS public.exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  subject TEXT NOT NULL, -- Literasi, Numerasi, IPAS, dll
  grade_level VARCHAR(20), -- Fase C / Kelas 5-6
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

-- 5. TABEL SOAL (DATA PUBLIK UNTUK RUANG UJIAN - TANPA KUNCI JAWABAN)
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  order_no INT NOT NULL DEFAULT 1,
  type public.question_type NOT NULL DEFAULT 'single',
  competency TEXT, -- Capaian Pembelajaran
  stimulus TEXT, -- Teks cerita / HTML aman / rumus KaTeX
  media_urls JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{type:'image'|'audio', url:'...'}]
  prompt TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb, -- Struktur fleksibel per tipe AKM
  points NUMERIC(6,2) NOT NULL DEFAULT 1.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. TABEL KUNCI JAWABAN (TERPISAH & TERKUNCI DARI SISWA)
CREATE TABLE IF NOT EXISTS public.question_keys (
  question_id UUID PRIMARY KEY REFERENCES public.questions(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  answer_key JSONB NOT NULL,
  -- Contoh format answer_key:
  -- single:           {"correct": "A"}
  -- multiple:         {"correct": ["A", "C"]}
  -- true_false_table: {"correct": {"row1": true, "row2": false}}
  -- matching:         {"correct": {"L1": "R2", "L2": "R1"}}
  -- short_answer:     {"accepted": ["1/2", "0.5", "0,5"], "case_sensitive": false}
  rubric_note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. TABEL SESI UJIAN SISWA (TIMER SERVER, ANTI-LOGIN GANDA, BUKTI KIRIM)
CREATE TABLE IF NOT EXISTS public.exam_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.session_status NOT NULL DEFAULT 'not_started',
  server_started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  extra_minutes INT NOT NULL DEFAULT 0, -- Diubah oleh Proktor
  device_token UUID DEFAULT gen_random_uuid(), -- Direset Proktor saat pindah perangkat
  violation_count INT NOT NULL DEFAULT 0,
  score NUMERIC(6,2), -- Hanya diisi oleh Edge Function grade-exam
  receipt_number VARCHAR(40) UNIQUE, -- Bukti kirim valid dari server
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id)
);

-- 8. TABEL JAWABAN SISWA
CREATE TABLE IF NOT EXISTS public.student_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  answer_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_flagged BOOLEAN NOT NULL DEFAULT false, -- Status "Ragu-ragu"
  is_correct BOOLEAN, -- Diisi server saat grading
  earned_points NUMERIC(6,2) DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, question_id)
);

-- 9. TABEL LOG PROKTOR & ANTI-CHEAT
CREATE TABLE IF NOT EXISTS public.proctor_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type VARCHAR(40) NOT NULL, -- 'TAB_SWITCH', 'EXIT_FULLSCREEN', 'RESET_LOGIN', 'ADD_TIME', 'FORCE_SUBMIT'
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. INDEX PERFORMA (UNTUK 40+ SISWA SERENTAK PER RUANG)
CREATE INDEX IF NOT EXISTS idx_profiles_school_role ON public.profiles(school_id, role);
CREATE INDEX IF NOT EXISTS idx_exams_school_status ON public.exams(school_id, status);
CREATE INDEX IF NOT EXISTS idx_questions_exam ON public.questions(exam_id, order_no);
CREATE INDEX IF NOT EXISTS idx_sessions_exam_status ON public.exam_sessions(exam_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_student ON public.exam_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_answers_session ON public.student_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_logs_session ON public.proctor_logs(session_id, created_at DESC);

-- 11. TRIGGER UPDATED_AT OTOMATIS
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_exams_updated ON public.exams;
CREATE TRIGGER trg_exams_updated BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_sessions_updated ON public.exam_sessions;
CREATE TRIGGER trg_sessions_updated BEFORE UPDATE ON public.exam_sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_answers_updated ON public.student_answers;
CREATE TRIGGER trg_answers_updated BEFORE UPDATE ON public.student_answers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 12. AKTIFKAN REALTIME UNTUK MONITORING PROKTOR
ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.proctor_logs;

