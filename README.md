# MDC - Markdown Document Converter

AI-powered tool that converts presentations, documents, and files to Markdown format. Extract content from PowerPoint, PDF, Word, and other document types using advanced AI text extraction and conversion technology.

## What is MDC?

MDC (Markdown Document Converter) is a powerful AI-driven tool that extracts content from presentations (PowerPoint, PPTX, PPT, PPSX), documents (PDF, DOC, DOCX), and other file formats and converts them into clean, organized Markdown files. It leverages advanced AI models to turn images into text, automatically organize headings and images, generate comprehensive table of contents, and maintain document structure during conversion.


## Preview
<img width="2117" height="1554" alt="preview" src="https://github.com/user-attachments/assets/6c0e3291-db74-47ef-9230-fa8dec275280" />




MDC extracts content from presentations (PowerPoint, PPTX, PPT, PPSX), documents (PDF, DOC, DOCX), and other file formats and converts them into clean, organized Markdown files. It leverages advanced AI models to turn images into text, automatically organize headings and images, generate comprehensive table of contents, and maintain document structure during conversion.

### Key Features

- **Multi-format Support**: Convert PowerPoint presentations, PDF documents, Word files, and more
- **AI-Powered Extraction**: Use OpenAI, Gemini, Ollama, Together, or OpenRouter APIs for intelligent text extraction
- **Image Processing**: Automatically extract and convert images to text using AI vision models
- **Smart Organization**: Automatically detect and organize headings, create table of contents (work in progress)
- **Attachment Support**: Extract and process embedded files and media
- **Customizable**: Configure API settings, processing parameters, and output formats
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **Obsidian Integration**: Available as a plugin for Obsidian knowledge management

## Quick Install Guide

### Prerequisites

**System Requirements:**
- Node.js (18+)
- Poppler-utils (for PDF processing)
- LibreOffice (for document conversions)
- Internet connection for AI API access

**Install commands:**

**Windows:**
```bash
# Install Node.js
winget install OpenJS.NodeJS.LTS

# Install Poppler
choco install poppler

# Install LibreOffice
winget install TheDocumentFoundation.LibreOffice
```

**macOS:**
```bash
# Install Node.js
brew install node

# Install Poppler
brew install poppler

# Install LibreOffice
brew install --cask libreoffice
```

**Linux (Ubuntu/Debian):**
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Poppler and LibreOffice
sudo apt install poppler-utils libreoffice
```

### Installation Methods

#### Method A: Global CLI Installation

```bash
# Clone the repository
git clone https://github.com/dralkh/mdc.git
cd mdc

# Install dependencies and build
npm install && npm run build-all

# Install system-wide (makes mdc command available globally)
npm link

# Verify installation
mdc --version
```

#### Method B: Obsidian Plugin Installation

```bash
# Install and test obsidian plugin
npm run install-plugin

# Install plugin to specific directory (non-interactive)
npm run install-plugin -- --d "/path/to/obsidian/plugins"
# or
npm run install-plugin -- --directory "/path/to/obsidian/plugins"
```

#### Method C: Local Development Setup

```bash
# For development without global installation
npm install && npm run build-all
# Use via npm script: npm run mdc -- "file.pptx" --md
```

### Configure AI API Access

MDC supports multiple AI providers. Choose one or more for your conversion needs.

#### Setup API Keys

Create a `.env` file in the project folder by copying the example:

```bash
cp .env.example .env
```

Then, edit the `.env` file to add your API keys:

```env
# OpenRouter (Recommended - supports multiple models)
OPENROUTER_API_KEY=your_openrouter_key_here

# OpenAI (GPT-4, GPT-3.5)
OPENAI_API_KEY=your_openai_key_here

# Google Gemini
GEMINI_API_KEY=your_gemini_key_here

# Together AI
TOGETHER_API_KEY=your_together_key_here

# Ollama (Local models)
OLLAMA_API_KEY=your_ollama_key_here

# OpenAI-Compatible API (Optional)
# Use this to connect to a custom or local OpenAI-compatible API endpoint
MDC_OPENAI_BASE_URL=http://localhost:8080/v1
```

#### Supported AI Models
Ensure the model supports vision and text


## Basic Usage

MDC provides flexible command-line interface for converting various document formats to Markdown.

### Quick Start Examples

```bash
# Convert PowerPoint to Markdown (most common use)
npm run mdc -- "presentation.pptx" --md --api openrouter

