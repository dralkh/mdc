import { OpenAI } from 'openai';
import { retryWithBackoff } from '../utils';

interface RateLimitInfo {
  requests: number;
  interval: string;
  interval_seconds: number;
  requests_per_second: number;
}

/**
 * Authenticates the OpenAI API key by checking if it's valid.
 * @returns A tuple [success, rate_limit] where:
 * - success: True if authentication is successful, else False
 * - rate_limit: Object containing rate limit information or null if authentication failed
 */
export async function authenticateOpenaiApi(baseURL?: string): Promise<[boolean, RateLimitInfo | null]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("❌ OpenAI API key not found in environment variables.");
    return [false, null];
  }

  const client = new OpenAI({ apiKey, baseURL });
  
  // Define API request function for retry
  const authRequest = async () => {
    // Make a simple API call to check if the key is valid
    return await client.models.list();
  };
  
  try {
    // Make a simple API call with retry to check if the key is valid
    const response = await retryWithBackoff(authRequest);
    if (response === null) {
      return [false, null];
    }
    
    // OpenAI has different rate limits based on model and tier
    // For simplicity, we'll use conservative defaults
    const rateLimitInfo: RateLimitInfo = {
      requests: 500,  // Conservative estimate
      interval: '60s',
      interval_seconds: 60,
      requests_per_second: 200  // Conservative default
    };
    
    console.log("✅ Successfully authenticated with OpenAI API.");
    console.log(`📊 Using conservative rate limit: ${rateLimitInfo.requests} requests per ${rateLimitInfo.interval} ` +
          `(${rateLimitInfo.requests_per_second} req/s)`);
    
    return [true, rateLimitInfo];
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`❌ Failed to authenticate with OpenAI API: ${error.message}`);
    return [false, null];
  }
}

/**
 * Filters out parameters that are not compatible with OpenAI API.
 * Only keeps parameters that are known to be compatible with OpenAI's API.
 */
function filterIncompatibleParameters(parameters: Record<string, any>): Record<string, any> {
  // Create a copy of parameters to avoid modifying the original
  const filteredParams: Record<string, any> = {};
  
  // List of parameters that are compatible with OpenAI API
  const compatibleParams = new Set([
    'model', 'messages', 'temperature', 'top_p', 'n', 'stream', 'stop',
    'max_tokens', 'presence_penalty', 'frequency_penalty', 'logit_bias', 'user',
    'response_format', 'seed', 'tools', 'tool_choice'
  ]);
  
  // Only keep compatible parameters
  for (const [param, value] of Object.entries(parameters)) {
    if (compatibleParams.has(param)) {
      filteredParams[param] = value;
    } else {
      // console.warn(`⚠️ Removing incompatible parameter '${param}' for OpenAI API call`);
      // Handle parameter conversion for common cases
      if (param === 'top_k' && !('top_p' in filteredParams)) {
        // Convert top_k to top_p with a reasonable default if top_p isn't provided
        // console.log(`ℹ️ Using default top_p=0.9 in place of top_k`);
        filteredParams.top_p = 0.9;
      } else if (param === 'repetition_penalty' && !('frequency_penalty' in filteredParams)) {
        // Roughly convert repetition_penalty to frequency_penalty
        // console.log(`ℹ️ Converting repetition_penalty to frequency_penalty`);
        // Map repetition_penalty > 1.0 to a positive frequency_penalty
        const repVal = parameters[param];
        if (typeof repVal === 'number' && repVal > 1.0) {
          // Scale it to a reasonable range for frequency_penalty (-2.0 to 2.0)
          const freqVal = Math.min((repVal - 1.0) * 2.0, 2.0);
          filteredParams.frequency_penalty = freqVal;
          // console.log(`ℹ️ Converted repetition_penalty=${repVal} to frequency_penalty=${freqVal}`);
        }
      }
    }
  }
  
  return filteredParams;
}

/**
 * Sends the Base64-encoded image data URL to the OpenAI API to extract text.
 */
export async function extractTextFromImage(
  dataUrl: string, 
  apiKey: string,
  modelName: string,
  prompt: string,
  parameters: Record<string, any>,
  baseURL?: string
): Promise<string | null> {
  const client = new OpenAI({ apiKey, baseURL });
  
  try {
    // Filter out incompatible parameters
    const filteredParameters = filterIncompatibleParameters(parameters);
    
    // Define API request function for retry
    const makeApiRequest = async () => {
      return await client.chat.completions.create({
        model: modelName,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt
              },
              {
                type: "image_url",
                image_url: {
                  url: dataUrl
                }
              }
            ]
          }
        ],
        ...filteredParameters
      });
    };
    
    // Make the API call with retry
    const response = await retryWithBackoff(makeApiRequest);
    if (response === null) {
      return null;
    }
    
    return response.choices[0].message.content?.trim() || null;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error communicating with OpenAI API: ${error.message}`);
    return null;
  }
}

/**
 * Sends the aggregated text to OpenAI API to convert it into Markdown format.
 * Returns the Markdown text.
 */
export async function extractMarkdownFromText(
  allText: string, 
  baseFilename: string, 
  apiKey: string,
  modelName: string,
  prompt: string,
  parameters: Record<string, any>,
  baseURL?: string
): Promise<string | null> {
  const client = new OpenAI({ apiKey, baseURL });
  
  try {
    // Filter out incompatible parameters
    const filteredParameters = filterIncompatibleParameters(parameters);
    
    // Define API request function for retry
    const makeApiRequest = async () => {
      return await client.chat.completions.create({
        model: modelName,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt
              },
              {
                type: "text",
                text: allText
              }
            ]
          }
        ],
        ...filteredParameters
      });
    };
    
    // Make the API call with retry
    const response = await retryWithBackoff(makeApiRequest);
    if (response === null) {
      return null;
    }
    
    return response.choices[0].message.content?.trim() || null;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error communicating with OpenAI API for Markdown conversion: ${error.message}`);
    return null;
  }
}

/**
 * Sends the extracted headings to the OpenAI API with a specific prompt to generate a TOC.
 * Returns the extracted TOC as a string.
 */
export async function extractTocFromMarkdown(
  extractedHeadingsText: string, 
  baseFilename: string, 
  apiKey: string,
  modelName: string,
  prompt: string,
  parameters: Record<string, any>,
  baseURL?: string
): Promise<string | null> {
  const client = new OpenAI({ apiKey, baseURL });
  
  // Format the prompt with placeholders
  let formattedPrompt: string;
  try {
    formattedPrompt = prompt.replace(/{base_filename}/g, baseFilename)
                           .replace(/{extracted_headings_text}/g, extractedHeadingsText);
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`❌ Missing placeholder in prompt configuration: ${error.message}`);
    return null;
  }
  
  try {
    // Filter out incompatible parameters
    const filteredParameters = filterIncompatibleParameters(parameters);
    
    // Define API request function for retry
    const makeApiRequest = async () => {
      return await client.chat.completions.create({
        model: modelName,
        messages: [
          {
            role: "user",
            content: formattedPrompt
          }
        ],
        ...filteredParameters
      });
    };
    
    // Make the API call with retry
    const response = await retryWithBackoff(makeApiRequest);
    if (response === null) {
      return null;
    }
    
    return response.choices[0].message.content?.trim() || null;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error communicating with OpenAI API for TOC extraction: ${error.message}`);
    return null;
  }
}
