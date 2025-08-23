import { App, PluginSettingTab, Setting, Modal, Notice } from 'obsidian';
import type MDCIntegrationPlugin from './plugin'; // Use type import
import { DEFAULT_PROMPT_PARAMETERS, DEFAULT_SETTINGS, OpenAICompatibleProvider } from './types'; // Import defaults from types
import { v4 as uuidv4 } from 'uuid';

class ProviderModal extends Modal {
    provider: OpenAICompatibleProvider;
    onSave: (provider: OpenAICompatibleProvider) => void;
    isNew: boolean;

    constructor(app: App, provider: OpenAICompatibleProvider | null, onSave: (provider: OpenAICompatibleProvider) => void) {
        super(app);
        this.isNew = provider === null;
        this.provider = provider || { id: uuidv4(), name: '', apiKey: '', baseURL: '', model: '', requestsPerMinute: 60 };
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        this.titleEl.setText(this.isNew ? 'Add Custom Provider' : 'Edit Custom Provider');

        new Setting(contentEl)
            .setName('Provider Name')
            .setDesc('A unique name for this provider configuration.')
            .addText(text => text
                .setPlaceholder('e.g., My Local LLM')
                .setValue(this.provider.name)
                .onChange(value => this.provider.name = value));

        new Setting(contentEl)
            .setName('API Key')
            .setDesc('The API key for this provider.')
            .addText(text => text
                .setPlaceholder('Enter API Key')
                .setValue(this.provider.apiKey)
                .onChange(value => this.provider.apiKey = value));

        new Setting(contentEl)
            .setName('Base URL')
            .setDesc('The base URL of the OpenAI-compatible API.')
            .addText(text => text
                .setPlaceholder('http://localhost:8080/v1')
                .setValue(this.provider.baseURL)
                .onChange(value => this.provider.baseURL = value));

        new Setting(contentEl)
            .setName('Model Name')
            .setDesc('The specific model to use with this provider.')
            .addText(text => text
                .setPlaceholder('e.g., gpt-4o-mini')
                .setValue(this.provider.model)
                .onChange(value => this.provider.model = value));
        
        new Setting(contentEl)
            .setName('Requests per Minute')
            .setDesc('The maximum number of API calls to make per minute.')
            .addSlider(slider => slider
                .setLimits(1, 300, 1)
                .setValue(this.provider.requestsPerMinute)
                .setDynamicTooltip()
                .onChange(value => this.provider.requestsPerMinute = value));

        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Save')
                .setCta()
                .onClick(() => {
                    if (this.provider.name && this.provider.baseURL && this.provider.model) {
                        this.onSave(this.provider);
                        this.close();
                    } else {
                        new Notice('Please fill in all required fields: Provider Name, Base URL, and Model Name.');
                    }
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}


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

		// Setup main layout
		const mainLayout = containerEl.createDiv({ cls: 'mdc-settings-layout' });
		const tabsContainer = mainLayout.createDiv({ cls: 'mdc-settings-tabs' });
		const tabContents = mainLayout.createDiv({ cls: 'mdc-settings-tab-contents' });

		// Create tabs
		const tabs = [
			{ id: 'models', label: 'API Configuration' },
			{ id: 'processing', label: 'Processing Options' },
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
				Object.values(tabButtons).forEach(btn => btn.removeClass('active'));
				tabButton.addClass('active');

				Array.from(tabContents.children).forEach(el => {
					if (el instanceof HTMLElement) {
						el.style.display = el.getAttribute('data-tab-content') === tab.id ? 'block' : 'none';
					}
				});
			});
		});

		// Create tab content containers
		const tabContentDivs: Record<string, HTMLElement> = {};
		tabs.forEach(tab => {
			const contentDiv = tabContents.createDiv({
				cls: 'mdc-settings-tab-content',
				attr: { 'data-tab-content': tab.id },
			});
			tabContentDivs[tab.id] = contentDiv;
			contentDiv.style.display = 'none';
		});

		// Activate first tab by default
		tabButtons.models.addClass('active');
		tabContentDivs.models.style.display = 'block';

		// Add CSS for layout and active tab
        const style = document.head.querySelector('style#mdc-settings-styles');
        if (style) style.remove(); // Avoid duplicating styles
		const newStyle = document.createElement('style');
        newStyle.id = 'mdc-settings-styles';
		newStyle.textContent = `
            .mdc-settings-layout { display: flex; }
            .mdc-settings-tabs { display: flex; flex-direction: column; width: 200px; flex-shrink: 0; margin-right: 2rem; }
            .mdc-settings-tab { padding: 0.75rem 1rem; border: none; background: none; cursor: pointer; border-right: 2px solid transparent; text-align: left; }
            .mdc-settings-tab.active { border-right-color: var(--interactive-accent); font-weight: 600; background-color: var(--background-modifier-hover); }
            .mdc-settings-tab-content { flex-grow: 1; }
            .setting-item-advanced { margin-left: 1.5rem; }
            .custom-provider-list-item { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border-bottom: 1px solid var(--background-modifier-border); }
        `;
		document.head.appendChild(newStyle);

		//=============================================================
		// API CONFIGURATION TAB
		//=============================================================
		const modelsTab = tabContentDivs.models;
		this.renderApiConfigTab(modelsTab);

		//=============================================================
		// PROCESSING OPTIONS TAB
		//=============================================================
		const processingTab = tabContentDivs.processing;
		this.renderProcessingTab(processingTab);

		//=============================================================
		// PROMPT SETTINGS TAB
		//=============================================================
		const promptsTab = tabContentDivs.prompts;
		this.renderPromptsTab(promptsTab);
        
		//=============================================================
		// BASIC SETTINGS TAB
		//=============================================================
		const basicTab = tabContentDivs.basic;
        this.renderBasicTab(basicTab);
	}

    renderApiConfigTab(container: HTMLElement) {
        container.empty();

		new Setting(container)
			.setName('API Provider')
			.setDesc('Select which API to use for processing')
			.addDropdown(dropdown => {
                const defaultProviders = {
                    'openai': 'OpenAI',
                    'openrouter': 'OpenRouter',
                    'together': 'Together AI',
                    'gemini': 'Google Gemini',
                    'ollama': 'Ollama (local)',
                    'fireworks': 'Fireworks AI',
                };
                Object.entries(defaultProviders).forEach(([value, label]) => {
                    dropdown.addOption(value, label);
                });

                this.plugin.settings.customOpenAIProviders.forEach(provider => {
                    dropdown.addOption(provider.id, `${provider.name} (Custom)`);
                });

				dropdown.setValue(this.plugin.settings.apiProvider)
				.onChange(async (value) => {
                    this.plugin.settings.apiProvider = value;
					await this.plugin.saveSettings();
                    this.renderApiConfigTab(container); // Re-render to show relevant settings
				});
            });

        // Show API key fields based on selected provider
        const provider = this.plugin.settings.apiProvider;
        if (provider === 'openai') {
            new Setting(container)
                .setName('OpenAI API Key')
                .addText(text => text.setValue(this.plugin.settings.openaiApiKey).onChange(async val => {
                    this.plugin.settings.openaiApiKey = val; await this.plugin.saveSettings();
                }));
        } else if (provider === 'openrouter') {
            new Setting(container)
                .setName('OpenRouter API Key')
                .addText(text => text.setValue(this.plugin.settings.openrouterApiKey).onChange(async val => {
                    this.plugin.settings.openrouterApiKey = val; await this.plugin.saveSettings();
                }));
        } else if (provider === 'together') {
            new Setting(container)
                .setName('Together AI API Key')
                .addText(text => text.setValue(this.plugin.settings.togetherApiKey).onChange(async val => {
                    this.plugin.settings.togetherApiKey = val; await this.plugin.saveSettings();
                }));
        } else if (provider === 'gemini') {
            new Setting(container)
                .setName('Gemini API Key')
                .addText(text => text.setValue(this.plugin.settings.geminiApiKey).onChange(async val => {
                    this.plugin.settings.geminiApiKey = val; await this.plugin.saveSettings();
                }));
        } else if (provider === 'fireworks') {
            new Setting(container)
                .setName('Fireworks API Key')
                .addText(text => text.setValue(this.plugin.settings.fireworksApiKey).onChange(async val => {
                    this.plugin.settings.fireworksApiKey = val; await this.plugin.saveSettings();
                }));
        }
        
        // Rate Limiting
        if (provider === 'openai' || this.plugin.settings.customOpenAIProviders.some(p => p.id === provider)) {
            new Setting(container)
                .setName('Requests per Minute')
                .setDesc('The maximum number of API calls to make per minute.')
                .addSlider(slider => slider
                    .setLimits(1, 300, 1)
                    .setValue(this.plugin.settings.requestsPerMinute)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.requestsPerMinute = value;
                        await this.plugin.saveSettings();
                    }));
        }
        
        // Show model name fields
        new Setting(container).setName('Model Configuration').setHeading();
        
        if (provider === 'openai') {
            new Setting(container).setName('OpenAI Model').addText(text => text.setValue(this.plugin.settings.openaiModel.name).onChange(async val => { this.plugin.settings.openaiModel.name = val; await this.plugin.saveSettings(); }));
        } else if (provider === 'openrouter') {
            new Setting(container).setName('OpenRouter Model').addText(text => text.setValue(this.plugin.settings.openrouterModel.name).onChange(async val => { this.plugin.settings.openrouterModel.name = val; await this.plugin.saveSettings(); }));
        } else if (provider === 'together') {
            new Setting(container).setName('Together AI Model').addText(text => text.setValue(this.plugin.settings.togetherModel.name).onChange(async val => { this.plugin.settings.togetherModel.name = val; await this.plugin.saveSettings(); }));
        } else if (provider === 'gemini') {
            new Setting(container).setName('Gemini Model').addText(text => text.setValue(this.plugin.settings.geminiModel.name).onChange(async val => { this.plugin.settings.geminiModel.name = val; await this.plugin.saveSettings(); }));
        } else if (provider === 'ollama') {
            new Setting(container).setName('Ollama Model').addText(text => text.setValue(this.plugin.settings.ollamaModel.name).onChange(async val => { this.plugin.settings.ollamaModel.name = val; await this.plugin.saveSettings(); }));
        } else if (provider === 'fireworks') {
            new Setting(container).setName('Fireworks AI Model').addText(text => text.setValue(this.plugin.settings.fireworksModel.name).onChange(async val => { this.plugin.settings.fireworksModel.name = val; await this.plugin.saveSettings(); }));
        }


        // Custom OpenAI-Compatible Providers
        new Setting(container)
            .setName('Custom OpenAI-Compatible Providers')
            .setHeading();

        const providerListEl = container.createDiv('custom-provider-list');
        this.plugin.settings.customOpenAIProviders.forEach((provider, index) => {
            const itemEl = providerListEl.createDiv('custom-provider-list-item');
            itemEl.createSpan({ text: provider.name });
            const controlsEl = itemEl.createDiv();

            new Setting(controlsEl)
                .addButton(button => button
                    .setButtonText('Edit')
                    .onClick(() => {
                        new ProviderModal(this.app, provider, async (updatedProvider) => {
                            this.plugin.settings.customOpenAIProviders[index] = updatedProvider;
                            await this.plugin.saveSettings();
                            this.renderApiConfigTab(container);
                        }).open();
                    }))
                .addButton(button => button
                    .setButtonText('Delete')
                    .setWarning()
                    .onClick(async () => {
                        this.plugin.settings.customOpenAIProviders.splice(index, 1);
                        await this.plugin.saveSettings();
                        this.renderApiConfigTab(container);
                    }));
        });

        new Setting(container)
            .addButton(button => button
                .setButtonText('Add Custom Provider')
                .setCta()
                .onClick(() => {
                    new ProviderModal(this.app, null, async (newProvider) => {
                        this.plugin.settings.customOpenAIProviders.push(newProvider);
                        await this.plugin.saveSettings();
                        this.renderApiConfigTab(container);
                    }).open();
                }));
    }

    renderProcessingTab(container: HTMLElement) {
        container.empty();
  new Setting(container)
   .setName('Verbose Output')
   .setDesc('Enable verbose output, creating intermediate files as process_output directory.')
   .addToggle(toggle => toggle
    .setValue(this.plugin.settings.verboseOutput)
    .onChange(async (value) => {
    	this.plugin.settings.verboseOutput = value;
    	await this.plugin.saveSettings();
    }));

  new Setting(container)
   .setName('Extract Attachments')
   .setDesc('Extract and process attachment images')
   .addToggle(toggle => toggle
    .setValue(this.plugin.settings.extractAttachments)
    .onChange(async (value) => {
    	this.plugin.settings.extractAttachments = value;
    	await this.plugin.saveSettings();
    }));

  new Setting(container)
   .setName('Generate Table of Contents')
   .setDesc('Create a table of contents from headings')
   .addToggle(toggle => toggle
    .setValue(this.plugin.settings.generateToc)
    .onChange(async (value) => {
    	this.plugin.settings.generateToc = value;
    	await this.plugin.saveSettings();
    }));

  new Setting(container)
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

  new Setting(container)
   .setName('Update Headings')
   .setDesc('Update heading hierarchy in the generated Markdown')
   .addToggle(toggle => toggle
    .setValue(this.plugin.settings.updateHeadings)
    .onChange(async (value) => {
    	this.plugin.settings.updateHeadings = value;
    	await this.plugin.saveSettings();
    }));
  new Setting(container)
   .setName('Use AI for Heading Restructuring (RAG)')
   .setDesc('When enabled, uses a more advanced AI workflow with full document context to determine heading hierarchy. When disabled, uses the older TOC-based method.')
   .addToggle(toggle => toggle
    .setValue(this.plugin.settings.useAiForHeadings)
    .onChange(async (value) => {
    	this.plugin.settings.useAiForHeadings = value;
    	await this.plugin.saveSettings();
    }));

  new Setting(container)
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

  // Artifact Detection Settings
  new Setting(container)
   .setName('AI-Powered Artifact Detection')
   .setHeading();

  new Setting(container)
   .setName('Enable Artifact Detection')
   .setDesc('Use AI to detect and filter out low-value images (artifacts) before text extraction')
   .addToggle(toggle => toggle
    .setValue(this.plugin.settings.artifactDetection.enabled)
    .onChange(async (value) => {
    	this.plugin.settings.artifactDetection.enabled = value;
    	await this.plugin.saveSettings();
    }));

  new Setting(container)
   .setName('Confidence Threshold')
   .setDesc('Minimum confidence score (0.0-1.0) to classify an image as an artifact')
   .addSlider(slider => slider
    .setLimits(0, 1, 0.05)
    .setValue(this.plugin.settings.artifactDetection.confidenceThreshold)
    .setDynamicTooltip()
    .onChange(async (value) => {
    	this.plugin.settings.artifactDetection.confidenceThreshold = value;
    	await this.plugin.saveSettings();
    }));

  new Setting(container)
   .setName('Max Concurrent Requests')
   .setDesc('Maximum number of concurrent artifact detection requests')
   .addSlider(slider => slider
    .setLimits(1, 10, 1)
    .setValue(this.plugin.settings.artifactDetection.maxConcurrentRequests)
    .setDynamicTooltip()
    .onChange(async (value) => {
    	this.plugin.settings.artifactDetection.maxConcurrentRequests = value;
    	await this.plugin.saveSettings();
    }));

  new Setting(container)
   .setName('Request Timeout (ms)')
   .setDesc('Timeout for artifact detection requests in milliseconds')
   .addText(text => text
    .setPlaceholder('30000')
    .setValue(String(this.plugin.settings.artifactDetection.requestTimeout))
    .onChange(async (value) => {
    	const timeout = parseInt(value);
    	if (!isNaN(timeout) && timeout > 0) {
    		this.plugin.settings.artifactDetection.requestTimeout = timeout;
    		await this.plugin.saveSettings();
    	}
    }));

  new Setting(container)
   .setName('Retry Failed Requests')
   .setDesc('Automatically retry failed artifact detection requests')
   .addToggle(toggle => toggle
    .setValue(this.plugin.settings.artifactDetection.retryFailedRequests)
    .onChange(async (value) => {
    	this.plugin.settings.artifactDetection.retryFailedRequests = value;
    	await this.plugin.saveSettings();
    }));

  new Setting(container)
   .setName('Max Retry Attempts')
   .setDesc('Maximum number of retry attempts for failed requests')
   .addSlider(slider => slider
    .setLimits(1, 5, 1)
    .setValue(this.plugin.settings.artifactDetection.maxRetryAttempts)
    .setDynamicTooltip()
    .onChange(async (value) => {
    	this.plugin.settings.artifactDetection.maxRetryAttempts = value;
    	await this.plugin.saveSettings();
    }));

  new Setting(container)
   .setName('Retry Delay (ms)')
   .setDesc('Delay between retry attempts in milliseconds')
   .addText(text => text
    .setPlaceholder('1000')
    .setValue(String(this.plugin.settings.artifactDetection.retryDelay))
    .onChange(async (value) => {
    	const delay = parseInt(value);
    	if (!isNaN(delay) && delay >= 0) {
    		this.plugin.settings.artifactDetection.retryDelay = delay;
    		await this.plugin.saveSettings();
    	}
    }));

  // Logging Settings
  new Setting(container)
   .setName('Logging Settings')
   .setHeading();

  new Setting(container)
   .setName('Log Individual Results')
   .setDesc('Log detailed results for each image analyzed')
   .addToggle(toggle => toggle
    .setValue(this.plugin.settings.artifactDetection.logIndividualResults)
    .onChange(async (value) => {
    	this.plugin.settings.artifactDetection.logIndividualResults = value;
    	await this.plugin.saveSettings();
    }));

  new Setting(container)
   .setName('Log Summary Statistics')
   .setDesc('Log summary statistics after processing all images')
   .addToggle(toggle => toggle
    .setValue(this.plugin.settings.artifactDetection.logSummaryStatistics)
    .onChange(async (value) => {
    	this.plugin.settings.artifactDetection.logSummaryStatistics = value;
    	await this.plugin.saveSettings();
    }));

  new Setting(container)
   .setName('Save Detailed Results')
   .setDesc('Save detailed artifact detection results to a JSON file')
   .addToggle(toggle => toggle
    .setValue(this.plugin.settings.artifactDetection.saveDetailedResults)
    .onChange(async (value) => {
    	this.plugin.settings.artifactDetection.saveDetailedResults = value;
    	await this.plugin.saveSettings();
    }));

  new Setting(container)
   .setName('Results File Path')
   .setDesc('Path where detailed results will be saved')
   .addText(text => text
    .setPlaceholder('./artifact_detection_results.json')
    .setValue(this.plugin.settings.artifactDetection.resultsFilePath)
    .onChange(async (value) => {
    	this.plugin.settings.artifactDetection.resultsFilePath = value;
    	await this.plugin.saveSettings();
    }));
   }

    renderPromptsTab(container: HTMLElement) {
        container.empty();
  container.createEl('h3', { text: 'Prompt Configurations' });
  container.createEl('p', {
   text: 'Configure the prompts used for different tasks. These will override the config.yaml defaults.'
  });

  const disclaimer = container.createEl('p', { cls: 'setting-item-description' });
  disclaimer.innerHTML = `<strong>Note:</strong> Support for advanced parameters (e.g., penalties, Top K) may vary across different AI models and API providers. When using a custom OpenAI-compatible provider, please consult its documentation for compatibility details.`;

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
        // Set the textarea rows and make it responsive
        textarea.inputEl.rows = 5;
        textarea.inputEl.style.width = '100%';
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
   container,
   'Extract Text from Image',
   'This prompt is used to extract text from rendered presentation images.',
   'extractTextFromImage'
  );

  createPromptSettings(
   container,
   'Convert Text to Markdown',
   'This prompt is used to convert extracted text into structured Markdown.',
   'extractMarkdownFromText'
  );

  createPromptSettings(
   container,
   'Generate Table of Contents',
   'This prompt is used to generate a table of contents from extracted headings.',
   'extractTocFromMarkdown'
  );

  // Reset All Prompts button
  new Setting(container)
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
    
    renderBasicTab(container: HTMLElement) {
        container.empty();
  new Setting(container)
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

  new Setting(container)
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

  new Setting(container)
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
  new Setting(container)
   .setName('PDF Tools Paths')
   .setDesc('Paths to the poppler-utils executables needed for PDF processing')
   .setHeading();

  new Setting(container)
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

  new Setting(container)
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

  new Setting(container)
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
    }
}
