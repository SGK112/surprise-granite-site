/**
 * Image Upload Script for Cloudinary and Supabase
 *
 * Uploads downloaded product images to cloud storage.
 *
 * Usage:
 *   node upload-images.js --cloudinary   # Upload to Cloudinary
 *   node upload-images.js --supabase     # Upload to Supabase Storage
 *   node upload-images.js --both         # Upload to both
 *
 * Environment Variables Required:
 *   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const CONFIG = {
  msiDir: path.join(__dirname, '../assets/msi'),
  daltileDir: path.join(__dirname, '../assets/daltile'),
  outputPath: path.join(__dirname, '../data/image-urls.json')
};

// Upload to Cloudinary
async function uploadToCloudinary(imagePath, publicId) {
  const cloudinary = require('cloudinary').v2;

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });

  try {
    const result = await cloudinary.uploader.upload(imagePath, {
      public_id: publicId,
      folder: 'surprise-granite/materials',
      transformation: [
        { width: 600, height: 600, crop: 'limit' },
        { quality: 'auto:good' },
        { fetch_format: 'auto' }
      ]
    });

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Upload to Supabase Storage
async function uploadToSupabase(imagePath, fileName, bucket = 'materials') {
  const { createClient } = require('@supabase/supabase-js');

  const supabase = createClient(
    process.env.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    const fileBuffer = await fs.readFile(imagePath);
    const contentType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, fileBuffer, {
        contentType,
        upsert: true
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    return {
      success: true,
      url: urlData.publicUrl,
      path: data.path
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Process all images in a directory
async function processDirectory(dir, prefix, uploadFn) {
  const results = [];

  try {
    const files = await fs.readdir(dir);
    const imageFiles = files.filter(f =>
      f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png') || f.endsWith('.webp')
    );

    console.log(`Found ${imageFiles.length} images in ${dir}`);

    for (const file of imageFiles) {
      const filePath = path.join(dir, file);
      const publicId = `${prefix}/${file.replace(/\.[^.]+$/, '')}`;

      console.log(`  Uploading: ${file}`);
      const result = await uploadFn(filePath, publicId);

      if (result.success) {
        console.log(`    ✓ ${result.url}`);
        results.push({
          file,
          ...result
        });
      } else {
        console.log(`    ✗ ${result.error}`);
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 500));
    }
  } catch (error) {
    console.log(`Error processing ${dir}: ${error.message}`);
  }

  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const useCloudinary = args.includes('--cloudinary') || args.includes('--both');
  const useSupabase = args.includes('--supabase') || args.includes('--both');

  if (!useCloudinary && !useSupabase) {
    console.log('Usage: node upload-images.js [--cloudinary] [--supabase] [--both]');
    console.log('\nRequired environment variables:');
    console.log('  Cloudinary: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
    console.log('  Supabase: SUPABASE_URL, SUPABASE_SERVICE_KEY');
    return;
  }

  console.log('='.repeat(60));
  console.log('Product Image Uploader');
  console.log('='.repeat(60));

  const allResults = {
    cloudinary: { msi: [], daltile: [] },
    supabase: { msi: [], daltile: [] }
  };

  if (useCloudinary) {
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      console.log('\n⚠ Cloudinary credentials not found. Set environment variables.');
    } else {
      console.log('\n--- Uploading to Cloudinary ---');

      // MSI images
      console.log('\nProcessing MSI images...');
      allResults.cloudinary.msi = await processDirectory(
        CONFIG.msiDir, 'msi', uploadToCloudinary
      );

      // Daltile images
      console.log('\nProcessing Daltile images...');
      allResults.cloudinary.daltile = await processDirectory(
        CONFIG.daltileDir, 'daltile', uploadToCloudinary
      );
    }
  }

  if (useSupabase) {
    if (!process.env.SUPABASE_SERVICE_KEY) {
      console.log('\n⚠ Supabase credentials not found. Set environment variables.');
    } else {
      console.log('\n--- Uploading to Supabase Storage ---');

      // MSI images
      console.log('\nProcessing MSI images...');
      allResults.supabase.msi = await processDirectory(
        CONFIG.msiDir, 'msi',
        (path, id) => uploadToSupabase(path, id.replace('/', '-'))
      );

      // Daltile images
      console.log('\nProcessing Daltile images...');
      allResults.supabase.daltile = await processDirectory(
        CONFIG.daltileDir, 'daltile',
        (path, id) => uploadToSupabase(path, id.replace('/', '-'))
      );
    }
  }

  // Save results
  await fs.writeFile(CONFIG.outputPath, JSON.stringify(allResults, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('COMPLETE');
  console.log('='.repeat(60));
  console.log(`Results saved to: ${CONFIG.outputPath}`);

  const cloudinaryCount = allResults.cloudinary.msi.length + allResults.cloudinary.daltile.length;
  const supabaseCount = allResults.supabase.msi.length + allResults.supabase.daltile.length;

  if (cloudinaryCount > 0) console.log(`Cloudinary uploads: ${cloudinaryCount}`);
  if (supabaseCount > 0) console.log(`Supabase uploads: ${supabaseCount}`);
}

main().catch(console.error);
