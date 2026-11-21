-- ============================================================
-- SICAKAP - ROW LEVEL SECURITY (RLS) & PROTEKSI KOLOM
-- ============================================================

-- 1. HELPER FUNCTIONS (AMAN DARI RECURSION RLS)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- 2. TRIGGER PELINDUNG KOLOM SENSITIF (SISWA TIDAK BISA EDIT SKOR/WAKTU SENDIRI)
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

-- 3. AKTIFKAN RLS DI SEMUA TABEL
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proctor_logs ENABLE ROW LEVEL SECURITY;

-- 4. POLICIES: SCHOOLS
CREATE POLICY "superadmin_all_schools" ON public.schools
  FOR ALL USING (public.get_my_role() = 'superadmin');

CREATE POLICY "school_members_read_own_school" ON public.schools
  FOR SELECT USING (id = public.get_my_school_id());

-- 5. POLICIES: PROFILES
CREATE POLICY "superadmin_all_profiles" ON public.profiles
  FOR ALL USING (public.get_my_role() = 'superadmin');

CREATE POLICY "users_read_own_profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "staff_read_school_profiles" ON public.profiles
  FOR SELECT USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN ('admin_sekolah', 'proktor', 'guru')
  );

CREATE POLICY "admin_manage_school_profiles" ON public.profiles
  FOR ALL USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'admin_sekolah'
    AND role <> 'superadmin'
  );

-- 6. POLICIES: EXAMS
CREATE POLICY "superadmin_all_exams" ON public.exams
  FOR ALL USING (public.get_my_role() = 'superadmin');

CREATE POLICY "staff_manage_school_exams" ON public.exams
  FOR ALL USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN ('admin_sekolah', 'guru', 'proktor')
  );

CREATE POLICY "siswa_read_active_school_exams" ON public.exams
  FOR SELECT USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'siswa'
    AND status = 'active'
  );

-- 7. POLICIES: QUESTIONS (TANPA KUNCI)
CREATE POLICY "superadmin_all_questions" ON public.questions
  FOR ALL USING (public.get_my_role() = 'superadmin');

CREATE POLICY "guru_admin_manage_questions" ON public.questions
  FOR ALL USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN ('admin_sekolah', 'guru')
  );

CREATE POLICY "siswa_read_active_exam_questions" ON public.questions
  FOR SELECT USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'siswa'
    AND EXISTS (
      SELECT 1 FROM public.exam_sessions s
      WHERE s.exam_id = questions.exam_id
        AND s.student_id = auth.uid()
        AND s.status = 'in_progress'
    )
  );

-- 8. POLICIES: QUESTION_KEYS (BLOKIR TOTAL UNTUK SISWA & PROKTOR)
CREATE POLICY "superadmin_all_keys" ON public.question_keys
  FOR ALL USING (public.get_my_role() = 'superadmin');

CREATE POLICY "guru_admin_manage_keys" ON public.question_keys
  FOR ALL USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN ('admin_sekolah', 'guru')
  );

-- 9. POLICIES: EXAM_SESSIONS
CREATE POLICY "superadmin_all_sessions" ON public.exam_sessions
  FOR ALL USING (public.get_my_role() = 'superadmin');

CREATE POLICY "staff_manage_school_sessions" ON public.exam_sessions
  FOR ALL USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN ('admin_sekolah', 'proktor', 'guru')
  );

CREATE POLICY "siswa_read_own_session" ON public.exam_sessions
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "siswa_update_own_active_session" ON public.exam_sessions
  FOR UPDATE USING (
    student_id = auth.uid()
    AND status = 'in_progress'
  );

-- 10. POLICIES: STUDENT_ANSWERS
CREATE POLICY "superadmin_all_answers" ON public.student_answers
  FOR ALL USING (public.get_my_role() = 'superadmin');

CREATE POLICY "staff_read_school_answers" ON public.student_answers
  FOR SELECT USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN ('admin_sekolah', 'proktor', 'guru')
  );

CREATE POLICY "siswa_read_own_answers" ON public.student_answers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.exam_sessions s
      WHERE s.id = student_answers.session_id
        AND s.student_id = auth.uid()
    )
  );

CREATE POLICY "siswa_upsert_answers_while_in_progress" ON public.student_answers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.exam_sessions s
      WHERE s.id = student_answers.session_id
        AND s.student_id = auth.uid()
        AND s.status = 'in_progress'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.exam_sessions s
      WHERE s.id = student_answers.session_id
        AND s.student_id = auth.uid()
        AND s.status = 'in_progress'
    )
  );

-- 11. POLICIES: PROCTOR_LOGS
CREATE POLICY "superadmin_all_logs" ON public.proctor_logs
  FOR ALL USING (public.get_my_role() = 'superadmin');

CREATE POLICY "staff_manage_school_logs" ON public.proctor_logs
  FOR ALL USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN ('admin_sekolah', 'proktor', 'guru')
  );

CREATE POLICY "siswa_insert_own_violation_log" ON public.proctor_logs
  FOR INSERT WITH CHECK (
    school_id = public.get_my_school_id()
    AND actor_id = auth.uid()
    AND event_type IN ('TAB_SWITCH', 'EXIT_FULLSCREEN')
  );

