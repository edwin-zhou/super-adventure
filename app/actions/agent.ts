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
  timestamps?: number[];
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

// Define the study notes generation function declaration (Gemini format)
const generateImageDeclaration = {
  name: 'generate_study_notes',
  description: 'Generate NEW study notes or class notes based on educational content, video transcripts, or text descriptions. Creates handwritten-style notes with diagrams, equations, summaries, and organized content. IMPORTANT: The image generation tool does NOT have access to video content or conversation context - you must explicitly describe ALL content, concepts, equations, diagrams, and details that should appear in the notes. Note style templates are automatically included to match the user\'s preferred style. Use this when the user asks to create notes, generate study materials, summarize content, or create class notes from videos or text. CRITICAL: This function generates MULTIPLE pages in a single call. Provide an array of page objects, where each page contains a focused, easily digestible amount of information.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      pages: {
        type: Type.ARRAY,
        description: 'An array of page objects, where each object represents one page of study notes to generate. Each page should contain a SMALL, FOCUSED, EASILY DIGESTIBLE amount of information - typically one main topic, concept, or section.',
        items: {
          type: Type.OBJECT,
          properties: {
            description: {
              type: Type.STRING,
              description: 'A detailed description of the content for this page. Since the image tool has no access to video content or conversation context, you must explicitly include the specific content for THIS page. For video-based notes, extract and describe the actual content, examples, equations, diagrams, and details that appear in the video. Be extremely specific about what educational content should appear on this single page, keeping it focused and easy to read. Base your description on the ACTUAL content and examples from the video - include specific examples, exact equations, detailed diagrams, and concrete explanations as they appear in the video.',
            },
            timestamps: {
              type: Type.ARRAY,
              description: 'An optional array of timestamps (in seconds) that correspond to the video content covered on this page. These are stored as metadata for future reference.',
              items: {
                type: Type.NUMBER,
              },
            },
          },
          required: ['description'],
        },
      },
      size: {
        type: Type.STRING,
        enum: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
        description: 'The size of the generated notes pages. Always use "1024x1536" (portrait, full-page) for study notes to fit whiteboard pages properly. This size applies to all pages.',
      },
    },
    required: ['pages'],
  },
};

// Define the study notes editing function declaration (Gemini format)
const editImageDeclaration = {
  name: 'edit_study_notes',
  description: 'Edit or modify existing study notes that were previously generated. Use this when the user wants to update, refine, correct, or add content to their notes. If a mask context is available (user has selected a region with the lasso tool), the mask will be automatically provided to edit only that specific region of the notes. Otherwise, edits will apply to the entire notes page. Use this for corrections, additions, clarifications, or improvements to study materials.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      imageId: {
        type: Type.STRING,
        description: 'The ID of the previously generated study notes to edit. Use the most recently generated notes ID if the user refers to "the notes", "this page", or "it".',
      },
      editPrompt: {
        type: Type.STRING,
        description: 'A description of the edits to make to the study notes. Be specific about what content to add, change, correct, or improve. Include any equations, diagrams, text, or formatting changes needed. If a mask is available, describe what educational content should appear in the selected region.',
      },
      size: {
        type: Type.STRING,
        enum: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
        description: 'The size of the output notes page. Default is 1024x1536 (portrait, full-page).',
      },
    },
    required: ['imageId', 'editPrompt'],
  },
};

// Define the add to page tool declaration (Gemini format)
const addToPageDeclaration = {
  name: 'add_notes_to_page',
  description: 'Add generated study notes to a specific page number on the whiteboard. Use this when the user asks to add, place, or put study notes onto the whiteboard. The whiteboard has pages numbered 1, 2, 3, etc. Each page is 1024x1536 pixels, perfect for full-page study notes.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      imageId: {
        type: Type.STRING,
        description: 'The ID of the generated study notes to add to the whiteboard page.',
      },
      pageNumber: {
        type: Type.NUMBER,
        description: 'The page number (1, 2, 3, etc.) to add the notes to. If the page doesn\'t exist, it will be created. Default is 1.',
      },
      replace: {
        type: Type.BOOLEAN,
        description: 'If true (default), replace all existing content on the page with these notes. If false, add the notes to the page alongside existing content.',
      },
    },
    required: ['imageId'],
  },
};

