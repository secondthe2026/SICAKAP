-- ============================================================
-- SICAKAP - RPC START EXAM SESSION & SERVER TIMESTAMP
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_exam_session(
  p_exam_id UUID,
  p_token_code TEXT,
  p_device_token UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_exam public.exams%ROWTYPE;
  v_session public.exam_sessions%ROWTYPE;
  v_clean_token TEXT := UPPER(TRIM(COALESCE(p_token_code, '')));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesi login tidak valid.';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid AND is_active = true;
  IF NOT FOUND OR v_profile.role <> 'siswa' THEN
    RAISE EXCEPTION 'Hanya akun siswa aktif yang dapat memulai ujian.';
  END IF;

  -- Cari ujian yang aktif & cocok dengan ID atau Token (KETAT: HANYA MILIK SEKOLAH SISWA SENDIRI)
  SELECT * INTO v_exam
  FROM public.exams
  WHERE (
    (p_exam_id IS NOT NULL AND id = p_exam_id)
    OR (v_clean_token <> '' AND UPPER(TRIM(COALESCE(token_code, ''))) = v_clean_token)
  )
  AND school_id = v_profile.school_id
  AND (
    status::text IN ('active', 'aktif', 'published')
    OR is_active = true
  )
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ujian tidak ditemukan atau belum diaktifkan proktor.';
  END IF;

  -- Ikat p_exam_id ke ID ujian yang sebenarnya
  p_exam_id := v_exam.id;

  -- Cek sesi existing (jika siswa refresh halaman / lanjut ujian)
  SELECT * INTO v_session
  FROM public.exam_sessions
  WHERE exam_id = p_exam_id AND student_id = v_uid;

  IF FOUND THEN
    IF v_session.status = 'submitted' THEN
      RAISE EXCEPTION 'Ujian ini sudah kamu selesaikan sebelumnya.';
    END IF;
    IF v_session.status = 'locked' THEN
      RAISE EXCEPTION 'Sesi dikunci oleh proktor. Hubungi proktor ruangan.';
    END IF;

    -- Validasi perangkat ganda (kecuali proktor sudah reset device_token jadi NULL)
    IF v_session.device_token IS NOT NULL
       AND p_device_token IS NOT NULL
       AND v_session.device_token <> p_device_token THEN
      RAISE EXCEPTION 'Akun sedang aktif di perangkat lain. Minta proktor klik Reset Login.';
    END IF;

    -- Jika baru di-reset proktor, ikat perangkat baru
    IF v_session.device_token IS NULL THEN
      UPDATE public.exam_sessions
      SET device_token = COALESCE(p_device_token, gen_random_uuid()),
          status = 'in_progress',
          server_started_at = COALESCE(server_started_at, now())
      WHERE id = v_session.id
      RETURNING * INTO v_session;
    END IF;
  ELSE
    -- Sesi baru: wajib cocokkan token ujian aktif
    IF v_exam.token_code IS NOT NULL AND v_clean_token <> UPPER(TRIM(v_exam.token_code)) THEN
      RAISE EXCEPTION 'Token ujian salah. Periksa kembali token dari proktor.';
    END IF;

    IF v_exam.token_expires_at IS NOT NULL AND now() > v_exam.token_expires_at THEN
      RAISE EXCEPTION 'Token ujian sudah kedaluwarsa. Minta token terbaru ke proktor.';
    END IF;

    INSERT INTO public.exam_sessions (
      exam_id, school_id, student_id, status, server_started_at, device_token, kelas
    ) VALUES (
      p_exam_id, v_profile.school_id, v_uid, 'in_progress', now(), COALESCE(p_device_token, gen_random_uuid()), COALESCE(v_profile.kelas, v_exam.kelas)
    )
    RETURNING * INTO v_session;
  END IF;

  RETURN jsonb_build_object(
    'session', to_jsonb(v_session),
    'exam', jsonb_build_object(
      'id', v_exam.id,
      'title', v_exam.title,
      'subject', v_exam.subject,
      'duration_minutes', v_exam.duration_minutes,
      'shuffle_questions', v_exam.shuffle_questions,
      'shuffle_options', v_exam.shuffle_options,
      'max_tab_switches', v_exam.max_tab_switches
    ),
    'server_now', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_exam_session(UUID, TEXT, UUID) TO authenticated;

