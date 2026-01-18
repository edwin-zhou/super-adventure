'use server'

import { GoogleGenAI, Type } from '@google/genai';
import OpenAI from 'openai';
import { normalizeYoutubeUrl } from '@/lib/youtube-utils';
import { readFileSync } from 'fs';
import { join } from 'path';

// Store generated images temporarily (keyed by a short ID)
// We store both the data URL (for display) and raw base64 (for editing)
const imageCache = new Map<string, { 
  imageUrl: string; 
  base64Data: string; 
  prompt: string;
  format: string;
}>();

function generateImageId(): string {
  return Math.random().toString(36).substring(2, 8);
}

// Current thread ID for the conversation (server-side state)
let currentThreadId = crypto.randomUUID();

// Global video context - persists across messages in a session
let videoContext: string[] = [];
// Track which videos have already been sent to the model (to avoid re-sending)
let videosSentToModel: Set<string> = new Set();

// Note style samples - uploaded by user to influence generated notes
const noteStyleSamples = new Map<string, { 
  base64Data: string; 
  format: string;
  uploadedAt: Date;
}>();

// Load default note style sample on module initialization
function loadDefaultNoteStyle() {
  try {
    const defaultStylePath = join(process.cwd(), 'public', 'note-styles', 'default.jpg');
    const imageBuffer = readFileSync(defaultStylePath);
    const base64Data = imageBuffer.toString('base64');
    
    // Add as default note style with a fixed ID
    noteStyleSamples.set('default', {
      base64Data,
      format: 'jpg',
      uploadedAt: new Date(0), // Mark as default (epoch time)
    });
  } catch (error) {
    // Default note style not found - that's okay, users can upload their own
    console.warn('Default note style not found at public/note-styles/default.jpg');
  }
}

// Initialize default note style
loadDefaultNoteStyle();

// Conversation history - store as Gemini format
interface MessagePart {
  text?: string;
  fileData?: { fileUri: string; mimeType?: string };
  functionCall?: { name: string; args: Record<string, any> };
  functionResponse?: { name: string; response: { result: any } };
}

interface ConversationTurn {
  role: 'user' | 'model';
  parts: MessagePart[];
}

let conversationHistory: ConversationTurn[] = [];

// Initialize the Gemini client
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }
  
  return new GoogleGenAI({ apiKey });
};

// OpenAI client for image generation
const getOpenAIClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  return new OpenAI({ apiKey });
};

// Helper function to convert base64 image data to a data URL
function imageDataToUrl(imageData: string, format: string = 'png'): string {
  const mimeType = format === 'png' ? 'image/png' 
    : format === 'jpeg' ? 'image/jpeg' 
    : 'image/webp';
  return `data:${mimeType};base64,${imageData}`;
}

// Define the image generation function declaration (Gemini format)
const generateImageDeclaration = {
  name: 'generate_image',
  description: 'Generate a NEW image based on a text description. Can optionally use reference images from the conversation to influence the style, content, or composition. Use this when the user asks to create, draw, or generate a new image.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      prompt: {
        type: Type.STRING,
        description: 'A detailed description of the image to generate. Be specific about style, colors, composition, and subjects. If using reference images, describe how to incorporate them.',
      },
      referenceImageIds: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Optional array of image IDs from previously generated images to use as references. The generated image will be influenced by these reference images. Use when the user says things like "make something like this", "use this as reference", "in the style of the previous image", or wants to combine elements from multiple images.',
      },
      size: {
        type: Type.STRING,
        enum: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
        description: 'The size of the generated image. Default is 1024x1536 (portrait, full-page).',
      },
      quality: {
        type: Type.STRING,
        enum: ['low', 'medium', 'high', 'auto'],
        description: 'The quality level of the generated image. Default is auto.',
      },
    },
    required: ['prompt'],
  },
};

