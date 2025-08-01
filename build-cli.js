#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Run esbuild
console.log('Building CLI with esbuild...');
execSync('node esbuild.cli.config.mjs production', { stdio: 'inherit' });

// Add shebang to the output file
const cliPath = path.join(__dirname, 'dist', 'cli.js');
console.log(`Adding shebang to ${cliPath}...`);

// Read the file
let content = fs.readFileSync(cliPath, 'utf8');

// Add shebang if not present
if (!content.startsWith('#!/usr/bin/env node')) {
    content = '#!/usr/bin/env node\n' + content;
    fs.writeFileSync(cliPath, content);
}

// Make it executable
console.log('Making CLI executable...');
execSync(`chmod +x ${cliPath}`, { stdio: 'inherit' });

console.log('CLI build completed successfully!');
