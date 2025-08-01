import * as fs from 'fs-extra';
import * as path from 'path';
import { spawn } from 'child_process';
import { PDF_QUALITY_SETTINGS } from './constants';
import sharp from 'sharp';

/**
 * Compresses a PDF file using Poppler's pdftocairo.
 * Includes fallback to use original file if compression fails.
 * 
 * @param inputPdfPath - Path to the input PDF file.
 * @param outputPdfPath - Path to save the compressed PDF file.
 * @param quality - Compression quality. Options: 'screen', 'ebook', 'printer', 'prepress'.
 * @returns True if compression is successful or fallback succeeds, False otherwise.
 */
export async function compressPdf(
  inputPdfPath: string, 
  outputPdfPath: string, 
  quality: keyof typeof PDF_QUALITY_SETTINGS = 'ebook'
): Promise<boolean> {
  if (!(quality in PDF_QUALITY_SETTINGS)) {
    console.warn(`⚠️ Invalid quality setting '${quality}'. Using 'ebook' as default.`);
    quality = 'ebook';
  }

  // Import findExecutablePath from utils
  const { findExecutablePath } = await import('../utils');

  // Find pdftocairo executable path with enhanced detection
  const pdftocairoPath = await findExecutablePath('pdftocairo', 'PDFTOCAIRO_PATH');

  // If pdftocairo is not available, just copy the file
  if (!pdftocairoPath) {
    console.warn("⚠️ Will use the original PDF without compression.");
    try {
      await fs.copy(inputPdfPath, outputPdfPath);
      console.log(`⚠️ PDF compression skipped. Copied original to: ${path.basename(outputPdfPath)}`);
      return true; // Return true to allow processing to continue
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`❌ Error copying PDF file: ${err.message}`);
      return false;
    }
  }

  // Get the quality settings
  const settings = PDF_QUALITY_SETTINGS[quality];
  
  // Create temp filename for pdftocairo output (it doesn't need extension)
  const tempOutputBase = outputPdfPath.replace('.pdf', '');
  
  try {
    // Use pdftocairo to compress the PDF
    await new Promise<void>((resolve, reject) => {
      const pdftocairo = spawn(pdftocairoPath, [
        '-pdf',                 // Output to PDF
        '-r', settings.dpi.toString(),  // Resolution
        inputPdfPath,          // Input path
        tempOutputBase         // Output path without extension
      ]);
      
      let errorOutput = '';
      
      // Capture error output
      pdftocairo.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pdftocairo.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`pdftocairo process exited with code ${code}${errorOutput ? ': ' + errorOutput.trim() : ''}`));
        }
      });
      
      pdftocairo.on('error', (err) => {
        reject(new Error(`Error executing pdftocairo: ${err.message}`));
      });
    });
    
    // pdftocairo automatically adds .pdf extension
    const actualOutputPath = tempOutputBase + '.pdf';
    
    if (fs.existsSync(actualOutputPath)) {
      // If output path is not the same as the actual pdftocairo output path, rename it
      if (actualOutputPath !== outputPdfPath) {
        await fs.rename(actualOutputPath, outputPdfPath);
      }
      console.log(`✅ Successfully compressed PDF: ${path.basename(outputPdfPath)}`);
      return true;
    } else {
      console.warn(`⚠️ Compression failed: ${path.basename(actualOutputPath)} not found.`);
      // Fall back to copying the original file
      console.warn(`⚠️ Falling back to using original PDF file...`);
      await fs.copy(inputPdfPath, outputPdfPath);
      console.log(`✅ Copied original PDF to: ${path.basename(outputPdfPath)}`);
      return true;
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`⚠️ Error compressing PDF ${path.basename(inputPdfPath)}: ${err.message}`);
    
    // Try to check if the input PDF is valid
    let validPdf = true;
    try {
      // Find pdfinfo executable
      const pdfinfoPath = await findExecutablePath('pdfinfo', 'PDFINFO_PATH');
      
      if (pdfinfoPath) {
        await new Promise<void>((resolve) => {
          const pdfinfo = spawn(pdfinfoPath, [inputPdfPath]);
          
          let pdfErrorOutput = '';
          pdfinfo.stderr.on('data', (data) => {
            pdfErrorOutput += data.toString();
          });
          
          pdfinfo.on('close', (code) => {
            if (code === 0) {
              resolve();
            } else {
              console.error(`❌ The PDF file ${path.basename(inputPdfPath)} appears to be invalid or corrupted.`);
              console.error(`   Error: ${pdfErrorOutput.trim()}`);
              validPdf = false;
              resolve(); // We still want to continue
            }
          });
          
          pdfinfo.on('error', () => {
            resolve();
          });
        });
      }
    } catch (e) {
      // Ignore any errors in validation
      console.warn(`⚠️ Could not validate PDF file. Please check if it's valid and not corrupted.`);
    }
    
    // If the PDF seems valid, try to copy it as a fallback
    if (validPdf) {
      try {
        console.warn(`⚠️ Attempting to use original PDF without compression...`);
        await fs.copy(inputPdfPath, outputPdfPath);
        console.log(`✅ Copied original PDF to: ${path.basename(outputPdfPath)}`);
        return true;
      } catch (copyError) {
        const cErr = copyError instanceof Error ? copyError : new Error(String(copyError));
        console.error(`❌ Error copying original PDF file: ${cErr.message}`);
      }
    }
    
    return false;
  }
}

