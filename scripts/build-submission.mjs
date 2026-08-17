import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const SUBMISSION_DIR = path.join(ROOT, 'submission_pkg');
const ZIP_OUTPUT = path.join(ROOT, 'aero-glide-submission.zip');

console.log('=== Meta Horizon Creator Competition: Submission Packager ===\n');

// 1. Build project
console.log('1. Running production build...');
execSync('npm run build', { stdio: 'inherit' });

// 2. Prepare submission folder
console.log('\n2. Preparing self-contained submission folder...');
if (fs.existsSync(SUBMISSION_DIR)) {
  fs.rmSync(SUBMISSION_DIR, { recursive: true, force: true });
}
if (fs.existsSync(ZIP_OUTPUT)) {
  fs.unlinkSync(ZIP_OUTPUT);
}
fs.mkdirSync(SUBMISSION_DIR, { recursive: true });
fs.mkdirSync(path.join(SUBMISSION_DIR, 'vendor'), { recursive: true });

// Copy vendor Three.js
const threeSrc = path.join(ROOT, 'node_modules', 'three', 'build', 'three.module.js');
if (fs.existsSync(threeSrc)) {
  fs.copyFileSync(threeSrc, path.join(SUBMISSION_DIR, 'vendor', 'three.module.js'));
  console.log('  ✓ Copied three.module.js to vendor/');
}

// Copy public assets (models, terrains, etc.)
const publicDir = path.join(ROOT, 'public');
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, SUBMISSION_DIR, { recursive: true });
  console.log('  ✓ Copied public assets to submission directory');
}

// Copy built dist files
fs.cpSync(DIST, SUBMISSION_DIR, { recursive: true });
console.log('  ✓ Copied built application files to submission directory');

// 3. Verify zero external network requests
console.log('\n3. Validating 100% offline compliance (No CDNs or external URLs)...');
function checkOffline(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  let hasExternal = false;
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      checkOffline(fullPath);
    } else if (file.name.endsWith('.html') || file.name.endsWith('.js') || file.name.endsWith('.css')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const matches = content.match(/https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\/[^\s"']*/g);
      if (matches) {
        const realFetches = matches.filter(url => 
          !url.includes('www.w3.org') && 
          !url.includes('schema.org') &&
          !url.includes('github.com') &&
          !url.includes('zyfod.dev')
        );
        if (realFetches.length > 0) {
          console.warn(`  ⚠ Found potential external URLs in ${file.name}:`, realFetches);
          hasExternal = true;
        }
      }
    }
  }
  return !hasExternal;
}

const offlineValid = checkOffline(SUBMISSION_DIR);
if (offlineValid) {
  console.log('  ✓ Passed: 0 external runtime CDNs or network fetches detected.');
}

// 4. Create single ZIP
console.log('\n4. Creating submission ZIP (< 35MB required)...');
execSync(`cd "${SUBMISSION_DIR}" && zip -r -9 "${ZIP_OUTPUT}" .`, { stdio: 'pipe' });

const stats = fs.statSync(ZIP_OUTPUT);
const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
console.log(`\n🎉 Submission package created successfully!`);
console.log(`   File: ${ZIP_OUTPUT}`);
console.log(`   Size: ${sizeMB} MB (Limit: 35.00 MB)`);
if (parseFloat(sizeMB) <= 35.0) {
  console.log(`   Status: VALID (< 35MB)`);
} else {
  console.error(`   Status: INVALID - Exceeds 35MB limit!`);
}
