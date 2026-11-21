INSERT INTO storage.buckets (id, name, public)
VALUES ('question-media', 'question-media', true)
ON CONFLICT (id) DO NOTHING;

-- Guru & Admin Sekolah hanya boleh upload di folder sekolahnya sendiri: {school_id}/...
CREATE POLICY "staff_upload_school_media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'question-media'
    AND (storage.foldername(name))[1] = public.get_my_school_id()::text
    AND public.get_my_role() IN ('superadmin', 'admin_sekolah', 'guru')
  );

CREATE POLICY "staff_delete_school_media" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'question-media'
    AND (storage.foldername(name))[1] = public.get_my_school_id()::text
    AND public.get_my_role() IN ('superadmin', 'admin_sekolah', 'guru')
  );

CREATE POLICY "public_read_question_media" ON storage.objects
  FOR SELECT USING (bucket_id = 'question-media');