/**
 * Optimizes PPTX files by compressing embedded images.
 * 
 * @param inputPptxPath - Path to the input PPTX file.
 * @param outputPptxPath - Path to save the optimized PPTX file.
 * @param imageQuality - JPEG compression quality (1-100).
 * @returns True if optimization is successful, False otherwise.
 */
export async function optimizePptxImages(
  inputPptxPath: string, 
  outputPptxPath: string, 
  imageQuality: number = 75
): Promise<boolean> {
  try {
    // For TypeScript implementation, we'll do a simplified version
    // using filesystem operations - in a real implementation you'd use
    // a library like pptxgenjs
    
    // 1. Create temporary directory
    const tempDir = path.join(path.dirname(outputPptxPath), '_temp_pptx_optimize');
    await fs.ensureDir(tempDir);
    
    // 2. Extract PPTX to temp directory (it's a zip file)
    await new Promise<void>((resolve, reject) => {
      const unzip = spawn('unzip', [
        '-o',  // Overwrite files
        '-q',  // Quiet mode
        inputPptxPath,
        '-d', tempDir
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
    
    // 3. Find and optimize images in media folder
    const mediaDir = path.join(tempDir, 'ppt', 'media');
    let optimized = false;
    
    if (fs.existsSync(mediaDir)) {
      const files = await fs.readdir(mediaDir);
      
      for (const file of files) {
        const filePath = path.join(mediaDir, file);
        const ext = path.extname(file).toLowerCase();
        
        if (['.jpeg', '.jpg', '.png'].includes(ext)) {
          try {
            // Optimize the image
            await sharp(filePath)
              .jpeg({ quality: imageQuality })
              .toBuffer()
              .then(buffer => fs.writeFile(filePath, buffer));
            
            optimized = true;
          } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            console.warn(`⚠️ Error optimizing image ${file}: ${error.message}`);
          }
        }
      }
    }
    
    // 4. Repackage as PPTX
    await new Promise<void>((resolve, reject) => {
      const zip = spawn('zip', [
        '-r',  // Recursive
        '-q',  // Quiet mode
        outputPptxPath,
        '.'   // Current directory (temp_dir)
      ], { cwd: tempDir });
      
      zip.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`zip process exited with code ${code}`));
        }
      });
      
      zip.on('error', (err) => {
        reject(err);
      });
    });
    
    // 5. Clean up temporary directory
    await fs.remove(tempDir);
    
    if (optimized) {
      console.log(`✅ Successfully optimized PPTX: ${path.basename(outputPptxPath)}`);
      return true;
    } else {
      console.warn(`⚠️ No images optimized in PPTX: ${path.basename(inputPptxPath)}`);
      return false;
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`⚠️ Error optimizing PPTX ${path.basename(inputPptxPath)}: ${err.message}`);
    return false;
  }
}

/**
 * Converts a .ppt or .ppsx file to .pptx using LibreOffice's command-line interface.
 * Returns the path to the converted .pptx file or null if conversion fails.
 */
