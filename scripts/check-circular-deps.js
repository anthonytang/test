#!/usr/bin/env node

/**
 * Circular Dependency Checker
 * Detects circular dependencies in @studio packages
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PACKAGES = [
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

function findCircularDependencies(packageName) {
  const packagePath = path.join(__dirname, '..', 'packages', packageName, 'src');
  
  if (!fs.existsSync(packagePath)) {
    return [];
  }

  const visited = new Set();
  const recursionStack = new Set();
  const circularDeps = [];

  function visit(file, currentPath = []) {
    if (recursionStack.has(file)) {
      const cycleStart = currentPath.indexOf(file);
      const cycle = currentPath.slice(cycleStart).concat(file);
      circularDeps.push(cycle);
      return;
    }

    if (visited.has(file)) {
      return;
    }

    visited.add(file);
    recursionStack.add(file);

    try {
      const content = fs.readFileSync(file, 'utf-8');
      const imports = extractImports(content);
      
      imports.forEach(imp => {
        const resolvedPath = resolveImport(imp, file, packageName);
        if (resolvedPath && fs.existsSync(resolvedPath)) {
          visit(resolvedPath, [...currentPath, file]);
        }
      });
    } catch (error) {
      // Skip files that can't be read
    }

    recursionStack.delete(file);
  }

  function extractImports(content) {
    const imports = [];
    const importRegex = /import\s+.*?\s+from\s+['"](@studio\/[^'"]+)['"]/g;
    const requireRegex = /require\s*\(['"](@studio\/[^'"]+)['"]\)/g;
    
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    while ((match = requireRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    
    return imports;
  }

  function resolveImport(importPath, fromFile, packageName) {
    if (!importPath.startsWith('@studio/')) {
      return null;
    }

    const targetPackage = importPath.replace('@studio/', '');
    const targetPath = path.join(__dirname, '..', 'packages', targetPackage, 'src');
    
    if (!fs.existsSync(targetPath)) {
      return null;
    }

    // Try to find index file or matching file
    const indexFile = path.join(targetPath, 'index.ts');
    if (fs.existsSync(indexFile)) {
      return indexFile;
    }

    const indexTsx = path.join(targetPath, 'index.tsx');
    if (fs.existsSync(indexTsx)) {
      return indexTsx;
    }

    return null;
  }

  function getAllSourceFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory() && !file.startsWith('__') && file !== 'node_modules') {
        getAllSourceFiles(filePath, fileList);
      } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        fileList.push(filePath);
      }
    });
    return fileList;
  }

  const sourceFiles = getAllSourceFiles(packagePath);
  sourceFiles.forEach(file => {
    if (!visited.has(file)) {
      visit(file);
    }
  });

  return circularDeps;
}

function checkCircularDependencies() {
  console.log('🔍 Checking for circular dependencies...\n');
  
  let hasCircularDeps = false;

  PACKAGES.forEach(packageName => {
    const circularDeps = findCircularDependencies(packageName);
    
    if (circularDeps.length > 0) {
      hasCircularDeps = true;
      console.log(`❌ ${packageName}: Found ${circularDeps.length} circular dependency(ies)`);
      circularDeps.forEach((cycle, index) => {
        console.log(`   Cycle ${index + 1}:`);
        cycle.forEach(file => {
          const relativePath = path.relative(path.join(__dirname, '..'), file);
          console.log(`     - ${relativePath}`);
        });
      });
      console.log();
    } else {
      console.log(`✅ ${packageName}: No circular dependencies`);
    }
  });

  if (hasCircularDeps) {
    console.log('\n❌ Circular dependencies detected!');
    process.exit(1);
  } else {
    console.log('\n✅ No circular dependencies found!');
  }
}

checkCircularDependencies();

