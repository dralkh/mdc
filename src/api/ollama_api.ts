import axios from 'axios';
import * as fs from 'fs-extra';
import { retryWithBackoff, prepareImageForLlava } from '../utils';

interface RateLimitInfo {
  requests: number;
  interval: string;
  interval_seconds: number;
  requests_per_second: number;
}

/**
 * Authenticates the Ollama API by checking if it's reachable.
 * @returns A tuple [success, rate_limit] where:
 * - success: True if authentication is successful, else False
 * - rate_limit: Object containing rate limit information or null if authentication failed
 */
export async function authenticateOllamaApi(): Promise<[boolean, RateLimitInfo | null]> {
  // Get the Ollama API endpoint from environment variables, default to localhost
  const ollamaApiBase = process.env.OLLAMA_API_BASE || "http://localhost:11434";
  
  const authRequest = async () => {
    // Make a simple API call to check if the API is reachable
    const response = await axios.get(`${ollamaApiBase}/api/version`);
    return response;
  };
  
  try {
    // Use retry with backoff for API authentication
    const response = await retryWithBackoff(authRequest);
    if (response === null) {
      return [false, null];
    }
            
    // Get version information
    const versionInfo = response.data;
    
    // Configure rate limits for local Ollama - one request at a time
    const rateLimitInfo: RateLimitInfo = {
      requests: 1,  // One request at a time
      interval: '1s',
      interval_seconds: 1,
      requests_per_second: 1  // One request per second
    };
    
    console.log(`✅ Successfully connected to Ollama API (Version: ${versionInfo?.version || 'unknown'}).`);
    console.log(`📊 Using sequential processing for local Ollama: 1 request at a time`);
    
    return [true, rateLimitInfo];
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`❌ Failed to connect to Ollama API at ${ollamaApiBase}: ${error.message}`);
    return [false, null];
  }
}

/**
 * Filters out parameters that are not compatible with Ollama API.
 * Only keeps parameters that are known to be compatible with Ollama's API.
 */
function filterIncompatibleParameters(parameters: Record<string, any>): Record<string, any> {
  // Create a copy of parameters to avoid modifying the original
  const filteredParams: Record<string, any> = {};
  
  // List of parameters that are compatible with Ollama API
  const compatibleParams = new Set([
    'temperature', 'top_p', 'top_k', 'stop', 'max_tokens', 
    'repeat_penalty', 'presence_penalty', 'frequency_penalty', 
    'seed', 'num_ctx', 'num_predict', 'stream'
  ]);
  
  // Parameters that need to be nested under 'options'
  const optionsParams = new Set([
    'temperature', 'top_p', 'top_k', 'repeat_penalty', 'presence_penalty', 
    'frequency_penalty', 'seed', 'num_ctx', 'num_predict', 'num_gpu', 
    'mirostat', 'mirostat_tau', 'mirostat_eta'
  ]);
  
  const options: Record<string, any> = {};
  
  // Sort parameters into appropriate structure
  for (const [param, value] of Object.entries(parameters)) {
    if (compatibleParams.has(param)) {
      if (optionsParams.has(param)) {
        options[param] = value;
      } else {
        filteredParams[param] = value;
      }
    } else {
      console.warn(`⚠️ Removing incompatible parameter '${param}' for Ollama API call`);
      // Handle parameter conversion for common cases
      if (param === 'repetition_penalty') {
        console.log(`ℹ️ Converting repetition_penalty to repeat_penalty`);
        options.repeat_penalty = value;
      } else if (param === 'max_tokens' && !('num_predict' in filteredParams)) {
        console.log(`ℹ️ Converting max_tokens to num_predict`);
        options.num_predict = value;
      }
    }
  }
  
  // Add options to filtered params if any exist
  if (Object.keys(options).length > 0) {
    filteredParams.options = options;
  }
  
  return filteredParams;
}

/**
 * Sends the Base64-encoded image data URL to the Ollama API to extract text.
 * Uses the vision-capable model specified in configuration.
 */
