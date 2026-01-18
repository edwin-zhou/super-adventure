/**
 * Mask generation utilities for lasso-based image editing
 */

/**
 * Normalize a lasso path to a single, non-self-intersecting polygon hull
 * Preserves concave shapes (does NOT convert to convex hull)
 * @param path - Array of coordinates [x1, y1, x2, y2, ...]
 * @returns Normalized path as a single closed polygon
 */
export function normalizeToSingleHull(path: number[]): number[] {
  if (path.length < 6) {
    // Need at least 3 points for a polygon
    return path
  }
  
  // Extract points as {x, y} objects for easier manipulation
  const points: Array<{ x: number; y: number }> = []
  for (let i = 0; i < path.length; i += 2) {
    points.push({ x: path[i], y: path[i + 1] })
  }
  
  // Remove duplicate consecutive points
  const uniquePoints = points.filter((point, idx) => {
    if (idx === 0) return true
    const prev = points[idx - 1]
    return Math.abs(point.x - prev.x) > 0.5 || Math.abs(point.y - prev.y) > 0.5
  })
  
  if (uniquePoints.length < 3) {
    return path
  }
  
  // Simple self-intersection check and removal
  // For each segment, check if it intersects with non-adjacent segments
  const cleanedPoints = removeSelfIntersections(uniquePoints)
  
  // Ensure the polygon is closed (first point connects to last)
  // Already implicitly closed when we render, but we can verify
  const first = cleanedPoints[0]
  const last = cleanedPoints[cleanedPoints.length - 1]
  const isClosed = Math.abs(first.x - last.x) < 0.5 && Math.abs(first.y - last.y) < 0.5
  
  // Convert back to flat array
  const result: number[] = []
  for (const point of cleanedPoints) {
    result.push(point.x, point.y)
  }
  
  // Don't add duplicate closing point if already closed
  if (!isClosed && cleanedPoints.length > 0) {
    // Canvas will close it automatically
  }
  
  return result
}

/**
 * Remove self-intersections from a polygon path
 * Uses a simple greedy approach to remove crossing segments
 */
function removeSelfIntersections(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length < 4) return points
  
  // Create segments
  const segments: Array<{ start: { x: number; y: number }; end: { x: number; y: number }; idx: number }> = []
  for (let i = 0; i < points.length; i++) {
    const start = points[i]
    const end = points[(i + 1) % points.length]
    segments.push({ start, end, idx: i })
  }
  
  // Find intersections (only check non-adjacent segments)
  const toRemove = new Set<number>()
  
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 2; j < segments.length; j++) {
      // Don't check adjacent segments or closing segment against first
      if (j === i + 1 || (i === 0 && j === segments.length - 1)) continue
      
      if (segmentsIntersect(segments[i].start, segments[i].end, segments[j].start, segments[j].end)) {
        // Mark the later segment for removal (simpler approach)
        toRemove.add(j)
      }
    }
  }
  
  // Remove marked points
  if (toRemove.size === 0) return points
  
  const cleaned = points.filter((_, idx) => !toRemove.has(idx))
  return cleaned.length >= 3 ? cleaned : points
}

/**
 * Check if two line segments intersect
 */
function segmentsIntersect(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number }
): boolean {
  const d1 = direction(p3, p4, p1)
  const d2 = direction(p3, p4, p2)
  const d3 = direction(p1, p2, p3)
  const d4 = direction(p1, p2, p4)
  
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }
  
  return false
}

/**
 * Calculate the direction/orientation of point p3 relative to line p1-p2
 */
function direction(p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }): number {
  return (p3.y - p1.y) * (p2.x - p1.x) - (p2.y - p1.y) * (p3.x - p1.x)
}

/**
 * Generate a mask image from a polygon path
 * @param path - Normalized polygon path [x1, y1, x2, y2, ...]
 * @param imageWidth - Width of the target image
 * @param imageHeight - Height of the target image
 * @returns Base64-encoded PNG with alpha channel
 */
