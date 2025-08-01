import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import * as mime from 'mime-types';
import sharp from 'sharp';
import { spawn } from 'child_process';

/**
 * Retry a function call with exponential backoff.
 * 
 * @param func - The function to call
 * @param maxRetries - Maximum number of retries
 * @param initialDelay - Initial delay between retries in milliseconds
 * @param backoffFactor - Multiplicative factor for delay increase
 * @returns The result of the function call or null if all retries failed
 */
export async function retryWithBackoff<T>(
  func: () => Promise<T>, 
  maxRetries = 3, 
  initialDelay = 1000, 
  backoffFactor = 2
): Promise<T | null> {
  let delay = initialDelay;
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`🔄 Retry attempt ${attempt}/${maxRetries}...`);
      }
      return await func();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt === maxRetries) {
        console.error(`❌ All retry attempts failed. Last error: ${lastError.message}`);
        break;
      }
      
      console.warn(`⚠️ Request failed: ${lastError.message}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= backoffFactor;
    }
  }
  
  return null;
}

/**
 * Reads an image file and converts it to a Base64-encoded data URL.
 */
export async function getDataUrl(imagePath: string): Promise<string | null> {
  try {
    const imageData = await fs.readFile(imagePath);
    const base64Encoded = imageData.toString('base64');
    
    // Map file extensions to MIME types
    const ext = path.extname(imagePath).toLowerCase();
    let mimeType = mime.lookup(ext);
    
    if (!mimeType) {
      // For unsupported formats, try to detect using file content
      try {
        const imageInfo = await sharp(imageData).metadata();
        mimeType = `image/${imageInfo.format}`;
      } catch {
        // Default to octet-stream if we can't detect
        mimeType = 'application/octet-stream';
      }
    }
    
    const dataUrl = `data:${mimeType};base64,${base64Encoded}`;
    return dataUrl;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error encoding image ${path.basename(imagePath)} to Base64: ${error.message}`);
    return null;
  }
}

/**
 * Converts an image to .webp format.
 * Handles a wide variety of image formats including vector formats when possible.
 */
export async function convertImageToWebp(sourcePath: string, destPath: string): Promise<boolean> {
  try {
    // Handle vector formats like SVG differently
    if (sourcePath.toLowerCase().endsWith('.svg')) {
      // For SVG, we can use sharp but with special handling
      await sharp(sourcePath, { density: 300 })
        .webp({ quality: 85, lossless: true })
        .toFile(destPath);
    } else {
      // Standard raster image processing
      const image = sharp(sourcePath);
      const metadata = await image.metadata();
      
      // Handle transparency
      if (metadata.hasAlpha) {
        await image.webp({ quality: 85, lossless: true }).toFile(destPath);
      } else {
        // Convert to RGB if needed
        await image.webp({ quality: 85 }).toFile(destPath);
      }
    }
    
    console.log(`🔄 Converted ${path.basename(sourcePath)} to ${path.basename(destPath)}`);
    return true;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error converting ${path.basename(sourcePath)} to WEBP: ${error.message}`);
    return false;
  }
}

/**
 * Prepares an image for LLaVA compatibility (for Ollama API only).
 * Converts WebP to PNG if needed, as LLaVA models typically have issues with WebP format.
 * Returns the path to the prepared image (either the original or a converted temporary file).
 */
export async function prepareImageForLlava(imagePath: string): Promise<string> {
  try {
    // Convert webp to PNG for better compatibility with LLaVA
    if (imagePath.toLowerCase().endsWith('.webp')) {
      const tempPngPath = imagePath.replace('.webp', '.png');
      try {
        await sharp(imagePath)
          .toFormat('png')
          .toFile(tempPngPath);
        
        console.log(`🔄 Converted ${path.basename(imagePath)} to PNG for better LLaVA compatibility`);
        return tempPngPath;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        console.error(`⚠️ Error converting webp to PNG: ${error.message}`);
        // Continue with original webp if conversion fails
      }
    }
    
    return imagePath;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error preparing image for LLaVA: ${error.message}`);
    return imagePath;
  }
}

/**
 * Yields successive n-sized chunks from iterable.
 */
export function* batchIterable<T>(iterable: T[], n = 1): Generator<T[]> {
  const length = iterable.length;
  for (let i = 0; i < length; i += n) {
    yield iterable.slice(i, i + n);
  }
}

/**
 * Get estimated token count from text
 * Uses a simple estimation where 1 token ≈ 4 characters
 */