export async function extractTextFromImage(
  dataUrl: string, 
  apiKey: string, 
  modelName: string, 
  prompt: string, 
  parameters: Record<string, any>
): Promise<string | null> {
  // Get the Ollama API endpoint from environment variables, default to localhost
  const ollamaApiBase = process.env.OLLAMA_API_BASE || "http://localhost:11434";
  
  // Extract the base64 data from the data URL
  let base64Data: string;
  if (dataUrl) {
    if (dataUrl.startsWith('data:image')) {
      // Extract only the base64 part from the data URL
      base64Data = dataUrl.includes(',') ? dataUrl.split(',', 2)[1] : dataUrl;
    } else {
      // If it's already a base64 string without data URL prefix
      base64Data = dataUrl;
    }
  } else {
    console.error("❌ Invalid image data URL");
    return null;
  }
  
  // Variable to store available models
  let availableModels: string[] = [];
  
  // Check available models with retry
  const checkModels = async () => {
    const modelCheck = await axios.get(`${ollamaApiBase}/api/tags`);
    availableModels = modelCheck.data.models?.map((model: any) => model.name) || [];
    return modelCheck;
  };
  
  try {
    // Validate that the model is available
    try {
      const modelCheckResponse = await retryWithBackoff(checkModels);
      if (modelCheckResponse === null) {
        console.warn("⚠️ Failed to check available models after retries, continuing anyway");
      } else {
        // If the model includes a tag like "llava:latest", check if base model exists
        const baseModel = modelName.includes(':') ? modelName.split(':')[0] : modelName;
        
        const modelExists = availableModels.includes(modelName) || 
                            availableModels.some(m => m.startsWith(`${baseModel}:`));
        
        if (!modelExists) {
          console.warn(`⚠️ Model '${modelName}' not found in available models. Using 'llava:latest' instead.`);
          console.warn(`⚠️ Available models: ${availableModels.join(', ')}`);
          
          // Check if llava model exists in any form
          const llavaExists = availableModels.some(m => m.toLowerCase().includes('llava'));
          
          if (llavaExists) {
            // Find the first llava model
            for (const m of availableModels) {
              if (m.toLowerCase().includes('llava')) {
                modelName = m;
                console.log(`🔄 Using available llava model: ${modelName}`);
                break;
              }
            }
          } else {
            console.error(`❌ No llava model found. Please pull a llava model with 'ollama pull llava'`);
            return null;
          }
        }
      }
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      console.warn(`⚠️ Failed to check available models: ${error.message}`);
      // Continue with the requested model anyway
    }
  
    // Filter out incompatible parameters
    const filteredParameters = filterIncompatibleParameters(parameters);
    
    // Remove any parameters that would cause conflicts
    ['images', 'model', 'prompt', 'stream'].forEach(param => {
      if (param in filteredParameters) {
        delete filteredParameters[param];
      }
    });
    
    // For webp images, add a note about potential compatibility issues with LLaVA
    if (dataUrl.toLowerCase().includes('webp') && dataUrl.toLowerCase().includes('data:image')) {
      console.warn("⚠️ WebP format may have compatibility issues with LLaVA. If errors occur, try converting to PNG/JPEG.");
    }
    
    // Prepare the request payload
    const payload = {
      model: modelName,
      prompt: prompt,
      stream: false,
      images: [base64Data],
      ...filteredParameters
    };
    
    // Print debug info
    console.log(`🔍 Making Ollama API request to: ${ollamaApiBase}/api/generate`);
    console.log(`🔍 Using model: ${modelName}`);
    
    // Define API request function for retry
    const makeApiRequest = async () => {
      const resp = await axios.post(`${ollamaApiBase}/api/generate`, payload);
      return resp;
    };
    
    // Make the API call with retry
    const response = await retryWithBackoff(makeApiRequest);
    if (response === null) {
      return null;
    }
            
    // Parse the response
    const responseData = response.data;
    
    // Extract the text from the response
    return responseData.response?.trim() || null;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error communicating with Ollama API for image processing: ${error.message}`);
    if ('response' in error && error.response) {
      console.error(`❌ Error response: ${JSON.stringify(error.response)}`);
    }
    return null;
  }
}

/**
 * Sends the aggregated text to Ollama API to convert it into Markdown format.
 * Returns the Markdown text.
 */
export async function extractMarkdownFromText(
  allText: string, 
  baseFilename: string, 
  apiKey: string, 
  modelName: string, 
  prompt: string, 
  parameters: Record<string, any>
): Promise<string | null> {
  // Get the Ollama API endpoint from environment variables, default to localhost
  const ollamaApiBase = process.env.OLLAMA_API_BASE || "http://localhost:11434";
  
  try {
    // Filter out incompatible parameters
    const filteredParameters = filterIncompatibleParameters(parameters);
    
    // Prepare the request payload with the combined prompt and all_text
    const combinedPrompt = `${prompt}\n\n${allText}`;
    
    const payload = {
      model: modelName,
      prompt: combinedPrompt,
      stream: false,
      ...filteredParameters
    };
    
    // Define API request function for retry
    const makeApiRequest = async () => {
      const resp = await axios.post(`${ollamaApiBase}/api/generate`, payload);
      return resp;
    };
    
    // Make the API call with retry
    const response = await retryWithBackoff(makeApiRequest);
    if (response === null) {
      return null;
    }
    
    // Parse the response
    const responseData = response.data;
    
    // Extract the text from the response
    return responseData.response?.trim() || null;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error communicating with Ollama API for Markdown conversion: ${error.message}`);
    return null;
  }
}

