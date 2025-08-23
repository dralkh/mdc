#!/usr/bin/env node

import * as fs from 'fs-extra';
import * as path from 'path';
import { program } from 'commander';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';
import { spawn } from 'child_process';

import { loadConfig, getEnvVariable } from './config';
import { 
  authenticateOpenrouterApi,
  extractTextFromImage as openrouterExtractTextFromImage,
  extractMarkdownFromText as openrouterExtractMarkdownFromText,
  extractTocFromMarkdown as openrouterExtractTocFromMarkdown
} from './api/openrouter_api';
import {
  authenticateOpenaiApi,
  extractTextFromImage as openaiExtractTextFromImage,
  extractMarkdownFromText as openaiExtractMarkdownFromText,
  extractTocFromMarkdown as openaiExtractTocFromMarkdown
} from './api/openai_api';
import {
  authenticateOllamaApi,
  extractTextFromImage as ollamaExtractTextFromImage,
  extractMarkdownFromText as ollamaExtractMarkdownFromText,
  extractTocFromMarkdown as ollamaExtractTocFromMarkdown
} from './api/ollama_api';
import {
  authenticateTogetherApi,
  extractTextFromImageTogetherAI,
  extractMarkdownFromTextTogetherAI,
  extractTocFromMarkdownTogetherAI
} from './api/together_api';
import {
  authenticateGeminiApi,
  extractTextFromImageGemini,
  extractMarkdownFromTextGemini,
  extractTocFromMarkdownGemini
} from './api/gemini_api';
import {
  authenticateFireworksApi,
  extractTextFromImage as fireworksExtractTextFromImage,
  extractMarkdownFromText as fireworksExtractMarkdownFromText,
  extractTocFromMarkdown as fireworksExtractTocFromMarkdown
} from './api/fireworks_api';
import {
  compressPdf,
  optimizePptxImages,
  convertPresentationToPptx,
  convertPptToPdf,
  convertDocToPdf
} from './processing/conversions';
import {
  getImagePaths,
  extractMediaImagesFromPptx,
  extractRenderedImagesFromPptx,
  extractMediaImagesFromPdf,
  extractRenderedImagesFromPdf
} from './processing/image_processing';
import {
  extractHeadingsWithWordCounts, // Changed from extractAllHeadings
  saveExtractedHeadings,
  injectTocIntoMarkdown,
  splitTextIntoChunks,
  combineChunks,
  removeMarkdownFormatting,
  cleanMarkdownCodeBlocks
} from './markdown/markdown';
import {
  estimateTokenCount
} from './utils';
import { updateMarkdownHeadings } from './markdown/markdown_headings';
import {
  getDataUrl,
  convertImageToWebp as convertImageToWebpInUtils,
  prepareImageForLlava,
  batchIterable,
  sleep
} from './utils';
import { DEFAULT_REQUESTS_PER_SECOND, SLEEP_TIME } from './processing/constants';
import pLimit from 'p-limit';

// Load .env file
dotenv.config();

/**
 * Process an image by converting it to a data URL and sending it to the specified API
 * for text extraction.
 */
async function processImage(
  imagePath: string, 
  apiKey: string, 
  modelName: string, 
  prompt: string, 
  parameters: Record<string, any>,
  apiProvider: 'openrouter' | 'openai' | 'ollama' | 'together' | 'gemini' | 'fireworks' = 'openrouter',
  baseURL?: string
): Promise<string> {
  // For Ollama only: prepare the image for LLaVA compatibility if needed
  let dataUrl: string | null;
  
  if (apiProvider.toLowerCase() === 'ollama') {
    // This will convert WebP to PNG if needed for LLaVA compatibility
    const preparedImagePath = await prepareImageForLlava(imagePath);
    dataUrl = await getDataUrl(preparedImagePath);

    // Clean up temporary file if one was created
    if (preparedImagePath !== imagePath && 
        preparedImagePath.endsWith('.png') && 
        fs.existsSync(preparedImagePath)) {
      try {
        await fs.unlink(preparedImagePath);
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        console.warn(`  ⚠️ Could not remove temporary file ${preparedImagePath}: ${error.message}`);
      }
    }
  } else {
    // For OpenAI and OpenRouter: use the image as-is without LLaVA-specific conversions
    dataUrl = await getDataUrl(imagePath);
  }

  if (dataUrl) {
    console.log(`  ➡️ Encoded ${path.basename(imagePath)} to data URL.`);

    let text: string | null;
    if (apiProvider.toLowerCase() === 'openai') {
      text = await openaiExtractTextFromImage(dataUrl, apiKey, modelName, prompt, parameters, baseURL);
    } else if (apiProvider.toLowerCase() === 'ollama') {
      text = await ollamaExtractTextFromImage(dataUrl, apiKey, modelName, prompt, parameters);
    } else if (apiProvider.toLowerCase() === 'together') {
      text = await extractTextFromImageTogetherAI(dataUrl, apiKey, modelName, prompt, parameters);
    } else if (apiProvider.toLowerCase() === 'gemini') {
      text = await extractTextFromImageGemini(dataUrl, apiKey, modelName, prompt, parameters);
    } else if (apiProvider.toLowerCase() === 'fireworks') {
      text = await fireworksExtractTextFromImage(dataUrl, apiKey, modelName, prompt, parameters);
    } else {  // Default to OpenRouter
      text = await openrouterExtractTextFromImage(dataUrl, apiKey, modelName, prompt, parameters);
    }

    if (text) {
      console.log(`  ✅ Extracted text from image ${path.basename(imagePath)} using ${apiProvider} API.`);
      return text;
    } else {
      console.warn(`  ⚠️ Failed to extract text from image ${path.basename(imagePath)} using ${apiProvider} API.`);
      return '';
    }
  } else {
    console.warn(`  ⚠️ Failed to encode ${path.basename(imagePath)}.`);
    return '';
  }
}

/**
 * Main entry point for the MDC application
 */
