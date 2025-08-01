import { App, Modal, Notice } from 'obsidian';
import type MDCIntegrationPlugin from './plugin'; // Use type import

export class FileSelectionModal extends Modal {
	plugin: MDCIntegrationPlugin;
	filePath: string = '';

	constructor(app: App, plugin: MDCIntegrationPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Select document to convert' });

		contentEl.createEl('p', {
			text: 'Select a document file (PPTX, PPT, PPSX, PDF, DOC, DOCX) to convert to Markdown.'
		});

		// File input (note: this only works on desktop Obsidian)
		const fileInput = contentEl.createEl('input', {
			attr: {
				type: 'file',
				accept: '.pptx,.ppt,.ppsx,.pdf,.doc,.docx'
			}
		});

		fileInput.addEventListener('change', (event) => {
			const target = event.target as HTMLInputElement;
			if (target.files && target.files.length > 0) {
				// @ts-ignore - access native file path
				this.filePath = target.files[0].path;
				// Clear previous selection message if any
				const existingSelection = contentEl.querySelector('.mdc-selected-file');
				if (existingSelection) {
					existingSelection.remove();
				}
				contentEl.createEl('p', {
					text: `Selected: ${this.filePath}`,
					cls: 'mdc-selected-file'
				});
			}
		});

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'button-container' });
		buttonContainer.style.marginTop = '1rem'; // Add some spacing

		const convertButton = buttonContainer.createEl('button', {
			text: 'Convert',
			cls: 'mod-cta'
		});
		convertButton.style.marginRight = '0.5rem'; // Add spacing between buttons

		convertButton.addEventListener('click', async () => {
			if (!this.filePath) {
				new Notice('Please select a file to convert.');
				return;
			}

			new Notice('Starting conversion. This may take several minutes.');

			try {
				this.close();
				await this.plugin.runMDCTool(this.filePath);
				new Notice('Conversion completed successfully.');
			} catch (error) {
				console.error('Conversion error:', error);
				new Notice(`Conversion failed: ${error instanceof Error ? error.message : String(error)}`);
			}
		});

		const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelButton.addEventListener('click', () => {
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
