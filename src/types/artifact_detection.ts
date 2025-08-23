/**
 * Artifact Detection Types
 * 
 * Defines the structure for AI-powered artifact detection responses
 */

export interface ArtifactDetectionResponse {
  /** Whether the image is considered an artifact */
  is_artifact: boolean;
  /** Confidence level of the detection (0.0 to 1.0) */
  confidence: number;
  /** Detailed reason for the classification */
  reason: string;
  /** Type of artifact or content detected */
  artifact_type: ArtifactType;
  /** Recommendation to keep or discard the image */
  recommendation: Recommendation;
  /** Detailed analysis of the image content */
  content_analysis?: ContentAnalysis;
}

export enum ArtifactType {
  SOLID_COLOR = 'solid_color',
  DUPLICATE = 'duplicate',
  LOW_QUALITY = 'low_quality',
  CHART = 'chart',
  DIAGRAM = 'diagram',
  LOGO = 'logo',
  TEXT_CONTENT = 'text_content',
  SCREENSHOT = 'screenshot',
  ICON = 'icon',
  OTHER = 'other'
}

export enum Recommendation {
  KEEP = 'keep',
  DISCARD = 'discard'
}

export interface ContentAnalysis {
  /** Whether the image contains any readable text */
  has_text: boolean;
  /** Whether the image contains meaningful content */
  has_meaningful_content: boolean;
  /** Estimated quality of the image */
  estimated_quality: QualityLevel;
  /** Optional description of the content */
  content_description?: string;
}

export enum QualityLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

export interface ArtifactDetectionConfig {
  /** Whether artifact detection is enabled */
  enabled: boolean;
  /** Minimum confidence threshold for detection */
  confidence_threshold: number;
  /** AI prompt for artifact detection */
  prompt: string;
  /** API parameters for artifact detection */
  parameters: ArtifactDetectionParameters;
  /** Processing settings */
  processing: ArtifactProcessingSettings;
  /** Logging configuration */
  logging: ArtifactLoggingSettings;
}

export interface ArtifactDetectionParameters {
  temperature: number;
  top_p: number;
  frequency_penalty: number;
  presence_penalty: number;
  repetition_penalty: number;
  top_k: number;
  max_tokens: number;
}

export interface ArtifactProcessingSettings {
  /** Maximum concurrent requests */
  max_concurrent_requests: number;
  /** Request timeout in milliseconds */
  request_timeout: number;
  /** Whether to retry failed requests */
  retry_failed_requests: boolean;
  /** Maximum retry attempts */
  max_retry_attempts: number;
  /** Delay between retries in milliseconds */
  retry_delay: number;
}

export interface ArtifactLoggingSettings {
  /** Whether logging is enabled */
  enabled: boolean;
  /** Whether to log individual results */
  log_individual_results: boolean;
  /** Whether to log summary statistics */
  log_summary_statistics: boolean;
  /** Whether to save detailed results */
  save_detailed_results: boolean;
  /** Path for saving results */
  results_file_path: string;
}

export interface ArtifactDetectionStats {
  /** Total images processed */
  total_images: number;
  /** Images identified as artifacts */
  artifacts_detected: number;
  /** Images identified as valuable */
  valuable_images: number;
  /** Images with low confidence (kept as safety measure) */
  low_confidence_kept: number;
  /** Average confidence score */
  average_confidence: number;
  /** Processing time in milliseconds */
  processing_time_ms: number;
}

/**
 * Utility function to parse JSON response from AI
 */