/**
 * Sends the extracted headings to the Ollama API with a specific prompt to generate a TOC.
 * Returns the extracted TOC as a string.
 */
export async function extractTocFromMarkdown(
  extractedHeadingsText: string, 
  baseFilename: string, 
  apiKey: string, 
  modelName: string, 
  prompt: string, 
  parameters: Record<string, any>
): Promise<string | null> {
  // Get the Ollama API endpoint from environment variables, default to localhost
  const ollamaApiBase = process.env.OLLAMA_API_BASE || "http://localhost:11434";
  
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
    
    // Prepare the request payload
    const payload = {
      model: modelName,
      prompt: formattedPrompt,
      stream: false,
      ...filteredParameters
    };
    
    // Define API request function for retry
    const makeApiRequest = async () => {
      const resp = await axios.post(`${ollamaApiBase}/api/generate`, payload);
      return resp;
    };
    
    // Make the API call with retry
    const response = await retryWithBackoff(makeApiRequest);
    if (response === null) {
      return null;
    }
    
    // Parse the response
    const responseData = response.data;
    
    // Extract the text from the response
    return responseData.response?.trim() || null;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error communicating with Ollama API for TOC extraction: ${error.message}`);
    return null;
  }
}

/**
 * Communicate with Ollama API using the chat endpoint.
 */
export async function chatWithOllama(
  messages: Array<{role: string, content: string}>, 
  modelName: string, 
  parameters: Record<string, any> = {}
): Promise<string | null> {
  // Get the Ollama API endpoint from environment variables, default to localhost
  const ollamaApiBase = process.env.OLLAMA_API_BASE || "http://localhost:11434";
  
  try {
    // Filter out incompatible parameters
    const filteredParameters = filterIncompatibleParameters(parameters);
    
    // Prepare the request payload
    const payload = {
      model: modelName,
      messages: messages,
      stream: false,
      ...filteredParameters
    };
    
    // Define API request function for retry
    const makeApiRequest = async () => {
      const resp = await axios.post(`${ollamaApiBase}/api/chat`, payload);
      return resp;
    };
    
    // Make the API call with retry
    const response = await retryWithBackoff(makeApiRequest);
    if (response === null) {
      return null;
    }
    
    // Parse the response
    const responseData = response.data;
    
    // Extract the content from the response
    if (responseData.message && responseData.message.content) {
      return responseData.message.content.trim();
    } else {
      console.warn("⚠️ Unexpected response structure from Ollama API");
      return null;
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error communicating with Ollama API: ${error.message}`);
    return null;
  }
}

/**
 * Sends the full markdown content and a list of headings to the Ollama API to determine the correct heading hierarchy.
 * @returns A JSON object with the corrected heading levels.
 */
export async function restructureHeadingsWithRag(
  fullMarkdown: string,
  headings: { text: string; level: number }[],
  apiKey: string,
  modelName: string,
  prompt: string,
  parameters: Record<string, any>
): Promise<string | null> {
  // Get the Ollama API endpoint from environment variables, default to localhost
  const ollamaApiBase = process.env.OLLAMA_API_BASE || "http://localhost:11434";

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

  try {
    // Filter out incompatible parameters
    const filteredParameters = filterIncompatibleParameters(parameters);

    // Prepare the request payload
    const payload = {
      model: modelName,
      prompt: formattedPrompt,
      stream: false,
      ...filteredParameters
    };

    // Define API request function for retry
    const makeApiRequest = async () => {
      const resp = await axios.post(`${ollamaApiBase}/api/generate`, payload);
      return resp;
    };

    // Make the API call with retry
    const response = await retryWithBackoff(makeApiRequest);
    if (response === null) {
      return null;
    }

    // Parse the response
    const responseData = response.data;

    // Extract the text from the response
    return responseData.response?.trim() || null;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error communicating with Ollama API for heading restructuring: ${error.message}`);
    return null;
  }
}
