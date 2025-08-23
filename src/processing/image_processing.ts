import * as fs from 'fs-extra';
import * as path from 'path';
import sharp from 'sharp';
import { spawn } from 'child_process';
import * as crypto from 'crypto'; // Added for hashing
import { SUPPORTED_IMAGE_FORMATS } from './constants';
import { convertImageToWebp } from '../utils';
import pLimit from 'p-limit';

/**
 * Retrieves all image file paths from the specified directory.
 *
 * @param directory - The directory to search for images.
 * @returns An array of image file paths.
 */
export async function getImagePaths(directory: string): Promise<string[]> {
  try {
    const dirPath = path.resolve(directory);
    
    if (!fs.existsSync(dirPath) || !(await fs.stat(dirPath)).isDirectory()) {
      console.error(`❌ The directory ${directory} does not exist.`);
      return [];
    }

    const files = await fs.readdir(dirPath);
    const imagePaths = files
      .filter(file => {
        const ext = path.extname(file).toLowerCase().slice(1);
        return SUPPORTED_IMAGE_FORMATS.includes(ext);
      })
      .map(file => path.join(dirPath, file));
    
    return imagePaths;
  } catch (error) {
    console.error(`❌ Error getting image paths: ${error}`);
    return [];
  }
}

/**
 * Extracts rendered images from a PDF file.
 * Renders each page of a PDF file as an image and saves them to the rendered_images directory.
 * Follows the naming convention: basefilename-1.webp, basefilename-2.webp, etc.
 * 
 * @param pdfPath - Path to the PDF file
 * @param renderedDir - Directory to save rendered images
 * @param baseFilename - Base filename for the output images
 * @param apiKey - API key for the selected provider
 * @param modelName - Name of the AI model to use
 * @param prompt - Prompt for text extraction from image
 * @param parameters - Parameters for the API call
 * @param apiProvider - API provider ('openrouter', 'openai', or 'ollama')
 * @param processImageFn - Function to process a single image with the AI
 * @param timeBetweenRequests - Time to wait between API requests for rate limiting
 * @returns Array of objects containing image path, extracted text, and token count.
 */
export async function extractRenderedImagesFromPdf(
  pdfPath: string,
  renderedDir: string,
  baseFilename: string,
  apiKey: string,
  modelName: string,
  prompt: string,
  parameters: Record<string, any>,
  apiProvider: 'openrouter' | 'openai' | 'ollama' | 'together' | 'gemini' | 'fireworks',
  processImageFn: (imagePath: string, apiKey: string, modelName: string, prompt: string, parameters: Record<string, any>, apiProvider: 'openrouter' | 'openai' | 'ollama' | 'together' | 'gemini' | 'fireworks') => Promise<string>,
  timeBetweenRequests: number
): Promise<{ imgPath: string, result: string, tokenCount: number }[]> {
  try {
    const { findExecutablePath, estimateTokenCount } = await import('../utils');
    await fs.ensureDir(renderedDir);

    const pdfinfoPath = await findExecutablePath('pdfinfo', 'PDFINFO_PATH');
    if (!pdfinfoPath) {
      console.error("❌ The 'pdfinfo' tool was not found. Please install poppler-utils and add it to your PATH or set PDFINFO_PATH environment variable.");
      return [];
    }

    const pdfInfo = await new Promise<string>((resolve, reject) => {
      const pdfinfo = spawn(pdfinfoPath, [pdfPath]);
      let output = '';
      pdfinfo.stdout.on('data', (data) => { output += data.toString(); });
      pdfinfo.on('close', (code) => code === 0 ? resolve(output) : reject(new Error(`pdfinfo process exited with code ${code}`)));
      pdfinfo.on('error', (err) => reject(err));
    });

    const pageCountMatch = pdfInfo.match(/Pages:\s*(\d+)/);
    const pageCount = pageCountMatch ? parseInt(pageCountMatch[1], 10) : 0;
    if (pageCount === 0) {
      console.warn("⚠️ No pages found in PDF or could not determine page count.");
      return [];
    }

    const pdftocairoPath = await findExecutablePath('pdftocairo', 'PDFTOCAIRO_PATH');
    if (!pdftocairoPath) {
      console.error("❌ The 'pdftocairo' tool was not found. Please install poppler-utils and add it to your PATH or set PDFTOCAIRO_PATH environment variable.");
      return [];
    }

    const requestsPerSecond = 1000 / timeBetweenRequests;
    const limit = pLimit(Math.ceil(requestsPerSecond));

    const pagePromises = Array.from({ length: pageCount }, (_, i) => limit(async () => {
      const pageNum = i + 1;
      try {
        const tempPngPath = path.join(renderedDir, `${baseFilename}-${pageNum}-temp.png`);
        await new Promise<void>((resolve, reject) => {
          const pdftocairo = spawn(pdftocairoPath, ['-png', '-singlefile', '-f', String(pageNum), '-l', String(pageNum), '-r', '200', pdfPath, path.join(renderedDir, `${baseFilename}-${pageNum}-temp`)]);
          pdftocairo.on('close', (code) => code === 0 ? resolve() : reject(new Error(`pdftocairo process exited with code ${code}`)));
          pdftocairo.on('error', (err) => reject(err));
        });

        const renderedFilename = `${baseFilename}-${pageNum}.webp`;
        const renderedPath = path.join(renderedDir, renderedFilename);
        await sharp(tempPngPath).webp({ quality: 80 }).toFile(renderedPath);
        await fs.remove(tempPngPath);
        console.log(`  ➡️ Rendered Page ${pageNum} to Image: ${renderedFilename}`);

        console.log(`  🧠 Sending rendered image ${renderedFilename} to AI for processing...`);
        const result = await processImageFn(renderedPath, apiKey, modelName, prompt, parameters, apiProvider);
        const tokenCount = result ? estimateTokenCount(result) : 0;
        if (result) console.log(`  📊 Estimated ${tokenCount} tokens for ${renderedFilename}`);
        
        return { imgPath: renderedPath, result, tokenCount };
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        console.error(`⚠️ Error rendering and processing page ${pageNum}: ${error.message}`);
        return null;
      }
    }));

    const results = await Promise.all(pagePromises);
    return results.filter(item => item !== null) as { imgPath: string, result: string, tokenCount: number }[];
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`⚠️ Error in extractRenderedImagesFromPdf: ${err.message}`);
    return [];
  }
}

