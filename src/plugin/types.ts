// Interface definitions
export interface MDCModelSettings {
	name: string;
}

export interface OpenAICompatibleProvider {
	id: string;
	name: string;
	apiKey: string;
	baseURL: string;
	model: string;
}

export interface MDCPromptParameters {
	temperature: number;
	top_p: number;
	frequency_penalty: number;
	presence_penalty: number;
	repetition_penalty: number;
	top_k: number;
	max_tokens: number;
}

export interface MDCPromptConfig {
	prompt: string;
	parameters: MDCPromptParameters;
}

export interface MDCPluginSettings {
	// Basic settings
	nodePath: string;
	cliPath: string;
	configPath: string;
	libreOfficePath: string;
	pdfimagesPath: string;  // New setting for pdfimages
	pdfinfoPath: string;    // New setting for pdfinfo
	pdftocairoPath: string; // New setting for pdftocairo
	apiProvider: string;
	openrouterApiKey: string; // Separate API key for OpenRouter
	openaiApiKey: string;     // Separate API key for OpenAI
	togetherApiKey: string;   // API key for Together AI
	geminiApiKey: string;     // API key for Gemini

	

	// Processing options
	extractAttachments: boolean;
	generateToc: boolean;
	tokenLimit: number;
	updateHeadings: boolean;
	identicalImageThreshold: number; // New setting
	verboseOutput: boolean; // New setting for verbose output

	// Model configurations
	openrouterModel: MDCModelSettings;
	openaiModel: MDCModelSettings;
	ollamaModel: MDCModelSettings;
	togetherModel: MDCModelSettings; // Added for Together AI
	geminiModel: MDCModelSettings;   // Added for Gemini

	// Custom OpenAI-compatible providers
	customOpenAIProviders: OpenAICompatibleProvider[];

	// Prompt configurations
	prompts: {
		extractTextFromImage: MDCPromptConfig;
		extractMarkdownFromText: MDCPromptConfig;
		extractTocFromMarkdown: MDCPromptConfig;
	};
}

export const DEFAULT_PROMPT_PARAMETERS: MDCPromptParameters = {
	temperature: 0.1,
	top_p: 0.95,
	frequency_penalty: 0,
	presence_penalty: 0,
	repetition_penalty: 1,
	top_k: 0,
	max_tokens: 2048
};

