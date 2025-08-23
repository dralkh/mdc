import axios from 'axios';
import { retryWithBackoff } from '../utils';

// Define a simple rate limit info structure for Together AI
// Based on their documentation: 600 RPM = 10 RPS
const TOGETHER_AI_RATE_LIMIT = {
  requests_per_minute: 600,
  requests_per_second: 10,
};

const TOGETHER_API_BASE_URL = "https://api.together.xyz/v1";

/**
 * Authenticates the Together AI API key by making a lightweight test call.
 * @returns A tuple [success, rate_limit_info] where:
 * - success: True if authentication is successful, else False
 * - rate_limit_info: Object containing rate limit information or null if authentication failed
 */
export async function authenticateTogetherApi(apiKey: string): Promise<[boolean, typeof TOGETHER_AI_RATE_LIMIT | null]> {
  const testUrl = `${TOGETHER_API_BASE_URL}/chat/completions`;
  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const payload = {
    model: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
    messages: [{ role: "user", content: "test" }],
    max_tokens: 1,
  };

  const authRequest = async () => {
    const resp = await axios.post(testUrl, payload, { headers });
    return resp;
  };

  try {
    const response = await retryWithBackoff(authRequest, 3, 1000, TOGETHER_AI_RATE_LIMIT.requests_per_second); // Max 3 retries, 1s initial delay
    if (response === null) {
      console.error(`❌ Failed to authenticate with Together AI after multiple retries.`);
      return [false, null];
    }

    if (response.status === 200) {
      console.log("✅ Successfully authenticated with Together AI.");
      console.log(`📊 Rate limit: ${TOGETHER_AI_RATE_LIMIT.requests_per_minute} RPM (${TOGETHER_AI_RATE_LIMIT.requests_per_second} RPS)`);
      return [true, TOGETHER_AI_RATE_LIMIT];
    } else {
      console.error(`❌ Failed to authenticate with Together AI.`);
      console.error(`Status Code: ${response.status}`);
      console.error(`Response: ${JSON.stringify(response.data)}`);
      return [false, null];
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`Error during Together AI API authentication: ${error.message}`);
    if (axios.isAxiosError(error) && error.response) {
      console.error(`Response Data: ${JSON.stringify(error.response.data)}`);
    }
    return [false, null];
  }
}

/**
 * Sends the Base64-encoded image data URL to the Together AI API to extract text.
 */
export async function extractTextFromImageTogetherAI(
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
              url: dataUrl // Can be http(s) URL or base64 data URI
            }
          }
        ]
      }
    ],
    ...parameters
  };

  const makeApiRequest = async () => {
    const resp = await axios.post(
      `${TOGETHER_API_BASE_URL}/chat/completions`,
      payload,
      { headers }
    );
    return resp;
  };

  try {
    const response = await retryWithBackoff(makeApiRequest, 5, 2000, TOGETHER_AI_RATE_LIMIT.requests_per_second);
    if (response === null) {
      return null;
    }
    if (response.status === 200) {
      try {
        return response.data.choices[0].message.content.trim();
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        console.error(`⚠️ Unexpected response format from Together AI API (Image Text Extraction): ${error.message}`);
        console.error(`Response Data: ${JSON.stringify(response.data)}`);
        return null;
      }
    } else {
      console.error(`⚠️ API request failed (Image Text Extraction) with status code ${response.status}: ${JSON.stringify(response.data)}`);
      return null;
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error communicating with Together AI API (Image Text Extraction): ${error.message}`);
    if (axios.isAxiosError(error) && error.response) {
      console.error(`Response Data: ${JSON.stringify(error.response.data)}`);
    }
    return null;
  }
}

/**
 * Sends the aggregated text to Together AI API to convert it into Markdown format.
 */
export async function extractMarkdownFromTextTogetherAI(
  allText: string,
  baseFilename: string, // Included for consistency, though not directly used in this OpenAI-compatible payload
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
        content: [ // Assuming prompt and text are sent as separate text blocks if needed, or combined
          {
            type: "text",
            text: prompt // The main instruction prompt
          },
          {
            type: "text",
            text: allText // The text to be converted
          }
        ]
      }
    ],
    ...parameters
  };

  const makeApiRequest = async () => {
    const resp = await axios.post(
      `${TOGETHER_API_BASE_URL}/chat/completions`,
      payload,
      { headers }
    );
    return resp;
  };

  try {
    const response = await retryWithBackoff(makeApiRequest, 5, 2000, TOGETHER_AI_RATE_LIMIT.requests_per_second);
    if (response === null) {
      return null;
    }
    if (response.status === 200) {
      try {
        return response.data.choices[0].message.content.trim();
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        console.error(`⚠️ Unexpected response format from Together AI API (Markdown Conversion): ${error.message}`);
        console.error(`Response Data: ${JSON.stringify(response.data)}`);
        return null;
      }
    } else {
      console.error(`⚠️ Markdown conversion API request failed with status code ${response.status}: ${JSON.stringify(response.data)}`);
      return null;
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error communicating with Together AI API (Markdown Conversion): ${error.message}`);
    if (axios.isAxiosError(error) && error.response) {
      console.error(`Response Data: ${JSON.stringify(error.response.data)}`);
    }
    return null;
  }
}