// Define the image editing function declaration (Gemini format)
const editImageDeclaration = {
  name: 'edit_image',
  description: 'Edit or modify an existing image that was previously generated in this conversation. Use this when the user wants to change, modify, update, or refine an image that already exists. The user might say things like "make it blue", "add a hat", "remove the background", "make it more realistic", etc.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      imageId: {
        type: Type.STRING,
        description: 'The ID of the previously generated image to edit. Use the most recently generated image ID if the user refers to "the image" or "it".',
      },
      editPrompt: {
        type: Type.STRING,
        description: 'A description of the edits to make to the image. Be specific about what changes should be made.',
      },
      size: {
        type: Type.STRING,
        enum: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
        description: 'The size of the output image. Default is 1024x1536 (portrait, full-page).',
      },
      quality: {
        type: Type.STRING,
        enum: ['low', 'medium', 'high', 'auto'],
        description: 'The quality level of the output image. Default is auto.',
      },
    },
    required: ['imageId', 'editPrompt'],
  },
};

// Define the add to page tool declaration (Gemini format)
const addToPageDeclaration = {
  name: 'add_to_page',
  description: 'Add a generated full-page image to a specific page number on the whiteboard. Use this when the user asks to add, place, or put generated notes/images onto the whiteboard. The whiteboard has pages numbered 1, 2, 3, etc. Each page is 1024x1536 pixels.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      imageId: {
        type: Type.STRING,
        description: 'The ID of the generated image to add to the whiteboard page.',
      },
      pageNumber: {
        type: Type.NUMBER,
        description: 'The page number (1, 2, 3, etc.) to add the image to. If the page doesn\'t exist, it will be created. Default is 1.',
      },
      replace: {
        type: Type.BOOLEAN,
        description: 'If true (default), replace all existing content on the page with this image. If false, add the image to the page alongside existing content.',
      },
    },
    required: ['imageId'],
  },
};

// Define the edit image with mask function declaration (Gemini format)
const editImageWithMaskDeclaration = {
  name: 'edit_image_with_mask',
  description: 'Edit a specific region of an image using a mask. The mask defines which area of the image to modify (inpainting). Use this when the user has selected a region on an image using the lasso tool and wants to edit only that region. The mask is automatically provided from the lasso selection.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      imageId: {
        type: Type.STRING,
        description: 'The ID of the image to edit. This should match the image that was selected with the lasso.',
      },
      editPrompt: {
        type: Type.STRING,
        description: 'A description of what to add, change, or modify in the masked region. Be specific about what should appear in the selected area.',
      },
      size: {
        type: Type.STRING,
        enum: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
        description: 'The size of the output image. Default is 1024x1536 (portrait, full-page).',
      },
      quality: {
        type: Type.STRING,
        enum: ['low', 'medium', 'high', 'auto'],
        description: 'The quality level of the output image. Default is auto.',
      },
    },
    required: ['imageId', 'editPrompt'],
  },
};