export async function convertPresentationToPptx(
  presentationPath: string, 
  outputDir: string
): Promise<string | null> {
  // Import findExecutablePath from utils
  const { findExecutablePath } = await import('../utils');

  // Find LibreOffice executable path
  const sofficePath = await findExecutablePath('soffice', 'LIBREOFFICE_PATH');

  if (!sofficePath) {
    console.error("❌ LibreOffice 'soffice' command not found. Please install LibreOffice and add it to your PATH or set LIBREOFFICE_PATH environment variable.");
    return null;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const soffice = spawn(sofficePath, [
        "--headless",
        "--convert-to", "pptx",
        presentationPath,
        "--outdir", outputDir
      ]);
      
      soffice.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`soffice process exited with code ${code}`));
        }
      });
      
      soffice.on('error', (err) => {
        reject(err);
      });
    });
    
    const baseName = path.basename(presentationPath, path.extname(presentationPath));
    const convertedPptx = path.join(outputDir, `${baseName}.pptx`);
    
    if (fs.existsSync(convertedPptx)) {
      console.log(`✅ Successfully converted ${path.basename(presentationPath)} to ${path.basename(convertedPptx)}`);
      return convertedPptx;
    } else {
      console.warn(`⚠️ Conversion failed: ${path.basename(convertedPptx)} not found.`);
      return null;
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`⚠️ Error converting ${path.basename(presentationPath)} to PPTX: ${err.message}`);
    return null;
  }
}

/**
 * Converts a PPTX file to PDF using LibreOffice's command-line interface.
 * Returns the path to the converted PDF file or null if conversion fails.
 */
export async function convertPptToPdf(pptxPath: string): Promise<string | null> {
  // Import findExecutablePath from utils
  const { findExecutablePath } = await import('../utils');

  // Find LibreOffice executable path
  const sofficePath = await findExecutablePath('soffice', 'LIBREOFFICE_PATH');

  if (!sofficePath) {
    console.error("❌ LibreOffice 'soffice' command not found. Please install LibreOffice and add it to your PATH or set LIBREOFFICE_PATH environment variable.");
    return null;
  }

  const outputDir = path.dirname(pptxPath);
  
  try {
    await new Promise<void>((resolve, reject) => {
      const soffice = spawn(sofficePath, [
        "--headless",
        "--convert-to", "pdf",
        pptxPath,
        "--outdir", outputDir
      ]);
      
      soffice.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`soffice process exited with code ${code}`));
        }
      });
      
      soffice.on('error', (err) => {
        reject(err);
      });
    });
    
    const baseName = path.basename(pptxPath, path.extname(pptxPath));
    const convertedPdf = path.join(outputDir, `${baseName}.pdf`);
    
    if (fs.existsSync(convertedPdf)) {
      console.log(`✅ Successfully converted ${path.basename(pptxPath)} to ${path.basename(convertedPdf)}`);
      return convertedPdf;
    } else {
      console.warn(`⚠️ Conversion failed: ${path.basename(convertedPdf)} not found.`);
      return null;
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`⚠️ Error converting ${path.basename(pptxPath)} to PDF: ${err.message}`);
    return null;
  }
}

/**
 * Converts a DOC or DOCX file to PDF using LibreOffice's command-line interface.
 * Returns the path to the converted PDF file or null if conversion fails.
 */
export async function convertDocToPdf(
  docPath: string, 
  outputDir: string
): Promise<string | null> {
  // Import findExecutablePath from utils
  const { findExecutablePath } = await import('../utils');

  // Find LibreOffice executable path
  const sofficePath = await findExecutablePath('soffice', 'LIBREOFFICE_PATH');

  if (!sofficePath) {
    console.error("❌ LibreOffice 'soffice' command not found. Please install LibreOffice and add it to your PATH or set LIBREOFFICE_PATH environment variable.");
    return null;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const soffice = spawn(sofficePath, [
        "--headless",
        "--convert-to", "pdf",
        docPath,
        "--outdir", outputDir
      ]);
      
      soffice.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`soffice process exited with code ${code}`));
        }
      });
      
      soffice.on('error', (err) => {
        reject(err);
      });
    });
    
    const baseName = path.basename(docPath, path.extname(docPath));
    const convertedPdf = path.join(outputDir, `${baseName}.pdf`);
    
    if (fs.existsSync(convertedPdf)) {
      console.log(`✅ Successfully converted ${path.basename(docPath)} to ${path.basename(convertedPdf)}`);
      return convertedPdf;
    } else {
      console.warn(`⚠️ Conversion failed: ${path.basename(convertedPdf)} not found.`);
      return null;
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`⚠️ Error converting ${path.basename(docPath)} to PDF: ${err.message}`);
    return null;
  }
}
