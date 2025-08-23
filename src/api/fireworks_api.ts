import { OpenAI } from 'openai';
import { retryWithBackoff } from '../utils';
import {
  ArtifactDetectionResponse,
  parseArtifactDetectionResponse
} from '../types/artifact_detection';

interface RateLimitInfo {
  requests: number;
  interval: string;
  interval_seconds: number;
  requests_per_second: number;
}

/**
 * Authenticates the Fireworks API key by checking if it's valid.
 * @returns A tuple [success, rate_limit] where:
 * - success: True if authentication is successful, else False
 * - rate_limit: Object containing rate limit information or null if authentication failed
 */
export async function authenticateFireworksApi(): Promise<[boolean, RateLimitInfo | null]> {
  const apiKey = process.env.FIREWORKS_API_KEY;
  if (!apiKey) {
    console.error("❌ Fireworks API key not found in environment variables.");
    return [false, null];
  }

  const client = new OpenAI({ apiKey, baseURL: "https://api.fireworks.ai/inference/v1" });
  
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
    
    // Fireworks has different rate limits based on model and tier
    // For simplicity, we'll use conservative defaults
    const rateLimitInfo: RateLimitInfo = {
      requests: 500,  // Conservative estimate
      interval: '60s',
      interval_seconds: 60,
      requests_per_second: 200  // Conservative default
    };
    
    console.log("✅ Successfully authenticated with Fireworks API.");
    console.log(`📊 Using conservative rate limit: ${rateLimitInfo.requests} requests per ${rateLimitInfo.interval} ` +
          `(${rateLimitInfo.requests_per_second} req/s)`);
    
    return [true, rateLimitInfo];
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`❌ Failed to authenticate with Fireworks API: ${error.message}`);
    return [false, null];
  }
}

/**
 * Filters out parameters that are not compatible with Fireworks API.
 * Only keeps parameters that are known to be compatible with Fireworks's API.
 */
function filterIncompatibleParameters(parameters: Record<string, any>): Record<string, any> {
  // Create a copy of parameters to avoid modifying the original
  const filteredParams: Record<string, any> = {};
  
  // List of parameters that are compatible with Fireworks API (OpenAI + top_k)
  const compatibleParams = new Set([
    'model', 'messages', 'temperature', 'top_p', 'n', 'stream', 'stop',
    'max_tokens', 'presence_penalty', 'frequency_penalty', 'logit_bias', 'user',
    'response_format', 'seed', 'tools', 'tool_choice', 'top_k'
  ]);
  
  // Only keep compatible parameters
  for (const [param, value] of Object.entries(parameters)) {
    if (compatibleParams.has(param)) {
      filteredParams[param] = value;
    } else {
      // console.warn(`⚠️ Removing incompatible parameter '${param}' for Fireworks API call`);
    }
  }
  
  return filteredParams;
}

/**
 * Sends the Base64-encoded image data URL to the Fireworks API to extract text.
 */
export async function extractTextFromImage(
  dataUrl: string, 
  apiKey: string,
  modelName: string,
  prompt: string,
  parameters: Record<string, any>
): Promise<string | null> {
  const client = new OpenAI({ apiKey, baseURL: "https://api.fireworks.ai/inference/v1" });
  
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
    console.error(`⚠️ Error communicating with Fireworks API: ${error.message}`);
    return null;
  }
}
/**
 * Sends the aggregated text to Fireworks API to convert it into Markdown format.
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
  const client = new OpenAI({ apiKey, baseURL: "https://api.fireworks.ai/inference/v1" });
  
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
    console.error(`⚠️ Error communicating with Fireworks API for Markdown conversion: ${error.message}`);
    return null;
  }
}

/**
 * Sends the extracted headings to the Fireworks API with a specific prompt to generate a TOC.
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
  const client = new OpenAI({ apiKey, baseURL: "https://api.fireworks.ai/inference/v1" });
  
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
    console.error(`⚠️ Error communicating with Fireworks API for TOC extraction: ${error.message}`);
    return null;
  }
}

/**
 * Sends the full markdown content and a list of headings to the Fireworks API to determine the correct heading hierarchy.
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
  const client = new OpenAI({ apiKey, baseURL: "https://api.fireworks.ai/inference/v1" });

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
    const filteredParameters = filterIncompatibleParameters(parameters);

    const makeApiRequest = async () => {
      return await client.chat.completions.create({
        model: modelName,
        messages: [
          {
            role: "user",
            content: formattedPrompt,
          },
        ],
        ...filteredParameters,
      });
    };

    const response = await retryWithBackoff(makeApiRequest);
    if (response === null) {
      return null;
    }

    return response.choices[0].message.content?.trim() || null;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error communicating with Fireworks API for heading restructuring: ${error.message}`);
    return null;
  }
}

/**
 * Sends an image to the Fireworks API to detect if it's an artifact or valuable content.
 * Returns structured JSON response with artifact detection results.
 */
export async function detectArtifactsInImage(
  dataUrl: string,
  apiKey: string,
  modelName: string,
  prompt: string,
  parameters: Record<string, any>
): Promise<ArtifactDetectionResponse | null> {
  const client = new OpenAI({ apiKey, baseURL: "https://api.fireworks.ai/inference/v1" });
  
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
    
    if (response.choices && response.choices[0] && response.choices[0].message) {
      try {
        const content = response.choices[0].message.content?.trim();
        if (!content) {
          console.warn('⚠️ No content received from Fireworks API for artifact detection');
          return null;
        }
        
        // Parse the JSON response
        const parsedResponse = parseArtifactDetectionResponse(content);
        if (!parsedResponse) {
          console.warn('⚠️ Failed to parse artifact detection response from Fireworks API');
          console.warn('Raw response:', content);
          return null;
        }
        
        const confidence = parsedResponse.confidence !== undefined ? parsedResponse.confidence.toFixed(2) : 'undefined';
        console.log(`  ✅ Artifact detection completed: ${parsedResponse.is_artifact ? 'Artifact' : 'Valuable'} (${confidence} confidence)`);
        if (parsedResponse.content_analysis?.content_description) {
          console.log(`  📝 Content: ${parsedResponse.content_analysis.content_description}`);
        }
        
        return parsedResponse;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        console.error(`⚠️ Unexpected response format from Fireworks API for artifact detection: ${error.message}`);
        return null;
      }
    } else {
      console.error(`⚠️ Artifact detection API request failed: No valid response structure`);
      return null;
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error communicating with Fireworks API for artifact detection: ${error.message}`);
    return null;
  }
}