export function parseArtifactDetectionResponse(response: string): ArtifactDetectionResponse | null {
  try {
    // Clean the response to ensure it's valid JSON
    let cleanResponse = response.trim();
    
    // Remove any markdown code block markers if present
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/```json\n?/, '').replace(/\n?```$/, '');
    } else if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/```\n?/, '').replace(/\n?```$/, '');
    }
    
    // Try to extract JSON if the response contains explanatory text
    // Look for JSON pattern between { and }
    const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanResponse = jsonMatch[0];
    }
    
    // If no JSON found, try to create a structured response from text
    if (!cleanResponse.startsWith('{')) {
      console.warn('No JSON found in response, attempting to create structured response from text');
      return createStructuredResponseFromText(cleanResponse);
    }
    
    const parsed = JSON.parse(cleanResponse);
    
    // Validate and fix the response structure
    const validatedResponse = validateAndFixResponse(parsed);
    if (!validatedResponse) {
      return null;
    }
    
    return validatedResponse;
  } catch (error) {
    console.error('Failed to parse artifact detection response:', error);
    console.error('Raw response:', response);
    
    // Try to create a structured response from the raw text
    try {
      return createStructuredResponseFromText(response);
    } catch (fallbackError) {
      console.error('Fallback parsing also failed:', fallbackError);
      return null;
    }
  }
}

/**
 * Validates and fixes the response structure
 */
function validateAndFixResponse(parsed: any): ArtifactDetectionResponse | null {
  // Fix missing or invalid fields
  if (typeof parsed.is_artifact !== 'boolean') {
    console.warn('Invalid or missing is_artifact, defaulting to false');
    parsed.is_artifact = false;
  }
  
  if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
    console.warn('Invalid or missing confidence, defaulting to 0.5');
    parsed.confidence = 0.5;
  }
  
  if (typeof parsed.reason !== 'string' || !parsed.reason.trim()) {
    console.warn('Invalid or missing reason, defaulting');
    parsed.reason = 'No reason provided';
  }
  
  if (typeof parsed.artifact_type !== 'string' || !parsed.artifact_type.trim()) {
    console.warn('Invalid or missing artifact_type, defaulting to other');
    parsed.artifact_type = 'other';
  }
  
  if (typeof parsed.recommendation !== 'string' || !parsed.recommendation.trim()) {
    console.warn('Invalid or missing recommendation, inferring from is_artifact');
    parsed.recommendation = parsed.is_artifact ? 'discard' : 'keep';
  }
  
  // Ensure content_analysis exists and has required fields
  if (!parsed.content_analysis || typeof parsed.content_analysis !== 'object') {
    parsed.content_analysis = {
      has_text: false,
      has_meaningful_content: !parsed.is_artifact,
      estimated_quality: 'medium',
      content_description: parsed.reason
    };
  } else {
    if (typeof parsed.content_analysis.has_text !== 'boolean') {
      parsed.content_analysis.has_text = false;
    }
    if (typeof parsed.content_analysis.has_meaningful_content !== 'boolean') {
      parsed.content_analysis.has_meaningful_content = !parsed.is_artifact;
    }
    if (!['low', 'medium', 'high'].includes(parsed.content_analysis.estimated_quality)) {
      parsed.content_analysis.estimated_quality = 'medium';
    }
    if (!parsed.content_analysis.content_description) {
      parsed.content_analysis.content_description = parsed.reason;
    }
  }
  
  return parsed as ArtifactDetectionResponse;
}

/**
 * Creates a structured response from plain text when JSON parsing fails
 */
function createStructuredResponseFromText(text: string): ArtifactDetectionResponse | null {
  const lowerText = text.toLowerCase();
  
  // Analyze the text to determine if it's likely an artifact
  const isArtifact = detectArtifactFromText(lowerText);
  const confidence = estimateConfidenceFromText(lowerText, isArtifact);
  const artifactType = detectArtifactTypeFromText(lowerText);
  const reason = text.length > 100 ? text.substring(0, 100) + '...' : text;
  
  return {
    is_artifact: isArtifact,
    confidence: confidence,
    reason: reason,
    artifact_type: artifactType as ArtifactType,
    recommendation: (isArtifact ? 'discard' : 'keep') as Recommendation,
    content_analysis: {
      has_text: detectTextFromText(lowerText),
      has_meaningful_content: !isArtifact,
      estimated_quality: estimateQualityFromText(lowerText) as QualityLevel,
      content_description: reason
    }
  };
}

/**
 * Determines if text describes an artifact
 */
