import { GoogleGenAI, HarmCategory, HarmBlockThreshold, GenerationConfig } from "@google/genai";
import * as fs from 'fs'; // Node.js file system module, if needed for direct file operations
import { retryWithBackoff } from '../utils'; // Assuming utils.ts is in the same directory or adjust path
import {
  ArtifactDetectionResponse,
  parseArtifactDetectionResponse
} from '../types/artifact_detection';

// Interface for rate limit information, similar to other API modules
interface RateLimitInfo {
  requests: number;
  interval: string;
  interval_seconds: number;
  requests_per_second: number;
  credits?: number; // Optional, as Gemini might not use a credit system like OpenRouter
}

// Helper to extract Base64 data and MIME type from a data URL
function parseDataUrl(dataUrl: string): { mimeType: string; base64Data: string } | null {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) {
    console.error("Invalid data URL format.");
    return null;
  }
  return { mimeType: match[1], base64Data: match[2] };
}

/**
 * Authenticates the Gemini API key by making a simple API call.
 * @returns A tuple [success, rate_limit] where:
 * - success: True if authentication is successful, else False
 * - rate_limit: Object containing rate limit information or null if authentication failed
 */
export async function authenticateGeminiApi(apiKey: string): Promise<[boolean, RateLimitInfo | null]> {
  try {
    const genAI = new GoogleGenAI({ apiKey });
    // Attempt a very simple, low-cost call to check if the API key is valid.
    // To simulate an auth check, we can try a minimal generateContent call.
    // Using "gemini-1.5-flash-latest" as it's a generally available model suitable for generateContent.
    await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{text: "test"}] }]
      // Removed generationConfig for simplicity in auth call
    });

    // Gemini API has RPM (Requests Per Minute) limits.
    // Example: 500 RPM for Gemini 1.5 Flash.
    // We need to translate this to requests_per_second for consistency.
    const rpm = 500; // This might need to be configurable or dynamically fetched if possible
    const intervalSeconds = 60;
    const requestsPerSecond = Math.floor(rpm / intervalSeconds);

    const rateLimit: RateLimitInfo = {
      requests: rpm,
      interval: `${intervalSeconds}s`,
      interval_seconds: intervalSeconds,
      requests_per_second: requestsPerSecond,
    };

    console.log("✅ Successfully authenticated with Gemini API (simulated via a lightweight call).");
    console.log(`📊 Rate limit (example): ${rateLimit.requests} requests per ${rateLimit.interval} (${rateLimit.requests_per_second} req/s)`);
    return [true, rateLimit];
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`❌ Failed to authenticate with Gemini API: ${error.message}`);
    if (error.message.includes("API key not valid")) {
        console.error("Please ensure your Gemini API key is correct and has the necessary permissions.");
    }
    return [false, null];
  }
}

/**
 * Sends the Base64-encoded image data URL to the Gemini API to extract text.
 */