// Execute the image generation function
async function executeGenerateImage(args: { prompt: string; referenceImageIds?: string[]; size?: string; quality?: string }): Promise<{ success: boolean; imageId?: string; message: string; error?: string }> {
  try {
    const client = getOpenAIClient();
    
    // Check if we have reference images to use
    const hasReferences = args.referenceImageIds && args.referenceImageIds.length > 0;
    
    let response;
    
    if (hasReferences) {
      // Use the edit endpoint with reference images
      const referenceImages: File[] = [];
      const validRefs: string[] = [];
      
      for (const refId of args.referenceImageIds!) {
        // Check both image cache and note style samples
        const cached = imageCache.get(refId);
        const noteSample = noteStyleSamples.get(refId);
        
        if (cached) {
          const imageBuffer = Buffer.from(cached.base64Data, 'base64');
          const imageFile = new File([imageBuffer], `ref_${refId}.png`, { type: 'image/png' });
          referenceImages.push(imageFile);
          validRefs.push(refId);
        } else if (noteSample) {
          const imageBuffer = Buffer.from(noteSample.base64Data, 'base64');
          const imageFile = new File([imageBuffer], `note_style_${refId}.png`, { type: 'image/png' });
          referenceImages.push(imageFile);
          validRefs.push(refId);
        }
      }
      
      if (referenceImages.length === 0) {
        return {
          success: false,
          error: 'No valid reference images found',
          message: `Could not find any of the specified reference images. Available IDs: ${Array.from(imageCache.keys()).join(', ') || 'none'}`,
        };
      }
      
      // Use images.edit for reference-based generation
      response = await client.images.edit({
        model: 'gpt-image-1.5',
        image: referenceImages.length === 1 ? referenceImages[0] : referenceImages as any,
        prompt: args.prompt,
        size: (args.size || '1024x1536') as any,
        quality: (args.quality || 'auto') as any,
      });
    } else {
      // Standard generation without references
      response = await client.images.generate({
        model: 'gpt-image-1.5',
        prompt: args.prompt,
        n: 1,
        size: (args.size || '1024x1536') as any,
        quality: (args.quality || 'auto') as any,
        // @ts-ignore - These are valid parameters for gpt-image models
        output_format: 'png',
        background: 'transparent',
      });
    }

    if (!response.data || response.data.length === 0) {
      throw new Error('No image data returned from API');
    }

    const imageData = response.data[0].b64_json;
    if (!imageData) {
      throw new Error('Image data is empty');
    }

    const imageUrl = imageDataToUrl(imageData, 'png');
    const imageId = generateImageId();
    
    // Cache the image for client retrieval AND for potential editing
    imageCache.set(imageId, {
      imageUrl,
      base64Data: imageData,
      prompt: response.data[0].revised_prompt || args.prompt,
      format: 'png',
    });
    
    const refMessage = hasReferences 
      ? ` (using ${args.referenceImageIds!.length} reference image(s))`
      : '';
    
    return {
      success: true,
      imageId,
      message: `Successfully generated image with ID "${imageId}"${refMessage}: "${response.data[0].revised_prompt || args.prompt}"`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
      message: `Failed to generate image: ${errorMessage}`,
    };
  }
}

