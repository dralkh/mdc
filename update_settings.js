const fs = require('fs');
const path = require('path');

const dataJsonPath = process.argv[2];
const cliPath = process.argv[3];

if (!dataJsonPath || !cliPath) {
  console.error('Usage: node update_settings.js <path_to_data.json> <path_to_cli>');
  process.exit(1);
}

let settings = {};
if (fs.existsSync(dataJsonPath)) {
  try {
    settings = JSON.parse(fs.readFileSync(dataJsonPath, 'utf8'));
  } catch (e) {
    console.error('Could not parse existing data.json. Starting fresh.', e);
    settings = {};
  }
}

settings.cliPath = cliPath;

fs.writeFileSync(dataJsonPath, JSON.stringify(settings, null, 2));
console.log(`Successfully updated ${path.basename(dataJsonPath)} with CLI path: ${cliPath}`);
