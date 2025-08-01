import * as fs from 'fs-extra';
import * as path from 'path';
import * as readline from 'readline';

// Parse command line arguments
function parseArgs(): { directory?: string } {
  const args = process.argv.slice(2);
  const flags: { directory?: string } = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--d' || arg === '--directory') {
      flags.directory = args[i + 1];
      i++; // Skip next argument as it's the directory value
    } else if (arg.startsWith('--d=') || arg.startsWith('--directory=')) {
      flags.directory = arg.split('=')[1];
    }
  }
  
  return flags;
}

const projectDir = process.cwd();
const flags = parseArgs();

function installPlugin(obsidianPluginsDir: string) {
  if (!fs.existsSync(obsidianPluginsDir) || !fs.statSync(obsidianPluginsDir).isDirectory()) {
    console.error(`Error: Directory '${obsidianPluginsDir}' not found.`);
    process.exit(1);
  }

  const mdcPluginDir = path.join(obsidianPluginsDir, 'mdc');
  const dataJsonPath = path.join(mdcPluginDir, 'data.json');

  fs.ensureDirSync(mdcPluginDir);

  console.log('Copying plugin files...');
  fs.copySync(path.join(projectDir, 'main.js'), path.join(mdcPluginDir, 'main.js'));
  fs.copySync(path.join(projectDir, 'manifest.json'), path.join(mdcPluginDir, 'manifest.json'));
  fs.copySync(path.join(projectDir, 'styles.css'), path.join(mdcPluginDir, 'styles.css'));
  
  fs.copySync(path.join(projectDir, 'config.yaml'), path.join(mdcPluginDir, 'config.yaml'));

  console.log(`Plugin installed successfully in '${mdcPluginDir}'!`);
}

// Check if directory was provided via command line arguments
if (flags.directory) {
  console.log(`Using directory from command line: ${flags.directory}`);
  installPlugin(flags.directory);
} else {
  // Fall back to interactive mode
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Enter the path to your Obsidian plugins directory: ', (obsidianPluginsDir) => {
    installPlugin(obsidianPluginsDir);
    rl.close();
  });
}
