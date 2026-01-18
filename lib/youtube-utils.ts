// YouTube URL detection regex
const YOUTUBE_URL_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:\S*)?/gi;

/**
 * Extracts YouTube URLs from a message
 */
export function extractYoutubeUrls(text: string): string[] {
  const matches = text.match(YOUTUBE_URL_REGEX);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Normalizes YouTube URL to standard format
 */
export function normalizeYoutubeUrl(url: string): string {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  if (match && match[1]) {
    return `https://www.youtube.com/watch?v=${match[1]}`;
  }
  return url;
}

/**
 * Checks if a string contains a YouTube URL
 */
export function containsYoutubeUrl(text: string): boolean {
  // Use a fresh regex to avoid stateful lastIndex issues with global flag
  const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
  return regex.test(text);
}

/**
 * Extract YouTube video ID for thumbnail
 */
export function getYoutubeVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  return match ? match[1] : null;
}
