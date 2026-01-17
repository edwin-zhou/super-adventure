import OpenAI from 'openai';

// Initialize the OpenAI client
// The API key should be set via environment variable VITE_OPENAI_API_KEY
const getClient = () => {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('VITE_OPENAI_API_KEY environment variable is not set');
  }
  return new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
};

/**
 * Image generation options
 */
export interface ImageGenerationOptions {
  // The model to use for image generation
  model?: 'gpt-image-1.5' | 'gpt-image-1' | 'gpt-image-1-mini';
  // Image size
  size?: '1024x1024' | '1024x1536' | '1536x1024' | 'auto';
  // Quality level
  quality?: 'low' | 'medium' | 'high' | 'auto';
  // Output format
  outputFormat?: 'png' | 'jpeg' | 'webp';
  // Output compression (0-100) for jpeg/webp
  outputCompression?: number;
  // Background type
  background?: 'opaque' | 'transparent' | 'auto';
  // Number of images to generate
  n?: number;
  // Enable streaming with partial images
  stream?: boolean;
  // Number of partial images to receive when streaming (0-3)
  partialImages?: number;
}

/**
 * Image generation response
 */
export interface ImageGenerationResult {
  // Base64-encoded image data
  imageData: string;
  // Revised prompt used for generation
  revisedPrompt?: string;
  // Image format
  format: string;
  // Size of the image
  size: string;
  // Usage information
  usage?: {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Streaming image generation callback
 */
export interface StreamingImageCallbacks {
  // Called when a partial image is received
  onPartialImage?: (imageData: string, index: number) => void;
  // Called when the final image is received
  onComplete?: (result: ImageGenerationResult) => void;
  // Called on error
  onError?: (error: Error) => void;
}

/**
 * Generates an image using OpenAI's GPT Image models
 * @param prompt - The text prompt describing the image to generate
 * @param options - Optional configuration for image generation
 * @returns Promise with the generated image data
 */
export async function generateImage(
  prompt: string,
  options: ImageGenerationOptions = {}
): Promise<ImageGenerationResult> {
  const client = getClient();

  const {
    model = 'gpt-image-1.5',
    size = 'auto',
    quality = 'auto',
    outputFormat = 'png',
    outputCompression,
    background = 'auto',
    n = 1,
  } = options;

  try {
    const response = await client.images.generate({
      model,
      prompt,
      n,
      size: size as any,
      quality: quality as any,
      // @ts-ignore - These are valid parameters for gpt-image models
      output_format: outputFormat,
      output_compression: outputCompression,
      background,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('No image data returned from API');
    }

    const imageData = response.data[0].b64_json;
    if (!imageData) {
      throw new Error('Image data is empty');
    }

    return {
      imageData,
      revisedPrompt: response.data[0].revised_prompt,
      format: outputFormat,
      size: size,
      usage: response.usage ? {
        totalTokens: response.usage.total_tokens,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      } : undefined,
    };
  } catch (error) {
    console.error('OpenAI Image API error:', error);

    if (error instanceof Error) {
      if (error.message.includes('API key') || error.message.includes('Unauthorized')) {
        throw new Error('Invalid or missing API key. Please check your VITE_OPENAI_API_KEY.');
      }
      if (error.message.includes('quota') || error.message.includes('rate limit')) {
        throw new Error('API quota exceeded or rate limit reached. Please try again later.');
      }
      if (error.message.includes('content_policy')) {
        throw new Error('The prompt was rejected by the content policy. Please try a different prompt.');
      }
      throw new Error(`Failed to generate image: ${error.message}`);
    }

    throw new Error('An unexpected error occurred while generating the image.');
  }
}

/**
 * Generates an image with streaming (receives partial images as they're generated)
 * @param prompt - The text prompt describing the image to generate
 * @param callbacks - Callbacks for handling streaming events
 * @param options - Optional configuration for image generation
 */
export async function generateImageStreaming(
  prompt: string,
  callbacks: StreamingImageCallbacks,
  options: ImageGenerationOptions = {}
): Promise<void> {
  const client = getClient();

  const {
    model = 'gpt-image-1.5',
    size = 'auto',
    quality = 'auto',
    outputFormat = 'png',
    outputCompression,
    background = 'auto',
    partialImages = 2,
  } = options;

  try {
    const stream = await client.images.generate({
      model,
      prompt,
      n: 1,
      size: size as any,
      quality: quality as any,
      stream: true,
      // @ts-ignore - These are valid parameters for gpt-image models
      output_format: outputFormat,
      output_compression: outputCompression,
      background,
      partial_images: partialImages,
    });

    for await (const event of stream as any) {
      if (event.type === 'image_generation.partial_image') {
        const idx = event.partial_image_index;
        const imageData = event.b64_json;
        
        if (callbacks.onPartialImage) {
          callbacks.onPartialImage(imageData, idx);
        }
      } else if (event.type === 'image_generation.completed') {
        const result: ImageGenerationResult = {
          imageData: event.b64_json,
          revisedPrompt: event.revised_prompt,
          format: outputFormat,
          size: size,
          usage: event.usage ? {
            totalTokens: event.usage.total_tokens,
            inputTokens: event.usage.input_tokens,
            outputTokens: event.usage.output_tokens,
          } : undefined,
        };

        if (callbacks.onComplete) {
          callbacks.onComplete(result);
        }
      }
    }
  } catch (error) {
    console.error('OpenAI Image API streaming error:', error);

    const err = error instanceof Error
      ? new Error(`Failed to generate image: ${error.message}`)
      : new Error('An unexpected error occurred while generating the image.');

    if (callbacks.onError) {
      callbacks.onError(err);
    } else {
      throw err;
    }
  }
}

/**
 * Helper function to convert base64 image data to a data URL for display
 * @param imageData - Base64-encoded image data
 * @param format - Image format (png, jpeg, webp)
 * @returns Data URL that can be used as img src
 */
export function imageDataToUrl(imageData: string, format: string = 'png'): string {
  const mimeType = format === 'png' ? 'image/png' 
    : format === 'jpeg' ? 'image/jpeg' 
    : 'image/webp';
  return `data:${mimeType};base64,${imageData}`;
}

/**
 * Helper function to download an image from base64 data
 * @param imageData - Base64-encoded image data
 * @param filename - Filename for the downloaded image
 * @param format - Image format (png, jpeg, webp)
 */
export function downloadImage(imageData: string, filename: string, format: string = 'png'): void {
  const dataUrl = imageDataToUrl(imageData, format);
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename.endsWith(`.${format}`) ? filename : `${filename}.${format}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Helper function to create a Blob from base64 image data
 * @param imageData - Base64-encoded image data
 * @param format - Image format (png, jpeg, webp)
 * @returns Blob that can be used for uploads or File API
 */
export function imageDataToBlob(imageData: string, format: string = 'png'): Blob {
  const mimeType = format === 'png' ? 'image/png' 
    : format === 'jpeg' ? 'image/jpeg' 
    : 'image/webp';
  
  const byteCharacters = atob(imageData);
  const byteNumbers = new Array(byteCharacters.length);
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}
