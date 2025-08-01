// Constants for the MDC application

// Default rate limit values (will be overridden if API provides them)
export const DEFAULT_REQUESTS_PER_SECOND = 5; // Maximum number of requests per second
export const SLEEP_TIME = 1000; // Time to sleep between batches in milliseconds

// PDF quality settings for Poppler
export const PDF_QUALITY_SETTINGS = {
  screen: { dpi: 72, jpegQuality: 60 },   // Low quality, small file size
  ebook: { dpi: 150, jpegQuality: 80 },   // Medium quality, balanced file size
  printer: { dpi: 300, jpegQuality: 90 }, // High quality for printing
  prepress: { dpi: 300, jpegQuality: 100 } // Maximum quality
};

// Supported image formats for conversion
export const SUPPORTED_IMAGE_FORMATS = [
  'jpeg', 'jpg', 'png', 'tiff', 'bmp', 'gif', 'webp', 
  'svg', 'wmf', 'emf', 'ico', 'psd', 'heic', 'heif', 
  'raw', 'cr2', 'nef', 'arw', 'dng'
];