/**
 * Sends the extracted headings to the Together AI API to generate a TOC.
 */
export async function extractTocFromMarkdownTogetherAI(
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

  let formattedPrompt: string;
  try {
    formattedPrompt = prompt.replace(/{base_filename}/g, baseFilename)
                           .replace(/{extracted_headings_text}/g, extractedHeadingsText);
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`❌ Error formatting TOC prompt: ${error.message}`);
    return null;
  }

  const payload = {
    model: modelName,
    messages: [
      {
        role: "user",
        content: formattedPrompt // The fully formatted prompt
      }
    ],
    ...parameters
  };

  const makeApiRequest = async () => {
    const resp = await axios.post(
      `${TOGETHER_API_BASE_URL}/chat/completions`,
      payload,
      { headers }
    );
    return resp;
  };

  try {
    const response = await retryWithBackoff(makeApiRequest, 5, 2000, TOGETHER_AI_RATE_LIMIT.requests_per_second);
    if (response === null) {
      return null;
    }
    if (response.status === 200) {
      try {
        return response.data.choices[0].message.content.trim();
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        console.error(`⚠️ Unexpected response format from Together AI API (TOC Extraction): ${error.message}`);
        console.error(`Response Data: ${JSON.stringify(response.data)}`);
        return null;
      }
    } else {
      console.error(`⚠️ TOC extraction API request failed with status code ${response.status}: ${JSON.stringify(response.data)}`);
      return null;
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error communicating with Together AI API (TOC Extraction): ${error.message}`);
    if (axios.isAxiosError(error) && error.response) {
      console.error(`Response Data: ${JSON.stringify(error.response.data)}`);
    }
    return null;
  }
}

/**
 * Sends the full markdown content and a list of headings to the Together AI API to determine the correct heading hierarchy.
 * @returns A JSON object with the corrected heading levels.
 */
export async function restructureHeadingsWithRagTogetherAI(
  fullMarkdown: string,
  headings: { text: string; level: number }[],
  apiKey: string,
  modelName: string,
  prompt: string,
  parameters: Record<string, any>
): Promise<string | null> {
  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

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

  const makeApiRequest = async () => {
    const resp = await axios.post(
      `${TOGETHER_API_BASE_URL}/chat/completions`,
      payload,
      { headers }
    );
    return resp;
  };

  try {
    const response = await retryWithBackoff(makeApiRequest, 5, 2000, TOGETHER_AI_RATE_LIMIT.requests_per_second);
    if (response === null) {
      return null;
    }
    if (response.status === 200) {
      try {
        return response.data.choices[0].message.content.trim();
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        console.error(`⚠️ Unexpected response format from Together AI API (Heading Restructuring): ${error.message}`);
        console.error(`Response Data: ${JSON.stringify(response.data)}`);
        return null;
      }
    } else {
      console.error(`⚠️ Heading restructuring API request failed with status code ${response.status}: ${JSON.stringify(response.data)}`);
      return null;
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`⚠️ Error communicating with Together AI API (Heading Restructuring): ${error.message}`);
    if (axios.isAxiosError(error) && error.response) {
      console.error(`Response Data: ${JSON.stringify(error.response.data)}`);
    }
    return null;
  }
}