/**
 * Extracts embedded media images from a PDF file and saves them to the attachments directory.
 * Smartly filters out artifacts and low-value images using multiple criteria.
 * 
 * @param pdfPath - Path to the PDF file
 * @param attachmentsDir - Directory to save attachment images
 * @param baseFilename - Base filename for the output images
 * @returns Array of paths to the attachment images
 */
export async function extractMediaImagesFromPdf(
  pdfPath: string, 
  attachmentsDir: string, 
  baseFilename: string,
  identicalImageThreshold: number // Added new parameter
): Promise<string[]> {
  try {
    // Import findExecutablePath from utils
    const { findExecutablePath } = await import('../utils');

    // Ensure directory exists
    await fs.ensureDir(attachmentsDir);
    
    const attachmentPaths: string[] = [];
    
    // Create a temporary directory for extracted images
    const tempDir = path.join(attachmentsDir, '_temp_extract');
    await fs.ensureDir(tempDir);
    
    // Find pdfimages executable
    const pdfimagesPath = await findExecutablePath('pdfimages', 'PDFIMAGES_PATH');
    
    if (!pdfimagesPath) {
      console.error("❌ The 'pdfimages' tool was not found. Please install poppler-utils and add it to your PATH or set PDFIMAGES_PATH environment variable.");
      return [];
    }
    
    // Extract all images using pdfimages
    await new Promise<void>((resolve, reject) => {
      const pdfimages = spawn(pdfimagesPath, [
        '-all',        // Extract all image types
        '-p',          // Include page numbers in output filenames
        pdfPath,
        path.join(tempDir, 'image')
      ]);
      
      pdfimages.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`pdfimages process exited with code ${code}`));
        }
      });
      
      pdfimages.on('error', (err) => {
        reject(err);
      });
    });
    
    // --- New logic for hashing, duplicate detection, and filtering ---
    const allExtractedFilesRaw = await fs.readdir(tempDir);
    const fileProcessingLimit = pLimit(10); // Concurrency for reading and hashing files

    // 1. Read files, check for solid colors, calculate hashes, and extract metadata
    const metadataPromises = allExtractedFilesRaw.map(originalFilename => fileProcessingLimit(async () => {
      const filePath = path.join(tempDir, originalFilename);
      try {
        const statInfo = await fs.stat(filePath);
        if (!statInfo.isFile()) return null;

        // --- Solid color and artifact detection ---
        const imageStats = await sharp(filePath).stats();
        // We are interested in the first 3 channels (R, G, B) for color analysis.
        // sharp ensures 'channels' has at least 3 elements for common color image types.
        const [rChannel, gChannel, bChannel] = imageStats.channels;

        const meanR = rChannel.mean;
        const meanG = gChannel.mean;
        const meanB = bChannel.mean;
        const stdevR = rChannel.stdev;
        const stdevG = gChannel.stdev;
        const stdevB = bChannel.stdev;
        const minR = rChannel.min;
        const minG = gChannel.min;
        const minB = bChannel.min;

        // Check for pure solid black (very low mean, very low stdev for all channels)
        const isPureSolidBlack = meanR < 5 && meanG < 5 && meanB < 5 && 
                                 stdevR < 1 && stdevG < 1 && stdevB < 1;
        if (isPureSolidBlack) {
          console.log(`🗑️ Discarding pure solid black image: ${originalFilename}`);
          // await fs.remove(filePath); 
          return null; 
        }

        // Check for pure solid white (very high mean, very low stdev for all channels)
        const isPureSolidWhite = meanR > 250 && meanG > 250 && meanB > 250 && 
                                 stdevR < 1 && stdevG < 1 && stdevB < 1;
        if (isPureSolidWhite) {
          console.log(`🗑️ Discarding pure solid white image: ${originalFilename}`);
          // await fs.remove(filePath); 
          return null;
        }

        // Check for "mostly white with dark frame/artifacts"
        // Conditions:
        // 1. Average color is predominantly white.
        // 2. Standard deviation is low, but not as low as pure solid (allows for some dark pixels).
        // 3. Minimum pixel values are low, indicating presence of dark pixels.
        const isMostlyWhiteBackground = meanR > 230 && meanG > 230 && meanB > 230; // Avg color is very light
        const hasLowOverallVariance = stdevR < 30 && stdevG < 30 && stdevB < 30;   // Low variance, allows for small dark areas
        const hasDarkPixels = minR < 50 && minG < 50 && minB < 50;                 // Confirms presence of dark pixels

        if (isMostlyWhiteBackground && hasLowOverallVariance && hasDarkPixels) {
          console.log(`🗑️ Discarding likely artifact (mostly white with dark elements): ${originalFilename}`);
          // await fs.remove(filePath); 
          return null;
        }
        // --- End of solid color and artifact detection ---

        const imageData = await fs.readFile(filePath);
        const hash = crypto.createHash('md5').update(imageData).digest('hex');
        
        const pageMatch = originalFilename.match(/image-(\d+)-/);
        const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : 1;

        return { path: filePath, hash, pageNum, originalFilename };
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        // If sharp fails (e.g. non-image file that pdfimages might extract), treat as error and skip
        if (error.message.includes('Input buffer contains unsupported image format')) {
          console.warn(`⚠️ Skipping unsupported image format: ${originalFilename}`);
          return null;
        }
        console.error(`⚠️ Error processing file ${originalFilename}: ${error.message}`);
        return null;
      }
    }));
    
    const allFileMetadata = (await Promise.all(metadataPromises)).filter(m => m !== null) as { path: string, hash: string, pageNum: number, originalFilename: string }[];

    if (allFileMetadata.length === 0) {
      console.log("ℹ️ No valid images found after initial filtering (solid color / errors).");
      await fs.remove(tempDir);
      return [];
    }

    // 2. Group files by hash
    const imageHashesMap = new Map<string, { path: string, pageNum: number, originalFilename: string }[]>();
    for (const meta of allFileMetadata) {
      if (!imageHashesMap.has(meta.hash)) {
        imageHashesMap.set(meta.hash, []);
      }
      imageHashesMap.get(meta.hash)!.push(meta);
    }

    // 3. Filter based on duplicate count
    const filesToKeepForProcessing: { path: string, pageNum: number, originalFilename: string }[] = [];
    for (const [hash, imagesWithSameHash] of imageHashesMap.entries()) {
      const count = imagesWithSameHash.length;
      // Use the identicalImageThreshold parameter
      if (count <= identicalImageThreshold) { 
        filesToKeepForProcessing.push(...imagesWithSameHash);
      } else {
        console.log(`🗑️ Discarding ${count} identical images (hash: ${hash}, count ${count} > ${identicalImageThreshold}).`);
      }
    }
    
    // 4. Rebuild pageImageMap with filtered images
    const pageImageMap = new Map<number, { path: string, originalFilename: string }[]>();
    for (const fileMeta of filesToKeepForProcessing) {
      if (!pageImageMap.has(fileMeta.pageNum)) {
        pageImageMap.set(fileMeta.pageNum, []);
      }
      // Store path and originalFilename for sorting and conversion
      pageImageMap.get(fileMeta.pageNum)!.push({ path: fileMeta.path, originalFilename: fileMeta.originalFilename });
    }

    // --- End of new logic ---

    const successfulAttachmentPaths: string[] = [];
    const conversionLimit = pLimit(8); // Concurrency for sharp conversions
    const conversionPromises = [];

    // Sort pages numerically
    const sortedPageNumbers = Array.from(pageImageMap.keys()).sort((a, b) => a - b);

    // Process images page by page and rename with per-page counter
    for (const pageNum of sortedPageNumbers) {
      // Sort images within a page by their original filename to maintain consistent numbering
      const imagesOnPage = pageImageMap.get(pageNum)!.sort((a, b) => a.originalFilename.localeCompare(b.originalFilename));
      let pageAttachmentNum = 1;

      for (const imageMeta of imagesOnPage) { // imageMeta is { path: string, originalFilename: string }
        const currentAttachmentNum = pageAttachmentNum++; // Capture for async context
        conversionPromises.push(conversionLimit(async () => {
          try {
            const webpFilename = `${baseFilename}-ps${pageNum}-${currentAttachmentNum}.webp`;
            const webpPath = path.join(attachmentsDir, webpFilename);

            await sharp(imageMeta.path) // Use imageMeta.path (path in tempDir)
              .webp({ quality: 85 })
              .toFile(webpPath);

            console.log(`  ➡️ Extracted and converted image from page ${pageNum}: ${webpFilename}`);
            return webpPath;
          } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            console.error(`⚠️ Error converting image ${imageMeta.originalFilename} from page ${pageNum}: ${error.message}`);
            return null;
          }
        }));
      }
    }

    // Wait for all conversion promises to settle
    const conversionResults = await Promise.all(conversionPromises);
    successfulAttachmentPaths.push(...(conversionResults.filter(p => p !== null) as string[]));

    // Clean up temporary directory
    await fs.remove(tempDir);

    console.log(`🎉 Extracted ${successfulAttachmentPaths.length} valuable images from PDF after duplicate filtering.`);
    return successfulAttachmentPaths;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`⚠️ Error in extractMediaImagesFromPdf: ${err.message}`);
    return [];
  }
}

