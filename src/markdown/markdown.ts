import * as fs from 'fs-extra';
import * as path from 'path';
import { estimateTokenCount } from '../utils';

interface Heading {
  level: number;
  text: string;
  wordCount?: number; // Added for word count
}

/**
 * Counts words in a given text string after removing markdown formatting.
 * @param text The text to count words from.
 * @returns The number of words.
 */
function countWords(text: string): number {
  const cleanedText = removeMarkdownFormatting(text);
  if (!cleanedText.trim()) {
    return 0;
  }
  return cleanedText.trim().split(/\s+/).length;
}

/**
 * Extracts all headings from the provided markdown_text along with their word counts.
 * Word counts are based on the content under each heading until the next heading or end of document.
 * Returns an array of Heading objects with level, text, and wordCount.
 */
export function extractHeadingsWithWordCounts(markdownText: string): Heading[] {
  const headingsWithContent: Heading[] = [];
  const lines = markdownText.split('\n');
  let currentContent: string[] = [];
  let lastHeading: Heading | null = null;

  const headingPattern = /^(#{1,6})\s+(.*)/;

  for (const line of lines) {
    const match = line.match(headingPattern);
    if (match) { // New heading found
      if (lastHeading) { // Finalize previous heading's content and word count
        lastHeading.wordCount = countWords(currentContent.join('\n'));
        // Only add if it's a valid heading (text is not empty)
        if (lastHeading.text) {
            headingsWithContent.push(lastHeading);
        }
      }
      // Reset content for new heading
      currentContent = []; 
      lastHeading = { 
        level: match[1].length, 
        text: match[2].trim(), 
        // wordCount will be calculated when the next heading or EOF is found
      };
    } else { // Not a heading line
      if (lastHeading) { // Only collect content if we are currently under a heading
        currentContent.push(line);
      }
    }
  }

  // Process the last heading in the document
  if (lastHeading && lastHeading.text) { 
    lastHeading.wordCount = countWords(currentContent.join('\n'));
    headingsWithContent.push(lastHeading);
  }
  
  return headingsWithContent;
}


/**
 * Saves the extracted headings (now including word counts) to a Markdown file.
 */
export async function saveExtractedHeadings(headings: Heading[], outputPath: string): Promise<void> {
  try {
    // Ensure parent directory exists
    await fs.ensureDir(path.dirname(outputPath));
    
    // Create the content, now including word count
    const content = headings.map(({ level, text, wordCount }) => {
      const hashes = '#'.repeat(level);
      const wordCountDisplay = wordCount !== undefined ? ` (${wordCount} words)` : '';
      return `${hashes} ${text}${wordCountDisplay}`;
    }).join('\n');
    
    // Write to file
    await fs.writeFile(outputPath, content, 'utf8');
    console.log(`✅ Extracted headings saved to ${outputPath}`);
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`❌ Error saving extracted headings to ${outputPath}: ${error.message}`);
    console.error(`   Path attempted: ${outputPath}`);
  }
}

/**
 * Injects the TOC at the beginning of the markdown_text and saves it to output_path.
 */
export async function injectTocIntoMarkdown(toc: string, markdownText: string, outputPath: string): Promise<void> {
  try {
    // Ensure parent directory exists
    await fs.ensureDir(path.dirname(outputPath));
    
    // Combine TOC and markdown
    const content = `${toc}\n\n${markdownText}`;
    
    // Write to file
    await fs.writeFile(outputPath, content, 'utf8');
    console.log(`✅ TOC injected and main Markdown saved to ${outputPath}`);
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`❌ Error injecting TOC into main Markdown file: ${error.message}`);
    console.error(`   Path attempted: ${outputPath}`);
  }
}

/**
 * Splits the input text into chunks, each with a maximum of max_tokens.
 * Uses a simple token estimation where 1 token ≈ 4 characters.
 */
export function splitTextIntoChunks(text: string, maxTokens: number): string[] {
  const AVG_CHARS_PER_TOKEN = 4;
  const maxChars = maxTokens * AVG_CHARS_PER_TOKEN;
  
  // Create chunks
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    chunks.push(text.substring(i, i + maxChars));
  }
  
  console.log(`🔄 Split text into ${chunks.length} chunks based on ${maxTokens} tokens per chunk.`);
  return chunks;
}

/**
 * Combines multiple text chunks into a single text block.
 */
export function combineChunks(chunks: string[]): string {
  const combinedText = chunks.join('\n\n');
  console.log("✅ Combined all chunks into a single text block.");
  return combinedText;
}

/**
 * Removes markdown formatting elements from text.
 */
export function removeMarkdownFormatting(text: string): string {
  // Remove triple backticks code blocks
  let cleanedText = text.replace(/```[\s\S]*?```/g, '');
  
  // Remove inline code backticks
  cleanedText = cleanedText.replace(/`([^`]*)`/g, '$1');
  
  // Remove emphasis/bold
  cleanedText = cleanedText.replace(/\*\*(.*?)\*\*/g, '$1');
  cleanedText = cleanedText.replace(/__(.*?)__/g, '$1');
  
  // Remove emphasis/italic
  cleanedText = cleanedText.replace(/\*(.*?)\*/g, '$1');
  cleanedText = cleanedText.replace(/_(.*?)_/g, '$1');
  
  // Remove links but keep the text
  cleanedText = cleanedText.replace(/\[(.*?)\]\(.*?\)/g, '$1');
  
  // Remove HTML tags
  cleanedText = cleanedText.replace(/<[^>]*>/g, '');
  
  // Remove horizontal rules
  cleanedText = cleanedText.replace(/^\s*[\-\*_]{3,}\s*$/gm, '');
  
  // Clean up multiple newlines
  cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n');
  
  return cleanedText;
}

/**
 * Removes standalone triple backticks (```) and ```markdown tags from the text.
 */
export function cleanMarkdownCodeBlocks(text: string): string {
  // Remove standalone triple backticks on their own line
  let cleanedText = text.replace(/^\s*```\s*$/gm, '');
  
  // Remove ```markdown at the start of code blocks
  cleanedText = cleanedText.replace(/```markdown/g, '');
  
  // Clean up any resulting multiple newlines
  cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n');
  
  return cleanedText;
}