export function estimateTokenCount(text: string): number {
  const AVG_CHARS_PER_TOKEN = 4;
  return Math.ceil(text.length / AVG_CHARS_PER_TOKEN);
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Find the path to an executable, checking environment variables first, then PATH, 
 * then common installation directories based on platform.
 * 
 * @param executableName - The name of the executable to find (base name without extension)
 * @param envVarName - Optional environment variable name that may contain the path
 * @returns The full path to the executable, or null if not found
 */
export async function findExecutablePath(
  executableName: string,
  envVarName?: string
): Promise<string | null> {
  const platform = process.platform;
  let possibleNames: string[] = [executableName];
  
  // Add platform-specific executable names
  if (platform === 'win32' && !executableName.endsWith('.exe')) {
    possibleNames = [executableName + '.exe', executableName];
  }
  
  // First check environment variable if provided
  if (envVarName && process.env[envVarName]) {
    const envPath = process.env[envVarName];
    try {
      // Verify the path exists
      if (fs.existsSync(envPath)) {
        console.log(`✅ Found ${executableName} at ${envPath} (from environment variable)`);
        return envPath;
      }
      console.warn(`⚠️ Environment variable ${envVarName} points to invalid path: ${envPath}`);
      // Continue to check other locations
    } catch (e) {
      console.warn(`⚠️ Error checking environment variable path: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  
  // Check if the executable is in PATH
  try {
    const cmd = platform === 'win32' ? 'where' : 'which';
    
    for (const name of possibleNames) {
      try {
        const result = await new Promise<string | null>((resolve) => {
          const check = spawn(cmd, [name]);
          let output = '';
          
          check.stdout.on('data', (data) => {
            output += data.toString();
          });
          
          check.on('close', (code) => {
            if (code === 0 && output.trim()) {
              const execPath = output.trim().split('\n')[0]; // Take the first result
              console.log(`✅ Found ${name} at ${execPath} (from PATH)`);
              resolve(execPath);
            } else {
              resolve(null);
            }
          });
          
          check.on('error', () => {
            resolve(null);
          });
        });
        
        if (result) {
          return result;
        }
      } catch (e) {
        // Continue to next possible name
      }
    }
  } catch (e) {
    console.warn(`⚠️ Error checking PATH for ${executableName}: ${e instanceof Error ? e.message : String(e)}`);
  }
  
  // Check common installation locations based on platform
  const commonLocations: string[] = [];
  
  // Poppler tools locations
  if (isPopplerTool(executableName)) {
    if (platform === 'win32') {
      // Windows common locations for Poppler
      const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
      const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
      
      for (const progDir of [programFiles, programFilesX86]) {
        commonLocations.push(
          path.join(progDir, 'poppler', 'bin', `${executableName}.exe`),
          path.join(progDir, 'poppler-utils', 'bin', `${executableName}.exe`),
          path.join(progDir, 'xpdf-tools', 'bin', `${executableName}.exe`)
        );
      }
    } else if (platform === 'darwin') {
      // macOS common locations for Poppler
      commonLocations.push(
        `/usr/local/bin/${executableName}`,
        `/opt/homebrew/bin/${executableName}`,
        `/opt/local/bin/${executableName}`,
        `/usr/bin/${executableName}`
      );
    } else if (platform === 'linux') {
      // Linux common locations for Poppler
      commonLocations.push(
        `/usr/bin/${executableName}`,
        `/usr/local/bin/${executableName}`,
        `/opt/bin/${executableName}`
      );
    }
  } else if (executableName === 'soffice') {
    // LibreOffice common locations
    if (platform === 'win32') {
      const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
      const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
      
      commonLocations.push(
        path.join(programFiles, 'LibreOffice', 'program', 'soffice.exe'),
        path.join(programFilesX86, 'LibreOffice', 'program', 'soffice.exe'),
        path.join(programFiles, 'LibreOffice\\7', 'program', 'soffice.exe'),
        path.join(programFilesX86, 'LibreOffice\\7', 'program', 'soffice.exe')
      );
    } else if (platform === 'darwin') {
      commonLocations.push(
        '/Applications/LibreOffice.app/Contents/MacOS/soffice',
        '/Applications/OpenOffice.app/Contents/MacOS/soffice'
      );
    } else if (platform === 'linux') {
      commonLocations.push(
        '/usr/bin/soffice',
        '/usr/lib/libreoffice/program/soffice',
        '/usr/bin/libreoffice',
        '/opt/libreoffice/program/soffice'
      );
    }
  }
  
  // Check each common location
  for (const location of commonLocations) {
    try {
      if (fs.existsSync(location)) {
        console.log(`✅ Found ${executableName} at ${location} (common location)`);
        return location;
      }
    } catch (e) {
      // Continue to next location
    }
  }
  
  // If we get here, we couldn't find the executable
  console.warn(`⚠️ ${executableName} not found in PATH or common locations`);
  
  // Provide installation instructions
  const instructions = getInstallationInstructions(executableName);
  if (instructions) {
    console.info(instructions);
  }
  
  return null;
}

/**
 * Checks if a tool is part of the Poppler-utils suite.
 */
function isPopplerTool(toolName: string): boolean {
  const popplerTools = [
    'pdfinfo', 'pdftocairo', 'pdfimages', 'pdftotext', 
    'pdftops', 'pdfseparate', 'pdfunite', 'pdfdetach'
  ];
  return popplerTools.includes(toolName);
}

/**
 * Get installation instructions for various tools based on the platform.
 * 
 * @param toolName - The name of the tool
 * @returns Installation instructions as a formatted string
 */
export function getInstallationInstructions(toolName: string): string {
  const platform = process.platform;
  let instructions = `⚠️ ${toolName} is required but was not found. `;
  
  if (isPopplerTool(toolName)) {
    if (platform === 'win32') {
      instructions += 'Installation instructions for Poppler-utils on Windows:\n' +
        '- Download Poppler for Windows from https://github.com/oschwartz10612/poppler-windows/releases\n' +
        '- Extract the ZIP file to a directory (e.g., C:\\Program Files\\poppler)\n' +
        '- Add the bin directory to your PATH environment variable\n' +
        '- Alternatively, install via Chocolatey with: choco install poppler';
    } else if (platform === 'darwin') {
      instructions += 'Installation instructions for Poppler-utils on macOS:\n' +
        '- Install via Homebrew with: brew install poppler\n' +
        '- Or via MacPorts with: sudo port install poppler';
    } else if (platform === 'linux') {
      const distro = getLinuxDistro();
      if (distro.includes('Ubuntu') || distro.includes('Debian')) {
        instructions += 'Installation instructions for Ubuntu/Debian:\n' +
          '- Install via apt: sudo apt update && sudo apt install poppler-utils';
      } else if (distro.includes('Fedora') || distro.includes('RHEL') || distro.includes('CentOS')) {
        instructions += 'Installation instructions for Fedora/RHEL/CentOS:\n' +
          '- Install via dnf: sudo dnf install poppler-utils';
      } else if (distro.includes('Arch')) {
        instructions += 'Installation instructions for Arch Linux:\n' +
          '- Install via pacman: sudo pacman -S poppler';
      } else {
        instructions += 'Installation instructions for Linux:\n' +
          '- Install using your distribution\'s package manager (usually called poppler-utils or poppler)';
      }
    }
  } else if (toolName === 'soffice') {
    if (platform === 'win32') {
      instructions += 'Installation instructions for LibreOffice on Windows:\n' +
        '- Download LibreOffice from https://www.libreoffice.org/download/\n' +
        '- Run the installer and follow the instructions';
    } else if (platform === 'darwin') {
      instructions += 'Installation instructions for LibreOffice on macOS:\n' +
        '- Install via Homebrew with: brew install --cask libreoffice\n' +
        '- Or download from https://www.libreoffice.org/download/';
    } else if (platform === 'linux') {
      const distro = getLinuxDistro();
      if (distro.includes('Ubuntu') || distro.includes('Debian')) {
        instructions += 'Installation instructions for Ubuntu/Debian:\n' +
          '- Install via apt: sudo apt update && sudo apt install libreoffice';
      } else if (distro.includes('Fedora') || distro.includes('RHEL') || distro.includes('CentOS')) {
        instructions += 'Installation instructions for Fedora/RHEL/CentOS:\n' +
          '- Install via dnf: sudo dnf install libreoffice';
      } else if (distro.includes('Arch')) {
        instructions += 'Installation instructions for Arch Linux:\n' +
          '- Install via pacman: sudo pacman -S libreoffice';
      } else {
        instructions += 'Installation instructions for Linux:\n' +
          '- Install using your distribution\'s package manager\n' +
          '- Or download from https://www.libreoffice.org/download/';
      }
    }
  } else {
    // Generic instructions for other tools
    instructions += 'Please install it using your system\'s package manager or download from the official website.';
  }
  
  return instructions;
}

/**
 * Attempt to detect the Linux distribution.
 * 
 * @returns The detected Linux distribution or 'Linux' if not detected
 */
export function getLinuxDistro(): string {
  if (process.platform !== 'linux') {
    return '';
  }
  
  try {
    // Try to read /etc/os-release
    if (fs.existsSync('/etc/os-release')) {
      const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
      const nameMatch = osRelease.match(/NAME="?([^"\n]+)"?/);
      if (nameMatch && nameMatch[1]) {
        return nameMatch[1];
      }
    }
    
    // Try to read /etc/lsb-release
    if (fs.existsSync('/etc/lsb-release')) {
      const lsbRelease = fs.readFileSync('/etc/lsb-release', 'utf8');
      const distroMatch = lsbRelease.match(/DISTRIB_ID="?([^"\n]+)"?/);
      if (distroMatch && distroMatch[1]) {
        return distroMatch[1];
      }
    }
    
    // Try common distribution files
    const distroFiles = [
      { file: '/etc/debian_version', name: 'Debian' },
      { file: '/etc/redhat-release', name: 'Red Hat' },
      { file: '/etc/fedora-release', name: 'Fedora' },
      { file: '/etc/centos-release', name: 'CentOS' },
      { file: '/etc/arch-release', name: 'Arch Linux' },
      { file: '/etc/gentoo-release', name: 'Gentoo' }
    ];
    
    for (const { file, name } of distroFiles) {
      if (fs.existsSync(file)) {
        return name;
      }
    }
  } catch (e) {
    // Ignore errors
  }
  
  return 'Linux';
}