// Define the set video timestamp tool declaration (Gemini format)
const setVideoTimestampDeclaration = {
  name: 'set_video_timestamp',
  description: 'Set the video playback to a specific timestamp. Use this when the user asks to jump to a specific time in the video, seek to a timestamp, go to a certain minute/second, or reference a specific part of the video. The timestamp should be provided in seconds (e.g., 120 for 2 minutes, 90.5 for 1 minute 30.5 seconds).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      timestamp: {
        type: Type.NUMBER,
        description: 'The timestamp in seconds to seek to. For example: 60 for 1 minute, 120 for 2 minutes, 90.5 for 1 minute 30.5 seconds. Must be a non-negative number.',
      },
    },
    required: ['timestamp'],
  },
};


// Execute the image generation function - generates multiple pages in parallel
async function executeGenerateImage(args: { pages: Array<{ description: string; timestamps?: number[] }>; size?: string }): Promise<Array<{ success: boolean; imageId?: string; message: string; error?: string }>> {
  const client = getOpenAIClient();
  
  // ALWAYS include note style templates - hard-wired
  // Start with "default" and add any user-uploaded samples
  const allNoteStyleIds = Array.from(noteStyleSamples.keys());
  const referenceImages: File[] = [];
  
  for (const refId of allNoteStyleIds) {
    const noteSample = noteStyleSamples.get(refId);
    if (noteSample) {
      const imageBuffer = Buffer.from(noteSample.base64Data, 'base64');
      const imageFile = new File([imageBuffer], `note_style_${refId}.png`, { type: 'image/png' });
      referenceImages.push(imageFile);
    }
  }
  
  const templateCount = referenceImages.length;
  const size = args.size || '1024x1536';
  
  // Generate all pages in parallel
  const results = await Promise.all(
    args.pages.map(async (page, index) => {
      try {
        // Build the prompt with instruction to use templates
        const enhancedPrompt = `Style Reference:
Use the included note style template(s) as the visual reference.

Goal:
Create educational study notes that match the template's style exactly.

What to PRESERVE from template:
- Handwriting style, letter formation, and character proportions
- Paper type, texture, and background appearance
- Layout structure, margins, and spacing patterns
- Color palette and ink/pen style
- Organization patterns (headings, bullet points, numbering)

What to CHANGE (new educational content):
${page.description}

Constraints:
- Maintain natural handwritten appearance
- Keep text legible and well-organized
- Use appropriate sizing for headings vs body text
- No digital fonts or computer-generated text
- Preserve the authentic study notes aesthetic from the template`;
        
        let response;
        
        if (referenceImages.length > 0) {
          // Use the edit endpoint with reference images (note style templates)
          response = await client.images.edit({
            model: 'gpt-image-1.5',
            image: referenceImages.length === 1 ? referenceImages[0] : referenceImages as any,
            prompt: enhancedPrompt,
            size: size as any,
            quality: 'high' as any,
            // @ts-ignore - These are valid parameters for gpt-image models
            output_format: 'png',
            background: 'transparent',
          });
        } else {
          // Fallback: Standard generation without references (shouldn't happen if default exists)
          response = await client.images.generate({
            model: 'gpt-image-1.5',
            prompt: enhancedPrompt,
            n: 1,
            size: size as any,
            quality: 'high' as any,
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
          prompt: response.data[0].revised_prompt || page.description,
          format: 'png',
          timestamps: page.timestamps, // Store timestamps as metadata
        });
        
        const refMessage = templateCount > 0 
          ? ` (using ${templateCount} note style template(s))`
          : '';
        
        return {
          success: true,
          imageId,
          message: `Successfully generated study notes page ${index + 1} with ID "${imageId}"${refMessage}: "${response.data[0].revised_prompt || page.description}"`,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          success: false,
          error: errorMessage,
          message: `Failed to generate study notes page ${index + 1}: ${errorMessage}`,
        };
      }
    })
  );
  
  return results;
}

// Execute the image editing function (supports both full-image and masked editing)
async function executeEditImage(args: { imageId: string; editPrompt: string; maskBase64?: string; size?: string }): Promise<{ success: boolean; imageId?: string; message: string; error?: string }> {
  try {
    const client = getOpenAIClient();
    
    // Get the source image from cache
    const sourceImage = imageCache.get(args.imageId);
    if (!sourceImage) {
      return {
        success: false,
        error: 'Notes not found',
        message: `Could not find study notes with ID "${args.imageId}". The notes may have expired or the ID is incorrect.`,
      };
    }
    
    // Convert base64 to a File-like object for the API
    const imageBuffer = Buffer.from(sourceImage.base64Data, 'base64');
    const imageFile = new File([imageBuffer], 'source.png', { type: 'image/png' });
    
    // Build the edit request - include mask if provided
    const editRequest: any = {
      model: 'gpt-image-1.5',
      image: imageFile,
      prompt: args.editPrompt,
      size: (args.size || '1024x1536') as any,
      quality: 'high' as any,
      // @ts-ignore - These are valid parameters for gpt-image models
      output_format: 'png',
      background: 'transparent',
    };
    
    // Add mask if provided (for inpainting)
    if (args.maskBase64) {
      const maskBuffer = Buffer.from(args.maskBase64, 'base64');
      const maskFile = new File([maskBuffer], 'mask.png', { type: 'image/png' });
      editRequest.mask = maskFile;
    }
    
    const response = await client.images.edit(editRequest);

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
    const editType = args.maskBase64 ? 'Masked edit' : 'Edited';
    imageCache.set(newImageId, {
      imageUrl,
      base64Data: imageData,
      prompt: `${editType}: ${args.editPrompt} (from ${args.imageId})`,
      format: 'png',
    });
    
    const editMessage = args.maskBase64 
      ? `Successfully edited selected region in study notes. New notes ID: "${newImageId}". Edit applied: "${args.editPrompt}"`
      : `Successfully edited study notes. New notes ID: "${newImageId}". Edit applied: "${args.editPrompt}"`;
    
    return {
      success: true,
      imageId: newImageId,
      message: editMessage,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
      message: `Failed to edit study notes: ${errorMessage}`,
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
        error: 'Notes not found',
        message: `Could not find study notes with ID "${args.imageId}". Available IDs: ${Array.from(imageCache.keys()).join(', ') || 'none'}`,
      };
    }
    
    // The actual placement on the whiteboard will be handled client-side
    // We just return the action for the client to execute
    return {
      success: true,
      pageNumber,
      replace,
      message: `Successfully queued study notes "${args.imageId}" to be ${replace ? 'replaced on' : 'added to'} page ${pageNumber}.`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      pageNumber: args.pageNumber || 1,
      replace: args.replace !== undefined ? args.replace : true,
      error: errorMessage,
      message: `Failed to add study notes to page: ${errorMessage}`,
    };
  }
}

