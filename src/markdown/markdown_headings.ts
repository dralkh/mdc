import * as fs from 'fs-extra';
import * as path from 'path';
import { cleanMarkdownCodeBlocks } from './markdown';

// Set up logging
const logger = {
  info: (message: string) => console.log(message),
  warn: (message: string) => console.warn(`⚠️ ${message}`),
  error: (message: string) => console.error(`❌ ${message}`),
  debug: (message: string) => console.debug(`🔍 ${message}`)
};

// Define a type for TOC nodes for better type safety
type TocNode = {
  tocLevel: number; // Level based on indentation in TOC (0-based)
  markdownLevel: number; // Corresponding markdown heading level (1-based)
  text: string;
  children: TocNode[];
};

/**
 * Parse the TOC content and build a hierarchical structure.
 *
 * @param tocContent The content of the TOC markdown file.
 * @returns The TOC hierarchy as an array of TocNode objects.
 */
export function parseToc(tocContent: string): TocNode[] {
  logger.info("Parsing TOC content.");
  logger.debug("Raw TOC content:\n" + tocContent);
  
  const tocHierarchy: TocNode[] = [];
  const headingStack: TocNode[] = []; // Stack to keep track of parent nodes

  const lines = tocContent.split('\n');
  let validTocItems = 0;
  let foundTocHeader = false;
  
  for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
    const originalLine = lines[lineNumber];
    const line = originalLine.trim();
    
    // Skip the "Table of Contents" header line
    if (line.startsWith('## Table of Contents')) {
      foundTocHeader = true;
      continue;
    }
    
    // Skip empty lines and headers
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }

    // Match lines starting with '- ' or '- [[' or just bullet points
    const tocItemMatch = originalLine.match(/^(\s*)(?:[-*+])\s+(.*)$/);
    if (!tocItemMatch) {
      // Also check for numbered lists
      const numberedMatch = originalLine.match(/^(\s*)\d+\.\s+(.*)$/);
      if (numberedMatch) {
        logger.debug(`Line ${lineNumber + 1}: Found numbered TOC item: '${originalLine}'`);
      } else {
        logger.debug(`Line ${lineNumber + 1}: Skipping non-TOC line: '${originalLine}'`);
      }
      continue; // Skip lines that don't represent TOC items
    }

    const indentation = tocItemMatch[1].length;
    let headingText = tocItemMatch[2].trim();

    // Handle Obsidian link format [[...]]
    if (headingText.startsWith('[[')) {
      headingText = headingText.substring(2, headingText.length - 2).trim();
    }

    // Calculate TOC level based on indentation (assuming 2 spaces per level)
    // Level 0 for 0 indentation, Level 1 for 2 spaces, etc.
    const tocLevel = Math.floor(indentation / 2);
    const markdownLevel = tocLevel + 1; // Map TOC level 0 to Markdown #, 1 to ##, etc.

    const newHeading: TocNode = {
      tocLevel: tocLevel,
      markdownLevel: markdownLevel,
      text: headingText,
      children: []
    };

    // Adjust the stack to find the correct parent
    while (headingStack.length > 0 && headingStack[headingStack.length - 1].tocLevel >= tocLevel) {
      headingStack.pop();
    }

    // Add the new heading to its parent's children or to the root hierarchy
    if (headingStack.length > 0) {
      headingStack[headingStack.length - 1].children.push(newHeading);
    } else {
      tocHierarchy.push(newHeading);
    }

    // Push the new heading onto the stack
    headingStack.push(newHeading);
    
    validTocItems++;
    logger.debug(`Line ${lineNumber + 1}: Found heading '${headingText}' with TOC level ${tocLevel} (Markdown level ${markdownLevel}).`);
  }

  logger.info(`Parsed ${validTocItems} valid TOC items from ${lines.length} total lines.`);
  logger.debug("Parsed TOC hierarchy: " + JSON.stringify(tocHierarchy, null, 2));
  return tocHierarchy;
}

/**
 * Flattens the TOC hierarchy into a depth-first ordered list.
 * @param hierarchy The hierarchical TOC structure.
 * @returns A flat array of TocNode objects.
 */
export function flattenTocHierarchy(hierarchy: TocNode[]): TocNode[] {
  const flatList: TocNode[] = [];
  function traverse(nodes: TocNode[]) {
    for (const node of nodes) {
      flatList.push(node);
      traverse(node.children);
    }
  }
  traverse(hierarchy);
  return flatList;
}

