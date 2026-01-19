#!/usr/bin/env node
/**
 * Generate Outdoor Arizona Kitchen Video
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  model: 'minimax/video-01',
  localImage: null,
  prompt: `Cinematic Arizona backyard at golden sunset. Beautiful stone countertop on outdoor BBQ island with built-in stainless steel grill. Saguaro cactus silhouettes and desert mountains in background. Warm orange and purple sunset sky. Pool visible nearby. Camera slowly pans across the luxurious outdoor living space. High-end real estate video. Southwestern desert atmosphere.`,
  outputPath: './videos/hero-outdoor-v2.mp4',
  duration: 5,
};

function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...options.headers }
    };
    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        return downloadFile(response.headers.location, outputPath).then(resolve).catch(reject);
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(outputPath); });
    }).on('error', (err) => { fs.unlink(outputPath, () => {}); reject(err); });
  });
}

async function generateVideo() {
  const API_TOKEN = process.env.REPLICATE_API_TOKEN;
  if (!API_TOKEN) { console.error('Need REPLICATE_API_TOKEN'); process.exit(1); }

  console.log('🏜️  Generating Outdoor Arizona Kitchen Video...');

  const [owner, name] = CONFIG.model.split('/');
  const modelInfo = await fetchJSON(`https://api.replicate.com/v1/models/${owner}/${name}`, {
    headers: { 'Authorization': `Bearer ${API_TOKEN}` }
  });

  const version = modelInfo.latest_version?.id;
  if (!version) throw new Error('Could not get model version');

  const prediction = await fetchJSON('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_TOKEN}` },
    body: JSON.stringify({
      version: version,
      input: { prompt: CONFIG.prompt, prompt_optimizer: true }
    })
  });

  console.log(`📍 Prediction ID: ${prediction.id}`);

  let result = prediction;
  while (result.status !== 'succeeded' && result.status !== 'failed') {
    await new Promise(resolve => setTimeout(resolve, 3000));
    result = await fetchJSON(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { 'Authorization': `Bearer ${API_TOKEN}` }
    });
    process.stdout.write(`\r⏳ Status: ${result.status}...`);
  }

  if (result.status === 'failed') throw new Error(result.error || 'Failed');

  const videoUrl = Array.isArray(result.output) ? result.output[0] : result.output;
  console.log(`\n✅ Video URL: ${videoUrl}`);

  const outputDir = path.dirname(CONFIG.outputPath);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  await downloadFile(videoUrl, CONFIG.outputPath);
  const stats = fs.statSync(CONFIG.outputPath);
  console.log(`✅ Downloaded: ${CONFIG.outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
}

generateVideo().catch(err => { console.error('Error:', err.message); process.exit(1); });
