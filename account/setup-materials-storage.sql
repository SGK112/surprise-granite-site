-- Materials Storage Bucket Setup for Supabase
-- Run this in Supabase SQL Editor to create storage for material images
-- ============================================================

-- Create the materials storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('materials', 'materials', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policy: Anyone can view materials (public bucket)
CREATE POLICY "materials_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'materials');

-- Policy: Authenticated users can upload
CREATE POLICY "materials_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'materials'
    AND auth.role() = 'authenticated'
  );

-- Policy: Service role can do everything
CREATE POLICY "materials_service_all" ON storage.objects
  FOR ALL USING (
    bucket_id = 'materials'
    AND auth.role() = 'service_role'
  );

-- Verify bucket was created
SELECT * FROM storage.buckets WHERE id = 'materials';