export const DEFAULT_SETTINGS: MDCPluginSettings = {
	// Basic settings
	nodePath: '/opt/homebrew/bin/node', // Default for macOS
	cliPath: '',
	configPath: '',
	libreOfficePath: '/Applications/LibreOffice.app/Contents/MacOS/soffice', // Default for macOS
	pdfimagesPath: '/usr/local/bin/pdfimages', // Default for macOS with Homebrew
	pdfinfoPath: '/usr/local/bin/pdfinfo', // Default for macOS with Homebrew
	pdftocairoPath: '/usr/local/bin/pdftocairo', // Default for macOS with Homebrew
	apiProvider: 'openrouter',
	openrouterApiKey: '',
	openaiApiKey: '',
	togetherApiKey: '', // Added for Together AI
	geminiApiKey: '',   // Added for Gemini

	

	// Processing options
	extractAttachments: true,
	generateToc: true,
	tokenLimit: 4000,
	updateHeadings: true,
	identicalImageThreshold: 3, // Default value for new setting
	verboseOutput: false, // Default for verbose output

	// Model configurations
	openrouterModel: { name: "mistralai/mistral-small-3.1-24b-instruct" },
	openaiModel: { name: "gpt-4o-mini" },
	ollamaModel: { name: "gemma3:12b" },
	togetherModel: { name: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8" }, // Default Together AI model
	geminiModel: { name: "gemini-2.5-flash-preview-04-17" }, // Default Gemini model

	customOpenAIProviders: [],

	// Prompt configurations
	prompts: {
		extractTextFromImage: {
			prompt: "Please extract all visible text from the provided image and format it into Markdown.\n      Follow these guidelines strictly:\n\n      1. **Headings**:\n        - If a title is present, format it using `#####` (e.g., `##### Title`).\n\n      2. **Text Styling**:\n        - Use bullet points and numbered lists where applicable.\n        - Use `**bold**` for text that should appear blue.\n        - Use `*italics*` for text that should appear green.\n        - Use `***bold/italics***` for text that should appear red.\n\n      3. **Markdown Syntax**:\n        - Do not use code blocks.\n\n      4. **General Instructions**:\n        - Maintain the original structure and hierarchy of the text as it appears in the image.\n        - Ensure that all extracted text is accurately represented.",
      		parameters: { ...DEFAULT_PROMPT_PARAMETERS }
		},
		extractMarkdownFromText: {
			prompt: "Convert the provided content into a detailed, hierarchical Markdown format optimized for Obsidian. \n      Ensure that every element—including text, images, diagrams, and footnotes—is accurately represented and organized. \n      Follow these guidelines strictly:\n\n      ### 1. Content Integrity\n      - **Preservation and Text Formatting**:\n        - Maintain the original structure and hierarchy of the source content for accuracy.\n        - Use `**bold**`, `*italics*`, and `***bold/italics***` to emphasize key points as appropriate.\n\n      - **Referenced Attachments**:\n        - Place image references side by side using the format `![[attachments/image1.webp]]`.\n        - Use clear and descriptive filenames for all attachments to enhance clarity and searchability.\n\n      - **Lists and Tables**:\n        - Preserve the original structure of lists, tables, and other formatted elements from the source content.\n\n      - **Consistency**:\n        - Maintain consistent formatting throughout the document for a professional and cohesive appearance.\n\n      ### 2. Completeness and Accuracy\n      - **Comprehensive Inclusion**:\n        - Ensure that all relevant content from the source—whether text, images, diagrams, or footnotes—is included in the Markdown output.\n\n      - **Accuracy**:\n        - Verify that the hierarchy, formatting, and linking accurately represent the original content without omissions or distortions.\n\n      ### 3. Headings Hierarchy\n      - **Levels**:\n        - Major Topic: `#`\n        - Main Categories: `##`\n        - Subcategories: `###`\n        - Sub-Subcategories: `####`\n        - Continue up to `######` for deeper levels as necessary.\n\n      - **Best Practices**:\n        - **Avoid Overuse**: Introduce a new heading level only when there's a meaningful division in content.\n        - **Aesthetic Structure**: Ensure the hierarchy is logical and visually pleasing to facilitate easy navigation.\n\n      - **Avoid Overuse**:\n        - Refrain from using `---` separators for minor divisions or within closely related content sections.",
      		parameters: { ...DEFAULT_PROMPT_PARAMETERS, max_tokens: 8192 }
		},
		extractTocFromMarkdown: {
			prompt: " Create a comprehensive and organized Table of Contents (TOC) for the topic \"{base_filename}\" based on the provided Markdown headings.\n\n      **Required TOC Format:**\n      ## Table of Contents\n      - Main Heading 1\n        - Subheading 1.1\n        - Subheading 1.2\n      - Main Heading 2\n        - Subheading 2.1\n        - Subheading 2.2\n          - Sub-subheading 2.2.1\n\n      **Critical Formatting Rules:**\n      1. **Exact Text Matching**: Use the EXACT same text as provided in the headings - do not modify, rephrase, or normalize the text in any way\n      2. **Hierarchy**: Use 2 spaces per indentation level for subheadings\n      3. **Bullet Points**: Use hyphens (-) for all bullet points, no asterisks (*) or plus signs (+)\n      4. **No Extra Text**: Do not add any explanatory text, word counts, or additional formatting\n      5. **Case Sensitivity**: Preserve original case exactly as provided\n      6. **Special Characters**: Include all special characters, numbers, and punctuation exactly as in the original headings\n\n      **Structure Guidelines:**\n      1. Start with `## Table of Contents` header\n      2. Create a hierarchical bullet list that mirrors the logical structure\n      3. Each indentation level represents one level deeper in the hierarchy\n      4. Only include headings that have meaningful content (skip empty sections)\n\n      **Example with Heart Content:**\n      ## Table of Contents\n      - THE HEART OF THE MATTER\n        - Structure and Function of the Heart\n          - 5 INTERESTING FACTS ABOUT THE HEART\n          - Functions of the Heart\n          - ANATOMY OF THE HEART\n          - Four Chambers of the Heart\n          - Heart Structures\n            - ATRIA\n            - SEPTUM\n            - VENTRICLES\n          - Valves\n          - Flow of Blood\n            - Step 1\n            - Step 2\n          - Flow of Blood in Action\n\n      **Input Headings - Use EXACTLY as provided:**\n      {extracted_headings_text}",
		    		parameters: { ...DEFAULT_PROMPT_PARAMETERS, temperature: 0.3 }
		}
	}
};