# Convert PDF to Markdown
npm run mdc -- "document.pdf" --md --api openrouter

# Convert Word document to Markdown
npm run mdc -- "document.docx" --md --api openrouter

# Include images/attachments
npm run mdc -- "presentation.pptx" --md --ma --api openrouter

# Generate table of contents
npm run mdc -- "document.pdf" --md --table --api openrouter

# Convert with custom API key
npm run mdc -- "file.pptx" --md --api openai --api-key "your-key"
```

### Advanced Usage Patterns

```bash
# Batch conversion of multiple files
for file in *.pptx; do
  npm run mdc -- "$file" --md --api openrouter
done

# Convert with verbose output for debugging
npm run mdc -- "complex.pdf" --md --verbose --api openrouter

# Use custom configuration
npm run mdc -- "document.docx" --md --config "./custom-config.yaml" --api gemini
```

## Command Line Options

### Input Arguments
- `input-file` - Path to the input file (supports: PPTX, PPT, PPSX, PDF, DOC, DOCX)

### Output Options
- `-V, --version` - Output the version number and exit
- `--md` - Convert the extracted content into a Markdown (.md) file
- `--mr` - Minimal output mode (only extract basefilename_markdown_text.md)
- `--table` - Include a table of contents in the generated markdown
- `--headings` - Auto-update heading hierarchy based on detected TOC structure (work in progress)

### AI Configuration
- `--api <provider>` - API provider to use (openrouter, openai, ollama, together, or gemini) (default: "openrouter")
- `--api-key, -k <key>` - API key for the selected provider
- `--token <limit>` - Maximum number of tokens per chunk for processing

### Processing Options
- `--ma` - Include attachments extraction and processing
- `--identical-image-threshold <number>` - Threshold for discarding identical images during PDF media extraction
- `--toc-file <path>` - Optional: Path to the TOC markdown file
- `--config <path>` - Optional: Path to custom config.yaml file

### Debugging Options
- `--verbose` - Enable verbose output, creating intermediate files
- `-h, --help` - Display help for command

### Usage Examples
```bash
# Basic conversion with default settings
mdc "presentation.pptx" --md

# Use specific API provider
mdc "document.pdf" --md --api openai

# Include attachments and table of contents
mdc "presentation.pptx" --md --ma --table

# Use custom API key inline
mdc "file.pdf" --md --api openrouter --api-key "your-key-here"

# Verbose mode with custom config
mdc "document.docx" --md --verbose --config "./custom-config.yaml"
```

## Performance Optimization

### For Large Documents

```bash
# Process with smaller token chunks
mdc "large_document.pdf" --md --token 2000 --api openrouter

# Enable verbose mode to monitor progress
mdc "complex_presentation.pptx" --md --verbose --api openai

# Use local models for faster processing (offline)
mdc "document.docx" --md --api ollama
```

### Management

- Monitor token usage with `--verbose` flag
- Choose appropriate models for your needs
- Consider batch processing for multiple files
- Use local models (Ollama) when possible to reduce costs

## Use Cases

### Content Migration
- Convert legacy PowerPoint presentations to Markdown
- Migrate Word documents to modern documentation systems
- Transform PDF reports into editable Markdown format

### Knowledge Management
- Build personal knowledge bases from existing documents
- Create structured notes from presentation slides
- Integrate with Obsidian, Logseq, or other PKM tools

### Academic and Research
- Extract text from research papers and publications
- Convert lecture slides to study notes
- Archive and organize educational materials

### Business and Productivity
- Convert meeting presentations to action items
- Transform technical documentation to Markdown
- Create knowledge bases from company materials

## Integrations

### Obsidian Plugin
MDC is available as a third-party plugin for Obsidian:
- Seamless integration with Obsidian vault
- Right-click context menu for quick conversions
- Customizable settings within Obsidian
- Automatic file organization and linking


## Support & Contributing
If you encounter any issues, have feature requests, or would like to contribute, please let me know.

## License

MIT License - see [LICENSE](LICENSE) file for details.