// Execute the image editing function
async function executeEditImage(args: { imageId: string; editPrompt: string; size?: string; quality?: string }): Promise<{ success: boolean; imageId?: string; message: string; error?: string }> {
  try {
    const client = getOpenAIClient();
    
    // Get the source image from cache
    const sourceImage = imageCache.get(args.imageId);
    if (!sourceImage) {
      return {
        success: false,
        error: 'Image not found',
        message: `Could not find image with ID "${args.imageId}". The image may have expired or the ID is incorrect.`,
      };
    }
    
    // Convert base64 to a File-like object for the API
    const imageBuffer = Buffer.from(sourceImage.base64Data, 'base64');
    const imageFile = new File([imageBuffer], 'source.png', { type: 'image/png' });
    
    const response = await client.images.edit({
      model: 'gpt-image-1.5',
      image: imageFile,
      prompt: args.editPrompt,
      size: (args.size || '1024x1536') as any,
      quality: (args.quality || 'auto') as any,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('No image data returned from API');
    }

    const imageData = response.data[0].b64_json;
    if (!imageData) {
      throw new Error('Image data is empty');
    }

    const imageUrl = imageDataToUrl(imageData, 'png');
    const newImageId = generateImageId();
    
    // Cache the edited image
    imageCache.set(newImageId, {
      imageUrl,
      base64Data: imageData,
      prompt: `Edited: ${args.editPrompt} (from ${args.imageId})`,
      format: 'png',
    });
    
    return {
      success: true,
      imageId: newImageId,
      message: `Successfully edited image. New image ID: "${newImageId}". Edit applied: "${args.editPrompt}"`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
      message: `Failed to edit image: ${errorMessage}`,
    };
  }
}

// Execute the edit image with mask function
async function executeEditImageWithMask(args: { imageId: string; editPrompt: string; maskBase64: string; size?: string; quality?: string }): Promise<{ success: boolean; imageId?: string; message: string; error?: string }> {
  try {
    const client = getOpenAIClient();
    
    // Get the source image from cache
    const sourceImage = imageCache.get(args.imageId);
    if (!sourceImage) {
      return {
        success: false,
        error: 'Image not found',
        message: `Could not find image with ID "${args.imageId}". The image may have expired or the ID is incorrect.`,
      };
    }
    
    // Convert base64 to File objects for the API
    const imageBuffer = Buffer.from(sourceImage.base64Data, 'base64');
    const imageFile = new File([imageBuffer], 'source.png', { type: 'image/png' });
    
    const maskBuffer = Buffer.from(args.maskBase64, 'base64');
    const maskFile = new File([maskBuffer], 'mask.png', { type: 'image/png' });
    
    const response = await client.images.edit({
      model: 'gpt-image-1.5',
      image: imageFile,
      mask: maskFile,
      prompt: args.editPrompt,
      size: (args.size || '1024x1536') as any,
      quality: (args.quality || 'auto') as any,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('No image data returned from API');
    }

    const imageData = response.data[0].b64_json;
    if (!imageData) {
      throw new Error('Image data is empty');
    }

    const imageUrl = imageDataToUrl(imageData, 'png');
    const newImageId = generateImageId();
    
    // Cache the edited image
    imageCache.set(newImageId, {
      imageUrl,
      base64Data: imageData,
      prompt: `Masked edit: ${args.editPrompt} (from ${args.imageId})`,
      format: 'png',
    });
    
    return {
      success: true,
      imageId: newImageId,
      message: `Successfully edited masked region. New image ID: "${newImageId}". Edit applied: "${args.editPrompt}"`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
      message: `Failed to edit image with mask: ${errorMessage}`,
    };
  }
}

// Execute the add to page function
async function executeAddToPage(args: { imageId: string; pageNumber?: number; replace?: boolean }): Promise<{ success: boolean; pageNumber: number; replace: boolean; message: string; error?: string }> {
  try {
    const pageNumber = args.pageNumber || 1;
    const replace = args.replace !== undefined ? args.replace : true;
    
    // Verify the image exists
    const cached = imageCache.get(args.imageId);
    if (!cached) {
      return {
        success: false,
        pageNumber,
        replace,
        error: 'Image not found',
        message: `Could not find image with ID "${args.imageId}". Available IDs: ${Array.from(imageCache.keys()).join(', ') || 'none'}`,
      };
    }
    
    // The actual placement on the whiteboard will be handled client-side
    // We just return the action for the client to execute
    return {
      success: true,
      pageNumber,
      replace,
      message: `Successfully queued image "${args.imageId}" to be ${replace ? 'replaced on' : 'added to'} page ${pageNumber}.`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      pageNumber: args.pageNumber || 1,
      replace: args.replace !== undefined ? args.replace : true,
      error: errorMessage,
      message: `Failed to add image to page: ${errorMessage}`,
    };
  }
}

// System prompt for the agent
const SYSTEM_PROMPT = `You are a helpful teaching assistant for an interactive whiteboard application.
You help users understand educational content, answer questions, and provide explanations.

You have access to four main tools:

1. **generate_image**: Use this to create a NEW image based on a text description.
   - Use when the user asks to "create", "draw", "generate", or "make" a new image
   - Can optionally use \`referenceImageIds\` to provide reference images that influence the output
   - Use reference images when user says "like this", "similar to", "in the style of", "combine these", etc.
   - For FULL-PAGE NOTES: Always use size "1024x1536" (portrait) to fit whiteboard pages
   - Examples with references: "create notes from this video in my style", "make a logo like this but blue"

2. **edit_image**: Use this to MODIFY an existing image that was previously generated.
   - Use when the user wants to change, update, refine, or modify an existing image
   - You MUST provide the imageId of the image to edit
   - Examples: "make it blue", "add a hat", "make it more realistic", "remove the text"

3. **edit_image_with_mask**: Use this to EDIT A SPECIFIC REGION of an image (inpainting).
   - Use when a mask context is available (user has selected a region with the lasso tool)
   - The mask will be automatically provided - you just need the imageId and editPrompt
   - ONLY use this when explicitly told a mask is available in the context
   - Examples: "add a cat here", "change this to blue", "put a tree in the selected area"

4. **add_to_page**: Use this to add a generated image to a specific page on the whiteboard.
   - Use when the user asks to add, place, or put an image onto the whiteboard
   - Specify the pageNumber (1, 2, 3, etc.) - defaults to page 1
   - By default (replace=true), replaces all existing content on the page with the new image
   - Set replace=false if the user explicitly wants to add alongside existing content (e.g., "add to page 1 without replacing", "keep existing content")
   - Creates the page automatically if it doesn't exist
   - Examples: "add these notes to page 2", "put the image on the whiteboard", "replace page 1 with this", "overwrite page 3"

PERSONALIZED NOTES GENERATION:
- When user asks for "notes", "summary", or "study guide" from video content:
  1. ALWAYS use generate_image with size "1024x1536" (portrait, full-page) for notes
  2. ALWAYS include note style sample IDs as referenceImageIds - start with ["default"] and add any user-uploaded sample IDs
  3. The "default" note style shows handwritten mathematical notes on blue-lined paper - use this as the base style
  4. If user has uploaded additional note style samples, include those IDs too to match their preferred style
  5. The notes should be comprehensive, well-organized summaries of the video content
  6. Match the note-taking style from the samples (handwriting, diagrams, layout, formatting, structure, etc.)
- If user asks to add notes to whiteboard:
  - Use add_to_page tool with the generated image ID
  - Can specify which page (or default to page 1)
  - You can generate notes and add to page in a single turn (parallel function calls)

DECISION GUIDE:
- First image → use generate_image (no references)
- Notes/summary from video → use generate_image (size: 1024x1536, with note style as reference if available)
- User wants something "like" existing images → use generate_image with referenceImageIds
- User wants to modify entire image → use edit_image with imageId
- User has selected a region with lasso and wants to edit it → use edit_image_with_mask (mask will be provided)
- User wants to add image to whiteboard → use add_to_page with imageId and pageNumber (replace=true by default)
- User explicitly wants to keep existing content → use add_to_page with imageId, pageNumber, and replace=false

IMPORTANT: 
- After using any image tool, do NOT include markdown image syntax like ![alt](url) in your response
- Always mention the image ID in your response so the user can reference it later
- For add_to_page, always mention which page the image was added to
- If user references "the image" or "it", use the most recent image ID

Be concise but thorough in your responses.
Format your responses in a clear, readable way using markdown when helpful.`;

// Server Actions (exported for client use)

export async function invokeAgent(
  message: string, 
  noteStyleSampleIds?: string[],
  maskContext?: { imageId: string; maskBase64: string; targetImageId: string } | null
): Promise<{
  response: string;
  generatedImages?: Array<{ id: string; prompt: string; url: string }>;
  whiteboardActions?: Array<{ type: string; imageId: string; imageUrl: string; pageNumber: number; replace?: boolean }>;
  availableNoteStyleIds?: string[];
}> {
  const ai = getGeminiClient();
  
  // Get available note style sample IDs
  const availableNoteStyleIds = Array.from(noteStyleSamples.keys());
  
  // Build the content parts for the user message
  const userParts: MessagePart[] = [];
  
  // Add NEW videos that haven't been sent to the model yet
  // (videos already in history don't need to be re-sent)
  const newVideos = videoContext.filter(url => !videosSentToModel.has(url));
  if (newVideos.length > 0) {
    for (const url of newVideos) {
      userParts.push({
        fileData: { 
          fileUri: url,
          mimeType: 'video/*',  // Proper MIME type for video
        },
      } as MessagePart);
      // Mark as sent
      videosSentToModel.add(url);
    }
  }
  
  // Add mask context information if available
  let messageWithMask = message;
  if (maskContext) {
    messageWithMask = `[MASK CONTEXT AVAILABLE: The user has selected a region on image "${maskContext.targetImageId}" using the lasso tool. Use edit_image_with_mask to edit only that region.]\n\n${message}`;
  }
  
  // Add the text message
  userParts.push({ text: messageWithMask });
  
  // Build the full contents array with conversation history
  const contents: ConversationTurn[] = [
    ...conversationHistory,
    { role: 'user', parts: userParts },
  ];
  
  // Configure the model with function declarations
  const config = {
    tools: [{
      functionDeclarations: maskContext 
        ? [generateImageDeclaration, editImageDeclaration, editImageWithMaskDeclaration, addToPageDeclaration]
        : [generateImageDeclaration, editImageDeclaration, addToPageDeclaration],
    }],
    systemInstruction: SYSTEM_PROMPT,
  };
  
  // Track generated images in this turn
  const generatedImages: Array<{ id: string; prompt: string; url: string }> = [];
  
  // Track whiteboard actions to return to client
  const whiteboardActions: Array<{ type: string; imageId: string; imageUrl: string; pageNumber: number; replace?: boolean }> = [];
  
  // Function calling loop
  let currentContents = contents;
  let finalResponse = '';
  const maxIterations = 10; // Prevent infinite loops
  let iteration = 0;
  
  while (iteration < maxIterations) {
    iteration++;
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: currentContents,
      config,
    });
    
    // Check if the model wants to call a function
    if (response.functionCalls && response.functionCalls.length > 0) {
      // Execute function calls and build function responses
      const functionResponseParts: MessagePart[] = [];
      
      for (const functionCall of response.functionCalls) {
        const functionName = functionCall.name;
        const functionArgs = functionCall.args;
        
        if (!functionName || !functionArgs) {
          continue; // Skip invalid function calls
        }
        
        // Execute the function
        let functionResult: any;
        if (functionName === 'generate_image') {
          functionResult = await executeGenerateImage(functionArgs as { prompt: string; referenceImageIds?: string[]; size?: string; quality?: string });
          
          // Track generated image
          if (functionResult.success && functionResult.imageId) {
            const cached = imageCache.get(functionResult.imageId);
            if (cached) {
              generatedImages.push({
                id: functionResult.imageId,
                prompt: cached.prompt,
                url: cached.imageUrl,
              });
            }
          }
        } else if (functionName === 'edit_image') {
          functionResult = await executeEditImage(functionArgs as { imageId: string; editPrompt: string; size?: string; quality?: string });
          
          // Track edited image
          if (functionResult.success && functionResult.imageId) {
            const cached = imageCache.get(functionResult.imageId);
            if (cached) {
              generatedImages.push({
                id: functionResult.imageId,
                prompt: cached.prompt,
                url: cached.imageUrl,
              });
            }
          }
        } else if (functionName === 'edit_image_with_mask') {
          // Add the mask from context
          if (!maskContext) {
            functionResult = { 
              success: false, 
              error: 'No mask context available', 
              message: 'Mask-based editing requires a lasso selection.' 
            };
          } else {
            const argsWithMask = {
              ...(functionArgs as { imageId: string; editPrompt: string; size?: string; quality?: string }),
              maskBase64: maskContext.maskBase64,
            };
            functionResult = await executeEditImageWithMask(argsWithMask);
            
            // Track edited image
            if (functionResult.success && functionResult.imageId) {
              const cached = imageCache.get(functionResult.imageId);
              if (cached) {
                generatedImages.push({
                  id: functionResult.imageId,
                  prompt: cached.prompt,
                  url: cached.imageUrl,
                });
              }
            }
          }
        } else if (functionName === 'add_to_page') {
          functionResult = await executeAddToPage(functionArgs as { imageId: string; pageNumber?: number; replace?: boolean });
          
          // Track whiteboard action
          if (functionResult.success) {
            const imageId = (functionArgs as any).imageId;
            const cached = imageCache.get(imageId);
            if (cached) {
              whiteboardActions.push({
                type: 'add_full_page_image',
                imageId,
                imageUrl: cached.imageUrl,
                pageNumber: functionResult.pageNumber,
                replace: functionResult.replace,
              });
            }
          }
        } else {
          functionResult = { error: `Unknown function: ${functionName}` };
        }
        
        // Add the function response
        functionResponseParts.push({
          functionResponse: {
            name: functionName,
            response: { result: functionResult },
          },
        });
      }
      
      // Append the entire model response (preserves thought signatures)
      // and the function responses to contents
      if (!response.candidates || !response.candidates[0]?.content) {
        // No valid response, break the loop
        finalResponse = 'I encountered an issue processing the function call. Please try again.';
        break;
      }
      
      currentContents = [
        ...currentContents,
        response.candidates[0].content as ConversationTurn, // Use the complete response content with thought signatures
        { role: 'user', parts: functionResponseParts },
      ];
      
      // Continue the loop to get the final text response
      continue;
    }
    
    // No function calls - we have the final response
    finalResponse = response.text || 'I was unable to generate a response.';
    
    // Update conversation history with the complete conversation (including any tool calls)
    // currentContents already includes: history + new user message + any tool call exchanges
    // We just need to add the final model response
    if (response.candidates && response.candidates[0]?.content) {
      conversationHistory = [
        ...currentContents,
        response.candidates[0].content as ConversationTurn,
      ];
    } else {
      // Fallback: just append user message and text response
      conversationHistory = [
        ...currentContents,
        { role: 'model', parts: [{ text: finalResponse }] },
      ];
    }
    
    break;
  }
  
  if (iteration >= maxIterations) {
    finalResponse = 'I encountered an issue processing your request. Please try again.';
  }
  
  return {
    response: finalResponse,
    generatedImages: generatedImages.length > 0 ? generatedImages : undefined,
    whiteboardActions: whiteboardActions.length > 0 ? whiteboardActions : undefined,
    availableNoteStyleIds: availableNoteStyleIds.length > 0 ? availableNoteStyleIds : undefined,
  };
}

