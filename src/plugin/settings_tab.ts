import { App, PluginSettingTab, Setting, Modal, Notice } from 'obsidian';
import type MDCIntegrationPlugin from './plugin'; // Use type import
import { DEFAULT_PROMPT_PARAMETERS, DEFAULT_SETTINGS } from './types'; // Import defaults from types

export class MDCSettingTab extends PluginSettingTab {
	plugin: MDCIntegrationPlugin;

	constructor(app: App, plugin: MDCIntegrationPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'MDC Integration Settings' });

		// Setup tab navigation
		const tabsContainer = containerEl.createDiv({ cls: 'mdc-settings-tabs' });
		const tabContents = containerEl.createDiv({ cls: 'mdc-settings-tab-contents' });

		// Create tabs
		const tabs = [
			{ id: 'processing', label: 'Processing Options' },
			{ id: 'models', label: 'API Configuration' },
			{ id: 'prompts', label: 'Prompt Settings' },
			{ id: 'basic', label: 'Paths' }
		];

		// Setup tab buttons
		const tabButtons: Record<string, HTMLElement> = {};
		tabs.forEach(tab => {
			const tabButton = tabsContainer.createEl('button', {
				text: tab.label,
				cls: 'mdc-settings-tab',
				attr: { 'data-tab': tab.id }
			});
			tabButtons[tab.id] = tabButton;

			tabButton.addEventListener('click', () => {
				// Set active tab
				Object.values(tabButtons).forEach(btn => btn.removeClass('active'));
				tabButton.addClass('active');

				// Show tab content
				Array.from(tabContents.children).forEach(el => {
					if (el instanceof HTMLElement) {
						if (el.getAttribute('data-tab-content') === tab.id) {
							el.style.display = 'block';
						} else {
							el.style.display = 'none';
						}
					}
				});
			});
		});

		// Create tab content containers
		const tabContentDivs: Record<string, HTMLElement> = {};
		tabs.forEach(tab => {
			const contentDiv = tabContents.createDiv({
				cls: 'mdc-settings-tab-content',
				attr: { 'data-tab-content': tab.id }
			});
			tabContentDivs[tab.id] = contentDiv;
			contentDiv.style.display = 'none';
		});

		// Activate first tab by default
		tabButtons.processing.addClass('active');
		tabContentDivs.processing.style.display = 'block';

		// Style tab navigation
		tabsContainer.style.display = 'flex';
		tabsContainer.style.marginBottom = '1rem';
		tabsContainer.style.borderBottom = '1px solid var(--background-modifier-border)';

		// Style tab buttons
		Object.values(tabButtons).forEach(button => {
			button.style.padding = '0.5rem 1rem';
			button.style.border = 'none';
			button.style.background = 'none';
			button.style.cursor = 'pointer';
			button.style.borderBottom = '2px solid transparent';
		});

		// Add CSS for active tab
		const style = document.createElement('style');
		style.textContent = `
      .mdc-settings-tab.active {
        border-bottom: 2px solid var(--interactive-accent) !important;
        font-weight: bold;
      }
      
      .mdc-settings-tab-content {
        padding: 1rem 0;
      }
      
      .setting-item-advanced {
        margin-left: 1.5rem;
      }
    `;
		document.head.appendChild(style);

		//=============================================================
		// BASIC SETTINGS TAB
		//=============================================================
		const basicTab = tabContentDivs.basic;

		        new Setting(basicTab)
		            .setName('MDC CLI Path')
		            .setDesc('Path to the MDC CLI executable (main.js). Auto-detected on startup.')
		            .addText(text => {
		                text
		                    .setPlaceholder('e.g., /home/user/.nvm/versions/node/v22.11.0/bin/mdc')
		                    .setValue(this.plugin.settings.cliPath)
		                    .onChange(async (value) => {
		                        this.plugin.settings.cliPath = value;
		                        await this.plugin.saveSettings();
		                    });
		            });

		new Setting(basicTab)
            .setName('Node.js Path')
            .setDesc('Path to the Node.js executable.')
            .addText(text => {
                text
                    .setPlaceholder('e.g., /usr/local/bin/node')
                    .setValue(this.plugin.settings.nodePath)
                    .onChange(async (value) => {
                        this.plugin.settings.nodePath = value;
                        await this.plugin.saveSettings();
                    });
            });

		// Removed Config.yaml Path setting as it will now always use the deployed default,
		// and specific overrides are handled by other settings or environment variables.

		new Setting(basicTab)
			.setName('LibreOffice Path')
			.setDesc('Path to the LibreOffice soffice executable.')
			.addText(text => {
				text
					.setPlaceholder('e.g., /Applications/LibreOffice.app/Contents/MacOS/soffice')
					.setValue(this.plugin.settings.libreOfficePath)
					.onChange(async (value) => {
						this.plugin.settings.libreOfficePath = value;
						await this.plugin.saveSettings();
					});
			});

		// Add PDF tools paths settings
		new Setting(basicTab)
			.setName('PDF Tools Paths')
			.setDesc('Paths to the poppler-utils executables needed for PDF processing')
			.setHeading();

		new Setting(basicTab)
			.setName('pdfimages Path')
			.setDesc('Path to the pdfimages executable (part of poppler-utils).')
			.addText(text => {
				text
					.setPlaceholder('e.g., /usr/local/bin/pdfimages')
					.setValue(this.plugin.settings.pdfimagesPath)
					.onChange(async (value) => {
						this.plugin.settings.pdfimagesPath = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(basicTab)
            .setName('pdfinfo Path')
            .setDesc('Path to the pdfinfo executable (part of poppler-utils).')
            .addText(text => {
                text
                    .setPlaceholder('e.g., /usr/local/bin/pdfinfo')
                    .setValue(this.plugin.settings.pdfinfoPath)
                    .onChange(async (value) => {
                        this.plugin.settings.pdfinfoPath = value;
                        await this.plugin.saveSettings();
                    });
            });

		new Setting(basicTab)
            .setName('pdftocairo Path')
            .setDesc('Path to the pdftocairo executable (part of poppler-utils).')
            .addText(text => {
                text
                    .setPlaceholder('e.g., /usr/local/bin/pdftocairo')
                    .setValue(this.plugin.settings.pdftocairoPath)
                    .onChange(async (value) => {
                        this.plugin.settings.pdftocairoPath = value;
                        await this.plugin.saveSettings();
                    });
            });
		// Add installation guide section (collapsible)
		const installationGuideHeader = basicTab.createDiv({ cls: 'mdc-installation-guide-header' });
		installationGuideHeader.style.cursor = 'pointer';
		installationGuideHeader.style.padding = '0.5rem';
		installationGuideHeader.style.border = '1px solid var(--background-modifier-border)';
		installationGuideHeader.style.borderRadius = '4px';
		installationGuideHeader.style.marginBottom = '1rem';
		installationGuideHeader.style.display = 'flex';
		installationGuideHeader.style.justifyContent = 'space-between';
		installationGuideHeader.style.alignItems = 'center';

		const installationGuideTitle = installationGuideHeader.createEl('h3', {
			text: 'Installation Guide',
			cls: 'mdc-installation-guide-title'
		});
		installationGuideTitle.style.margin = '0';
		installationGuideTitle.style.fontSize = 'var(--font-ui-medium)';
		installationGuideTitle.style.fontWeight = 'bold';

		const installationGuideControls = installationGuideHeader.createDiv();
		installationGuideControls.style.display = 'flex';
		installationGuideControls.style.gap = '0.5rem';

		const installationGuideIcon = installationGuideHeader.createEl('span', {
			text: '▼',
			cls: 'mdc-installation-guide-icon'
		});
		installationGuideIcon.style.transition = 'transform 0.2s ease';

		const copyButton = installationGuideControls.createEl('button', {
			text: '📋 Copy',
			cls: 'copy-button'
		});
		copyButton.style.background = 'var(--interactive-normal)';
		copyButton.style.border = '1px solid var(--background-modifier-border)';
		copyButton.style.borderRadius = '4px';
		copyButton.style.padding = '0.25rem 0.5rem';
		copyButton.style.cursor = 'pointer';
		copyButton.style.fontSize = 'var(--font-ui-smaller)';
		copyButton.style.transition = 'all 0.2s ease';

		const installationGuideContent = basicTab.createDiv({ cls: 'mdc-installation-guide-content' });
		installationGuideContent.style.display = 'none';
		installationGuideContent.style.padding = '0';
		installationGuideContent.style.border = '1px solid var(--background-modifier-border)';
		installationGuideContent.style.borderRadius = '4px';
		installationGuideContent.style.marginBottom = '1rem';
		installationGuideContent.style.overflow = 'hidden';

		// Installation guide content
		const guideContainer = installationGuideContent.createDiv();
		guideContainer.style.padding = '1rem';

		// Create guide sections
		guideContainer.createEl('h4', { text: 'Required Software' });
		guideContainer.createEl('p', { 
			text: 'Before using MDC, you need to install the following components:',
			cls: 'setting-item-description'
		});

		const requirementsList = guideContainer.createEl('ul');
		const requirements = [
			{ name: 'Node.js', version: '18+', description: 'JavaScript runtime environment' },
			{ name: 'Poppler-utils', version: '', description: 'For PDF processing (pdfimages, pdfinfo, pdftocairo)' },
			{ name: 'LibreOffice', version: '', description: 'For document conversions (PowerPoint, Word, etc.)' }
		];

		requirements.forEach(req => {
			const li = requirementsList.createEl('li');
			li.innerHTML = `<strong>${req.name}</strong> ${req.version ? `(${req.version})` : ''} - ${req.description}`;
		});

		// Installation Commands
		guideContainer.createEl('h4', { text: 'Installation Commands' });
		
		const installationCommands = guideContainer.createEl('div');
		installationCommands.style.background = 'var(--background-secondary)';
		installationCommands.style.padding = '0.5rem';
		installationCommands.style.borderRadius = '4px';
		installationCommands.style.margin = '1rem 0';
		
		const installationCode = installationCommands.createEl('code');
		installationCode.textContent = `# Install Node.js (18+)
# Windows: winget install OpenJS.NodeJS.LTS
# macOS: brew install node
# Linux: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt install -y nodejs

# Install Poppler-utils
# Windows: choco install poppler
# macOS: brew install poppler
# Linux: sudo apt install poppler-utils

# Install LibreOffice
# Windows: winget install TheDocumentFoundation.LibreOffice
# macOS: brew install --cask libreoffice
# Linux: sudo apt install libreoffice`;
		installationCode.style.fontSize = 'var(--font-ui-small)';
		installationCode.style.display = 'block';
		installationCode.style.whiteSpace = 'pre-wrap';
		installationCode.style.wordBreak = 'break-word';

		// MDC Installation
		guideContainer.createEl('h4', { text: 'MDC Installation' });
		
		const mdcCommands = guideContainer.createEl('div');
		mdcCommands.style.background = 'var(--background-secondary)';
		mdcCommands.style.padding = '0.5rem';
		mdcCommands.style.borderRadius = '4px';
		mdcCommands.style.margin = '1rem 0';
		
		const mdcCode = mdcCommands.createEl('code');
		mdcCode.textContent = `# Clone the repository
git clone https://github.com/dralkh/mdc.git
cd mdc

# Install dependencies and build
npm install && npm run build-all

# Install system-wide (makes mdc command available globally)
npm link`;
		mdcCode.style.fontSize = 'var(--font-ui-small)';
		mdcCode.style.display = 'block';
		mdcCode.style.whiteSpace = 'pre-wrap';
		mdcCode.style.wordBreak = 'break-word';

		// Find MDC Path
		guideContainer.createEl('h4', { text: 'Finding MDC Path' });
		const findPath = guideContainer.createEl('p');
		findPath.innerHTML = 'To find the MDC CLI path, run this command in your terminal:';
		
		const pathCommand = guideContainer.createEl('div');
		pathCommand.style.background = 'var(--background-secondary)';
		pathCommand.style.padding = '0.5rem';
		pathCommand.style.borderRadius = '4px';
		pathCommand.style.margin = '1rem 0';
		
		const pathCode = pathCommand.createEl('code');
		pathCode.textContent = 'which mdc  # Linux/macOS\nwhere mdc  # Windows';
		pathCode.style.fontSize = 'var(--font-ui-small)';
		pathCode.style.display = 'block';
		pathCode.style.whiteSpace = 'pre-wrap';
		pathCode.style.wordBreak = 'break-word';
		
		const pathNote = guideContainer.createEl('p');
		pathNote.innerHTML = 'The output will show you the full path to the MDC executable that you should enter in the "MDC CLI Path" field above.';

		// Toggle functionality
		let isGuideExpanded = false;
		installationGuideHeader.addEventListener('click', () => {
			isGuideExpanded = !isGuideExpanded;
			installationGuideContent.style.display = isGuideExpanded ? 'block' : 'none';
			installationGuideIcon.style.transform = isGuideExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
		});

		// Copy functionality
		copyButton.addEventListener('click', async () => {
			// Collect all text content from the installation guide
			const guideText = [
				'# Required Software',
				'Before using MDC, you need to install the following components:',
				'- Node.js (18+) - JavaScript runtime environment',
				'- Poppler-utils - For PDF processing (pdfimages, pdfinfo, pdftocairo)',
				'- LibreOffice - For document conversions (PowerPoint, Word, etc.)',
				'',
				'# Installation Commands',
				'# Install Node.js (18+)',
				'# Windows: winget install OpenJS.NodeJS.LTS',
				'# macOS: brew install node',
				'# Linux: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt install -y nodejs',
				'',
				'# Install Poppler-utils',
				'# Windows: choco install poppler',
				'# macOS: brew install poppler',
				'# Linux: sudo apt install poppler-utils',
				'',
				'# Install LibreOffice',
				'# Windows: winget install TheDocumentFoundation.LibreOffice',
				'# macOS: brew install --cask libreoffice',
				'# Linux: sudo apt install libreoffice',
				'',
				'# MDC Installation',
				'# Clone the repository',
				'git clone https://github.com/dralkh/mdc.git',
				'cd mdc',
				'',
				'# Install dependencies and build',
				'npm install && npm run build-all',
				'',
				'# Install system-wide (makes mdc command available globally)',
				'npm link',
				'',
				'# Finding MDC Path',
				'To find the MDC CLI path, run this command in your terminal:',
				'which mdc  # Linux/macOS',
				'where mdc  # Windows',
				'The output will show you the full path to the MDC executable that you should enter in the "MDC CLI Path" field above.'
			].join('\n');

			try {
				// Copy to clipboard
				await navigator.clipboard.writeText(guideText);
				
				// Show feedback
				const originalText = copyButton.textContent;
				copyButton.textContent = '✓ Copied!';
				copyButton.style.background = 'var(--interactive-success)';
				
				// Reset after 2 seconds
				setTimeout(() => {
					copyButton.textContent = originalText;
					copyButton.style.background = 'var(--interactive-normal)';
				}, 16000);
			} catch (err) {
				console.error('Failed to copy text: ', err);
				new Notice('Failed to copy installation guide');
			}
		});

		// Add CSS for installation guide
		const guideStyle = document.createElement('style');
		guideStyle.textContent = `
		    .mdc-installation-guide-header {
		      background: var(--background-secondary);
		    }
		    
		    .mdc-installation-guide-title {
		      color: var(--text-normal);
		    }
		    
		    .mdc-installation-guide-icon {
		      color: var(--text-muted);
		      font-size: 0.8em;
		    }
		  `;
		document.head.appendChild(guideStyle);

  //=============================================================
  // PROCESSING OPTIONS TAB
  //=============================================================

		

		//=============================================================
		// PROCESSING OPTIONS TAB
		//=============================================================
		const processingTab = tabContentDivs.processing;

		new Setting(processingTab)
			.setName('Verbose Output')
			.setDesc('Enable verbose output, creating intermediate files as process_output directory.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.verboseOutput)
				.onChange(async (value) => {
					this.plugin.settings.verboseOutput = value;
					await this.plugin.saveSettings();
				}));

		new Setting(processingTab)
			.setName('Extract Attachments')
			.setDesc('Extract and process attachment images')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.extractAttachments)
				.onChange(async (value) => {
					this.plugin.settings.extractAttachments = value;
					await this.plugin.saveSettings();
				}));

		new Setting(processingTab)
			.setName('Generate Table of Contents')
			.setDesc('Create a table of contents from headings')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.generateToc)
				.onChange(async (value) => {
					this.plugin.settings.generateToc = value;
					await this.plugin.saveSettings();
				}));

		new Setting(processingTab)
			.setName('Token Limit')
			.setDesc('Maximum tokens per chunk for processing (0 for no limit)')
			.addText(text => text
				.setPlaceholder('4000')
				.setValue(String(this.plugin.settings.tokenLimit))
				.onChange(async (value) => {
					const limit = parseInt(value);
					if (!isNaN(limit) && limit >= 0) {
						this.plugin.settings.tokenLimit = limit;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(processingTab)
			.setName('Update Headings')
			.setDesc('Update heading hierarchy in the generated Markdown')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.updateHeadings)
				.onChange(async (value) => {
					this.plugin.settings.updateHeadings = value;
					await this.plugin.saveSettings();
				}));

		new Setting(processingTab)
			.setName('Identical Image Threshold (PDF Media)')
			.setDesc('Discard embedded PDF images if more than this many identical copies are found (0 to keep all).')
			.addText(text => text
				.setPlaceholder('3')
				.setValue(String(this.plugin.settings.identicalImageThreshold))
				.onChange(async (value) => {
					const threshold = parseInt(value);
					if (!isNaN(threshold) && threshold >= 0) {
						this.plugin.settings.identicalImageThreshold = threshold;
						await this.plugin.saveSettings();
					}
				}));

		//=============================================================
		// API CONFIGURATION TAB
		//=============================================================
		const modelsTab = tabContentDivs.models;

		modelsTab.createEl('h3', { text: 'API Configuration' });
		modelsTab.createEl('p', {
			text: 'Configure the API provider, API keys, and models used for different tasks. These will override the config.yaml defaults.'
		});

		new Setting(modelsTab)
			.setName('API Provider')
			.setDesc('Select which API to use for processing')
			.addDropdown(dropdown => dropdown
				.addOption('openrouter', 'OpenRouter')
				.addOption('openai', 'OpenAI')
				.addOption('ollama', 'Ollama (local)')
				.addOption('together', 'Together AI')
				.addOption('gemini', 'Google Gemini') // Added Gemini
				.setValue(this.plugin.settings.apiProvider)
				.onChange(async (value) => {
					if (value === 'openrouter' || value === 'openai' || value === 'ollama' || value === 'together' || value === 'gemini') {
						this.plugin.settings.apiProvider = value as 'openrouter' | 'openai' | 'ollama' | 'together' | 'gemini';
						await this.plugin.saveSettings();
					}
				}));

		new Setting(modelsTab)
			.setName('OpenRouter API Key')
			.setDesc('API key for OpenRouter (not needed for Ollama)')
			.addText(text => text
				.setPlaceholder('Enter your OpenRouter API key')
				.setValue(this.plugin.settings.openrouterApiKey)
				.onChange(async (value) => {
					this.plugin.settings.openrouterApiKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(modelsTab)
			.setName('OpenAI API Key')
			.setDesc('API key for OpenAI (not needed for Ollama)')
			.addText(text => text
				.setPlaceholder('Enter your OpenAI API key')
				.setValue(this.plugin.settings.openaiApiKey)
				.onChange(async (value) => {
					this.plugin.settings.openaiApiKey = value;
					await this.plugin.saveSettings();
				}));
		
		new Setting(modelsTab)
			.setName('Together AI API Key')
			.setDesc('API key for Together AI (not needed for Ollama)')
			.addText(text => text
				.setPlaceholder('Enter your Together AI API key')
				.setValue(this.plugin.settings.togetherApiKey)
				.onChange(async (value) => {
					this.plugin.settings.togetherApiKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(modelsTab)
			.setName('Gemini API Key')
			.setDesc('API key for Google Gemini (GOOGLE_API_KEY or GEMINI_API_KEY)')
			.addText(text => text
				.setPlaceholder('Enter your Gemini API key')
				.setValue(this.plugin.settings.geminiApiKey)
				.onChange(async (value) => {
					this.plugin.settings.geminiApiKey = value;
					await this.plugin.saveSettings();
				}));

		

		// OpenRouter Model
		new Setting(modelsTab)
			.setName('OpenRouter Model')
			.setDesc('The model to use when OpenRouter is selected')
			.addText(text => text
				.setPlaceholder('e.g., mistralai/mistral-small-3.1-24b-instruct')
				.setValue(this.plugin.settings.openrouterModel.name)
				.onChange(async (value) => {
					this.plugin.settings.openrouterModel.name = value;
					await this.plugin.saveSettings();
				}));

		// OpenAI Model
		new Setting(modelsTab)
			.setName('OpenAI Model')
			.setDesc('The model to use when OpenAI is selected')
			.addText(text => text
				.setPlaceholder('e.g., gpt-4o-mini')
				.setValue(this.plugin.settings.openaiModel.name)
				.onChange(async (value) => {
					this.plugin.settings.openaiModel.name = value;
					await this.plugin.saveSettings();
				}));

		// Ollama Model
		new Setting(modelsTab)
			.setName('Ollama Model')
			.setDesc('The model to use for all Ollama operations (image extraction and text processing)')
			.addText(text => text
				.setPlaceholder('e.g., gemma3:12b')
				.setValue(this.plugin.settings.ollamaModel.name)
				.onChange(async (value) => {
					this.plugin.settings.ollamaModel.name = value;
					await this.plugin.saveSettings();
				}));

		// Together AI Model
		new Setting(modelsTab)
			.setName('Together AI Model')
			.setDesc('The model to use when Together AI is selected (for chat and vision)')
			.addText(text => text
				.setPlaceholder('e.g., meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8')
				.setValue(this.plugin.settings.togetherModel.name)
				.onChange(async (value) => {
					this.plugin.settings.togetherModel.name = value;
					await this.plugin.saveSettings();
				}));

		// Gemini Model
		new Setting(modelsTab)
			.setName('Gemini Model')
			.setDesc('The model to use when Gemini is selected (e.g., gemini-2.5-flash-preview-04-17)')
			.addText(text => text
				.setPlaceholder('e.g., gemini-2.5-flash-preview-04-17')
				.setValue(this.plugin.settings.geminiModel.name)
				.onChange(async (value) => {
					this.plugin.settings.geminiModel.name = value;
					await this.plugin.saveSettings();
				}));

		//=============================================================
		// PROMPT SETTINGS TAB
		//=============================================================
		const promptsTab = tabContentDivs.prompts;

		promptsTab.createEl('h3', { text: 'Prompt Configurations' });
		promptsTab.createEl('p', {
			text: 'Configure the prompts used for different tasks. These will override the config.yaml defaults.'
		});

		// Function to create prompt settings section
		const createPromptSettings = (
			container: HTMLElement,
			title: string,
			description: string,
			promptKey: 'extractTextFromImage' | 'extractMarkdownFromText' | 'extractTocFromMarkdown'
		) => {
			const promptConfig = this.plugin.settings.prompts[promptKey];

			container.createEl('h4', { text: title });
			container.createEl('p', { text: description, cls: 'setting-item-description' });

			// Prompt Text
      new Setting(container)
      .setName('Prompt')
      .setClass('setting-item-advanced')
      .addTextArea((textarea) => { // Type inferred as TextAreaComponent
        textarea
          .setPlaceholder(`Enter prompt for ${title}`)
          .setValue(promptConfig.prompt)
          .onChange(async (value: string) => {
            promptConfig.prompt = value;
            await this.plugin.saveSettings();
          });
        // Set the textarea rows and cols (now available on HTMLTextAreaElement)
        textarea.inputEl.rows = 5;
        textarea.inputEl.cols = 80;
      })
      .setDesc('The prompt to send to the AI model');

			// Temperature
			new Setting(container)
				.setName('Temperature')
				.setClass('setting-item-advanced')
				.addSlider(slider => slider
					.setLimits(0, 2, 0.1)
					.setValue(promptConfig.parameters.temperature)
					.setDynamicTooltip()
					.onChange(async (value) => {
						promptConfig.parameters.temperature = value;
						await this.plugin.saveSettings();
					}))
				.addExtraButton(button => button
					.setIcon('reset')
					.setTooltip('Reset to default')
					.onClick(async () => {
						promptConfig.parameters.temperature = DEFAULT_PROMPT_PARAMETERS.temperature;
						await this.plugin.saveSettings();
						this.display(); // Refresh display
					}));

			// Top P
			new Setting(container)
				.setName('Top P')
				.setClass('setting-item-advanced')
				.addSlider(slider => slider
					.setLimits(0, 1, 0.05)
					.setValue(promptConfig.parameters.top_p)
					.setDynamicTooltip()
					.onChange(async (value) => {
						promptConfig.parameters.top_p = value;
						await this.plugin.saveSettings();
					}))
				.addExtraButton(button => button
					.setIcon('reset')
					.setTooltip('Reset to default')
					.onClick(async () => {
						promptConfig.parameters.top_p = DEFAULT_PROMPT_PARAMETERS.top_p;
						await this.plugin.saveSettings();
						this.display(); // Refresh display
					}));

			// Max Tokens
			new Setting(container)
				.setName('Max Tokens')
				.setClass('setting-item-advanced')
				.addText(text => text
					.setPlaceholder('2048')
					.setValue(String(promptConfig.parameters.max_tokens))
					.onChange(async (value) => {
						const tokens = parseInt(value);
						if (!isNaN(tokens) && tokens > 0) {
							promptConfig.parameters.max_tokens = tokens;
							await this.plugin.saveSettings();
						}
					}))
				.addExtraButton(button => button
					.setIcon('reset')
					.setTooltip('Reset to default')
					.onClick(async () => {
						if (promptKey === 'extractMarkdownFromText') {
							promptConfig.parameters.max_tokens = 8192;
						} else {
							promptConfig.parameters.max_tokens = DEFAULT_PROMPT_PARAMETERS.max_tokens;
						}
						await this.plugin.saveSettings();
						this.display(); // Refresh display
					}));

			// Advanced toggle
			const advancedToggleContainer = container.createDiv();
			let advancedSettingsShown = false;

			const advancedToggle = new Setting(advancedToggleContainer)
				.setName('Show Advanced Parameters')
				.setDesc('Display additional model parameters')
				.addToggle(toggle => toggle
					.setValue(advancedSettingsShown)
					.onChange(value => {
						advancedSettingsShown = value;
						const advancedSettingsEl = container.querySelector('.mdc-advanced-prompt-settings');
						if (advancedSettingsEl) {
							(advancedSettingsEl as HTMLElement).style.display = value ? 'block' : 'none';
						}
					}));

			// Advanced settings container
			const advancedSettings = container.createDiv({ cls: 'mdc-advanced-prompt-settings' });
			advancedSettings.style.display = 'none';
			advancedSettings.style.border = '1px solid var(--background-modifier-border)';
			advancedSettings.style.borderRadius = '4px';
			advancedSettings.style.padding = '0.5rem';
			advancedSettings.style.marginTop = '0.5rem';

			// Frequency Penalty
			new Setting(advancedSettings)
				.setName('Frequency Penalty')
				.setDesc('Penalizes repeated tokens')
				.setClass('setting-item-advanced')
				.addSlider(slider => slider
					.setLimits(0, 2, 0.1)
					.setValue(promptConfig.parameters.frequency_penalty)
					.setDynamicTooltip()
					.onChange(async (value) => {
						promptConfig.parameters.frequency_penalty = value;
						await this.plugin.saveSettings();
					}));

			// Presence Penalty
			new Setting(advancedSettings)
				.setName('Presence Penalty')
				.setDesc('Penalizes repeated topics')
				.setClass('setting-item-advanced')
				.addSlider(slider => slider
					.setLimits(0, 2, 0.1)
					.setValue(promptConfig.parameters.presence_penalty)
					.setDynamicTooltip()
					.onChange(async (value) => {
						promptConfig.parameters.presence_penalty = value;
						await this.plugin.saveSettings();
					}));

			// Top K
			new Setting(advancedSettings)
				.setName('Top K')
				.setDesc('Limits the tokens considered to the top K (0 for no limit)')
				.setClass('setting-item-advanced')
				.addText(text => text
					.setValue(String(promptConfig.parameters.top_k))
					.onChange(async (value) => {
						const topK = parseInt(value);
						if (!isNaN(topK) && topK >= 0) {
							promptConfig.parameters.top_k = topK;
							await this.plugin.saveSettings();
						}
					}));

			// Repetition Penalty
			new Setting(advancedSettings)
				.setName('Repetition Penalty')
				.setDesc('Penalizes repetitions (mainly for Ollama)')
				.setClass('setting-item-advanced')
				.addSlider(slider => slider
					.setLimits(0.5, 2, 0.1)
					.setValue(promptConfig.parameters.repetition_penalty)
					.setDynamicTooltip()
					.onChange(async (value) => {
						promptConfig.parameters.repetition_penalty = value;
						await this.plugin.saveSettings();
					}));

			// Reset All button
			new Setting(advancedSettings)
				.setName('Reset All Parameters')
				.setDesc('Reset all parameters to their default values')
				.addButton(button => button
					.setButtonText('Reset')
					.onClick(async () => {
						let defaultParams = { ...DEFAULT_PROMPT_PARAMETERS };

						// Special case for markdown extraction
						if (promptKey === 'extractMarkdownFromText') {
							defaultParams.max_tokens = 8192;
						}

						// Special case for TOC extraction
						if (promptKey === 'extractTocFromMarkdown') {
							defaultParams.temperature = 0.7;
						}

						promptConfig.parameters = defaultParams;
						await this.plugin.saveSettings();
						this.display(); // Refresh display
					}));

			// Add separator
			container.createEl('hr');
		};

		// Create sections for each prompt type
		createPromptSettings(
			promptsTab,
			'Extract Text from Image',
			'This prompt is used to extract text from rendered presentation images.',
			'extractTextFromImage'
		);

		createPromptSettings(
			promptsTab,
			'Convert Text to Markdown',
			'This prompt is used to convert extracted text into structured Markdown.',
			'extractMarkdownFromText'
		);

		createPromptSettings(
			promptsTab,
			'Generate Table of Contents',
			'This prompt is used to generate a table of contents from extracted headings.',
			'extractTocFromMarkdown'
		);

		// Reset All Prompts button
		new Setting(promptsTab)
			.setName('Reset All to Defaults')
			.setDesc('Reset all prompts and parameters to their default values')
			.addButton(button => button
				.setButtonText('Reset All')
				.setCta()
				.onClick(async () => {
					// Create a modal to confirm reset
					const modal = new Modal(this.app);
					modal.titleEl.setText('Reset All Prompts');
					modal.contentEl.setText('Are you sure you want to reset all prompts and parameters to their default values? This cannot be undone.');

					const buttonContainer = modal.contentEl.createDiv({ cls: 'mdc-button-container' });
					buttonContainer.style.marginTop = '1rem';

					const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
					cancelButton.addEventListener('click', () => modal.close());

					const confirmButton = buttonContainer.createEl('button', { text: 'Reset All', cls: 'mod-warning' });
					confirmButton.addEventListener('click', async () => {
						this.plugin.settings.prompts = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.prompts));
						await this.plugin.saveSettings();
						this.display(); // Refresh display
						modal.close();

						new Notice('All prompts have been reset to default values');
					});

					modal.open();
				}));

		
	}
}

      
  const osStyle = document.createElement('style');
  osStyle.textContent = `
      .mdc-os-tab.active {
        border-bottom: 2px solid var(--interactive-accent) !important;
        font-weight: bold;
      }
      
      .mdc-installation-guide-header {
        background: var(--background-secondary);
      }
      
      .mdc-installation-guide-title {
        color: var(--text-normal);
      }
      
      .mdc-installation-guide-icon {
        color: var(--text-muted);
        font-size: 0.8em;
      }
      
      .mdc-os-content {
        margin-top: 1rem;
      }
      
      .mdc-os-content pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-all;
      }
    `;
  document.head.appendChild(osStyle);

  //=============================================================
  // PROCESSING OPTIONS TAB
  //=============================================================

      
  //=============================================================
  // PROCESSING OPTIONS TAB
  //=============================================================