export async function extractTextFromImageGemini(
  dataUrl: string,
  apiKey: string,
  modelName: string,
  prompt: string,
  parameters: Record<string, any>
): Promise<string | null> {
  const parsedData = parseDataUrl(dataUrl);
  if (!parsedData) {
    return null;
  }
  const { mimeType, base64Data } = parsedData;

  const genAI = new GoogleGenAI({ apiKey });

  const imagePart = {
    inlineData: {
      data: base64Data,
      mimeType: mimeType,
    },
  };

  const requestPayloadContents = [{ role: "user", parts: [imagePart, { text: prompt }] }];

  const apiCall = async () => {
    const generateContentResponse = await genAI.models.generateContent({ // Renamed result to generateContentResponse
        model: modelName,
        contents: requestPayloadContents,
        // generationConfig and safetySettings might need to be omitted or handled differently
        // For now, relying on defaults or model's inherent settings if not directly passable here
        // generationConfig: parameters as GenerationConfig, 
        // safetySettings: [
        //     { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        //     { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        //     { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        //     { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        // ]
    });
    // Corrected: Access promptFeedback and text() directly on generateContentResponse
    if (generateContentResponse.promptFeedback?.blockReason) {
      console.error(`❌ Gemini API blocked the prompt for image text extraction: ${generateContentResponse.promptFeedback.blockReason}`);
      if (generateContentResponse.promptFeedback.blockReasonMessage) {
        console.error(`   Reason message: ${generateContentResponse.promptFeedback.blockReasonMessage}`);
      }
      return null;
    }
    return generateContentResponse.text;
  };

  try {
    const text = await retryWithBackoff(apiCall);
    if (text) {
      console.log(`✅ Extracted text from image using Gemini model ${modelName}.`);
      return text.trim();
    }
    console.warn(`⚠️ Failed to extract text from image using Gemini model ${modelName} after retries.`);
    return null;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error communicating with Gemini API for image text extraction: ${error.message}`);
    return null;
  }
}

/**
 * Sends the aggregated text to Gemini API to convert it into Markdown format.
 */
export async function extractMarkdownFromTextGemini(
  allText: string,
  baseFilename: string, // Included for consistency, may not be used directly in prompt for Gemini
  apiKey: string,
  modelName: string,
  prompt: string,
  parameters: Record<string, any>
): Promise<string | null> {
  const genAI = new GoogleGenAI({ apiKey });

  // Combine the user's prompt with the text to be converted
  const fullPrompt = `${prompt}\n\n---\n\n${allText}`;

  const requestPayloadContents = [{ role: "user", parts: [{ text: fullPrompt }] }];

  const apiCall = async () => {
    const generateContentResponse = await genAI.models.generateContent({ // Renamed result to generateContentResponse
        model: modelName,
        contents: requestPayloadContents,
        // generationConfig and safetySettings might need to be omitted or handled differently
        // generationConfig: parameters as GenerationConfig,
        // safetySettings: [
        //     { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        //     { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        //     { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        //     { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        // ]
    });
    // Corrected: Access promptFeedback and text() directly on generateContentResponse
    if (generateContentResponse.promptFeedback?.blockReason) {
      console.error(`❌ Gemini API blocked the prompt for Markdown conversion: ${generateContentResponse.promptFeedback.blockReason}`);
      if (generateContentResponse.promptFeedback.blockReasonMessage) {
        console.error(`   Reason message: ${generateContentResponse.promptFeedback.blockReasonMessage}`);
      }
      return null;
    }
    return generateContentResponse.text;
  };

  try {
    const markdown = await retryWithBackoff(apiCall);
    if (markdown) {
      console.log(`✅ Converted text to Markdown using Gemini model ${modelName}.`);
      return markdown.trim();
    }
    console.warn(`⚠️ Failed to convert text to Markdown using Gemini model ${modelName} after retries.`);
    return null;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error communicating with Gemini API for Markdown conversion: ${error.message}`);
    return null;
  }
}

/**
 * Sends the extracted headings to the Gemini API to generate a TOC.
 */
