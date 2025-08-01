import axios from 'axios';
import { retryWithBackoff } from '../utils';

interface RateLimitInfo {
  requests: number;
  interval: string;
  interval_seconds: number;
  requests_per_second: number;
  credits?: number;
}

/**
 * Authenticates the OpenRouter API key by sending a GET request to the auth endpoint.
 * @returns A tuple [success, rate_limit] where:
 * - success: True if authentication is successful, else False
 * - rate_limit: Object containing rate limit information or null if authentication failed
 */
export async function authenticateOpenrouterApi(apiKey: string): Promise<[boolean, RateLimitInfo | null]> {
  const authUrl = "https://openrouter.ai/api/v1/auth/key";
  const headers = {
    "Authorization": `Bearer ${apiKey}`,
  };

  // Define API request function for retry
  const authRequest = async () => {
    const resp = await axios.get(authUrl, { headers });
    return resp;
  };

  try {
    // Use retry with backoff for authentication request
    const response = await retryWithBackoff(authRequest);
    if (response === null) {
      return [false, null];
    }
            
    if (response.status === 200) {
      try {
        const data = response.data;
        const rateLimit = {
          requests: data?.data?.rate_limit?.requests ?? 5,
          interval: data?.data?.rate_limit?.interval ?? '10s',
          credits: data?.data?.limit ?? 5,
          interval_seconds: 10, // Will be updated below
          requests_per_second: 1 // Will be updated below
        };
        
        // Parse interval to seconds
        const intervalStr = rateLimit.interval;
        let intervalSeconds = 10; // Default

        if (intervalStr.endsWith('s')) {
          intervalSeconds = parseInt(intervalStr.slice(0, -1), 10);
        }
        
        rateLimit.interval_seconds = intervalSeconds;
        
        // Calculate requests per second
        const requestsPerSecond = rateLimit.requests / intervalSeconds;
        rateLimit.requests_per_second = Math.max(1, Math.floor(requestsPerSecond));
        
        console.log("✅ Successfully authenticated with OpenRouter API.");
        console.log(`📊 Rate limit: ${rateLimit.requests} requests per ${intervalStr} ` +
                   `(${rateLimit.requests_per_second} req/s)`);
        
        return [true, rateLimit];
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        console.error(`⚠️ Error parsing rate limit information: ${error.message}`);
        console.error(`Response: ${JSON.stringify(response.data)}`);
        return [true, null];
      }
    } else {
      console.error(`❌ Failed to authenticate with OpenRouter API.`);
      console.error(`Status Code: ${response.status}`);
      console.error(`Response: ${JSON.stringify(response.data)}`);
      return [false, null];
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`Error during OpenRouter API authentication: ${error.message}`);
    return [false, null];
  }
}

/**
 * Sends the Base64-encoded image data URL to the OpenRouter API to extract text.
 */
export async function extractTextFromImage(
  dataUrl: string, 
  apiKey: string, 
  modelName: string, 
  prompt: string, 
  parameters: Record<string, any>
): Promise<string | null> {
  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  
  const payload = {
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
    ...parameters
  };

  // Define API request function for retry
  const makeApiRequest = async () => {
    const resp = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      payload,
      { headers }
    );
    return resp;
  };

  try {
    // Make the API call with retry
    const response = await retryWithBackoff(makeApiRequest);
    if (response === null) {
      return null;
    }if (response.status === 200) {
      try {
        return response.data.choices[0].message.content.trim();
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        console.error(`⚠️ Unexpected response format from OpenRouter API: ${error.message}`);
        return null;
      }
    } else {
      console.error(`⚠️ API request failed with status code ${response.status}: ${JSON.stringify(response.data)}`);
      return null;
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error communicating with OpenRouter API: ${error.message}`);
    return null;
  }
}

/**
 * Sends the aggregated text to OpenRouter API to convert it into Markdown format.
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
  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const payload = {
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
    ...parameters
  };

  // Define API request function for retry
  const makeApiRequest = async () => {
    const resp = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      payload,
      { headers }
    );
    return resp;
  };

  try {
    // Make the API call with retry
    const response = await retryWithBackoff(makeApiRequest);
    if (response === null) {
      return null;
    }
            
    if (response.status === 200) {
      try {
        return response.data.choices[0].message.content.trim();
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        console.error(`⚠️ Unexpected response format from OpenRouter API for Markdown conversion: ${error.message}`);
        return null;
      }
    } else {
      console.error(`⚠️ Markdown conversion API request failed with status code ${response.status}: ${JSON.stringify(response.data)}`);
      return null;
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error communicating with OpenRouter API for Markdown conversion: ${error.message}`);
    return null;
  }
}

/**
 * Sends the extracted headings to the OpenRouter API with a specific prompt to generate a TOC.
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
  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  // Format the prompt with placeholders
  let formattedPrompt: string;
  try {
    formattedPrompt = prompt.replace(/{base_filename}/g, baseFilename)
                           .replace(/{extracted_headings_text}/g, extractedHeadingsText);
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`❌ Error formatting prompt: ${error.message}`);
    return null;
  }

  const payload = {
    model: modelName,
    messages: [
      {
        role: "user",
        content: formattedPrompt
      }
    ],
    ...parameters
  };

  // Define API request function for retry
  const makeApiRequest = async () => {
    const resp = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      payload,
      { headers }
    );
    return resp;
  };

  try {
    // Make the API call with retry
    const response = await retryWithBackoff(makeApiRequest);
    if (response === null) {
      return null;
    }
            
    if (response.status === 200) {
      try {
        return response.data.choices[0].message.content.trim();
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        console.error(`⚠️ Unexpected response format from OpenRouter API for TOC extraction: ${error.message}`);
        return null;
      }
    } else {
      console.error(`⚠️ TOC extraction API request failed with status code ${response.status}: ${JSON.stringify(response.data)}`);
      return null;
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error communicating with OpenRouter API for TOC extraction: ${error.message}`);
    return null;
  }
}
