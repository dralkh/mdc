import { App, Notice, Plugin, TFile } from 'obsidian';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Import types and settings
import { MDCPluginSettings, DEFAULT_SETTINGS } from './types';

// Import helper functions and classes
import {
	detectNodePath,
	detectLibreOfficePath,
	detectPdfimagesPath,
	detectPdfinfoPath,
	detectPdftocairoPath,
	detectCliPath
} from './path_detection';
import { FileSelectionModal } from './file_selection_modal';
import { MDCSettingTab } from './settings_tab';

export default class MDCIntegrationPlugin extends Plugin {
	settings: MDCPluginSettings = { ...DEFAULT_SETTINGS }; // Use spread to avoid modifying the original default

	async onload() {
		await this.loadSettings();

		// Add ribbon icon
		this.addRibbonIcon('document', 'Convert Document to Markdown', () => {
			new FileSelectionModal(this.app, this).open(); // Use imported modal
		});

		// Add command
		this.addCommand({
			id: 'convert-document-to-markdown',
			name: 'Convert document to Markdown',
			callback: () => {
				new FileSelectionModal(this.app, this).open(); // Use imported modal
			}
		});

		// Add file menu item for supported extensions
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				// Check if the file is a supported format
				if (file instanceof TFile) {
					const extension = file.extension?.toLowerCase();
					const supportedExtensions = ['pptx', 'ppt', 'ppsx', 'pdf', 'doc', 'docx'];

					if (supportedExtensions.includes(extension)) {
						menu.addItem((item) => {
							item
								.setTitle('Convert to Markdown with MDC')
								.setIcon('document')
								.onClick(async () => {
									// Get the file's system path
									const adapter = this.app.vault.adapter;
									// @ts-ignore - Access private method for getting full path
									if (adapter.getFullPath) {
										// @ts-ignore - TypeScript doesn't know about this method
										const filePath = await adapter.getFullPath(file.path);

										new Notice(`Starting conversion of ${file.name}. This may take several minutes.`);

										try {
											await this.runMDCTool(filePath);
											new Notice('Conversion completed successfully.');
										} catch (error) {
											console.error('Conversion error:', error);
											new Notice(`Conversion failed: ${error instanceof Error ? error.message : String(error)}`);
										}
									} else {
										new Notice('Unable to access file system path. This feature requires Obsidian desktop.');
									}
								});
						});
					}
				}
			})
		);

		// Add settings tab
		this.addSettingTab(new MDCSettingTab(this.app, this)); // Use imported settings tab
	}

	onunload() {
		console.log('MDC Integration plugin unloaded');
	}

	async detectCliPath() {
		const cliPath = await detectCliPath();
		if (cliPath) {
			this.settings.cliPath = cliPath;
			await this.saveSettings();
			console.log(`[MDC Plugin] Auto-detected CLI path: ${cliPath}`);
		} else {
			console.warn(`[MDC Plugin] Could not auto-detect CLI path. Please configure it manually in settings.`);
		}
		return cliPath;
	}

	async validateCliPath(): Promise<{ valid: boolean; message: string }> {
		if (!this.settings.cliPath) {
			return {
				valid: false,
				message: 'MDC CLI path is not configured. Please set it in the plugin settings.'
			};
		}

		if (!fs.existsSync(this.settings.cliPath)) {
			return {
				valid: false,
				message: `MDC CLI executable not found at: ${this.settings.cliPath}\n\nThis could be due to:\n1. The MDC tool is not installed\n2. The path was changed or moved\n3. Auto-detection failed\n\nPlease check the plugin settings and configure the correct CLI path.`
			};
		}

		// Try to execute the CLI with a simple command to verify it works
		return new Promise((resolve) => {
			const command = `"${this.settings.nodePath}" "${this.settings.cliPath}" --version`;
			exec(command, (error, stdout, stderr) => {
				if (error) {
					resolve({
						valid: false,
						message: `MDC CLI validation failed: ${stderr || error.message}\n\nPath: ${this.settings.cliPath}`
					});
				} else {
					console.log(`[MDC Plugin] CLI validation successful. Version: ${stdout.trim()}`);
					resolve({
						valid: true,
						message: `MDC CLI is working correctly. Version: ${stdout.trim()}`
					});
				}
			});
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		let settingsUpdated = false;

		// Auto-detect and validate node path
		if (!this.settings.nodePath || !fs.existsSync(this.settings.nodePath)) {
			this.settings.nodePath = await detectNodePath();
			if (this.settings.nodePath) settingsUpdated = true;
		}

		// Auto-detect and validate LibreOffice path
		if (!this.settings.libreOfficePath || !fs.existsSync(this.settings.libreOfficePath)) {
			this.settings.libreOfficePath = await detectLibreOfficePath();
			if (this.settings.libreOfficePath) settingsUpdated = true;
		}

		// Auto-detect and validate PDF tools paths
		if (!this.settings.pdfimagesPath || !fs.existsSync(this.settings.pdfimagesPath)) {
			this.settings.pdfimagesPath = await detectPdfimagesPath();
			if (this.settings.pdfimagesPath) settingsUpdated = true;
		}

		if (!this.settings.pdfinfoPath || !fs.existsSync(this.settings.pdfinfoPath)) {
			this.settings.pdfinfoPath = await detectPdfinfoPath();
			if (this.settings.pdfinfoPath) settingsUpdated = true;
		}

		if (!this.settings.pdftocairoPath || !fs.existsSync(this.settings.pdftocairoPath)) {
			this.settings.pdftocairoPath = await detectPdftocairoPath();
			if (this.settings.pdftocairoPath) settingsUpdated = true;
		}

		// Auto-detect CLI path if not set or if the current path doesn't exist
		if (!this.settings.cliPath || !fs.existsSync(this.settings.cliPath)) {
		    console.log(`[MDC Plugin] CLI path is missing or invalid: ${this.settings.cliPath}. Running auto-detection...`);
		    const originalPath = this.settings.cliPath;
		    await this.detectCliPath();
		    settingsUpdated = true;
		    
		    // If detection found a valid path, show a success notice
		    if (this.settings.cliPath && fs.existsSync(this.settings.cliPath) && originalPath !== this.settings.cliPath) {
		        new Notice('MDC CLI path auto-detected successfully.', 0);
		    }
		    // If detection still failed, show a warning notice
		    else if (!this.settings.cliPath || !fs.existsSync(this.settings.cliPath)) {
		        console.warn(`[MDC Plugin] CLI path detection failed. User will need to configure it manually.`);
		        new Notice('Warning: MDC CLI path could not be auto-detected. Please configure it manually in plugin settings.', 0);
		    }
		}

		if (settingsUpdated) {
			await this.saveSettings();
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Path detection functions are now imported from ./plugin/path_detection

	async runMDCTool(filePath: string): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			// Validate Node.js path
			if (!this.settings.nodePath) {
				reject(new Error('Node.js path not configured. Please check plugin settings.'));
				return;
			}
			
			if (!fs.existsSync(this.settings.nodePath)) {
				reject(new Error(`Node.js executable not found at: ${this.settings.nodePath}. Please configure the correct path in plugin settings.`));
				return;
			}

			// Validate CLI path
			if (!this.settings.cliPath) {
				reject(new Error('MDC CLI path not configured. Please check plugin settings or run auto-detection.'));
				return;
			}
			
			if (!fs.existsSync(this.settings.cliPath)) {
				reject(new Error(`MDC CLI executable not found at: ${this.settings.cliPath}. This could be due to:\n1. The MDC tool is not installed\n2. The path was changed or moved\n3. Auto-detection failed\n\nPlease check the plugin settings and configure the correct CLI path. You can also try running auto-detection again.`));
				return;
			}

			if (!fs.existsSync(filePath)) {
				reject(new Error(`File not found: ${filePath}`));
				return;
			}

			// Create output directories
			const fileDir = path.dirname(filePath);
			const verbose = this.settings.verboseOutput;
			let mdcWorkDir = fileDir; // Default to fileDir if not verbose

			if (verbose) {
				// Create working directory in the same directory as the input file only if verbose
				mdcWorkDir = path.join(fileDir, 'process_output');
				try {
					// Try to create the working directory if it doesn't exist
					if (!fs.existsSync(mdcWorkDir)) {
						fs.mkdirSync(mdcWorkDir, { recursive: true });
						console.log(`MDC Plugin: Created verbose working directory at ${mdcWorkDir}`);
					}
				} catch (err) {
					console.error('Error creating verbose working directory:', err);
					reject(new Error(`Failed to create verbose working directory: ${err}`));
					return;
				}
			} else {
				console.log(`MDC Plugin: Verbose output disabled. Using ${fileDir} as working directory.`);
			}

			// Build the command
			let command = `"${this.settings.nodePath}" "${this.settings.cliPath}" "${filePath}" --md --api ${this.settings.apiProvider}`;

			// Add verbose flag to CLI if plugin setting is true
			if (verbose) {
				command += ' --verbose';
			}

			// Add additional options
			if (this.settings.extractAttachments) {
				command += ' --ma';
			}

			if (this.settings.tokenLimit > 0) {
				command += ` --token ${this.settings.tokenLimit}`;
			}

			if (this.settings.generateToc) {
				command += ' --table';
			}

			if (this.settings.updateHeadings) {
				command += ' --headings';
			}

			// Add identical image threshold if set
			if (this.settings.identicalImageThreshold !== undefined && this.settings.identicalImageThreshold >= 0) {
				command += ` --identical-image-threshold ${this.settings.identicalImageThreshold}`;
			}

			// Add requests per minute
			command += ` --requests-per-minute ${this.settings.requestsPerMinute}`;

			// The --config flag is no longer added here.
			// The CLI will use its default config loading logic (which expects config.yaml in the plugin root).
			// For overriding prompts, a different mechanism (like a temporary config file) will be implemented later if needed.

			console.log(`Executing MDC command: ${command}`);

			// Set up environment variables for the child process
			const env = { ...process.env };

			

			// Find the selected provider configuration
			const selectedProviderId = this.settings.apiProvider;
			const customProvider = this.settings.customOpenAIProviders.find(p => p.id === selectedProviderId);

			if (customProvider) {
				// This is a custom OpenAI-compatible provider
				env.MDC_API_PROVIDER = 'openai'; // Treat as 'openai' for the CLI
				env.OPENAI_API_KEY = customProvider.apiKey;
				env.MDC_OPENAI_BASE_URL = customProvider.baseURL;
				env.MDC_OPENAI_MODEL = customProvider.model;
			} else {
				// This is a default provider
				env.MDC_API_PROVIDER = selectedProviderId;
				if (selectedProviderId === 'openrouter' && this.settings.openrouterApiKey) {
					env.OPENROUTER_API_KEY = this.settings.openrouterApiKey;
				} else if (selectedProviderId === 'openai' && this.settings.openaiApiKey) {
					env.OPENAI_API_KEY = this.settings.openaiApiKey;
				} else if (selectedProviderId === 'together' && this.settings.togetherApiKey) {
					env.TOGETHER_API_KEY = this.settings.togetherApiKey;
				} else if (selectedProviderId === 'gemini' && this.settings.geminiApiKey) {
					env.GEMINI_API_KEY = this.settings.geminiApiKey;
				} else if (selectedProviderId === 'fireworks' && this.settings.fireworksApiKey) {
					env.FIREWORKS_API_KEY = this.settings.fireworksApiKey;
				}

				// Set model names for default providers
				env.MDC_OPENROUTER_MODEL = this.settings.openrouterModel.name;
				env.MDC_OPENAI_MODEL = this.settings.openaiModel.name;
				env.MDC_OLLAMA_MODEL = this.settings.ollamaModel.name;
				env.MDC_TOGETHER_MODEL = this.settings.togetherModel.name;
				env.MDC_GEMINI_MODEL = this.settings.geminiModel.name;
				env.MDC_FIREWORKS_MODEL = this.settings.fireworksModel.name;
			}

			// Pass prompt settings as an environment variable
			env.MDC_PROMPTS_OVERRIDE = JSON.stringify(this.settings.prompts);

			// Execute the command with the environment variables and set working directory
			// Set working directory to the plugin directory so config.yaml can be found
			const pluginDir = path.dirname(this.settings.cliPath);
			const pluginRootDir = path.dirname(pluginDir); // Go up from dist/ to plugin root
			
			const childProcess = exec(command, {
				env,
				cwd: pluginRootDir // Set working directory to plugin root so config.yaml is found
			});

			let output = '';
			let errorOutput = '';

			childProcess.stdout?.on('data', (data) => {
				output += data.toString();
				// Only log important messages when verbose is disabled
				if (this.settings.verboseOutput) {
					console.log(data.toString());
				} else {
					// Log only important messages when verbose is disabled
					const message = data.toString().trim();
					if (message && (
						message.includes('Starting conversion') ||
						message.includes('Conversion completed') ||
						message.includes('MDC execution failed') ||
						message.includes('Processing Markdown file') ||
						message.includes('Using TOC file') ||
						message.includes('Updating heading hierarchy')
					)) {
						console.log(`MDC Plugin: ${message}`);
					}
				}
			});

			childProcess.stderr?.on('data', (data) => {
				errorOutput += data.toString();
				// Only log errors when verbose is disabled, filter out image processing errors
				if (this.settings.verboseOutput) {
					console.error(data.toString());
				} else {
					// Filter out image processing errors and other verbose messages
					const message = data.toString().trim();
					if (message && (
						message.includes('MDC execution failed') ||
						message.includes('Cannot read properties of undefined') === false && // Filter out image processing errors
						(message.includes('Error') && !message.includes('image-')) ||
						message.includes('Failed') ||
						message.includes('Processing Markdown file') ||
						message.includes('Using TOC file') ||
						message.includes('Updating heading hierarchy')
					)) {
						console.error(`MDC Plugin: ${message}`);
					}
				}
			});

			childProcess.on('close', (code) => {
				if (code === 0) {
					resolve(output);
				} else {
					reject(new Error(`MDC execution failed with code ${code}. Error: ${errorOutput}`));
				}
			});
		});
	}
// FileSelectionModal is now imported from ./plugin/file_selection_modal
// MDCSettingTab is now imported from ./plugin/settings_tab
}