/**
 * Extracts image references from a slide relationships XML file.
 * Returns an array of media filenames referenced by the slide.
 */
function extractImageReferences(xmlContent: string): string[] {
  const imageRefs: string[] = [];
  
  // Regular expression to find image relationships
  // This looks for Target attributes that point to ../media/ files
  const regex = /Target="\.\.\/media\/([^"]+)"/g;
  let match;
  
  while ((match = regex.exec(xmlContent)) !== null) {
    if (match[1]) {
      imageRefs.push(match[1]);
    }
  }
  
  return imageRefs;
}

/**
 * Extracts embedded media images from a PPTX file and saves them to the attachments directory.
 * Maps images to their correct slide numbers by parsing slide relationship files.
 */
export async function extractMediaImagesFromPptx(
  pptxPath: string, 
  attachmentsDir: string, 
  baseFilename: string
): Promise<string[]> {
  try {
    // Ensure directory exists
    await fs.ensureDir(attachmentsDir);
    
    const attachmentPaths: string[] = [];
    const tempDir = path.join(attachmentsDir, '_temp_pptx');
    
    // Extract PPTX contents
    await fs.ensureDir(tempDir);
    
    // Extract both media files and slide relationships
    await new Promise<void>((resolve, reject) => {
      const unzip = spawn('unzip', [
        '-o',  // Overwrite files
        '-q',  // Quiet mode
        pptxPath,
        'ppt/media/*',          // Extract media files
        'ppt/slides/*.xml',     // Extract slide XML files
        'ppt/slides/_rels/*.xml.rels', // Extract slide relationships
        '-d', tempDir           // Extract to temp directory
      ]);
      
      unzip.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`unzip process exited with code ${code}`));
        }
      });
      
      unzip.on('error', (err) => {
        reject(err);
      });
    });
    
    // Check if media folder exists
    const mediaDir = path.join(tempDir, 'ppt', 'media');
    if (!fs.existsSync(mediaDir)) {
      console.log(`📭 No media folder found in PPTX: ${pptxPath}`);
      await fs.remove(tempDir);
      return [];
    }
    
    // Get all media files
    const mediaFiles = await fs.readdir(mediaDir);
    
    // Initialize tracking variables
    const imageHashes = new Set<string>();
    let attachmentNum = 1;
    let usedFallback = false;
    
    // Try to get slide-to-image mapping
    const slidesDir = path.join(tempDir, 'ppt', 'slides');
    const slideToImages = new Map<number, string[]>();
    
    try {
      if (fs.existsSync(slidesDir)) {
        // Get list of slide files
        const slideFiles = (await fs.readdir(slidesDir))
          .filter(file => file.match(/^slide\d+\.xml$/))
          .sort((a, b) => {
            const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
            const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
            return numA - numB;
          });
        
        // For each slide, find its images
        for (const slideFile of slideFiles) {
          const slideNum = parseInt(slideFile.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
          const relsDir = path.join(slidesDir, '_rels');
          
          if (fs.existsSync(relsDir)) {
            const relsFile = path.join(relsDir, `${slideFile}.rels`);
            
            if (await fs.pathExists(relsFile)) {
              const relsContent = await fs.readFile(relsFile, 'utf8');
              // Extract image relationships
              const imageRefs = extractImageReferences(relsContent);
              slideToImages.set(slideNum, imageRefs);
            }
          }
        }
      }
      
      // Process each slide and its associated images if we have slide mappings
      if (slideToImages.size > 0) {
        console.log(`🔍 Found ${slideToImages.size} slides with image references`);

        // Limit concurrency for image processing
        const limit = pLimit(8); // Limit to 4 concurrent operations

        // Create an array of promises for each image reference across all slides
        const imagePromises = [];
        for (const [slideNum, imageRefs] of slideToImages.entries()) {
          for (const imageRef of imageRefs) {
            if (!mediaFiles.includes(imageRef)) continue;

            imagePromises.push(limit(async () => {
              try {
                const filePath = path.join(mediaDir, imageRef);
                const stat = await fs.stat(filePath);

                if (!stat.isFile()) return null;

                // Check if it's an image
                const ext = path.extname(imageRef).toLowerCase().slice(1);
                if (!SUPPORTED_IMAGE_FORMATS.includes(ext)) return null;

                // Compute hash to avoid duplicates
                const imageData = await fs.readFile(filePath);
                const imageHash = require('crypto').createHash('md5').update(imageData).digest('hex');

                if (imageHashes.has(imageHash)) return null;

                imageHashes.add(imageHash);

                // Convert to WebP
                const webpFilename = `${baseFilename}-ps${slideNum}-${attachmentNum}.webp`;
                const webpPath = path.join(attachmentsDir, webpFilename);

                await sharp(filePath)
                  .webp({ quality: 85 })
                  .toFile(webpPath);

                console.log(`  ➡️ Extracted and converted image from slide ${slideNum}: ${webpFilename}`);
                attachmentNum++; // Increment after successful processing
                return webpPath; // Return the path on success

              } catch (e) {
                const error = e instanceof Error ? e : new Error(String(e));
                console.error(`⚠️ Error processing media file ${imageRef}: ${error.message}`);
                return null; // Return null on error
              }
            }));
          }
        }

        // Wait for all promises to settle and filter out null results (errors and skipped images)
        const results = await Promise.all(imagePromises);
        const successfulAttachmentPaths = results.filter(path => path !== null) as string[];
        attachmentPaths.push(...successfulAttachmentPaths);

      } else {
        throw new Error("No slide-to-image mappings found");
      }
    } catch (error) {
      // Fallback to the original method if slide mapping fails
      console.warn(`⚠️ Failed to map images to specific slides: ${error instanceof Error ? error.message : String(error)}`);
      console.warn(`⚠️ Falling back to using slide sequence numbers.`);
      usedFallback = true;

      // Limit concurrency for image processing in fallback mode
      const limit = pLimit(8); // Limit to 4 concurrent operations

      // Create an array of promises for each media file
      const fallbackImagePromises = mediaFiles.map(file => limit(async () => {
        try {
          const filePath = path.join(mediaDir, file);
          const stat = await fs.stat(filePath);

          if (!stat.isFile()) return null;

          // Check if it's an image
          const ext = path.extname(file).toLowerCase().slice(1);
          if (!SUPPORTED_IMAGE_FORMATS.includes(ext)) return null;

          // Compute hash to avoid duplicates
          const imageData = await fs.readFile(filePath);
          const imageHash = require('crypto').createHash('md5').update(imageData).digest('hex');

          if (imageHashes.has(imageHash)) return null;

          imageHashes.add(imageHash);

          // Convert to WebP
          // In fallback mode, we don't have accurate slide numbers, so we use a generic placeholder
          const webpFilename = `${baseFilename}-ps-fallback-${attachmentNum}.webp`;
          const webpPath = path.join(attachmentsDir, webpFilename);

          await sharp(filePath)
            .webp({ quality: 85 })
            .toFile(webpPath);

          console.log(`  ➡️ Extracted and converted image (fallback mode): ${webpFilename}`);
          attachmentNum++; // Increment after successful processing
          return webpPath; // Return the path on success

        } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e));
          console.error(`⚠️ Error processing media file ${file}: ${error.message}`);
          return null; // Return null on error
        }
      }));

      // Wait for all promises to settle and filter out null results (errors and skipped images)
      const results = await Promise.all(fallbackImagePromises);
      const successfulAttachmentPaths = results.filter(path => path !== null) as string[];
      attachmentPaths.push(...successfulAttachmentPaths);
    }

    // Clean up temporary directory
    await fs.remove(tempDir);

    if (usedFallback) {
      console.log(`🎉 Extracted ${attachmentPaths.length} unique images from PPTX (using fallback method)`);
    } else {
      console.log(`🎉 Extracted ${attachmentPaths.length} unique images from PPTX with correct slide numbers`);
    }

    return attachmentPaths;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`⚠️ Error in extractMediaImagesFromPptx: ${err.message}`);
    return [];
  }
}

