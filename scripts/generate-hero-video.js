#!/usr/bin/env node
/**
 * Hero Video Generator using Replicate AI
 * Generates a stunning kitchen video for the homepage hero
 *
 * Usage: REPLICATE_API_TOKEN=your_token node scripts/generate-hero-video.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  // Use MiniMax
  model: 'minimax/video-01',

  // No source image
  localImage: null,

  // Luxurious spa bathroom with walk-in shower and freestanding tub
  prompt: `Cinematic luxury spa bathroom. Large curbless walk-in shower with floor-to-ceiling marble walls, rainfall showerhead. Elegant freestanding white soaking tub on opposite wall. Floating stone vanity with vessel sink between them. Soft ambient lighting. Spacious open layout. Camera slowly pans across this stunning bathroom. High-end interior design. Professional real estate video.`,

  // Output settings
  outputPath: './videos/hero-bathroom-v2.mp4',
  duration: 10, // seconds - longer video
};

// Fetch helper
function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// Download file
function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        return downloadFile(response.headers.location, outputPath)
          .then(resolve)
          .catch(reject);
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(outputPath);
      });
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {});
      reject(err);
    });
  });
}

async function generateVideo() {
  const API_TOKEN = process.env.REPLICATE_API_TOKEN;

  if (!API_TOKEN) {
    console.error('❌ REPLICATE_API_TOKEN environment variable is required');
    console.log('\nUsage: REPLICATE_API_TOKEN=your_token node scripts/generate-hero-video.js');
    console.log('\nGet your token at: https://replicate.com/account/api-tokens');
    process.exit(1);
  }

  console.log('🎬 Generating Hero Video for Surprise Granite');
  console.log('━'.repeat(50));
  console.log(`Model: ${CONFIG.model}`);
  console.log(`Duration: ${CONFIG.duration}s`);
  console.log(`Prompt: ${CONFIG.prompt.substring(0, 100)}...`);
  console.log('━'.repeat(50));

  try {
    // First, get the model version
    console.log('\n⏳ Fetching model info...');
    const [owner, name] = CONFIG.model.split('/');

    const modelInfo = await fetchJSON(`https://api.replicate.com/v1/models/${owner}/${name}`, {
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
      }
    });

    if (modelInfo.error) {
      throw new Error(`Model fetch error: ${modelInfo.error}`);
    }

    const version = modelInfo.latest_version?.id;
    if (!version) {
      throw new Error('Could not get model version');
    }
    console.log(`✓ Model version: ${version.substring(0, 12)}...`);

    // Create prediction
    console.log('⏳ Starting video generation...');

    const modelInputs = {
      prompt: CONFIG.prompt,
      prompt_optimizer: true,
    };

    // Add image for image-to-video generation
    if (CONFIG.localImage) {
      const imagePath = path.resolve(CONFIG.localImage);
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image not found: ${imagePath}`);
      }
      const imageBuffer = fs.readFileSync(imagePath);
      const ext = path.extname(imagePath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      const dataUri = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
      modelInputs.first_frame_image = dataUri;
      console.log(`🖼️  Using local image: ${CONFIG.localImage} (${(imageBuffer.length / 1024).toFixed(0)}KB)`);
    }

    const prediction = await fetchJSON('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify({
        version: version,
        input: modelInputs
      })
    });

    if (prediction.error) {
      throw new Error(prediction.error);
    }

    console.log(`📍 Prediction ID: ${prediction.id}`);
    console.log('⏳ Generating video (this may take 2-5 minutes)...\n');

    // Poll for completion
    let result = prediction;
    let dots = 0;
    const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let spinIdx = 0;

    while (result.status !== 'succeeded' && result.status !== 'failed' && result.status !== 'canceled') {
      await new Promise(resolve => setTimeout(resolve, 3000));

      result = await fetchJSON(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`,
        }
      });

      process.stdout.write(`\r${spinner[spinIdx++ % spinner.length]} Status: ${result.status}...`);
    }

    console.log('\n');

    if (result.status === 'failed') {
      throw new Error(result.error || 'Video generation failed');
    }

    if (result.status === 'canceled') {
      throw new Error('Video generation was canceled');
    }

    // Get video URL
    const videoUrl = Array.isArray(result.output) ? result.output[0] : result.output;

    if (!videoUrl) {
      throw new Error('No video URL in response');
    }

    console.log('✅ Video generated successfully!');
    console.log(`📹 Video URL: ${videoUrl}`);

    // Create videos directory if needed
    const outputDir = path.dirname(CONFIG.outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Download video
    console.log(`\n⬇️  Downloading to ${CONFIG.outputPath}...`);
    await downloadFile(videoUrl, CONFIG.outputPath);

    const stats = fs.statSync(CONFIG.outputPath);
    console.log(`✅ Downloaded! (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

    console.log('\n━'.repeat(50));
    console.log('🎉 Hero video ready!');
    console.log(`📁 File: ${CONFIG.outputPath}`);
    console.log('\nNext steps:');
    console.log('1. Review the video');
    console.log('2. Upload to CDN or keep local');
    console.log('3. Update hero section to use video background');
    console.log('━'.repeat(50));

    // Return info for programmatic use
    return {
      success: true,
      videoUrl,
      localPath: CONFIG.outputPath,
      model: CONFIG.model,
      prompt: CONFIG.prompt
    };

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  generateVideo();
}

module.exports = { generateVideo, CONFIG };