export async function extractTocFromMarkdownGemini(
  extractedHeadingsText: string,
  baseFilename: string,
  apiKey: string,
  modelName: string,
  promptTemplate: string, // Renamed to promptTemplate to avoid confusion
  parameters: Record<string, any>
): Promise<string | null> {
  const genAI = new GoogleGenAI({ apiKey });

  // Format the prompt with placeholders
  let formattedPrompt: string;
  try {
    formattedPrompt = promptTemplate.replace(/{base_filename}/g, baseFilename)
                                 .replace(/{extracted_headings_text}/g, extractedHeadingsText);
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`❌ Error formatting TOC prompt for Gemini: ${error.message}`);
    return null;
  }

  const requestPayloadContents = [{ role: "user", parts: [{ text: formattedPrompt }] }];

  const apiCall = async () => {
    const generateContentResponse = await genAI.models.generateContent({
        model: modelName,
        contents: requestPayloadContents,
        // generationConfig: parameters as GenerationConfig, // Omitting for now
        // safetySettings: [ // Omitting for now
        //     { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        //     { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        //     { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        //     { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        // ]
    });
    if (generateContentResponse.promptFeedback?.blockReason) {
      console.error(`❌ Gemini API blocked the prompt for TOC generation: ${generateContentResponse.promptFeedback.blockReason}`);
      if (generateContentResponse.promptFeedback.blockReasonMessage) {
        console.error(`   Reason message: ${generateContentResponse.promptFeedback.blockReasonMessage}`);
      }
      return null;
    }
    return generateContentResponse.text;
  };

  try {
    const toc = await retryWithBackoff(apiCall);
    if (toc) {
      console.log(`✅ Generated TOC using Gemini model ${modelName}.`);
      return toc.trim();
    }
    console.warn(`⚠️ Failed to generate TOC using Gemini model ${modelName} after retries.`);
    return null;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error communicating with Gemini API for TOC generation: ${error.message}`);
    return null;
  }
}

/**
 * Sends the full markdown content and a list of headings to the Gemini API to determine the correct heading hierarchy.
 * @returns A JSON object with the corrected heading levels.
 */
export async function restructureHeadingsWithRagGemini(
  fullMarkdown: string,
  headings: { text: string; level: number }[],
  apiKey: string,
  modelName: string,
  prompt: string,
  parameters: Record<string, any>
): Promise<string | null> {
  const genAI = new GoogleGenAI({ apiKey });

  const formattedPrompt = `
${prompt}

**Full Markdown Content:**
\`\`\`markdown
${fullMarkdown}
\`\`\`

**Headings List:**
\`\`\`json
${JSON.stringify(headings, null, 2)}
\`\`\`
`;

  const requestPayloadContents = [{ role: "user", parts: [{ text: formattedPrompt }] }];

  const apiCall = async () => {
    const generateContentResponse = await genAI.models.generateContent({
        model: modelName,
        contents: requestPayloadContents,
        // generationConfig: parameters as GenerationConfig, // Omitting for now
        // safetySettings: [ // Omitting for now
        //     { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        //     { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        //     { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        //     { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        // ]
    });
    if (generateContentResponse.promptFeedback?.blockReason) {
      console.error(`❌ Gemini API blocked the prompt for heading restructuring: ${generateContentResponse.promptFeedback.blockReason}`);
      if (generateContentResponse.promptFeedback.blockReasonMessage) {
        console.error(`   Reason message: ${generateContentResponse.promptFeedback.blockReasonMessage}`);
      }
      return null;
    }
    return generateContentResponse.text;
  };

  try {
    const response = await retryWithBackoff(apiCall);
    if (response) {
      console.log(`✅ Restructured headings using Gemini model ${modelName}.`);
      return response.trim();
    }
    console.warn(`⚠️ Failed to restructure headings using Gemini model ${modelName} after retries.`);
    return null;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error communicating with Gemini API for heading restructuring: ${error.message}`);
    return null;
  }
}

/**
 * Sends an image to the Gemini API to detect if it's an artifact or valuable content.
 * Returns structured JSON response with artifact detection results.
 */
export async function detectArtifactsInImageGemini(
  dataUrl: string,
  apiKey: string,
  modelName: string,
  prompt: string,
  parameters: Record<string, any>
): Promise<ArtifactDetectionResponse | null> {
  const parsedData = parseDataUrl(dataUrl);
  if (!parsedData) {
    return null;
  }
  const { mimeType, base64Data } = parsedData;

  const genAI = new GoogleGenAI({ apiKey });

  const imagePart = {
    inlineData: {
      data: base64Data,
      mimeType: mimeType,
    },
  };

  const requestPayloadContents = [{ role: "user", parts: [imagePart, { text: prompt }] }];

  const apiCall = async () => {
    const generateContentResponse = await genAI.models.generateContent({
        model: modelName,
        contents: requestPayloadContents,
    });
    
    if (generateContentResponse.promptFeedback?.blockReason) {
      console.error(`❌ Gemini API blocked the prompt for artifact detection: ${generateContentResponse.promptFeedback.blockReason}`);
      if (generateContentResponse.promptFeedback.blockReasonMessage) {
        console.error(`   Reason message: ${generateContentResponse.promptFeedback.blockReasonMessage}`);
      }
      return null;
    }
    return generateContentResponse.text;
  };

  try {
    const response = await retryWithBackoff(apiCall);
    if (response) {
      console.log(`✅ Artifact detection completed using Gemini model ${modelName}.`);
      
      // Parse the JSON response
      const parsedResponse = parseArtifactDetectionResponse(response);
      if (!parsedResponse) {
        console.warn('⚠️ Failed to parse artifact detection response from Gemini API');
        console.warn('Raw response:', response);
        return null;
      }
      
      const confidence = parsedResponse.confidence !== undefined ? parsedResponse.confidence.toFixed(2) : 'undefined';
      console.log(`  ✅ Artifact detection completed: ${parsedResponse.is_artifact ? 'Artifact' : 'Valuable'} (${confidence} confidence)`);
      if (parsedResponse.content_analysis?.content_description) {
        console.log(`  📝 Content: ${parsedResponse.content_analysis.content_description}`);
      }
      
      return parsedResponse;
    }
    console.warn(`⚠️ Failed to detect artifacts using Gemini model ${modelName} after retries.`);
    return null;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error communicating with Gemini API for artifact detection: ${error.message}`);
    return null;
  }
}