export async function clearConversation(): Promise<void> {
  currentThreadId = crypto.randomUUID();
  videoContext = [];
  videosSentToModel = new Set();
  conversationHistory = [];
  imageCache.clear();
  // Note: We DON'T clear noteStyleSamples on conversation clear
  // Users might want to use the same style across multiple chats
}

export async function getThreadId(): Promise<string> {
  return currentThreadId;
}

export async function addVideosToContext(urls: string[]): Promise<void> {
  const normalized = urls.map(normalizeYoutubeUrl);
  videoContext = [...new Set([...videoContext, ...normalized])];
}

export async function removeVideoFromContext(url: string): Promise<void> {
  const normalized = normalizeYoutubeUrl(url);
  videoContext = videoContext.filter(v => v !== normalized);
  videosSentToModel.delete(normalized);
}

export async function clearVideoContext(): Promise<void> {
  videoContext = [];
  videosSentToModel = new Set();
}

export async function getVideoContext(): Promise<string[]> {
  return [...videoContext];
}

// Retrieve a generated image by ID (kept in cache for potential editing)
export async function getGeneratedImage(imageId: string): Promise<{ imageUrl: string; prompt: string } | null> {
  const cached = imageCache.get(imageId);
  if (cached) {
    // Keep in cache so the image can be edited later
    return { imageUrl: cached.imageUrl, prompt: cached.prompt };
  }
  return null;
}

// Get list of all available image IDs (for debugging/reference)
export async function getAvailableImageIds(): Promise<string[]> {
  return Array.from(imageCache.keys());
}

// Note style sample management
export async function addNoteStyleSample(base64Data: string, format: string = 'png'): Promise<string> {
  const sampleId = generateImageId();
  noteStyleSamples.set(sampleId, {
    base64Data,
    format,
    uploadedAt: new Date(),
  });
  return sampleId;
}

export async function clearNoteStyleSamples(): Promise<void> {
  noteStyleSamples.clear();
}

export async function getNoteStyleSampleIds(): Promise<string[]> {
  return Array.from(noteStyleSamples.keys());
}

export async function getNoteStyleSample(sampleId: string): Promise<{ base64Data: string; format: string } | null> {
  const sample = noteStyleSamples.get(sampleId);
  if (sample) {
    return { base64Data: sample.base64Data, format: sample.format };
  }
  return null;
}