export function generateMaskFromPath(
  path: number[],
  imageWidth: number,
  imageHeight: number
): string {
  console.log('[MASK DEBUG] generateMaskFromPath called:', {
    pathLength: path.length,
    pathPoints: path.length / 2,
    imageWidth,
    imageHeight,
    pathPreview: path.slice(0, 6),
  });
  
  // Normalize the path first
  const normalizedPath = normalizeToSingleHull(path)
  console.log('[MASK DEBUG] Path normalized:', {
    originalLength: path.length,
    normalizedLength: normalizedPath.length,
    normalizedPoints: normalizedPath.length / 2,
  });
  
  if (normalizedPath.length < 6) {
    throw new Error('Path must have at least 3 points')
  }
  
  // Create an offscreen canvas
  const canvas = document.createElement('canvas')
  canvas.width = imageWidth
  canvas.height = imageHeight
  const ctx = canvas.getContext('2d')
  
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }
  
  console.log('[MASK DEBUG] Canvas created:', {
    width: canvas.width,
    height: canvas.height,
  });
  
  // Clear canvas (transparent background)
  ctx.clearRect(0, 0, imageWidth, imageHeight)
  
  // Draw the mask polygon (white = edit area)
  ctx.fillStyle = 'white'
  ctx.beginPath()
  
  // Move to first point
  ctx.moveTo(normalizedPath[0], normalizedPath[1])
  console.log('[MASK DEBUG] Starting path at:', {
    x: normalizedPath[0],
    y: normalizedPath[1],
  });
  
  // Draw lines to remaining points
  for (let i = 2; i < normalizedPath.length; i += 2) {
    ctx.lineTo(normalizedPath[i], normalizedPath[i + 1])
  }
  
  // Close the path
  ctx.closePath()
  ctx.fill()
  
  console.log('[MASK DEBUG] Mask drawn on canvas, converting to base64...');
  
  // Convert to base64 PNG
  const base64Data = canvas.toDataURL('image/png').split(',')[1]
  
  console.log('[MASK DEBUG] Mask generation complete:', {
    base64Length: base64Data.length,
    base64Preview: base64Data.substring(0, 50) + '...',
  });
  
  return base64Data
}

/**
 * Transform a path from canvas coordinates to image-relative coordinates
 * @param path - Path in canvas coordinates [x1, y1, x2, y2, ...]
 * @param imageElement - The image element containing position and dimensions
 * @param originalImageWidth - Original width of the source image
 * @param originalImageHeight - Original height of the source image
 * @returns Path in image-relative coordinates
 */
export function transformPathToImageCoordinates(
  path: number[],
  imageElement: { x: number; y: number; width: number; height: number },
  originalImageWidth: number,
  originalImageHeight: number
): number[] {
  const result: number[] = []
  
  for (let i = 0; i < path.length; i += 2) {
    const canvasX = path[i]
    const canvasY = path[i + 1]
    
    // Transform to image-relative coordinates (0-1 range)
    const relativeX = (canvasX - imageElement.x) / imageElement.width
    const relativeY = (canvasY - imageElement.y) / imageElement.height
    
    // Scale to original image dimensions
    const imageX = relativeX * originalImageWidth
    const imageY = relativeY * originalImageHeight
    
    result.push(imageX, imageY)
  }
  
  return result
}

/**
 * Check if a polygon path overlaps with an image element
 * @param path - Polygon path [x1, y1, x2, y2, ...]
 * @param imageElement - Image element with position and dimensions
 * @returns True if the path overlaps the image
 */
export function pathOverlapsImage(
  path: number[],
  imageElement: { x: number; y: number; width: number; height: number }
): boolean {
  if (path.length < 6) return false
  
  const imageRect = {
    left: imageElement.x,
    right: imageElement.x + imageElement.width,
    top: imageElement.y,
    bottom: imageElement.y + imageElement.height,
  }
  
  // Check if any point of the path is inside the image bounds
  for (let i = 0; i < path.length; i += 2) {
    const x = path[i]
    const y = path[i + 1]
    
    if (x >= imageRect.left && x <= imageRect.right &&
        y >= imageRect.top && y <= imageRect.bottom) {
      return true
    }
  }
  
  // Also check if image corners are inside the polygon
  const corners = [
    { x: imageRect.left, y: imageRect.top },
    { x: imageRect.right, y: imageRect.top },
    { x: imageRect.left, y: imageRect.bottom },
    { x: imageRect.right, y: imageRect.bottom },
  ]
  
  for (const corner of corners) {
    if (isPointInPolygon(corner, path)) {
      return true
    }
  }
  
  return false
}

/**
 * Check if a point is inside a polygon using ray casting algorithm
 */
function isPointInPolygon(point: { x: number; y: number }, polygon: number[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 2; i < polygon.length; j = i, i += 2) {
    const xi = polygon[i]
    const yi = polygon[i + 1]
    const xj = polygon[j]
    const yj = polygon[j + 1]
    
    const intersect = ((yi > point.y) !== (yj > point.y))
      && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}
