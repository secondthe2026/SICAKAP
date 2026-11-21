-- ============================================================
-- SICAKAP - ROW LEVEL SECURITY (RLS) & ISOLASI KELAS KETAT
-- Mematuhi 100% Aturan .agent/rules/rbac-sicakap.md
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
-- 2. ENSURE COLUMNS (ANTI ERROR 42703)
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS kelas TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS class_name TEXT;

ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS kelas TEXT DEFAULT 'Kelas 5';
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS grade_level TEXT;

ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS kelas TEXT;

ALTER TABLE public.question_keys ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;

ALTER TABLE public.exam_sessions ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.exam_sessions ADD COLUMN IF NOT EXISTS kelas TEXT;

ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS kelas TEXT;

ALTER TABLE public.student_answers ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;

ALTER TABLE public.proctor_logs ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;

-- ============================================================
-- 3. HELPER FUNCTIONS (AMAN DARI RECURSION RLS)
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
-- 4. TRIGGER PELINDUNG KOLOM SENSITIF
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
-- 5. AKTIFKAN RLS DI SEMUA TABEL
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
-- 6. POLICIES: SCHOOLS
-- ============================================================
CREATE POLICY "superadmin_all_schools" ON public.schools
  FOR ALL USING (public.get_my_role() = 'superadmin');

CREATE POLICY "school_members_read_own_school" ON public.schools
  FOR SELECT USING (id = public.get_my_school_id());

-- ============================================================
-- 7. POLICIES: PROFILES
-- ============================================================
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

-- ============================================================
-- 8. POLICIES: EXAMS
-- ============================================================
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

-- ============================================================
-- 9. POLICIES: QUESTIONS (SOAL TANPA KUNCI)
-- ============================================================
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

-- ============================================================
-- 10. POLICIES: QUESTION_KEYS (KUNCI DIBLOKIR TOTAL DARI SISWA)
-- ============================================================
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

-- ============================================================
-- 11. POLICIES: EXAM_SESSIONS (MONITORING & SESI UJIAN)
-- ============================================================
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

-- ============================================================
-- 12. POLICIES: EXAM_RESULTS (REKAP NILAI)
-- ============================================================
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

-- ============================================================
-- 13. POLICIES: STUDENT_ANSWERS
-- ============================================================
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

-- ============================================================
-- 14. POLICIES: PROCTOR_LOGS
-- ============================================================
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