/**
 * Extracts rendered images from a PPTX file.
 * Converts a PPTX file to PDF and then extracts rendered images from the PDF.
 * 
 * @param pptxPath - Path to the PPTX file
 * @param renderedDir - Directory to save rendered images
 * @param baseFilename - Base filename for the output images
 * @param apiKey - API key for the selected provider
 * @param modelName - Name of the AI model to use
 * @param prompt - Prompt for text extraction from image
 * @param parameters - Parameters for the API call
 * @param apiProvider - API provider ('openrouter', 'openai', or 'ollama')
 * @param processImageFn - Function to process a single image with the AI
 * @param timeBetweenRequests - Time to wait between API requests for rate limiting
 * @returns Array of objects containing image path, extracted text, and token count.
 */
export async function extractRenderedImagesFromPptx(
  pptxPath: string,
  renderedDir: string,
  baseFilename: string,
  apiKey: string,
  modelName: string,
  prompt: string,
  parameters: Record<string, any>,
  apiProvider: 'openrouter' | 'openai' | 'ollama' | 'together' | 'gemini' | 'fireworks',
  processImageFn: (imagePath: string, apiKey: string, modelName: string, prompt: string, parameters: Record<string, any>, apiProvider: 'openrouter' | 'openai' | 'ollama' | 'together' | 'gemini' | 'fireworks') => Promise<string>,
  timeBetweenRequests: number
): Promise<{ imgPath: string, result: string, tokenCount: number }[]> {
  // Import conversion function
  const { convertPptToPdf } = await import('./conversions.js');

  // Convert PPTX to PDF using LibreOffice
  const convertedPdf = await convertPptToPdf(pptxPath);
  if (!convertedPdf) {
    console.warn("⚠️ Failed to convert PPTX to PDF. Skipping rendered image extraction.");
    return [];
  }

  // Extract rendered images from the converted PDF and process them with AI
  const processedRenderedImages = await extractRenderedImagesFromPdf(
    convertedPdf,
    renderedDir,
    baseFilename,
    apiKey,
    modelName,
    prompt,
    parameters,
    apiProvider,
    processImageFn,
    timeBetweenRequests
  );
  return processedRenderedImages;
}

