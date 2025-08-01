import { exec } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

async function findExecutable(
	name: string,
	macPaths: string[],
	linuxPaths: string[]
): Promise<string> {
	return new Promise<string>((resolve) => {
		const platform = os.platform();
		console.log(`[MDC Path Detection] Detecting ${name} for platform: ${platform}`);

		const pathsToCheck: string[] = [];

		if (platform === 'darwin') {
			pathsToCheck.push(...macPaths);
		} else if (platform === 'linux') {
			pathsToCheck.push(...linuxPaths);
		}

		console.log(`[MDC Path Detection] Checking paths: ${pathsToCheck.join(', ')}`);

		for (const p of pathsToCheck) {
			console.log(`[MDC Path Detection] Checking if ${p} exists...`);
			if (fs.existsSync(p)) {
				console.log(`[MDC Path Detection] Found ${name} at ${p}`);
				resolve(p);
				return;
			}
		}

		console.log(`[MDC Path Detection] ${name} not found in common paths, falling back to 'which' command.`);

		const command = platform === 'win32' ? `where ${name}` : `which ${name}`;

		exec(command, (error, stdout) => {
			if (error || !stdout) {
				console.error(`[MDC Path Detection] 'which ${name}' command failed:`, error);
				resolve('');
				return;
			}

			const foundPath = stdout.trim().split('\n')[0];
			console.log(`[MDC Path Detection] Found ${name} via 'which' command at: ${foundPath}`);
			resolve(foundPath);
		});
	});
}

export async function detectNodePath(): Promise<string> {
	return findExecutable(
		'node',
		['/opt/homebrew/bin/node', '/usr/local/bin/node'],
		['/usr/bin/node', '/usr/local/bin/node', '/snap/bin/node']
	);
}

export async function detectLibreOfficePath(): Promise<string> {
	return findExecutable(
		'soffice',
		['/Applications/LibreOffice.app/Contents/MacOS/soffice'],
		['/usr/bin/soffice', '/usr/local/bin/soffice', '/snap/bin/libreoffice.soffice']
	);
}

export async function detectPdfimagesPath(): Promise<string> {
	return findExecutable(
		'pdfimages',
		['/usr/local/bin/pdfimages', '/opt/homebrew/bin/pdfimages'],
		['/usr/bin/pdfimages']
	);
}

export async function detectPdfinfoPath(): Promise<string> {
	return findExecutable(
		'pdfinfo',
		['/usr/local/bin/pdfinfo', '/opt/homebrew/bin/pdfinfo'],
		['/usr/bin/pdfinfo']
	);
}

export async function detectPdftocairoPath(): Promise<string> {
	return findExecutable(
		'pdftocairo',
		['/usr/local/bin/pdftocairo', '/opt/homebrew/bin/pdftocairo'],
		['/usr/bin/pdftocairo']
	);
}

export async function detectCliPath(): Promise<string> {
    return new Promise<string>((resolve) => {
        const platform = os.platform();
        const execName = 'mdc';
        const originExecName = 'mdc-origin';

        const pathsToCheck: string[] = [];

        // Check for both 'mdc' and 'mdc origin' commands
        const commandsToCheck = [execName, originExecName];

        commandsToCheck.forEach(cmd => {
            console.log(`[MDC Path Detection] Checking for command: ${cmd}`);
            
            // First, try to find the command using 'which' or 'where'
            const command = platform === 'win32' ? `where ${cmd}` : `which ${cmd}`;
            
            exec(command, (error, stdout) => {
                if (!error && stdout) {
                    const foundPath = stdout.trim().split('\n')[0];
                    console.log(`[MDC Path Detection] Found ${cmd} via 'which' command at: ${foundPath}`);
                    
                    // Validate that the path exists
                    if (fs.existsSync(foundPath)) {
                        resolve(foundPath);
                        return;
                    } else {
                        console.log(`[MDC Path Detection] Path ${foundPath} does not exist, continuing search...`);
                    }
                }
                
                // If 'which' command failed or path doesn't exist, check common installation paths
                if (platform === 'linux' || platform === 'darwin') {
                    // Check NVM paths
                    const nvmPath = path.join(os.homedir(), '.nvm', 'versions', 'node');
                    if (fs.existsSync(nvmPath)) {
                        const versions = fs.readdirSync(nvmPath);
                        versions.forEach(version => {
                            const nvmBinaryPath = path.join(nvmPath, version, 'bin', cmd);
                            pathsToCheck.push(nvmBinaryPath);
                        });
                    }
                    
                    // Check common global npm paths
                    const globalNpmPaths = [
                        path.join(os.homedir(), '.npm-global', 'bin', cmd),
                        path.join('/usr/local/bin', cmd),
                        path.join('/opt/homebrew/bin', cmd),
                        path.join('/usr/bin', cmd)
                    ];
                    
                    globalNpmPaths.forEach(p => pathsToCheck.push(p));
                }
                
                // Check if any of the paths exist
                for (const p of pathsToCheck) {
                    console.log(`[MDC Path Detection] Checking if ${p} exists...`);
                    if (fs.existsSync(p)) {
                        console.log(`[MDC Path Detection] Found ${cmd} at ${p}`);
                        resolve(p);
                        return;
                    }
                }
                
                // If we get here, no path was found
                console.log(`[MDC Path Detection] Could not find ${cmd} in any expected location`);
                resolve('');
            });
        });
    });
}