// Execute the set video timestamp function
async function executeSetVideoTimestamp(args: { timestamp: number }): Promise<{ success: boolean; timestamp: number; message: string; error?: string }> {
  try {
    const timestamp = Math.max(0, args.timestamp); // Ensure non-negative
    
    // The actual video seeking will be handled client-side
    // We just return the action for the client to execute
    return {
      success: true,
      timestamp,
      message: `Successfully queued video to seek to ${timestamp} seconds (${Math.floor(timestamp / 60)}:${String(Math.floor(timestamp % 60)).padStart(2, '0')}).`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      timestamp: args.timestamp,
      error: errorMessage,
      message: `Failed to set video timestamp: ${errorMessage}`,
    };
  }
}

// System prompt for the agent
const SYSTEM_PROMPT = `You are a helpful study assistant for an interactive whiteboard application designed for creating and organizing class notes and study materials.
You help students understand educational content, answer questions, create comprehensive study notes, and organize learning materials.

You have access to four main tools for creating and managing study notes and controlling video playback:

1. **generate_study_notes**: Use this to create NEW study notes or class notes from educational content.
   - Use when the user asks to "create notes", "generate study guide", "summarize", "make notes from this video", or "create class notes"
   - ALWAYS use size "1024x1536" (portrait, full-page) for study notes to fit whiteboard pages properly
   - CRITICAL: The image generation tool does NOT have access to video content, conversation history, or examples shown in videos. You MUST explicitly describe ALL content that should appear in the notes.
   - **SINGLE CALL WITH MULTIPLE PAGES**: This function generates MULTIPLE pages in a SINGLE call. Provide an array of page objects, where each page contains a SMALL, FOCUSED, EASILY DIGESTIBLE amount of information. Avoid cramming too much content onto a single page.
   - Each page should typically focus on: one main topic, one key concept, one section, one example, or one set of related formulas. Keep pages focused and readable.
   - Note style templates are automatically included - you don't need to specify them. The tool will match the user's preferred style automatically.
   - Create well-organized notes with clear sections, headings, equations, diagrams, and summaries - but spread across multiple pages for better readability
   - Examples: "create notes from this video", "generate a study guide on calculus", "make notes in my style"
   
   **WORKFLOW FOR VIDEO-BASED NOTES**:
   - **Analysis Phase**: First, thoroughly analyze the video to extract ALL key points, concepts, examples, and their exact timestamps. Pay close attention to:
     * Specific examples shown or discussed in the video
     * Exact equations, formulas, or mathematical expressions presented
     * Diagrams, charts, or visual aids displayed
     * Step-by-step explanations or solutions demonstrated
     * Important definitions, terminology, or concepts explained
     * Any specific numbers, data, or facts mentioned
   - **Grouping Phase**: Group related content together logically - each group should form one cohesive note page
   - **Generation Phase**: Make a SINGLE call to generate_study_notes with an array of page objects. Each page object should contain:
     * A detailed description of the content for that page (based on ACTUAL video content)
     * The relevant timestamps (array of seconds) for that content
   
   **CRITICAL**: Descriptions MUST be based on the ACTUAL content and examples from the video:
   - The image generation tool has NO access to the video. You MUST explicitly describe the actual content, examples, equations, diagrams, and details that appear in the video.
   - Base your descriptions on what you actually see and hear in the video - include specific examples, exact equations, detailed diagrams, and concrete explanations as they appear in the video.
   - Do not use generic descriptions - be specific about the actual content, examples, and visual elements shown in the video.
   - Include exact equations, formulas, numbers, and step-by-step processes as they are presented in the video.
   
   **PROMPT STRUCTURE BEST PRACTICES** (per page):
   - Each page should have a clear, focused topic or section
   - Organize content with headings, but keep it concise for one page
   - For important equations or formulas, write them out explicitly and clearly
   - For text that must appear verbatim (definitions, theorems), put it in "quotes"
   - Specify visual organization: "Title at top in large text, then 2-3 key points with bullet points, one diagram on the right side"
   - Be specific about layout: "heading in bold, key terms underlined, equations centered"
   - Describe diagrams in detail: "draw a labeled diagram showing [specific elements and their relationships]"
   - Remember: Less is more - each page should be easy to digest at a glance

2. **edit_study_notes**: Use this to EDIT or UPDATE existing study notes.
   - Use when the user wants to correct, refine, add content, or improve their notes
   - You MUST provide the imageId of the notes to edit (use most recent if user says "the notes" or "this page")
   - If a mask context is available (user has selected a region with the lasso tool), the mask will be automatically provided to edit only that specific region
   - If no mask is available, edits will apply to the entire notes page
   - Use for: corrections, additions, clarifications, improvements, adding equations or diagrams
   - Examples: "fix this equation", "add more detail here", "correct the formula", "make this clearer"
   
   **TEXT AND EQUATION RENDERING**:
   - For corrections to specific text/equations, provide the exact new text in "quotes"
   - Specify typography changes explicitly: "make heading larger", "center the equation", "underline key terms"
   - For adding new content, describe both what to add and where to place it

3. **add_notes_to_page**: Use this to add generated study notes to a specific page on the whiteboard.
   - Use when the user asks to add, place, or put study notes onto the whiteboard
   - Specify the pageNumber (1, 2, 3, etc.) - defaults to page 1
   - Pages are automatically created if the page number doesn't exist yet - you can use any page number
   - By default (replace=true), replaces all existing content on the page with the new notes
   - Set replace=false if the user explicitly wants to add alongside existing content (e.g., "add to page 1 without replacing", "keep existing notes")
   - For multi-page notes, use sequential page numbers (1, 2, 3, etc.) to organize content across pages
   - Examples: "add these notes to page 2", "put the notes on the whiteboard", "replace page 1 with these notes"

4. **set_video_timestamp**: Use this to set the video playback to a specific timestamp.
   - Use when the user asks to jump to a specific time, seek to a timestamp, go to a certain minute/second, or reference a specific part of the video
   - The timestamp should be provided in seconds (e.g., 120 for 2 minutes, 90.5 for 1 minute 30.5 seconds)
   - Convert time formats to seconds: "2:30" = 150 seconds, "1 minute 30 seconds" = 90 seconds, "3:45" = 225 seconds
   - Examples: "jump to 2 minutes", "go to 1:30", "seek to 90 seconds", "show me what happens at 3 minutes"

STUDY NOTES GENERATION WORKFLOW:
- When user asks for notes, summaries, or study guides from video/text content:
  1. **Analysis Phase**: Thoroughly analyze the video to extract ALL key points, concepts, examples, and their exact timestamps. Pay close attention to:
     - Specific examples shown or discussed in the video
     - Exact equations, formulas, or mathematical expressions presented
     - Diagrams, charts, or visual aids displayed
     - Step-by-step explanations or solutions demonstrated
     - Important definitions, terminology, or concepts explained
     - Any specific numbers, data, or facts mentioned
  2. **Grouping Phase**: Group related content together logically - each group should form one cohesive note page. Analyze the content and identify logical breakpoints (topics, concepts, sections, examples). Plan how to split content across multiple pages (typically 3-10+ pages depending on content volume). Each page should focus on ONE main idea, concept, or related set of information. Avoid cramming multiple major topics onto a single page.
  3. **Generation Phase**: Make a SINGLE call to generate_study_notes with size "1024x1536" (portrait, full-page) and an array of page objects. Each page object should contain:
     - A detailed description of the content for that page
     - The relevant timestamps (array of seconds) for that content
  4. **CRITICAL**: The image tool has NO access to video content or conversation context. You MUST explicitly describe EVERYTHING that should appear in the notes based on the ACTUAL video content:
     - All key concepts, definitions, and terminology (as they appear in the video)
     - All equations, formulas, and mathematical expressions (write them out explicitly as shown in the video)
     - All diagrams, charts, or visual aids (describe what they actually show in the video)
     - All examples, step-by-step solutions, or explanations (include the actual examples from the video)
     - All important points, summaries, and takeaways (based on what's actually presented)
     - Clear headings, sections, and organization structure
  5. **CRITICAL**: Base your descriptions on the ACTUAL content and examples from the video:
     - Do not use generic descriptions - be specific about the actual content, examples, and visual elements shown in the video
     - Include exact equations, formulas, numbers, and step-by-step processes as they are presented in the video
     - Base your descriptions on what you actually see and hear in the video
  6. Be extremely detailed and specific in your description for EACH page - include all educational content from the video that should appear on THAT particular page
  7. Remember: Better to have more pages with digestible content than fewer pages that are overwhelming
- If user asks to add notes to whiteboard:
  - Use add_notes_to_page tool with the generated notes ID
  - Can specify which page (or default to page 1)
  - Pages are automatically created if they don't exist - you can use any page number (1, 2, 3, etc.)
  - You can generate notes and add to page in a single turn (parallel function calls)
  - For multi-page notes, call add_notes_to_page multiple times with sequential page numbers

DECISION GUIDE:
- User wants notes/summary from video or text → use generate_study_notes (size: 1024x1536). Remember: explicitly describe ALL content based on ACTUAL video content since the tool has no video context. Note style templates are automatically included.
  - **SINGLE CALL WITH MULTIPLE PAGES**: For most content, make a SINGLE call to generate_study_notes with an array of page objects. Each page should contain a small, digestible amount of information. The function will generate all pages in parallel. Then use add_notes_to_page with sequential page numbers to place each page.
  - Only use a single page (array with one object) if the content is truly minimal (e.g., just one simple definition or one formula)
- User wants to modify/correct existing notes → use edit_study_notes with imageId (mask automatically provided if region selected)
- User wants to add notes to whiteboard → use add_notes_to_page with imageId and pageNumber (replace=true by default)
  - Pages are automatically created if they don't exist - use any page number (1, 2, 3, etc.)
- User explicitly wants to keep existing content → use add_notes_to_page with replace=false
- User wants to jump to a specific time in the video → use set_video_timestamp with timestamp in seconds
  - Convert time formats: "2:30" = 150, "1 minute 30 seconds" = 90, "3:45" = 225
  - Examples: "go to 2 minutes" → timestamp: 120, "jump to 1:30" → timestamp: 90, "seek to 3:45" → timestamp: 225

IMPORTANT: 
- After generating or editing notes, do NOT include markdown image syntax like ![alt](url) in your response
- Always mention the notes ID in your response so the user can reference it later
- For add_notes_to_page, always mention which page the notes were added to
- If user references "the notes" or "this page", use the most recent notes ID
- Focus on creating high-quality, educational study materials that help with learning

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
  whiteboardActions?: Array<{ type: string; imageId: string; imageUrl: string; pageNumber: number; replace?: boolean; timestamps?: number[] }>;
  videoActions?: Array<{ type: string; timestamp?: number; videoUrl?: string }>;
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
    messageWithMask = `[MASK CONTEXT AVAILABLE: The user has selected a region on study notes "${maskContext.targetImageId}" using the lasso tool. Use edit_study_notes to edit only that region - the mask will be automatically provided.]\n\n${message}`;
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
      functionDeclarations: [generateImageDeclaration, editImageDeclaration, addToPageDeclaration, setVideoTimestampDeclaration],
    }],
    systemInstruction: SYSTEM_PROMPT,
  };
  
  // Track generated images in this turn
  const generatedImages: Array<{ id: string; prompt: string; url: string }> = [];
  
  // Track whiteboard actions to return to client
  const whiteboardActions: Array<{ type: string; imageId: string; imageUrl: string; pageNumber: number; replace?: boolean; timestamps?: number[] }> = [];
  
  // Track video actions to return to client
  const videoActions: Array<{ type: string; timestamp?: number; videoUrl?: string }> = [];
  
  // Function calling loop
  let currentContents = contents;
  let finalResponse = '';
  const maxIterations = 10; // Prevent infinite loops
  let iteration = 0;
  
  while (iteration < maxIterations) {
    iteration++;
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: currentContents,
      config,
    });
    
    // Check if the model wants to call a function
    if (response.functionCalls && response.functionCalls.length > 0) {
      // Execute function calls and build function responses
      const functionResponseParts: MessagePart[] = [];
      
      // Separate generate_study_notes calls from other calls
      const generateCalls: Array<{ index: number; functionCall: any }> = [];
      const otherCalls: Array<{ index: number; functionCall: any }> = [];
      
      response.functionCalls.forEach((functionCall, index) => {
        if (functionCall.name === 'generate_study_notes') {
          generateCalls.push({ index, functionCall });
        } else {
          otherCalls.push({ index, functionCall });
        }
      });
      
      // Execute all generate_study_notes calls in parallel
      const generateResults = await Promise.all(
        generateCalls.map(async ({ index, functionCall }) => {
          const functionName = functionCall.name;
          const functionArgs = functionCall.args;
          
          if (!functionName || !functionArgs) {
            return { index, functionName: functionName || 'unknown', functionResult: { error: 'Invalid function call' } };
          }
          
          const functionResults = await executeGenerateImage(functionArgs as { pages: Array<{ description: string; timestamps?: number[] }>; size?: string });
          
          // Track all generated images from this call
          for (const functionResult of functionResults) {
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
          
          // Return the array of results as the function result
          return { index, functionName, functionResult: functionResults };
        })
      );
      
      // Store generate results in a map for ordered retrieval
      const generateResultsMap = new Map(generateResults.map(r => [r.index, r]));
      
      // Execute other calls sequentially
      const otherResults: Array<{ index: number; functionName: string; functionResult: any }> = [];
      
      for (const { index, functionCall } of otherCalls) {
        const functionName = functionCall.name;
        const functionArgs = functionCall.args;
        
        if (!functionName || !functionArgs) {
          otherResults.push({ index, functionName: functionName || 'unknown', functionResult: { error: 'Invalid function call' } });
          continue;
        }
        
        // Execute the function
        let functionResult: any;
        if (functionName === 'edit_study_notes') {
          // Add mask from context if available
          const editArgs = {
            ...(functionArgs as { imageId: string; editPrompt: string; size?: string }),
            ...(maskContext ? { maskBase64: maskContext.maskBase64 } : {}),
          };
          functionResult = await executeEditImage(editArgs);
          
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
        } else if (functionName === 'add_notes_to_page') {
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
                timestamps: cached.timestamps, // Include timestamps from cache
              });
            }
          }
        } else if (functionName === 'set_video_timestamp') {
          functionResult = await executeSetVideoTimestamp(functionArgs as { timestamp: number });
          
          // Track video action with video URL from context
          if (functionResult.success) {
            // Get the most recent video from context (or first if multiple)
            const videoUrl = videoContext.length > 0 ? videoContext[videoContext.length - 1] : undefined;
            videoActions.push({
              type: 'seek_to_timestamp',
              timestamp: functionResult.timestamp,
              videoUrl: videoUrl,
            });
          }
        } else {
          functionResult = { error: `Unknown function: ${functionName}` };
        }
        
        otherResults.push({ index, functionName, functionResult });
      }
      
      // Combine all results in original order
      const allResults = new Map([...generateResultsMap, ...new Map(otherResults.map(r => [r.index, r]))]);
      
      // Build function response parts in original order
      response.functionCalls.forEach((_, index) => {
        const result = allResults.get(index);
        if (result) {
          functionResponseParts.push({
            functionResponse: {
              name: result.functionName,
              response: { result: result.functionResult },
            },
          });
        }
      });
      
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
    videoActions: videoActions.length > 0 ? videoActions : undefined,
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
export async function getGeneratedImage(imageId: string): Promise<{ imageUrl: string; prompt: string; timestamps?: number[] } | null> {
  const cached = imageCache.get(imageId);
  if (cached) {
    // Keep in cache so the image can be edited later
    return { 
      imageUrl: cached.imageUrl, 
      prompt: cached.prompt,
      timestamps: cached.timestamps,
    };
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
