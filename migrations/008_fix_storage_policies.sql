-- =============================================
-- SURPRISE GRANITE - STORAGE BUCKET POLICIES
-- Migration 008: Fix lead-images bucket for public uploads
-- =============================================

-- Note: Run these commands in Supabase SQL Editor
-- Storage buckets and policies are managed through the storage schema

-- 0. Add image_urls column to leads table if it doesn't exist
ALTER TABLE leads ADD COLUMN IF NOT EXISTS image_urls TEXT[];
ALTER TABLE leads ADD COLUMN IF NOT EXISTS images JSONB;

COMMENT ON COLUMN leads.image_urls IS 'Array of image URLs uploaded with the lead';
COMMENT ON COLUMN leads.images IS 'JSONB array of image objects with url and metadata';

-- 1. Create the lead-images bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lead-images',
  'lead-images',
  true,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif'];

-- 2. Create listing-images bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'listing-images',
  'listing-images',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760;

-- 3. Drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Allow public read for lead-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to lead-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon uploads to lead-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads to lead-images" ON storage.objects;
DROP POLICY IF EXISTS "lead-images public read" ON storage.objects;
DROP POLICY IF EXISTS "lead-images public insert" ON storage.objects;

-- 4. Create RLS policies for lead-images bucket

-- Allow anyone to read images (public bucket)
CREATE POLICY "lead-images_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'lead-images');

-- Allow anyone to upload images (for public forms)
CREATE POLICY "lead-images_public_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'lead-images');

-- Allow authenticated users to update their uploads
CREATE POLICY "lead-images_auth_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'lead-images' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete
CREATE POLICY "lead-images_auth_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'lead-images' AND auth.role() = 'authenticated');

-- 5. Create RLS policies for listing-images bucket

DROP POLICY IF EXISTS "listing-images public read" ON storage.objects;
DROP POLICY IF EXISTS "listing-images auth insert" ON storage.objects;
DROP POLICY IF EXISTS "listing-images_public_read" ON storage.objects;
DROP POLICY IF EXISTS "listing-images_auth_insert" ON storage.objects;

CREATE POLICY "listing-images_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'listing-images');

CREATE POLICY "listing-images_auth_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'listing-images' AND auth.role() = 'authenticated');

CREATE POLICY "listing-images_auth_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'listing-images' AND auth.role() = 'authenticated');

CREATE POLICY "listing-images_auth_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'listing-images' AND auth.role() = 'authenticated');

-- 6. Verify buckets exist
SELECT id, name, public, file_size_limit FROM storage.buckets WHERE id IN ('lead-images', 'listing-images');
