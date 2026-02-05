#!/usr/bin/env node
/**
 * Post-build script: Add .js extensions to ESM imports in compiled dist files
 * Necessary for Node.js ESM strict mode compatibility
 * Usage: node add-js-extensions.cjs [dist-dir]
 */

const fs = require('fs');
const path = require('path');

// Accept dist directory as command line argument, default to ../dist
const distDir = process.argv[2] 
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'dist');

function addJsExtensionsToFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Match import/export statements with relative paths without .js or .json extensions
  // Patterns:
  // import X from './module'
  // import X from '../module'
  // export { X } from './module'
  // export * from './module'
  
  content = content.replace(
    /from\s+(['"])(\.[^'"]*?)(?<!\.js)(?<!\.json)\1/g,
    "from $1$2.js$1"
  );
  
  // Also handle dynamic imports: import('./module')
  content = content.replace(
    /import\(\s*(['"])(\.[^'"]*?)(?<!\.js)(?<!\.json)\1\s*\)/g,
    "import($1$2.js$1)"
  );
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ ${path.relative(distDir, filePath)}`);
  }
}

function processDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      processDirectory(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      addJsExtensionsToFile(fullPath);
    }
  }
}

console.log('Adding .js extensions to dist files...');
if (fs.existsSync(distDir)) {
  processDirectory(distDir);
  console.log('Done!');
} else {
  console.warn('dist directory not found');
}
