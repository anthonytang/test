#!/usr/bin/env node

/**
 * Performance Testing Script
 * Measures load times and performance metrics
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function measureBuildTime() {
  console.log('⏱️  Measuring build times...\n');
  
  const packages = [
    'core',
    'auth',
    'storage',
    'api',
    'projects',
    'results',
    'templates',
    'ui',
    'notifications',
  ];

  const results = [];

  packages.forEach(packageName => {
    const packagePath = path.join(__dirname, '..', 'packages', packageName);
    const packageJsonPath = path.join(packagePath, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
      return;
    }

    try {
      const startTime = Date.now();
      execSync('pnpm build', {
        cwd: packagePath,
        stdio: 'pipe',
      });
      const buildTime = (Date.now() - startTime) / 1000;
      
      results.push({
        package: `@studio/${packageName}`,
        buildTime: buildTime.toFixed(2),
      });
      
      console.log(`✅ @studio/${packageName}: ${buildTime.toFixed(2)}s`);
    } catch (error) {
      console.log(`❌ @studio/${packageName}: Build failed`);
    }
  });

  console.log('\n📊 Build Time Summary:');
  const totalTime = results.reduce((sum, r) => sum + parseFloat(r.buildTime), 0);
  const avgTime = totalTime / results.length;
  const maxTime = Math.max(...results.map(r => parseFloat(r.buildTime)));
  const minTime = Math.min(...results.map(r => parseFloat(r.buildTime)));

  console.log(`Total: ${totalTime.toFixed(2)}s`);
  console.log(`Average: ${avgTime.toFixed(2)}s`);
  console.log(`Fastest: ${minTime.toFixed(2)}s`);
  console.log(`Slowest: ${maxTime.toFixed(2)}s`);

  // Save results to file
  const resultsPath = path.join(__dirname, '..', 'performance-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    buildTimes: results,
    summary: {
      total: totalTime.toFixed(2),
      average: avgTime.toFixed(2),
      max: maxTime.toFixed(2),
      min: minTime.toFixed(2),
    },
  }, null, 2));

  console.log(`\n📄 Results saved to ${resultsPath}`);
}

function checkTypeCheckPerformance() {
  console.log('\n🔍 Measuring type-check performance...\n');
  
  const packages = [
    'core',
    'auth',
    'storage',
    'api',
    'projects',
    'results',
    'templates',
    'ui',
    'notifications',
  ];

  const results = [];

  packages.forEach(packageName => {
    const packagePath = path.join(__dirname, '..', 'packages', packageName);
    const packageJsonPath = path.join(packagePath, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
      return;
    }

    try {
      const startTime = Date.now();
      execSync('pnpm type-check', {
        cwd: packagePath,
        stdio: 'pipe',
      });
      const typeCheckTime = (Date.now() - startTime) / 1000;
      
      results.push({
        package: `@studio/${packageName}`,
        typeCheckTime: typeCheckTime.toFixed(2),
      });
      
      console.log(`✅ @studio/${packageName}: ${typeCheckTime.toFixed(2)}s`);
    } catch (error) {
      console.log(`❌ @studio/${packageName}: Type-check failed`);
    }
  });

  if (results.length > 0) {
    const totalTime = results.reduce((sum, r) => sum + parseFloat(r.typeCheckTime), 0);
    console.log(`\nTotal type-check time: ${totalTime.toFixed(2)}s`);
  }
}

async function main() {
  console.log('🚀 Performance Testing\n');
  console.log('='.repeat(50));
  
  await measureBuildTime();
  checkTypeCheckPerformance();
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ Performance testing complete!');
}

main().catch(console.error);

