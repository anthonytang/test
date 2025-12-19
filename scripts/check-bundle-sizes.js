#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PACKAGES = [
  '@studio/core',
  '@studio/auth',
  '@studio/storage',
  '@studio/api',
  '@studio/projects',
  '@studio/results',
  '@studio/templates',
  '@studio/ui',
  '@studio/notifications',
];

const MAX_BUNDLE_SIZE = {
  '@studio/core': 50,
  '@studio/auth': 50,
  '@studio/storage': 300,
  '@studio/api': 100,
  '@studio/projects': 200,
  '@studio/results': 200,
  '@studio/templates': 200,
  '@studio/ui': 500,
  '@studio/notifications': 50,
};

function getPackageSizes(packageName) {
  const packagePath = packageName.replace('@studio/', '');
  const distPath = path.join(__dirname, '..', 'packages', packagePath, 'dist');
  
  if (!fs.existsSync(distPath)) {
    return null;
  }

  let uncompressedSize = 0;
  let gzippedSize = 0;

  function calculateSizes(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        calculateSizes(filePath);
      } else {
        if (file.endsWith('.map')) {
          return;
        }
        
        const content = fs.readFileSync(filePath);
        uncompressedSize += content.length;
        gzippedSize += zlib.gzipSync(content).length;
      }
    });
  }

  calculateSizes(distPath);
  
  return {
    uncompressed: uncompressedSize / 1024,
    gzipped: gzippedSize / 1024,
  };
}

function checkBundleSizes() {
  console.log('📦 Checking bundle sizes (excluding source maps)...\n');
  
  const results = [];
  let hasErrors = false;

  console.log('Building packages...');
  try {
    execSync('pnpm build', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }

  console.log('\n');

  PACKAGES.forEach(packageName => {
    const sizes = getPackageSizes(packageName);
    const maxSize = MAX_BUNDLE_SIZE[packageName];
    
    if (sizes === null) {
      console.log(`⚠️  ${packageName}: Not built`);
      results.push({ package: packageName, size: null, maxSize, status: 'not-built' });
      return;
    }

    const status = sizes.gzipped > maxSize ? '❌' : '✅';
    const message = sizes.gzipped > maxSize ? 'EXCEEDS LIMIT' : 'OK';
    
    console.log(`${status} ${packageName}: ${sizes.gzipped.toFixed(2)} KB (gzipped) / ${maxSize} KB - ${message}`);
    console.log(`   └─ ${sizes.uncompressed.toFixed(2)} KB (uncompressed)`);
    
    results.push({
      package: packageName,
      gzipped: sizes.gzipped.toFixed(2),
      uncompressed: sizes.uncompressed.toFixed(2),
      maxSize,
      status: sizes.gzipped > maxSize ? 'exceeded' : 'ok',
    });

    if (sizes.gzipped > maxSize) {
      hasErrors = true;
    }
  });

  console.log('\n📊 Summary:');
  const exceeded = results.filter(r => r.status === 'exceeded');
  const ok = results.filter(r => r.status === 'ok');
  
  console.log(`✅ OK: ${ok.length}`);
  console.log(`❌ Exceeded: ${exceeded.length}`);

  if (hasErrors) {
    console.log('\n❌ Some bundles exceed size limits!');
    console.log('💡 Tip: gzipped sizes shown above are what users download');
    process.exit(1);
  } else {
    console.log('\n✅ All bundle sizes are within limits!');
  }
}

checkBundleSizes();