/**
 * Update the heading levels in the markdown content based on the flattened TOC order.
 * Insert missing headings from the TOC. Preserve headings/content not in the TOC.
 *
 * @param content The original markdown content.
 * @param flatToc The flattened TOC list (depth-first order).
 * @returns The updated markdown content.
 */
export function updateHeadingsWithHierarchy(
  content: string,
  flatToc: TocNode[]
): string {
  logger.info("Updating headings and inserting missing ones based on flattened TOC order.");
  logger.info(`Processing ${flatToc.length} headings from flattened TOC`);

  const lines = content.split('\n');
  const updatedLines: string[] = [];
  let tocIndex = 0; // Pointer to the current expected heading in the flat TOC
  
  // Log all TOC headings for debugging
  flatToc.forEach((node, index) => {
    logger.debug(`TOC[${index}]: level=${node.markdownLevel}, text="${node.text}"`);
  });

  let lineNumber = 0;
  for (const line of lines) {
    lineNumber++;
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);

    if (headingMatch) {
      const originalHashes = headingMatch[1];
      const headingText = headingMatch[2].trim();
      const originalLevel = originalHashes.length;

      logger.debug(`Line ${lineNumber}: Found heading "${headingText}" (level ${originalLevel})`);

      // Search for this heading text in the *remaining* part of the flat TOC
      let foundTocIndex = -1;
      
      // Try exact match first
      for (let i = tocIndex; i < flatToc.length; i++) {
        if (flatToc[i].text === headingText) {
          foundTocIndex = i;
          logger.debug(`Exact match found for "${headingText}" at TOC index ${i}`);
          break;
        }
      }
      
      // If no exact match, try case-insensitive match
      if (foundTocIndex === -1) {
        const lowerHeadingText = headingText.toLowerCase();
        for (let i = tocIndex; i < flatToc.length; i++) {
          if (flatToc[i].text.toLowerCase() === lowerHeadingText) {
            foundTocIndex = i;
            logger.debug(`Case-insensitive match found for "${headingText}" at TOC index ${i}`);
            break;
          }
        }
      }
      
      // If still no match, try removing extra spaces and punctuation
      if (foundTocIndex === -1) {
        const normalizedHeading = headingText
          .replace(/\s+/g, ' ')
          .replace(/[^\w\s]/g, '')
          .trim()
          .toLowerCase();
          
        for (let i = tocIndex; i < flatToc.length; i++) {
          const normalizedToc = flatToc[i].text
            .replace(/\s+/g, ' ')
            .replace(/[^\w\s]/g, '')
            .trim()
            .toLowerCase();
            
          if (normalizedToc === normalizedHeading) {
            foundTocIndex = i;
            logger.debug(`Normalized match found for "${headingText}" at TOC index ${i}`);
            break;
          }
        }
      }

      if (foundTocIndex !== -1) {
        // Found the heading in the TOC.
        logger.debug(`Line ${lineNumber}: Matched heading "${headingText}" to TOC[${foundTocIndex}]`);
        
        // 1. Insert any preceding TOC headings that were missed.
        while (tocIndex < foundTocIndex) {
          const missingTocNode = flatToc[tocIndex];
          const missingHeadingLine = '#'.repeat(missingTocNode.markdownLevel) + ' ' + missingTocNode.text;
          updatedLines.push(missingHeadingLine);
          logger.info(`Inserted missing heading from TOC: ${missingHeadingLine}`);
          tocIndex++;
        }

        // 2. Add the matched heading with the correct level from TOC.
        const matchedTocNode = flatToc[foundTocIndex];
        const updatedHeadingLine = '#'.repeat(matchedTocNode.markdownLevel) + ' ' + matchedTocNode.text;
        updatedLines.push(updatedHeadingLine);
        logger.info(`Updated heading level for: ${updatedHeadingLine} (Original level: ${originalLevel})`);

        // 3. Advance tocIndex past the matched heading.
        tocIndex = foundTocIndex + 1;

      } else {
        // Heading not found in the remaining TOC. Preserve it as is.
        logger.warn(`Line ${lineNumber}: Heading "${headingText}" (level ${originalLevel}) not found in the remaining TOC. Preserving original.`);
        logger.debug(`Available TOC headings from index ${tocIndex}: ${flatToc.slice(tocIndex).map(h => `"${h.text}"`).join(', ')}`);
        updatedLines.push(line);
      }
    } else {
      // Not a heading line, just add it to the output.
      updatedLines.push(line);
    }
  }

  // After processing all markdown lines, append any remaining headings from the TOC.
  let remainingCount = 0;
  while (tocIndex < flatToc.length) {
    const remainingTocNode = flatToc[tocIndex];
    const remainingHeadingLine = '#'.repeat(remainingTocNode.markdownLevel) + ' ' + remainingTocNode.text;
    // Add a newline before appending if the last line wasn't empty
    if (updatedLines.length > 0 && updatedLines[updatedLines.length - 1].trim() !== '') {
        updatedLines.push(''); // Add spacing
    }
    updatedLines.push(remainingHeadingLine);
    logger.info(`Appended remaining heading from TOC: ${remainingHeadingLine}`);
    tocIndex++;
    remainingCount++;
  }
  
  if (remainingCount > 0) {
    logger.info(`Appended ${remainingCount} remaining headings at the end`);
  }

  const finalContent = updatedLines.join('\n');

  // Clean the markdown content (optional, based on original logic)
  const cleanedContent = cleanMarkdownCodeBlocks(finalContent);

  logger.info(`Heading update completed. Processed ${lineNumber} lines.`);
  return cleanedContent;
}


