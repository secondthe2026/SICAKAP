-- ==========================================================================
-- SICAKAP - SINKRONISASI SKOR & KUNCI JAWABAN UJIAN
-- Jalankan di Supabase SQL Editor jika kolom di bawah belum ada di database
-- ==========================================================================

-- 1. Kolom answer_key pada questions (agar kunci jawaban terbaca langsung)
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS answer_key TEXT;

-- 2. Kolom score pada exam_sessions
ALTER TABLE public.exam_sessions ADD COLUMN IF NOT EXISTS score NUMERIC DEFAULT 0;

-- 3. Kolom rekapitulasi pada exam_results
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS score NUMERIC DEFAULT 0;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS correct_count INTEGER DEFAULT 0;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS wrong_count INTEGER DEFAULT 0;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS total_questions INTEGER DEFAULT 0;

-- 4. Pastikan RLS mengizinkan siswa dan guru meng-upsert hasil ujian
DROP POLICY IF EXISTS "siswa_guru_upsert_exam_results" ON public.exam_results;
CREATE POLICY "siswa_guru_upsert_exam_results" ON public.exam_results
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 5. Izinkan update skor pada exam_sessions
DROP POLICY IF EXISTS "siswa_guru_update_exam_sessions" ON public.exam_sessions;
CREATE POLICY "siswa_guru_update_exam_sessions" ON public.exam_sessions
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