/**
 * Performs second-pass artifact detection on images using AI analysis.
 * Analyzes images after basic filtering to identify artifacts vs valuable content.
 * Returns structured JSON responses with classification and confidence scores.
 *
 * @param imagePaths - Array of image file paths to analyze
 * @param apiKey - API key for the selected provider
 * @param modelName - Name of the AI model to use
 * @param prompt - Specialized artifact detection prompt
 * @param parameters - Parameters for the API call
 * @param apiProvider - API provider ('openrouter', 'openai', 'ollama', 'together', 'gemini', 'fireworks')
 * @param confidenceThreshold - Minimum confidence score to keep an image (0.0-1.0)
 * @param maxConcurrency - Maximum number of concurrent API requests
 * @param timeBetweenRequests - Time to wait between API requests for rate limiting
 * @returns Object containing filtered image paths and detection results
 */
export async function detectArtifactsInImages(
  imagePaths: string[],
  apiKey: string,
  modelName: string,
  prompt: string,
  parameters: Record<string, any>,
  apiProvider: 'openrouter' | 'openai' | 'ollama' | 'together' | 'gemini' | 'fireworks',
  confidenceThreshold: number = 0.7,
  maxConcurrency: number = 4,
  timeBetweenRequests: number = 1000
): Promise<{
  filteredImagePaths: string[];
  detectionResults: Array<{
    imagePath: string;
    isArtifact: boolean;
    confidence: number;
    artifactType?: string;
    reasoning?: string;
    recommendation?: 'keep' | 'discard';
  }>;
  statistics: {
    totalImages: number;
    artifactsDetected: number;
    valuableContent: number;
    averageConfidence: number;
  };
}> {
  try {
    console.log(`🔍 Starting second-pass artifact detection for ${imagePaths.length} images...`);
    console.log(`📊 Using confidence threshold: ${confidenceThreshold}, max concurrency: ${maxConcurrency}`);

    // Import required modules
    const { getDataUrl } = await import('../utils');
    const { parseArtifactDetectionResponse, shouldKeepImage } = await import('../types/artifact_detection');

    // Initialize statistics
    const statistics = {
      totalImages: imagePaths.length,
      artifactsDetected: 0,
      valuableContent: 0,
      averageConfidence: 0
    };

    const detectionResults: Array<{
      imagePath: string;
      isArtifact: boolean;
      confidence: number;
      artifactType?: string;
      reasoning?: string;
      recommendation?: 'keep' | 'discard';
    }> = [];

    // If no images to process, return early
    if (imagePaths.length === 0) {
      console.log("ℹ️ No images to analyze for artifacts.");
      return {
        filteredImagePaths: [],
        detectionResults: [],
        statistics
      };
    }

    // Set up concurrency limiting
    const requestsPerSecond = 1000 / timeBetweenRequests;
    const limit = pLimit(Math.min(maxConcurrency, Math.ceil(requestsPerSecond)));

    // Import the appropriate artifact detection function based on API provider
    let detectArtifactsFn: (dataUrl: string, apiKey: string, modelName: string, prompt: string, parameters: Record<string, any>) => Promise<any>;
    
    switch (apiProvider) {
      case 'openai':
        const { detectArtifactsInImage: detectArtifactsOpenAI } = await import('../api/openai_api');
        detectArtifactsFn = detectArtifactsOpenAI;
        break;
      case 'openrouter':
        const { detectArtifactsInImage: detectArtifactsOpenRouter } = await import('../api/openrouter_api');
        detectArtifactsFn = detectArtifactsOpenRouter;
        break;
      case 'ollama':
        const { detectArtifactsInImage: detectArtifactsOllama } = await import('../api/ollama_api');
        detectArtifactsFn = detectArtifactsOllama;
        break;
      case 'together':
        const { detectArtifactsInImageTogetherAI } = await import('../api/together_api');
        detectArtifactsFn = detectArtifactsInImageTogetherAI;
        break;
      case 'gemini':
        const { detectArtifactsInImageGemini } = await import('../api/gemini_api');
        detectArtifactsFn = detectArtifactsInImageGemini;
        break;
      case 'fireworks':
        const { detectArtifactsInImage: detectArtifactsFireworks } = await import('../api/fireworks_api');
        detectArtifactsFn = detectArtifactsFireworks;
        break;
      default:
        throw new Error(`Unsupported API provider: ${apiProvider}`);
    }

    // Process each image for artifact detection
    const detectionPromises = imagePaths.map(imagePath => limit(async () => {
      try {
        console.log(`  🔍 Analyzing image for artifacts: ${path.basename(imagePath)}`);
        
        // Convert image to data URL for API processing
        const dataUrl = await getDataUrl(imagePath);
        
        if (!dataUrl) {
          console.warn(`  ⚠️ Failed to convert image to data URL: ${path.basename(imagePath)}`);
          // Default to keeping the image if conversion fails
          return {
            imagePath,
            isArtifact: false,
            confidence: 0.5,
            artifactType: 'unknown',
            reasoning: 'Image conversion failed - defaulting to keep',
            recommendation: 'keep' as const
          };
        }
        
        // Call the artifact detection API
        const response = await detectArtifactsFn(dataUrl, apiKey, modelName, prompt, parameters);
        
        if (!response) {
          console.warn(`  ⚠️ No response from artifact detection API for ${path.basename(imagePath)}`);
          // Default to keeping the image if detection fails
          return {
            imagePath,
            isArtifact: false,
            confidence: 0.5,
            artifactType: 'unknown',
            reasoning: 'Detection failed - defaulting to keep',
            recommendation: 'keep' as const
          };
        }

        // The response should already be parsed as ArtifactDetectionResponse
        const parsedResponse = response;
        
        // Determine if we should keep the image based on detection results
        const shouldKeep = shouldKeepImage(parsedResponse, confidenceThreshold);
        
        const detectionResult = {
          imagePath,
          isArtifact: parsedResponse.is_artifact,
          confidence: parsedResponse.confidence,
          artifactType: parsedResponse.artifact_type,
          reasoning: parsedResponse.reason,
          recommendation: (shouldKeep ? 'keep' : 'discard') as 'keep' | 'discard'
        };

        // Log the result
        const statusIcon = shouldKeep ? '✅' : '🗑️';
        const statusText = shouldKeep ? 'KEEP' : 'DISCARD';
        const confidence = parsedResponse.confidence !== undefined ? parsedResponse.confidence.toFixed(2) : 'undefined';
        console.log(`  ${statusIcon} ${path.basename(imagePath)}: ${statusText} (${parsedResponse.artifact_type}, confidence: ${confidence})`);
        
        if (parsedResponse.reason) {
          console.log(`    💡 Reasoning: ${parsedResponse.reason.substring(0, 100)}...`);
        }

        return detectionResult;
        
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`  ❌ Error detecting artifacts in ${path.basename(imagePath)}: ${err.message}`);
        
        // Default to keeping the image if an error occurs
        return {
          imagePath,
          isArtifact: false,
          confidence: 0.5,
          artifactType: 'error',
          reasoning: `Detection error: ${err.message}`,
          recommendation: 'keep' as const
        };
      }
    }));

    // Wait for all detection promises to complete
    const results = await Promise.all(detectionPromises);
    detectionResults.push(...results);

    // Calculate statistics
    let totalConfidence = 0;
    let validConfidenceCount = 0;

    for (const result of detectionResults) {
      if (result.recommendation === 'discard') {
        statistics.artifactsDetected++;
      } else {
        statistics.valuableContent++;
      }
      
      if (result.confidence > 0) {
        totalConfidence += result.confidence;
        validConfidenceCount++;
      }
    }

    statistics.averageConfidence = validConfidenceCount > 0 ? totalConfidence / validConfidenceCount : 0;

    // Filter image paths based on detection results
    const filteredImagePaths = detectionResults
      .filter(result => result.recommendation === 'keep')
      .map(result => result.imagePath);

    // Actually delete the files that are identified as artifacts
    const artifactsToDelete = detectionResults
      .filter(result => result.recommendation === 'discard')
      .map(result => result.imagePath);

    if (artifactsToDelete.length > 0) {
      console.log(`🗑️ Deleting ${artifactsToDelete.length} artifact files...`);
      
      for (const artifactPath of artifactsToDelete) {
        try {
          if (fs.existsSync(artifactPath)) {
            await fs.remove(artifactPath);
            console.log(`  🗑️ Deleted artifact file: ${path.basename(artifactPath)}`);
          } else {
            console.warn(`  ⚠️ Artifact file not found: ${path.basename(artifactPath)}`);
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          console.error(`  ❌ Failed to delete artifact file ${path.basename(artifactPath)}: ${err.message}`);
        }
      }
    }

    // Log summary statistics
    console.log(`🎯 Artifact detection complete:`);
    console.log(`   📊 Total images analyzed: ${statistics.totalImages}`);
    console.log(`   🗑️ Artifacts detected: ${statistics.artifactsDetected}`);
    console.log(`   ✅ Valuable content: ${statistics.valuableContent}`);
    console.log(`   📈 Average confidence: ${statistics.averageConfidence.toFixed(2)}`);
    console.log(`   🎯 Images remaining after filtering: ${filteredImagePaths.length}`);

    return {
      filteredImagePaths,
      detectionResults,
      statistics
    };

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`❌ Error in detectArtifactsInImages: ${err.message}`);
    
    // On error, return all images as filtered (fail-safe)
    return {
      filteredImagePaths: imagePaths,
      detectionResults: imagePaths.map(imagePath => ({
        imagePath,
        isArtifact: false,
        confidence: 0.5,
        artifactType: 'error',
        reasoning: `System error: ${err.message}`,
        recommendation: 'keep' as const
      })),
      statistics: {
        totalImages: imagePaths.length,
        artifactsDetected: 0,
        valuableContent: imagePaths.length,
        averageConfidence: 0.5
      }
    };
  }
}