/**
 * Split the markdown content into multiple files based on second-level headings (##).
 *
 * @param content The markdown content to split.
 * @param outputDir The directory where the split files will be saved.
/**
 * Updates markdown headings based on TOC and returns the updated content.
 * @param markdownFile Path to the markdown file to process.
 * @param tocFile Path to the TOC file.
 * @param presentationOutputDir Directory to save backup and content files. Defaults to undefined.
 * @returns The updated markdown content, or null on error.
 */
export async function updateMarkdownHeadings(
  markdownFile: string,
  tocFile: string,
  presentationOutputDir?: string
): Promise<string | null> {
  // Make presentation_output_dir available to the rest of the function as a separate variable
  const presentationDir = presentationOutputDir;
  
  logger.info(`Processing Markdown file: ${markdownFile}`);
  logger.info(`Using TOC file: ${tocFile}`);

  let tocContent: string;
  try {
    tocContent = await fs.readFile(tocFile, 'utf8');
    logger.info(`Reading TOC file '${tocFile}'.`);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (err.message.includes('ENOENT')) {
      logger.error(`TOC file '${tocFile}' not found.`);
    } else {
      logger.error(`Error reading TOC file '${tocFile}': ${err.message}`);
    }
    return null;
  }

  const tocHierarchy = parseToc(tocContent);
  const flatToc = flattenTocHierarchy(tocHierarchy);

  let content: string;
  try {
    content = await fs.readFile(markdownFile, 'utf8');
    logger.info(`Reading Markdown file '${markdownFile}'.`);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (err.message.includes('ENOENT')) {
      logger.error(`Markdown file '${markdownFile}' not found.`);
    } else {
      logger.error(`Error reading Markdown file '${markdownFile}': ${err.message}`);
    }
    return null;
  }

  // Pass the flattened TOC list instead of the hierarchy and map
  const updatedContent = updateHeadingsWithHierarchy(content, flatToc);

  // ONLY create a backup if presentationOutputDir is specified
  // This prevents creating backups in the topics folder
  if (presentationDir) {
    const markdownPath = path.parse(markdownFile);
    const backupFilename = markdownPath.base + ".backup";
    const backupPath = path.join(presentationDir, backupFilename);
    logger.info(`Creating backup in presentation output directory: ${backupPath}`);
    
    try {
      await fs.copy(markdownFile, backupPath);
      logger.info(`Backup created at '${backupPath}'.`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.warn(`Could not create backup file '${backupPath}': ${err.message}`);
    }
  } else {
    logger.info(`No presentation_output_dir provided. Skipping backup creation.`);
  }

  try {
    await fs.writeFile(markdownFile, updatedContent, 'utf8');
    logger.info(`Successfully updated headings in '${markdownFile}'.`);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`Error writing to file '${markdownFile}': ${err.message}`);
    return null;
  }

  // Removed the splitIntoFiles call and related logic

  return updatedContent;
}

// Removed the main function
