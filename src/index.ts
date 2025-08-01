// Export main functionality
export { main } from './main';

// Export utility functions
export {
  retryWithBackoff,
  getDataUrl,
  convertImageToWebp,
  prepareImageForLlava,
  batchIterable,
  estimateTokenCount,
  sleep
} from './utils';

// Export API interfaces
export {
  authenticateOpenrouterApi,
  extractTextFromImage as openrouterExtractTextFromImage,
  extractMarkdownFromText as openrouterExtractMarkdownFromText,
  extractTocFromMarkdown as openrouterExtractTocFromMarkdown
} from './api/openrouter_api';

export {
  authenticateOpenaiApi,
  extractTextFromImage as openaiExtractTextFromImage,
  extractMarkdownFromText as openaiExtractMarkdownFromText,
  extractTocFromMarkdown as openaiExtractTocFromMarkdown
} from './api/openai_api';

export {
  authenticateOllamaApi,
  extractTextFromImage as ollamaExtractTextFromImage,
  extractMarkdownFromText as ollamaExtractMarkdownFromText,
  extractTocFromMarkdown as ollamaExtractTocFromMarkdown
} from './api/ollama_api';

// Export markdown processing utilities
export {
  extractHeadingsWithWordCounts, // Changed from extractAllHeadings
  saveExtractedHeadings,
  injectTocIntoMarkdown,
  splitTextIntoChunks,
  combineChunks,
  removeMarkdownFormatting,
  cleanMarkdownCodeBlocks
} from './markdown/markdown';

export { updateMarkdownHeadings } from './markdown/markdown_headings';

// Export image processing utilities
export {
  getImagePaths,
  extractMediaImagesFromPptx,
  extractRenderedImagesFromPptx,
  extractMediaImagesFromPdf,
  extractRenderedImagesFromPdf
} from './processing/image_processing';

// Export conversion utilities
export {
  compressPdf,
  optimizePptxImages,
  convertPresentationToPptx,
  convertPptToPdf,
  convertDocToPdf
} from './processing/conversions';

// Export configuration utilities
export { loadConfig, getEnvVariable } from './config';

// Export constants
export { DEFAULT_REQUESTS_PER_SECOND, SLEEP_TIME, PDF_QUALITY_SETTINGS, SUPPORTED_IMAGE_FORMATS } from './processing/constants';