export async function main(): Promise<void> {
  // Constants for API keys and URLs
  const OPENROUTER_API_KEY = getEnvVariable("OPENROUTER_API_KEY");
  const YOUR_SITE_URL = getEnvVariable("YOUR_SITE_URL");  // Optional
  const YOUR_SITE_NAME = getEnvVariable("YOUR_SITE_NAME");  // Optional

  // Command line arguments will be parsed later, but we need the config option now
  let configPath: string | undefined;
  const configArgIndex = process.argv.indexOf('--config');
  if (configArgIndex !== -1 && configArgIndex < process.argv.length - 1) {
    configPath = process.argv[configArgIndex + 1];
  }
  
  // Load configuration with custom path
  const config = loadConfig(configPath);
  
  // Override model names from environment variables if set
  // These can be set by the Obsidian plugin
  const OPENROUTER_MODEL_NAME = getEnvVariable("MDC_OPENROUTER_MODEL") || config.openrouter_model.name;
  const OPENAI_MODEL_NAME = getEnvVariable("MDC_OPENAI_MODEL") || config.openai_model.name;
  const OPENAI_BASE_URL = getEnvVariable("MDC_OPENAI_BASE_URL") || config.openai_model.baseURL;
  const OLLAMA_MODEL_NAME = getEnvVariable("MDC_OLLAMA_MODEL") || config.ollama_model.name;
  const TOGETHER_MODEL_NAME = getEnvVariable("MDC_TOGETHER_MODEL") || config.together_model.name;
  const GEMINI_MODEL_NAME = getEnvVariable("MDC_GEMINI_MODEL") || config.gemini_model.name; // Added Gemini
  const FIREWORKS_MODEL_NAME = getEnvVariable("MDC_FIREWORKS_MODEL") || config.fireworks_model.name;

  // Default time between requests (will be overridden later based on rate limits)
  let timeBetweenRequests = 1000;  // Default to 1 second between requests

  // Load prompts and their parameters from config.yaml
  let extractTextFromImagePrompt: string;
  let extractTextFromImageParameters: Record<string, any>;
  let extractMarkdownFromTextPrompt: string;
  let extractMarkdownFromTextParameters: Record<string, any>;
  let extractTocFromMarkdownPrompt: string;
  let extractTocFromMarkdownParameters: Record<string, any>;

  try {
    extractTextFromImagePrompt = config.prompts.extract_text_from_image.prompt;
    extractTextFromImageParameters = config.prompts.extract_text_from_image.parameters;

    extractMarkdownFromTextPrompt = config.prompts.extract_markdown_from_text.prompt;
    extractMarkdownFromTextParameters = config.prompts.extract_markdown_from_text.parameters;

    extractTocFromMarkdownPrompt = config.prompts.extract_toc_from_markdown.prompt;
    extractTocFromMarkdownParameters = config.prompts.extract_toc_from_markdown.parameters;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`❌ Missing prompt or parameters in config.yaml: ${error.message}`);
    process.exit(1);
  }

 // Override prompts if provided by environment variable
 const promptsOverride = getEnvVariable('MDC_PROMPTS_OVERRIDE');
 if (promptsOverride) {
   try {
     const overriddenPrompts = JSON.parse(promptsOverride);
     extractTextFromImagePrompt = overriddenPrompts.extractTextFromImage.prompt;
     extractTextFromImageParameters = overriddenPrompts.extractTextFromImage.parameters;
     extractMarkdownFromTextPrompt = overriddenPrompts.extractMarkdownFromText.prompt;
     extractMarkdownFromTextParameters = overriddenPrompts.extractMarkdownFromText.parameters;
     extractTocFromMarkdownPrompt = overriddenPrompts.extractTocFromMarkdown.prompt;
     extractTocFromMarkdownParameters = overriddenPrompts.extractTocFromMarkdown.parameters;
     console.log('✅ Loaded prompts from plugin settings override.');
   } catch (e) {
     console.error('❌ Failed to parse prompts override from environment variable.', e);
   }
 }

  // Set up command-line interface
  program
    .name('mdc')
    .description('Process and convert documents to Markdown')
    .version('0.1.1');

  program
    .argument('<input-file>', 'Path to the input PPTX, PPT, PPSX, PDF, DOC, or DOCX file')
    .option('--md', 'Convert the extracted content into a Markdown (.md) file')
    .option('--mr', 'Only extract basefilename_markdown_text.md without other outputs')
    .option('--api <provider>', 'API provider to use (openrouter, openai, ollama, together, gemini, or fireworks)', 'openrouter')
    .option('--api-key, -k <key>', 'API key for the selected provider')
    .option('--ma', 'Include attachments extraction and processing')
    .option('--token <limit>', 'Maximum number of tokens per chunk for processing')
    .option('--table', 'Include a table of contents in the generated markdown')
    .option('--headings', 'Update heading hierarchy of markdown text based on automatically detected TOC')
    .option('--toc-file <path>', 'Optional: Path to the TOC markdown file')
    .option('--config <path>', 'Optional: Path to custom config.yaml file')
    .option('--identical-image-threshold <number>', 'Threshold for discarding identical images during PDF media extraction') // New option
    .option('--verbose', 'Enable verbose output, creating intermediate files') // New verbose option
    .option('--requests-per-minute <number>', 'Maximum number of API calls per minute')
    .action(async (inputFile, options) => {
      const verbose = options.verbose || (config.processing_settings && config.processing_settings.verboseOutput) || false;
      let convertedPdfPathForCleanup: string | null = null; // For PPTX -> PDF temp file
      // Validate options
      if (options.md && options.mr) {
        console.error('❌ Cannot specify both --md and --mr options');
        process.exit(1);
      }
      
      // Determine the API key based on the selected provider
      const apiProvider = (getEnvVariable('MDC_API_PROVIDER') || options.api).toLowerCase();
      let apiKey: string;
      
      if (apiProvider === 'openai') {
        apiKey = options.apiKey || getEnvVariable('OPENAI_API_KEY') || '';
        if (!apiKey) {
          console.error('❌ OpenAI API key not provided. Use the --api-key argument or set OPENAI_API_KEY in the environment.');
          process.exit(1);
        }
      } else if (apiProvider === 'ollama') {
        // Ollama doesn't require an API key, but we'll set a dummy one for compatibility
        apiKey = 'ollama_local';
      } else if (apiProvider === 'together') { // Added Together AI
        apiKey = options.apiKey || getEnvVariable('TOGETHER_API_KEY') || '';
        if (!apiKey) {
          console.error('❌ Together AI API key not provided. Use the --api-key argument or set TOGETHER_API_KEY in the environment.');
          process.exit(1);
        }
      } else if (apiProvider === 'gemini') {
        apiKey = options.apiKey || getEnvVariable('GOOGLE_API_KEY') || getEnvVariable('GEMINI_API_KEY') || '';
        if (!apiKey) {
          console.error('❌ Gemini API key not provided. Use --api-key or set GOOGLE_API_KEY/GEMINI_API_KEY in env.');
          process.exit(1);
        }
      } else if (apiProvider === 'fireworks') {
        apiKey = options.apiKey || getEnvVariable('FIREWORKS_API_KEY') || '';
        if (!apiKey) {
          console.error('❌ Fireworks API key not provided. Use --api-key or set FIREWORKS_API_KEY in env.');
          process.exit(1);
        }
      } else {  // Default to OpenRouter
        apiKey = options.apiKey || OPENROUTER_API_KEY || '';
        if (!apiKey) {
          console.error('❌ OpenRouter API key not provided. Use the --api-key argument or set OPENROUTER_API_KEY in the environment.');
          process.exit(1);
        }
      }
      
      const filePath = path.resolve(inputFile);
      
      if (!fs.existsSync(filePath)) {
        console.error(`❌ The file ${filePath} does not exist.`);
        process.exit(1);
      }
      
      // Determine the base filename without extension and remove trailing numerals if any
      const parsedPath = path.parse(filePath);
      let baseFilename = parsedPath.name.replace(/\s+\d+$/, '').trim();
      
      // Get the parent directory of the input file
      const inputParentDir = parsedPath.dir;
      
      // Define the Topics/{base_filename} directory one level above the input file
      const topicsParent = path.join(path.dirname(inputParentDir), 'Topics');
      await fs.ensureDir(topicsParent);
      
      // Clean base_filename to ensure no trailing spaces in the directory name
      const topicsDir = path.join(topicsParent, baseFilename.trim());
      await fs.ensureDir(topicsDir);
      console.log(`📂 Created/Found Topics directory at ${topicsDir}`);
      
      // Define the attachments directory within Topics/{base_filename}/ if --ma is used
      let topicsAttachmentsDir: string | undefined;
      if (options.ma) {
        topicsAttachmentsDir = path.join(topicsDir, 'attachments');
        await fs.ensureDir(topicsAttachmentsDir);
        console.log(`📂 Created/Found Topics Attachments directory at ${topicsAttachmentsDir}`);
      } else {
        console.log('❗ Attachments extraction not enabled. Use --ma to include attachments.');
      }
      
      // Define the rendered_images and presentation_files directories within Input/
      const executionDir = process.cwd();
      const inputDir = path.join(executionDir, 'Input');
      await fs.ensureDir(inputDir);
      console.log(`📂 Created/Found Input directory at ${inputDir}`);
      
      const renderedDir = path.join(inputDir, 'rendered_images');
      await fs.ensureDir(renderedDir);
      console.log(`📂 Created/Found Rendered Images directory at ${renderedDir}`);
      
      const presentationDir = path.join(inputDir, 'presentation_files');
      await fs.ensureDir(presentationDir);
      console.log(`📂 Created/Found Presentation Files directory at ${presentationDir}`);
      
      // Define the output directory within presentation_files/
      const outputDir = path.join(presentationDir, 'output');
      await fs.ensureDir(outputDir);
      console.log(`📂 Created/Found Output directory at ${outputDir}`);
      
      // Authenticate with the appropriate API
      let authSuccess: boolean;
      let rateLimitInfo: Record<string, any> | null;
      
      if (apiProvider === 'openai') {
        console.log('🔑 Authenticating with OpenAI API...');
        [authSuccess, rateLimitInfo] = await authenticateOpenaiApi(OPENAI_BASE_URL);
        if (!authSuccess) {
          console.error('❌ Authentication failed. Please check your OpenAI API key.');
          process.exit(1);
        }
      } else if (apiProvider === 'ollama') {
        console.log('🔑 Checking connection to Ollama API...');
        [authSuccess, rateLimitInfo] = await authenticateOllamaApi();
        if (!authSuccess) {
          console.error('❌ Connection to Ollama API failed. Please check if Ollama is running.');
            process.exit(1);
          }
        } else if (apiProvider === 'together') { // Added Together AI
          console.log('🔑 Authenticating with Together AI API...');
          [authSuccess, rateLimitInfo] = await authenticateTogetherApi(apiKey);
          if (!authSuccess) {
            console.error('❌ Authentication failed. Please check your Together AI API key.');
            process.exit(1);
          }
        } else if (apiProvider === 'gemini') {
          console.log('🔑 Authenticating with Gemini API...');
          [authSuccess, rateLimitInfo] = await authenticateGeminiApi(apiKey);
          if (!authSuccess) {
            console.error('❌ Authentication failed. Please check your Gemini API key.');
            process.exit(1);
          }
        } else if (apiProvider === 'fireworks') {
          console.log('🔑 Authenticating with Fireworks API...');
          [authSuccess, rateLimitInfo] = await authenticateFireworksApi();
          if (!authSuccess) {
            console.error('❌ Authentication failed. Please check your Fireworks API key.');
            process.exit(1);
          }
        } else {  // Default to OpenRouter
          console.log('🔑 Authenticating with OpenRouter API...');
          [authSuccess, rateLimitInfo] = await authenticateOpenrouterApi(apiKey);
          if (!authSuccess) {
            console.error('❌ Authentication failed. Please check your OpenRouter API key.');
            process.exit(1);
          }
        }
        
        // Set requests per second based on rate limit info
        let requestsPerSecond = DEFAULT_REQUESTS_PER_SECOND;
        if (rateLimitInfo) {
          requestsPerSecond = rateLimitInfo.requests_per_second || DEFAULT_REQUESTS_PER_SECOND;
          console.log(`📊 Using rate limit: ${requestsPerSecond} requests per second`);
        } else {
          console.warn(`⚠️ Could not retrieve rate limit information. Using default: ${requestsPerSecond} requests per second`);
        }
        
        // Calculate time between requests to evenly distribute them
        if (options.requestsPerMinute) {
          const rpm = parseInt(options.requestsPerMinute, 10);
          if (!isNaN(rpm) && rpm > 0) {
            timeBetweenRequests = 60000 / rpm;
          }
        } else {
          timeBetweenRequests = 1000 / requestsPerSecond; // Convert to milliseconds
        }
        
        // Determine if the input file needs to be converted to PPTX or compressed
        const fileExt = path.extname(filePath).toLowerCase();
        const isPdf = fileExt === '.pdf';
        const isPptx = fileExt === '.pptx';
        const needsCompression = isPdf || isPptx;
        
        // Define paths for compressed files
        let compressedPdfPath: string;
        let compressedPptxPath: string;
        let updatedFilePath = filePath;
        
        if (isPdf && verbose) { // Only compress if verbose
          compressedPdfPath = path.join(parsedPath.dir, `${baseFilename}_compressed.pdf`);
          
          // Compress PDF before proceeding
          console.log(`📦 Compressing PDF file ${path.basename(filePath)}...`);
          const compressed = await compressPdf(filePath, compressedPdfPath, 'ebook');
          
          if (compressed) {
            updatedFilePath = compressedPdfPath;  // Update file_path to the compressed PDF
            console.log(`✅ PDF compressed successfully to ${compressedPdfPath}`);
          } else {
            console.error('❌ PDF compression failed. Continuing with original PDF.');
            // No process.exit(1) here, continue with uncompressed PDF if verbose compression fails
          }
        } else if (isPdf && !verbose) {
          console.log('ℹ️ Skipping PDF compression as verbose output is not enabled.');
        } else if (isPptx && verbose) { // Only optimize PPTX if verbose
          compressedPptxPath = path.join(parsedPath.dir, `${baseFilename}_optimized.pptx`);
          
          console.log(`📦 Optimizing PPTX file ${path.basename(filePath)} by compressing images...`);
          const optimized = await optimizePptxImages(filePath, compressedPptxPath, 75);
          
          if (optimized) {
            updatedFilePath = compressedPptxPath;  // Use optimized file instead of replacing original
            console.log(`✅ PPTX optimized successfully to ${compressedPptxPath}`);
          } else {
            console.error('❌ PPTX optimization failed. Continuing with original PPTX.');
            // Continue with original PPTX if optimization fails
          }
        } else if (isPptx && !verbose) {
          console.log('ℹ️ Skipping PPTX optimization as verbose output is not enabled.');
        }
        
        // Determine if the input file needs to be converted to PPTX or PDF
        if (['.ppt', '.ppsx'].includes(fileExt)) {
          console.log(`🔄 Converting ${path.basename(filePath)} to PPTX format...`);
          const convertedPptx = await convertPresentationToPptx(filePath, presentationDir);
          
          if (!convertedPptx) {
            console.error(`❌ Failed to convert ${fileExt.toUpperCase()} to PPTX. Exiting.`);
            process.exit(1);
          }
          
          updatedFilePath = convertedPptx;  // Update file_path to the converted PPTX
        } else if (['.doc', '.docx'].includes(fileExt)) {
          console.log(`🔄 Converting ${path.basename(filePath)} to PDF format...`);
          const convertedPdf = await convertDocToPdf(filePath, presentationDir);
          
          if (!convertedPdf) {
            console.error(`❌ Failed to convert ${fileExt.toUpperCase()} to PDF. Exiting.`);
            process.exit(1);
          }
          
          updatedFilePath = convertedPdf;  // Update file_path to the converted PDF
        }
        
        // Proceed to extract images
        console.log('📤 Extracting images and attachments...');
        
        // Get the new file extension after possible conversions
        const updatedFileExt = path.extname(updatedFilePath).toLowerCase();
        
        let processedRenderedImages: { imgPath: string, result: string, tokenCount: number }[] = [];
        let attachmentImages: string[] = [];

        // Calculate time between requests to evenly distribute them
        const totalRequestsPerPeriod = rateLimitInfo?.requests || 60; // Default to 60 if not specified
        const periodSeconds = rateLimitInfo?.interval_seconds || 10; // Default to 10s if not specified
        timeBetweenRequests = (periodSeconds * 1000) / totalRequestsPerPeriod;

        console.log(`📊 Rate limit details: ${totalRequestsPerPeriod} requests per ${periodSeconds}s`);
        console.log(`📊 Distributing requests with ${timeBetweenRequests.toFixed(8)}ms between each request`);

        // Define the processImage function to be passed to extraction functions
        const processImageFn = async (
          imagePath: string,
          apiKey: string,
          modelName: string,
          prompt: string,
          parameters: Record<string, any>,
          apiProvider: 'openrouter' | 'openai' | 'ollama' | 'together' | 'gemini' | 'fireworks',
      baseURL?: string
       ): Promise<string> => {
          // For Ollama only: prepare the image for LLaVA compatibility if needed
          let dataUrl: string | null;

          if (apiProvider.toLowerCase() === 'ollama') {
            // This will convert WebP to PNG if needed for LLaVA compatibility
            const preparedImagePath = await prepareImageForLlava(imagePath);
            dataUrl = await getDataUrl(preparedImagePath);

            // Clean up temporary file if one was created
            if (preparedImagePath !== imagePath &&
              preparedImagePath.endsWith('.png') &&
              fs.existsSync(preparedImagePath)) {
              try {
                await fs.unlink(preparedImagePath);
              } catch (e) {
                const error = e instanceof Error ? e : new Error(String(e));
                console.warn(`  ⚠️ Could not remove temporary file ${preparedImagePath}: ${error.message}`);
              }
            }
          } else {
            // For OpenAI, OpenRouter, TogetherAI, and Gemini: use the image as-is without LLaVA-specific conversions
            dataUrl = await getDataUrl(imagePath);
          }

          if (dataUrl) {
            console.log(`  ➡️ Encoded ${path.basename(imagePath)} to data URL.`);

            let text: string | null;
            if (apiProvider.toLowerCase() === 'openai') {
              text = await openaiExtractTextFromImage(dataUrl, apiKey, modelName, prompt, parameters, baseURL);
            } else if (apiProvider.toLowerCase() === 'ollama') {
              text = await ollamaExtractTextFromImage(dataUrl, apiKey, modelName, prompt, parameters);
            } else if (apiProvider.toLowerCase() === 'together') {
              text = await extractTextFromImageTogetherAI(dataUrl, apiKey, modelName, prompt, parameters);
            } else if (apiProvider.toLowerCase() === 'gemini') {
              text = await extractTextFromImageGemini(dataUrl, apiKey, modelName, prompt, parameters);
            } else if (apiProvider.toLowerCase() === 'fireworks') {
              text = await fireworksExtractTextFromImage(dataUrl, apiKey, modelName, prompt, parameters);
            } else { // Default to OpenRouter
              text = await openrouterExtractTextFromImage(dataUrl, apiKey, modelName, prompt, parameters);
            }

            if (text) {
              console.log(`  ✅ Extracted text from image ${path.basename(imagePath)} using ${apiProvider} API.`);
              return text;
            } else {
              console.warn(`  ⚠️ Failed to extract text from image ${path.basename(imagePath)} using ${apiProvider} API.`);
              return '';
            }
          } else {
            console.warn(`  ⚠️ Failed to encode ${path.basename(imagePath)}.`);
            return '';
          }
        };


        if (updatedFileExt === '.pptx') {
          console.log(`🔄 Converting ${path.basename(updatedFilePath)} to PDF format for image extraction...`);
          const convertedPdf = await convertPptToPdf(updatedFilePath); // Path to temp PDF
          convertedPdfPathForCleanup = convertedPdf; // Store for cleanup

          if (!convertedPdf) {
            console.error(`❌ Failed to convert PPTX to PDF for image extraction. Exiting.`);
            process.exit(1);
          }

          // Now use the converted PDF for both attachment and rendered image extraction
          if (topicsAttachmentsDir) {
            const identicalImageThreshold = options.identicalImageThreshold !== undefined 
              ? parseInt(options.identicalImageThreshold, 10) 
              : config.pdf_processing.identical_image_threshold;
            attachmentImages = await extractMediaImagesFromPdf(convertedPdf, topicsAttachmentsDir, baseFilename, identicalImageThreshold);
          }
          // Extract and process rendered images immediately
          processedRenderedImages = await extractRenderedImagesFromPdf(
            convertedPdf,
            renderedDir,
            baseFilename,
            apiKey,
            apiProvider === 'openai' ? OPENAI_MODEL_NAME : (apiProvider === 'ollama' ? OLLAMA_MODEL_NAME : (apiProvider === 'together' ? TOGETHER_MODEL_NAME : (apiProvider === 'gemini' ? GEMINI_MODEL_NAME : (apiProvider === 'fireworks' ? FIREWORKS_MODEL_NAME : OPENROUTER_MODEL_NAME)))),
            extractTextFromImagePrompt,
            extractTextFromImageParameters,
            apiProvider as 'openrouter' | 'openai' | 'ollama' | 'together' | 'gemini' | 'fireworks',
            (imgPath, apiKey, modelName, prompt, parameters, apiProvider) => processImageFn(imgPath, apiKey, modelName, prompt, parameters, apiProvider, OPENAI_BASE_URL),
            timeBetweenRequests
          );
        } else if (updatedFileExt === '.pdf') {
          // If the input was already a PDF, updatedFilePath is the one to use.
          // No separate convertedPdfPathForCleanup is set here unless it was a DOC->PDF earlier.
          if (topicsAttachmentsDir) {
            const identicalImageThreshold = options.identicalImageThreshold !== undefined
              ? parseInt(options.identicalImageThreshold, 10)
              : config.pdf_processing.identical_image_threshold;
            attachmentImages = await extractMediaImagesFromPdf(updatedFilePath, topicsAttachmentsDir, baseFilename, identicalImageThreshold);
          }
          // Extract and process rendered images immediately
          processedRenderedImages = await extractRenderedImagesFromPdf(
            updatedFilePath,
            renderedDir,
            baseFilename,
            apiKey,
            apiProvider === 'openai' ? OPENAI_MODEL_NAME : (apiProvider === 'ollama' ? OLLAMA_MODEL_NAME : (apiProvider === 'together' ? TOGETHER_MODEL_NAME : (apiProvider === 'gemini' ? GEMINI_MODEL_NAME : (apiProvider === 'fireworks' ? FIREWORKS_MODEL_NAME : OPENROUTER_MODEL_NAME)))),
            extractTextFromImagePrompt,
            extractTextFromImageParameters,
            apiProvider as 'openrouter' | 'openai' | 'ollama' | 'together' | 'gemini' | 'fireworks',
            (imgPath, apiKey, modelName, prompt, parameters, apiProvider) => processImageFn(imgPath, apiKey, modelName, prompt, parameters, apiProvider, OPENAI_BASE_URL),
            timeBetweenRequests
          );
        } else {
          console.error('❌ Unsupported file format. Please provide a PPTX, PPT, PPSX, PDF, DOC, or DOCX file.');
          process.exit(1);
        }

        const totalImages = processedRenderedImages.length + attachmentImages.length;
        if (totalImages === 0) {
          console.log('📭 No images found in the provided file.');
          process.exit(0);
        }

        console.log(`🖼️ Found ${processedRenderedImages.length} rendered image(s)${options.ma ? ` and ${attachmentImages.length} attachment image(s)` : ''} for text extraction.`);

        // Data structure to hold slide-wise data
        interface SlideData {
          renderedText: string;
          attachments: string[];
          tokenCount?: number;
        }

        const slidesData: Record<number, SlideData> = {};

        // Populate slidesData with processed rendered images
        if (processedRenderedImages.length > 0) {
          console.log('\n🛠️ Aggregating Processed Rendered Images...');

          for (const { imgPath, result, tokenCount } of processedRenderedImages) {
            if (result) {
              // Extract rendered image number from rendered image filename
              // Naming convention: basefilename-{rendered_image_num}.webp
              const basename = path.basename(imgPath);
              const parts = basename.split('-');

              if (parts.length >= 2) {
                try {
                  // Extract image number from the filename
                  const renderedImageNumStr = parts[parts.length - 1].replace('.webp', '');
                  const renderedImageNum = parseInt(renderedImageNumStr, 10);

                  // Initialize slide data if not present
                  if (!slidesData[renderedImageNum]) {
                    slidesData[renderedImageNum] = {
                      renderedText: '',
                      attachments: [],
                      tokenCount: 0 // Initialize tokenCount
                    };
                  }

                  slidesData[renderedImageNum].renderedText += `${result}\n`;
                  if (slidesData[renderedImageNum].tokenCount !== undefined) {
                    slidesData[renderedImageNum].tokenCount! += tokenCount;
                  }
                } catch (e) {
                  console.warn(`⚠️ Unable to parse rendered image number from filename: ${basename}`);
                }
              }
            }
          }
        }

        // Process attachment images and include their links
        if (options.ma && attachmentImages.length > 0) {
          console.log('\n🛠️ Processing Attachment Images and Including Them in Markdown...');

          for (const imgPath of attachmentImages) {
            const basename = path.basename(imgPath);
            const pattern = new RegExp(`^${baseFilename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-ps(\\d+)-(\\d+)\\.webp$`);
            const match = basename.match(pattern);

            if (match) {
              const slideNum = parseInt(match[1], 10);

              // Initialize slide data if not present
              if (!slidesData[slideNum]) {
                slidesData[slideNum] = {
                  renderedText: '',
                  attachments: [],
                  tokenCount: 0 // Initialize tokenCount
                };
              }

              // Append attachment image link
              const attachmentLink = `![[${basename}]]`;
              slidesData[slideNum].attachments.push(attachmentLink);

              // If token counting is enabled, estimate tokens for the attachment link
              const tokenLimit = options.token ? parseInt(options.token, 10) : undefined;
              if (tokenLimit && slidesData[slideNum].tokenCount !== undefined) {
                // Estimate a small token count for the attachment link (typically just a few tokens)
                const attachmentTokenCount = estimateTokenCount(attachmentLink);
                slidesData[slideNum].tokenCount! += attachmentTokenCount;
              }

              console.log(`  ➡️ Included attachment image link: ![[${basename}]]`);
            } else {
              console.warn(`⚠️ Filename does not match expected pattern: ${basename}`);
            }
          }
        }

        // Handling the --mr and --md arguments
        if (options.mr) {
          console.log('\n📝 Extracting basefilename_markdown_text.md only (Markdown-Only Request)...');

          // Aggregate all texts in the desired format
          let allTextForMarkdown = '';

          for (const slideNum of Object.keys(slidesData).sort((a, b) => parseInt(a) - parseInt(b))) {
            const slide = slidesData[parseInt(slideNum)];

            allTextForMarkdown += `-${slideNum}\n`;

            if (slide.renderedText) {
              allTextForMarkdown += `${slide.renderedText}\n`;
            }

            if (slide.attachments.length > 0) {
              // Concatenate all attachment image links with spaces
              const imageLinks = slide.attachments.join(' ');
              allTextForMarkdown += `${imageLinks}\n`;
            }

            allTextForMarkdown += '\n'; // Add spacing between slides
          }

          // Save the aggregated text to Input/presentation_files/output/base_filename_markdown_text.md
          const imgOutputMdPath = path.join(outputDir, `${baseFilename}_markdown_text.md`);

          try {
            await fs.writeFile(imgOutputMdPath, allTextForMarkdown, 'utf8');
            console.log(`✅ Aggregated Markdown text successfully saved to ${imgOutputMdPath}`);
          } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            console.warn(`⚠️ Error saving aggregated text to output: ${error.message}`);
          }

          // End of --mr option processing
          return;
        }

        if (options.md) {
          console.log('\n📝 Converting all extracted texts into Markdown format...');

          // Aggregate all texts in the desired format
          let allTextForMarkdown = '';

          for (const slideNum of Object.keys(slidesData).sort((a, b) => parseInt(a) - parseInt(b))) {
            const slide = slidesData[parseInt(slideNum)];

            allTextForMarkdown += `-${slideNum}\n`;

            if (slide.renderedText) {
              allTextForMarkdown += `${slide.renderedText}\n`;
            }

            if (slide.attachments.length > 0) {
              // Concatenate all attachment image links with spaces
              const imageLinks = slide.attachments.join(' ');
              allTextForMarkdown += `${imageLinks}\n`;
            }

            allTextForMarkdown += '\n'; // Add spacing between slides
          }

          // Save the aggregated text to Input/presentation_files/output/base_filename.md
          const imgOutputMdPath = path.join(outputDir, `${baseFilename}.md`);

          try {
            await fs.writeFile(imgOutputMdPath, allTextForMarkdown, 'utf8');
            console.log(`✅ Aggregated text successfully saved to ${imgOutputMdPath}`);
          } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            console.warn(`⚠️ Error saving aggregated text to output: ${error.message}`);
          }

          // Check if token-based processing is requested
          let finalMarkdown = '';

          if (options.token) {
            const tokenLimit = parseInt(options.token, 10);
            console.log(`📄 Token limit specified: ${tokenLimit} tokens per chunk.`);

            // If token counts were estimated during image processing, use them to create intelligent chunks
            if (tokenLimit && Object.values(slidesData).some(slide => slide.tokenCount !== undefined)) {
              console.log('🔍 Using pre-calculated token counts to create optimized chunks...');

              // Create chunks based on token counts
              const chunks: string[] = [];
              let currentChunk = '';
              let currentChunkTokens = 0;

              for (const slideNum of Object.keys(slidesData).sort((a, b) => parseInt(a) - parseInt(b))) {
                const slide = slidesData[parseInt(slideNum)];
                let slideText = `-${slideNum}\n`;

                if (slide.renderedText) {
                  slideText += `${slide.renderedText}\n`;
                }

                if (slide.attachments.length > 0) {
                  const imageLinks = slide.attachments.join(' ');
                  slideText += `${imageLinks}\n`;
                }

                slideText += '\n'; // Add spacing between slides

                // Get token count for this slide
                const slideTokens = slide.tokenCount || estimateTokenCount(slideText);

                // If adding this slide would exceed the token limit, start a new chunk
                if (currentChunkTokens + slideTokens > tokenLimit && currentChunk) {
                  chunks.push(currentChunk);
                  currentChunk = slideText;
                  currentChunkTokens = slideTokens;
                } else {
                  currentChunk += slideText;
                  currentChunkTokens += slideTokens;
                }
              }

              // Add the last chunk if it's not empty
              if (currentChunk) {
                chunks.push(currentChunk);
              }

              console.log(`📊 Created ${chunks.length} optimized chunks based on token counts`);

              // Process each chunk
              const limit = pLimit(Math.ceil(1000 / timeBetweenRequests));
              const chunkPromises = chunks.map((chunk, idx) => limit(async () => {
                console.log(`🔄 Processing chunk ${idx + 1}/${chunks.length} (approx. ${estimateTokenCount(chunk)} tokens)`);
                let markdownChunk: string | null;
                if (apiProvider === 'openai') {
                  markdownChunk = await openaiExtractMarkdownFromText(chunk, `${baseFilename}_part${idx + 1}`, apiKey, OPENAI_MODEL_NAME, extractMarkdownFromTextPrompt, extractMarkdownFromTextParameters, OPENAI_BASE_URL);
                } else if (apiProvider === 'ollama') {
                  markdownChunk = await ollamaExtractMarkdownFromText(chunk, `${baseFilename}_part${idx + 1}`, apiKey, OLLAMA_MODEL_NAME, extractMarkdownFromTextPrompt, extractMarkdownFromTextParameters);
                } else if (apiProvider === 'together') {
                  markdownChunk = await extractMarkdownFromTextTogetherAI(chunk, `${baseFilename}_part${idx + 1}`, apiKey, TOGETHER_MODEL_NAME, extractMarkdownFromTextPrompt, extractMarkdownFromTextParameters);
                } else if (apiProvider === 'gemini') {
                    markdownChunk = await extractMarkdownFromTextGemini(chunk, `${baseFilename}_part${idx + 1}`, apiKey, GEMINI_MODEL_NAME, extractMarkdownFromTextPrompt, extractMarkdownFromTextParameters);
                } else if (apiProvider === 'fireworks') {
                  markdownChunk = await fireworksExtractMarkdownFromText(chunk, `${baseFilename}_part${idx + 1}`, apiKey, FIREWORKS_MODEL_NAME, extractMarkdownFromTextPrompt, extractMarkdownFromTextParameters);
                } else {
                  markdownChunk = await openrouterExtractMarkdownFromText(chunk, `${baseFilename}_part${idx + 1}`, apiKey, OPENROUTER_MODEL_NAME, extractMarkdownFromTextPrompt, extractMarkdownFromTextParameters);
                }
                if (!markdownChunk) console.warn(`⚠️ Failed to process chunk ${idx + 1}.`);
                return markdownChunk;
              }));
              const processedChunks = (await Promise.all(chunkPromises)).filter(c => c !== null) as string[];

              // Combine all processed markdown chunks into final markdown
              finalMarkdown = combineChunks(processedChunks);
            } else {
              // Fall back to the original method if token counts weren't calculated
              console.log('📄 Using character-based estimation for chunking...');
              const textChunks = splitTextIntoChunks(allTextForMarkdown, tokenLimit);
              const limit = pLimit(Math.ceil(1000 / timeBetweenRequests));
              const chunkPromises = textChunks.map((chunk, idx) => limit(async () => {
                console.log(`🔄 Processing chunk ${idx + 1}/${textChunks.length}`);
                let markdownChunk: string | null;
                if (apiProvider === 'openai') {
                  markdownChunk = await openaiExtractMarkdownFromText(chunk, `${baseFilename}_part${idx + 1}`, apiKey, OPENAI_MODEL_NAME, extractMarkdownFromTextPrompt, extractMarkdownFromTextParameters, OPENAI_BASE_URL);
                } else if (apiProvider === 'ollama') {
                  markdownChunk = await ollamaExtractMarkdownFromText(chunk, `${baseFilename}_part${idx + 1}`, apiKey, OLLAMA_MODEL_NAME, extractMarkdownFromTextPrompt, extractMarkdownFromTextParameters);
                } else if (apiProvider === 'together') {
                  markdownChunk = await extractMarkdownFromTextTogetherAI(chunk, `${baseFilename}_part${idx + 1}`, apiKey, TOGETHER_MODEL_NAME, extractMarkdownFromTextPrompt, extractMarkdownFromTextParameters);
                } else {
                  markdownChunk = await openrouterExtractMarkdownFromText(chunk, `${baseFilename}_part${idx + 1}`, apiKey, OPENROUTER_MODEL_NAME, extractMarkdownFromTextPrompt, extractMarkdownFromTextParameters);
                }
                if (!markdownChunk) console.warn(`⚠️ Failed to process chunk ${idx + 1}.`);
                return markdownChunk;
              }));
              const processedChunks = (await Promise.all(chunkPromises)).filter(c => c !== null) as string[];

              // Combine all processed markdown chunks into final markdown
              finalMarkdown = combineChunks(processedChunks);
            }

            // Clean the markdown by removing standalone triple backticks and ```markdown
            finalMarkdown = cleanMarkdownCodeBlocks(finalMarkdown);
          } else {
            // Proceed to send the text to the AI for Markdown conversion without token splitting
            // Use the appropriate API for markdown extraction
            let markdown: string | null;

            if (apiProvider === 'openai') {
              markdown = await openaiExtractMarkdownFromText(
                allTextForMarkdown,
                baseFilename,
                apiKey,
                OPENAI_MODEL_NAME,
                extractMarkdownFromTextPrompt,
                extractMarkdownFromTextParameters,
                OPENAI_BASE_URL
              );
            } else if (apiProvider === 'ollama') {
              markdown = await ollamaExtractMarkdownFromText(
                allTextForMarkdown,
                baseFilename,
                apiKey,
                OLLAMA_MODEL_NAME,
                extractMarkdownFromTextPrompt,
                extractMarkdownFromTextParameters
              );
            } else if (apiProvider === 'together') { // Added Together AI
              markdown = await extractMarkdownFromTextTogetherAI(
                allTextForMarkdown,
                baseFilename,
                apiKey,
                TOGETHER_MODEL_NAME,
                extractMarkdownFromTextPrompt,
                extractMarkdownFromTextParameters
              );
            } else if (apiProvider === 'gemini') {
              markdown = await extractMarkdownFromTextGemini(
                allTextForMarkdown,
                baseFilename,
                apiKey,
                GEMINI_MODEL_NAME,
                extractMarkdownFromTextPrompt,
                extractMarkdownFromTextParameters
              );
            } else if (apiProvider === 'fireworks') {
              markdown = await fireworksExtractMarkdownFromText(
                allTextForMarkdown,
                baseFilename,
                apiKey,
                FIREWORKS_MODEL_NAME,
                extractMarkdownFromTextPrompt,
                extractMarkdownFromTextParameters
              );
            } else { // Default to OpenRouter
              markdown = await openrouterExtractMarkdownFromText(
                allTextForMarkdown,
                baseFilename,
                apiKey,
                OPENROUTER_MODEL_NAME,
                extractMarkdownFromTextPrompt,
                extractMarkdownFromTextParameters
              );
            }

            if (markdown) {
              // Clean the markdown by removing standalone triple backticks and ```markdown
              finalMarkdown = cleanMarkdownCodeBlocks(markdown);

              // Save markdown_text to a separate file in Output directory
              const markdownTextPath = path.join(outputDir, `${baseFilename}_markdown_text.md`);

              try {
                await fs.writeFile(markdownTextPath, finalMarkdown, 'utf8');
                console.log(`✅ Markdown text successfully saved to ${markdownTextPath}`);
              } catch (e) {
                const error = e instanceof Error ? e : new Error(String(e));
                console.warn(`⚠️ Error saving markdown text to ${markdownTextPath}: ${error.message}`);
              }
            } else {
              console.error('❌ Failed to generate markdown. Exiting.');
              process.exit(1);
            }
          }

          // At this point, we have finalMarkdown
          let toc: string | null = null;
          let tocPath: string | null = null;

          // Extract all headings from the markdown_text
          console.log('\n🔍 Extracting all headings (with word counts) from the Markdown text...');
          const headings = extractHeadingsWithWordCounts(finalMarkdown); // Changed function call
          const extractedHeadingsPath = path.join(outputDir, `${baseFilename}_extracted_headings.md`);
          await saveExtractedHeadings(headings, extractedHeadingsPath);

          // If table of contents is requested
          if (options.table) {
            // Convert the extracted headings into a single markdown string
            let extractedHeadingsText = '';

            for (const { level, text } of headings) {
              const hashes = '#'.repeat(level);
              extractedHeadingsText += `${hashes} ${text}\n`;
            }

            // Extract TOC from the extracted headings
            console.log('\n📑 Generating Table of Contents (TOC) from extracted headings...');

            // Apply rate limiting
            await sleep(timeBetweenRequests);

            // Use the appropriate API for TOC extraction
            if (apiProvider === 'openai') {
              toc = await openaiExtractTocFromMarkdown(
                extractedHeadingsText,
                baseFilename,
                apiKey,
                OPENAI_MODEL_NAME,
                extractTocFromMarkdownPrompt,
                extractTocFromMarkdownParameters,
                OPENAI_BASE_URL
              );
            } else if (apiProvider === 'ollama') {
              toc = await ollamaExtractTocFromMarkdown(
                extractedHeadingsText,
                baseFilename,
                apiKey,
                OLLAMA_MODEL_NAME,
                extractTocFromMarkdownPrompt,
                extractTocFromMarkdownParameters
              );
            } else if (apiProvider === 'together') { // Added Together AI
              toc = await extractTocFromMarkdownTogetherAI(
                extractedHeadingsText,
                baseFilename,
                apiKey,
                TOGETHER_MODEL_NAME,
                extractTocFromMarkdownPrompt,
                extractTocFromMarkdownParameters
              );
            } else if (apiProvider === 'gemini') {
              toc = await extractTocFromMarkdownGemini(
                extractedHeadingsText,
                baseFilename,
                apiKey,
                GEMINI_MODEL_NAME,
                extractTocFromMarkdownPrompt,
                extractTocFromMarkdownParameters
              );
            } else if (apiProvider === 'fireworks') {
              toc = await fireworksExtractTocFromMarkdown(
                extractedHeadingsText,
                baseFilename,
                apiKey,
                FIREWORKS_MODEL_NAME,
                extractTocFromMarkdownPrompt,
                extractTocFromMarkdownParameters
              );
            } else { // Default to OpenRouter
              toc = await openrouterExtractTocFromMarkdown(
                extractedHeadingsText,
                baseFilename,
                apiKey,
                OPENROUTER_MODEL_NAME,
                extractTocFromMarkdownPrompt,
                extractTocFromMarkdownParameters
              );
            }

            if (toc) {
              console.log('\n✅ Extracted Table of Contents:');
              console.log(toc);

              // Save TOC to a separate file
              tocPath = path.join(outputDir, `${baseFilename}_toc.md`);

              try {
                await fs.writeFile(tocPath, toc, 'utf8');
                console.log(`✅ TOC successfully saved to ${tocPath}`);
              } catch (e) {
                const error = e instanceof Error ? e : new Error(String(e));
                console.warn(`⚠️ Error saving TOC to ${tocPath}: ${error.message}`);
              }

              // Inject the TOC into the main Markdown file
              const finalMarkdownWithToc = toc + '\n\n' + finalMarkdown;
              finalMarkdown = finalMarkdownWithToc;
            } else {
              console.warn('⚠️ Failed to extract TOC from the extracted headings. Proceeding without TOC.');
            }
          }

          // Save the final markdown to both output directory and topics directory
          const finalOutputPath = path.join(outputDir, 'final_output.md');
          const topicOutputPath = path.join(topicsDir, `${baseFilename}.md`);

          try {
            // Save to output directory
            await fs.writeFile(finalOutputPath, finalMarkdown, 'utf8');
            console.log(`✅ Final markdown saved to ${finalOutputPath}`);

            // Also save to topics directory with topic name
            await fs.writeFile(topicOutputPath, finalMarkdown, 'utf8');
            console.log(`✅ Topic-specific markdown saved to ${topicOutputPath}`);
          } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            console.error(`⚠️ Error saving final markdown: ${error.message}`);
          }

          // Handle markdown heading hierarchy adjustments
          if (options.headings) {
            // Determine which markdown file to process
            const mdFileToProcess = finalOutputPath;

            console.log(`\n🔄 Processing markdown file: ${mdFileToProcess}`);

            // Auto-detect TOC file if not specified
            let tocFilePath: string | undefined;

            if (options.tocFile) {
              tocFilePath = options.tocFile;
            } else {
              // Try to find auto-generated TOC file in the output directory
              const autoTocPath = path.join(outputDir, `${baseFilename}_toc.md`);

              if (fs.existsSync(autoTocPath)) {
                tocFilePath = autoTocPath;
                console.log(`🔍 Automatically detected TOC file: ${tocFilePath}`);
              } else {
                console.warn("⚠️ No TOC file automatically detected. Trying to extract headings from the markdown...");
                // If no TOC file exists but we have headings from extraction, create a TOC file
                if (fs.existsSync(extractedHeadingsPath)) {
                  tocFilePath = extractedHeadingsPath;
                  console.log(`🔍 Using extracted headings as TOC: ${tocFilePath}`);
                } else if (options.table && tocPath && fs.existsSync(tocPath)) {
                  tocFilePath = tocPath;
                  console.log(`🔍 Using generated TOC: ${tocPath}`);
                } else {
                  console.error("❌ No TOC file found and no extracted headings available.");
                  console.error("💡 Run with --table first to generate a TOC or provide --toc-file explicitly.");
                  process.exit(1);
                }
              }
            }

            // Handle just heading adjustment
            console.log(`🔧 Updating heading hierarchy based on TOC`);
            let updatedContentAfterHeadings = await updateMarkdownHeadings(
              mdFileToProcess,
              tocFilePath!,
              outputDir // presentationOutputDir
            );

            if (updatedContentAfterHeadings) {
              console.log("✅ Successfully updated headings.");

              // Save the updated headings content back to the files
              try {
                  await fs.writeFile(finalOutputPath, updatedContentAfterHeadings, 'utf8');
                  await fs.writeFile(topicOutputPath, updatedContentAfterHeadings, 'utf8');
                  console.log(`✅ Saved updated headings content to final files.`);
              } catch (e) {
                  const error = e instanceof Error ? e : new Error(String(e));
                  console.error(`⚠️ Error saving updated headings content: ${error.message}`);
              }

            } else {
              console.error("❌ Failed to update headings.");
            }
          }
        }

        console.log("\n🏁 All processing completed.");

        if (!verbose) {
          // Clean up temporary files only - never delete the original input file
          // 1. Always preserve original input file
          console.log(`✅ Original input file preserved: ${filePath}`);

          // 2. Delete converted PDF if it's different from original and in presentationDir (e.g., DOCX -> PDF)
          if (updatedFilePath !== filePath &&
              updatedFilePath.endsWith('.pdf') &&
              (updatedFilePath.startsWith(presentationDir) || updatedFilePath.startsWith(path.join(parsedPath.dir)))) { // Check if in presentationDir or original input's dir
            try {
              if (fs.existsSync(updatedFilePath)) {
                await fs.unlink(updatedFilePath);
                console.log(`✅ Deleted temporary converted PDF file: ${updatedFilePath} (since --verbose was not specified).`);
              }
            } catch (e) {
              const error = e instanceof Error ? e : new Error(String(e));
              console.warn(`⚠️ Could not delete converted PDF file ${updatedFilePath}: ${error.message}`);
            }
          }
          
          // 3. Delete temporary PDF created from PPTX conversion for image extraction
          if (convertedPdfPathForCleanup && fs.existsSync(convertedPdfPathForCleanup)) {
            // Ensure it's not the same as updatedFilePath if updatedFilePath was already deleted
            if (convertedPdfPathForCleanup !== updatedFilePath ||
               (updatedFilePath === filePath || !updatedFilePath.endsWith('.pdf') || !(updatedFilePath.startsWith(presentationDir) || updatedFilePath.startsWith(path.join(parsedPath.dir))))) {
              try {
                await fs.unlink(convertedPdfPathForCleanup);
                console.log(`✅ Deleted temporary PDF from PPTX conversion: ${convertedPdfPathForCleanup} (since --verbose was not specified).`);
              } catch (e) {
                const error = e instanceof Error ? e : new Error(String(e));
                console.warn(`⚠️ Could not delete temporary PDF ${convertedPdfPathForCleanup}: ${error.message}`);
              }
            }
          }

          // 4. Clean up LibreOffice temporary files (.tmp files with random names)
          try {
            const inputDir = path.dirname(filePath);
            const files = await fs.readdir(inputDir);
            const libreOfficeTempFiles = files.filter(file =>
              file.match(/^\.~lock\..*#$/) || // LibreOffice lock files
              file.match(/^lu[0-9a-z]+\.tmp$/i) || // LibreOffice temp files like lu807809gop6c.tmp
              file.match(/\.tmp$/i) || // Any .tmp files
              file.match(/^~.*\.tmp$/i) // Temporary files starting with ~
            );
            
            for (const tempFile of libreOfficeTempFiles) {
              const tempFilePath = path.join(inputDir, tempFile);
              try {
                if (fs.existsSync(tempFilePath)) {
                  await fs.unlink(tempFilePath);
                  console.log(`🧹 Cleaned up temporary file: ${tempFile}`);
                }
              } catch (e) {
                const error = e instanceof Error ? e : new Error(String(e));
                console.warn(`⚠️ Could not remove temporary file ${tempFile}: ${error.message}`);
              }
            }
          } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            console.warn(`⚠️ Could not scan for temporary files: ${error.message}`);
          }
        }
      });

    await program.parseAsync(process.argv);
  }

// Only execute the main function if this file is being run directly
if (require.main === module) {
  main().catch(error => {
    console.error(`Unhandled error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  });
}