function detectArtifactFromText(text: string): boolean {
  const artifactKeywords = [
    'solid color', 'background', 'blank', 'empty', 'simple', 'basic',
    'logo', 'icon', 'decorative', 'placeholder', 'template',
    'low quality', 'blurry', 'pixelated', 'poor quality',
    'duplicate', 'repeated', 'similar', 'identical'
  ];
  
  const valuableKeywords = [
    'chart', 'graph', 'diagram', 'data', 'visualization',
    'text', 'content', 'information', 'details',
    'screenshot', 'interface', 'ui', 'screen',
    'document', 'page', 'content', 'meaningful'
  ];
  
  const artifactScore = artifactKeywords.filter(keyword => text.includes(keyword)).length;
  const valuableScore = valuableKeywords.filter(keyword => text.includes(keyword)).length;
  
  // If more valuable keywords, it's not an artifact
  if (valuableScore > artifactScore) return false;
  
  // If more artifact keywords, it is an artifact
  if (artifactScore > valuableScore) return true;
  
  // Default to not an artifact (better safe than sorry)
  return false;
}

/**
 * Estimates confidence based on text content
 */
function estimateConfidenceFromText(text: string, isArtifact: boolean): number {
  const confidenceIndicators = [
    'definitely', 'clearly', 'obviously', 'certainly', 'surely',
    'appears', 'seems', 'likely', 'probably', 'possibly',
    'might', 'could', 'may', 'perhaps', 'uncertain'
  ];
  
  let confidence = 0.5; // Default confidence
  
  for (const indicator of confidenceIndicators) {
    if (text.includes(indicator)) {
      if (['definitely', 'clearly', 'obviously', 'certainly', 'surely'].includes(indicator)) {
        confidence = Math.max(confidence, 0.9);
      } else if (['appears', 'seems', 'likely', 'probably', 'possibly'].includes(indicator)) {
        confidence = Math.max(confidence, 0.7);
      } else {
        confidence = Math.min(confidence, 0.4);
      }
    }
  }
  
  return confidence;
}

/**
 * Detects artifact type from text
 */
function detectArtifactTypeFromText(text: string): string {
  if (text.includes('solid') || text.includes('background') || text.includes('color')) {
    return 'solid_color';
  }
  if (text.includes('chart') || text.includes('graph') || text.includes('data')) {
    return 'chart';
  }
  if (text.includes('diagram') || text.includes('schematic') || text.includes('drawing')) {
    return 'diagram';
  }
  if (text.includes('logo') || text.includes('brand') || text.includes('symbol')) {
    return 'logo';
  }
  if (text.includes('text') || text.includes('content') || text.includes('document')) {
    return 'text_content';
  }
  if (text.includes('screenshot') || text.includes('screen') || text.includes('interface')) {
    return 'screenshot';
  }
  if (text.includes('icon') || text.includes('button') || text.includes('ui')) {
    return 'icon';
  }
  if (text.includes('blurry') || text.includes('pixelated') || text.includes('quality')) {
    return 'low_quality';
  }
  if (text.includes('duplicate') || text.includes('repeated') || text.includes('similar')) {
    return 'duplicate';
  }
  return 'other';
}

/**
 * Detects if text describes text content
 */
function detectTextFromText(text: string): boolean {
  return text.includes('text') || text.includes('content') || text.includes('document') ||
         text.includes('words') || text.includes('readable') || text.includes('writing');
}

/**
 * Estimates quality from text
 */
function estimateQualityFromText(text: string): 'low' | 'medium' | 'high' {
  if (text.includes('high') || text.includes('good') || text.includes('excellent') || text.includes('clear')) {
    return 'high';
  }
  if (text.includes('low') || text.includes('poor') || text.includes('blurry') || text.includes('pixelated')) {
    return 'low';
  }
  return 'medium';
}

/**
 * Utility function to determine if an image should be kept based on detection response
 */
export function shouldKeepImage(
  response: ArtifactDetectionResponse, 
  confidenceThreshold: number
): boolean {
  // If confidence is below threshold, keep the image (better safe than sorry)
  if (response.confidence < confidenceThreshold) {
    return true;
  }
  
  // If confident and not an artifact, keep it
  if (!response.is_artifact) {
    return true;
  }
  
  // If confident and is an artifact, discard it
  return false;
}