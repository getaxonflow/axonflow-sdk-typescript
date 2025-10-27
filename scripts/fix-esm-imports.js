#!/usr/bin/env node

/**
 * Post-build script to add .js extensions to ESM imports
 * TypeScript doesn't add these automatically, but Node ESM requires them
 */

const fs = require('fs');
const path = require('path');

const esmDir = path.join(__dirname, '../dist/esm');

function fixImportsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix relative imports: from './foo' -> from './foo.js'
  content = content.replace(/from\s+['"](\.\/.+?)(['"]);/g, (match, importPath, quote) => {
    // Don't add .js if it already has an extension
    if (importPath.endsWith('.js') || importPath.endsWith('.json')) {
      return match;
    }
    return `from ${quote}${importPath}.js${quote};`;
  });

  // Fix export statements: export ... from './foo' -> export ... from './foo.js'
  content = content.replace(/export\s+.*?from\s+['"](\.\/.+?)(['"]);/g, (match, importPath, quote) => {
    if (importPath.endsWith('.js') || importPath.endsWith('.json')) {
      return match;
    }
    return match.replace(importPath, importPath + '.js');
  });

  fs.writeFileSync(filePath, content, 'utf8');
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      walkDir(filePath);
    } else if (file.endsWith('.js')) {
      fixImportsInFile(filePath);
    }
  });
}

console.log('Fixing ESM imports...');
walkDir(esmDir);

// Create package.json to mark directory as ESM
const esmPackageJson = { type: 'module' };
fs.writeFileSync(
  path.join(esmDir, 'package.json'),
  JSON.stringify(esmPackageJson, null, 2),
  'utf8'
);

console.log('✅ ESM imports fixed');
