import * as fs from 'fs-extra';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export interface Config {
  openrouter_model: {
    name: string;
  };
  openai_model: {
    name: string;
  };
  ollama_model: {
    name: string;
  };
  together_model: { // Added for Together AI
    name: string;
  };
  gemini_model: { // Added for Gemini
    name: string;
  };
  prompts: {
    extract_text_from_image: {
      prompt: string;
      parameters: Record<string, any>;
    };
    extract_markdown_from_text: {
      prompt: string;
      parameters: Record<string, any>;
    };
    extract_toc_from_markdown: {
      prompt: string;
      parameters: Record<string, any>;
    };
  };
  pdf_processing: { // Added pdf_processing
    identical_image_threshold: number;
  };
  processing_settings: { // Added for verboseOutput
    verboseOutput: boolean;
  };
}

export function loadConfig(customPath?: string): Config {
  // Check priority:
  // 1. Custom path passed as parameter (CLI --config argument)
  // 2. MDC_CONFIG_PATH environment variable
  // 3. Default config path
  let configPath: string;
  
  if (customPath) {
    configPath = customPath;
    if (!fs.existsSync(configPath)) {
      console.error(`❌ Custom configuration file ${configPath} not found.`);
      console.error(`❌ Check your --config argument.`);
      process.exit(1);
    }
  } else if (process.env.MDC_CONFIG_PATH) {
    configPath = process.env.MDC_CONFIG_PATH;
    if (!fs.existsSync(configPath)) {
      console.error(`❌ Custom configuration file ${configPath} not found.`);
      console.error(`❌ Check your MDC_CONFIG_PATH environment variable.`);
      process.exit(1);
    }
  } else {
    // Use default config path
    configPath = path.join(__dirname, '..', 'config.yaml');
    if (!fs.existsSync(configPath)) {
      console.error(`❌ Configuration file ${configPath} not found.`);
      process.exit(1);
    }
  }
  
  console.log(`📝 Using configuration file: ${configPath}`);
  
  try {
    const configFile = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(configFile) as Config;
    return config;
  } catch (e) {
    console.error(`❌ Error parsing config.yaml: ${e}`);
    process.exit(1);
  }
}

export function getEnvVariable(key: string, defaultValue?: string): string | undefined {
  return process.env[key] || defaultValue;
}
