'use client'

import { useRef, useEffect, useState, forwardRef, useImperativeHandle, useCallback } from 'react'
import { Stage, Layer, Rect, Line } from 'react-konva'
import Konva from 'konva'
import { useWhiteboardStore } from '@/stores/useWhiteboardStore'
import { RectangleShape } from './shapes/Rectangle'
import { CircleShape } from './shapes/Circle'
import { LineShape } from './shapes/Line'
import { FreehandShape } from './shapes/FreehandLine'
import { TextNode } from './TextNode'
import { StickyNote } from './StickyNote'
import { ImageNode } from './ImageNode'
import type { WhiteboardElement, TextElement, StickyNoteElement, ImageElement } from '@/types/whiteboard'
import { normalizeToSingleHull, pathOverlapsImage, transformPathToImageCoordinates } from '@/lib/mask-utils'

const PAGE_WIDTH = 1024
const PAGE_HEIGHT = 1536
const PAGE_MARGIN = 50

interface WhiteboardCanvasProps {
  isVideoPlayerOpen?: boolean
}

export interface WhiteboardCanvasRef {
  addImageToPage: (imageUrl: string, pageNumber: number, replace?: boolean, timestamps?: number[], generatedImageId?: string) => void
}

export const WhiteboardCanvas = forwardRef<WhiteboardCanvasRef, WhiteboardCanvasProps>(
  function WhiteboardCanvas({ isVideoPlayerOpen = false }, ref) {
  const stageRef = useRef<Konva.Stage>(null)
  const [pages, setPages] = useState([{ id: 1, y: 0 }])
  const [pageColor, setPageColor] = useState('#ffffff')
  const [gridType, setGridType] = useState<'grid' | 'lines' | 'dots' | 'large-grid' | 'small-dots' | 'cross'>('grid')
  const [selectionPath, setSelectionPath] = useState<number[]>([])
  const [isDrawingSelection, setIsDrawingSelection] = useState(false)
  const [completedSelectionPath, setCompletedSelectionPath] = useState<number[]>([])
  const [isDraggingSelected, setIsDraggingSelected] = useState(false)
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null)
  const [dimensions, setDimensions] = useState({ width: 1920, height: 1080 })
  const [completionPosition, setCompletionPosition] = useState<{ x: number; y: number } | null>(null)
  
  const {
    elements,
    viewport,
    currentTool,
    drawing,
    selection,
    defaultStyles,
    setViewport,
    clearSelection,
    selectElement,
    deleteSelectedElements,
    startDrawing,
    continueDrawing,
    finishDrawing,
    addElement,
    updateElement,
    deleteElement,
    setLassoMaskContext,
    clearLassoMaskContext,
    setVideoPlayerTimestamp,
    setVideoPlayerOpen,
    setVideoPlayerAction,
    setChatbotOpen,
  } = useWhiteboardStore()
  
  // Get isVideoPlayerOpen and videoPlayerUrl from store (prop might be stale)
  const isVideoPlayerOpenFromStore = useWhiteboardStore((state) => state.isVideoPlayerOpen)
  const videoPlayerUrl = useWhiteboardStore((state) => state.videoPlayerUrl)

  // Set dimensions on client-side mount (SSR-safe)
  useEffect(() => {
    setDimensions({
      width: window.innerWidth,
      height: window.innerHeight,
    })

    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Check if a point is inside a polygon (for lasso selection)
  const isPointInPolygon = (point: { x: number; y: number }, polygon: number[]) => {
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

  // Check if element is inside selection path
  const isElementInSelection = (element: WhiteboardElement, path: number[]) => {
    if (path.length < 6) return false // Need at least 3 points
    
    // Get element bounds based on type
    let centerX = element.x
    let centerY = element.y
    
    if (element.type === 'rectangle' || element.type === 'sticky') {
      const el = element as any
      centerX = element.x + (el.width || 0) / 2
      centerY = element.y + (el.height || 0) / 2
    } else if (element.type === 'circle') {
      centerX = element.x
      centerY = element.y
    } else if (element.type === 'text') {
      const el = element as any
      centerX = element.x + (el.width || 100) / 2
      centerY = element.y + 10
    } else if (element.type === 'freehand' || element.type === 'line') {
      const el = element as any
      if (el.points && el.points.length >= 2) {
        centerX = element.x + el.points[0]
        centerY = element.y + el.points[1]
      }
    } else if (element.type === 'image') {
      const el = element as any
      centerX = element.x + (el.width || 0) / 2
      centerY = element.y + (el.height || 0) / 2
    }
    
    return isPointInPolygon({ x: centerX, y: centerY }, path)
  }

  const addPage = () => {
    const newPageY = (pages.length) * (PAGE_HEIGHT + PAGE_MARGIN)
    const newPages = [...pages, { id: pages.length + 1, y: newPageY }]
    setPages(newPages)
    
    // Scroll to the new page
    setTimeout(() => {
      const targetY = newPageY * viewport.scale + 50 - window.innerHeight / 2
      const constrained = constrainViewport(viewport.x, -targetY, viewport.scale)
      setViewport({ y: constrained.y })
    }, 100)
  }

  // Function to add an image to a specific page
  const addImageToPage = useCallback((imageUrl: string, pageNumber: number, replace: boolean = true, timestamps?: number[], generatedImageId?: string) => {
    // Calculate what pages we need and the page Y position
    const currentPages = [...pages]
    while (currentPages.length < pageNumber) {
      const newPageY = currentPages.length * (PAGE_HEIGHT + PAGE_MARGIN)
      currentPages.push({ id: currentPages.length + 1, y: newPageY })
    }
    
    // Update pages state (if needed)
    if (currentPages.length > pages.length) {
      setPages(currentPages)
    }
    
    // Get the page's Y position
    const page = currentPages.find(p => p.id === pageNumber) || currentPages[pageNumber - 1]
    const pageY = page ? page.y : (pageNumber - 1) * (PAGE_HEIGHT + PAGE_MARGIN)
    
    // If replace is true, delete all elements on this page
    if (replace) {
      const pageTop = pageY
      const pageBottom = pageY + PAGE_HEIGHT
      
      // Find all elements that are on this page
      const elementsToDelete = elements.filter((el) => {
        // Get element bounds based on type
        let elTop = el.y
        let elBottom = el.y
        
        if (el.type === 'image') {
          const imgEl = el as ImageElement
          elTop = el.y
          elBottom = el.y + (imgEl.height || 0)
        } else if (el.type === 'rectangle' || el.type === 'sticky') {
          const rectEl = el as any
          elTop = el.y
          elBottom = el.y + (rectEl.height || 0)
        } else if (el.type === 'text') {
          const textEl = el as TextElement
          // Approximate text height (rough estimate)
          elTop = el.y
          elBottom = el.y + (textEl.fontSize || 16) * 1.5
        } else if (el.type === 'circle') {
          const circleEl = el as any
          const radius = circleEl.radius || 0
          elTop = el.y - radius
          elBottom = el.y + radius
        } else if (el.type === 'freehand' || el.type === 'line') {
          const lineEl = el as any
          if (lineEl.points && lineEl.points.length >= 2) {
            // Find min and max Y from points
            const yPoints = lineEl.points.filter((_: any, idx: number) => idx % 2 === 1)
            elTop = el.y + Math.min(...yPoints)
            elBottom = el.y + Math.max(...yPoints)
          } else {
            elTop = el.y
            elBottom = el.y
          }
        }
        
        // Element is on this page if any part overlaps with the page bounds
        return (elTop < pageBottom && elBottom > pageTop)
      })
      
      // Delete all elements on this page
      elementsToDelete.forEach((el) => {
        deleteElement(el.id)
      })
    }
    
    // Create the image element to fill the page (centered)
    const imageElement: ImageElement = {
      id: `image-${Date.now()}-${Math.random()}`,
      type: 'image',
      src: imageUrl,
      x: (PAGE_WIDTH - 1024) / 2, // Center horizontally (1024 is image width)
      y: pageY + (PAGE_HEIGHT - 1536) / 2, // Center vertically on page (1536 is image height)
      width: 1024,
      height: 1536,
      draggable: true,
      visible: true,
      timestamps: timestamps, // Store timestamps with the image element
      generatedImageId: generatedImageId, // Store the agent's image cache ID for editing
    }
    
    // Add element outside of setPages callback
    addElement(imageElement)
  }, [pages, elements, addElement, deleteElement])

  // Expose addImageToPage to parent via ref
  useImperativeHandle(ref, () => ({
    addImageToPage,
  }), [addImageToPage])

  // Handle click-to-create for text and sticky notes
  const handleClickToCreate = (point: { x: number; y: number }) => {
    if (currentTool === 'text') {
      // Get the current font from CSS variable or use default
      const computedFont = getComputedStyle(document.documentElement)
        .getPropertyValue('--default-font')
        .trim() || defaultStyles.fontFamily
      
      const textElement: TextElement = {
        id: `text-${Date.now()}-${Math.random()}`,
        type: 'text',
        x: point.x,
        y: point.y,
        text: 'Double-click to edit',
        fontSize: defaultStyles.fontSize,
        fontFamily: computedFont,
        fontStyle: defaultStyles.fontStyle,
        fill: defaultStyles.stroke,
        width: 200,
        align: 'left',
        draggable: true,
        visible: true,
      }
      addElement(textElement)
    } else if (currentTool === 'sticky') {
      const stickyElement: StickyNoteElement = {
        id: `sticky-${Date.now()}-${Math.random()}`,
        type: 'sticky',
        x: point.x,
        y: point.y,
        text: 'Double-click to edit',
        width: 200,
        height: 200,
        backgroundColor: defaultStyles.stickyColor,
        textColor: '#000000',
        fontSize: 14,
        draggable: true,
        visible: true,
      }
      addElement(stickyElement)
    }
  }

  // Handle centering when container size changes
  const recenterCanvas = useCallback(() => {
    if (stageRef.current) {
      const container = stageRef.current.container()
      stageRef.current.width(container.offsetWidth)
      stageRef.current.height(container.offsetHeight)
      
      // Recenter pages horizontally within the container
      const containerWidth = container.offsetWidth
      const centeredX = (containerWidth - PAGE_WIDTH * viewport.scale) / 2
      setViewport({ x: centeredX })
    }
  }, [viewport.scale, setViewport])

  // Handle window resize
  useEffect(() => {
    recenterCanvas()
    window.addEventListener('resize', recenterCanvas)
    return () => window.removeEventListener('resize', recenterCanvas)
  }, [recenterCanvas])

  // Recenter when video player opens/closes - wait for CSS transition to complete
  useEffect(() => {
    // The container has a 300ms CSS transition, so we need to wait for it to complete
    // Also recenter multiple times during the transition for smoother experience
    const timeouts: NodeJS.Timeout[] = []
    
    // Recenter at various points during and after the transition
    const recenterTimes = [0, 50, 150, 320]
    recenterTimes.forEach(delay => {
      timeouts.push(setTimeout(recenterCanvas, delay))
    })
    
    return () => {
      timeouts.forEach(t => clearTimeout(t))
    }
  }, [isVideoPlayerOpen, recenterCanvas])

  // Use ResizeObserver as a fallback to catch any container size changes
  useEffect(() => {
    if (!stageRef.current) return
    
    const container = stageRef.current.container()
    const resizeObserver = new ResizeObserver(() => {
      recenterCanvas()
    })
    
    resizeObserver.observe(container)
    
    return () => {
      resizeObserver.disconnect()
    }
  }, [recenterCanvas])

  // Constrain viewport to stay within page bounds
  const constrainViewport = (_x: number, y: number, scale: number) => {
    const container = stageRef.current?.container()
    const stageWidth = container?.offsetWidth || window.innerWidth
    const stageHeight = window.innerHeight
    const totalPagesHeight = pages.length * (PAGE_HEIGHT + PAGE_MARGIN)
    
    // Keep pages centered horizontally within the container
    const centeredX = (stageWidth - PAGE_WIDTH * scale) / 2
    
    // Calculate vertical boundaries
    const scaledPagesHeight = totalPagesHeight * scale
    const minY = Math.min(0, stageHeight - scaledPagesHeight - 50)
    const maxY = 50
    
    // Constrain values
    const constrainedX = centeredX
    const constrainedY = Math.max(minY, Math.min(maxY, y))
    
    return { x: constrainedX, y: constrainedY }
  }

  // Watch for page color changes from CSS variable
  useEffect(() => {
    const updatePageColor = () => {
      const color = getComputedStyle(document.documentElement).getPropertyValue('--page-color').trim()
      setPageColor(color || '#ffffff')
    }
    
    updatePageColor()
    
    // Set up mutation observer to watch for CSS variable changes
    const observer = new MutationObserver(updatePageColor)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    
    return () => observer.disconnect()
  }, [])

  // Watch for grid type changes from data attribute
  useEffect(() => {
    const updateGridType = () => {
      const type = document.documentElement.getAttribute('data-grid-type') as 'grid' | 'lines' | 'dots' | 'large-grid' | 'small-dots' | 'cross' | null
      setGridType(type || 'grid')
    }
    
    updateGridType()
    
    // Set up mutation observer to watch for attribute changes
    const observer = new MutationObserver(updateGridType)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-grid-type'] })
    
    return () => observer.disconnect()
  }, [])

  // Clear drawing selection when changing away from select tool, but keep completed selection
  useEffect(() => {
    if (currentTool !== 'select') {
      setSelectionPath([])
      setIsDrawingSelection(false)
      // Don't clear completedSelectionPath - keep it visible
    }
  }, [currentTool])

  // Handle delete key for selection area
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in an input field
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection.selectedIds.length > 0) {
          // Delete selected elements
          deleteSelectedElements()
          // Clear the selection path
          setCompletedSelectionPath([])
          e.preventDefault()
        }
      } else if (e.key === 'Escape') {
        // Clear selection and path
        clearSelection()
        setCompletedSelectionPath([])
        clearLassoMaskContext()
        setCompletionPosition(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selection.selectedIds, deleteSelectedElements, clearSelection])

  // Mouse/pointer event handlers
  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()
    if (!stage) return
    
    console.log('Mouse down - Current tool:', currentTool, 'Target:', e.target.attrs.id || 'stage')
    
    const point = stage.getPointerPosition()
    if (!point) return
    
    // Transform point to account for viewport
    const transformedPoint = {
      x: (point.x - viewport.x) / viewport.scale,
      y: (point.y - viewport.y) / viewport.scale,
    }
    
    // Check if clicking on page or stage background (not on an element)
    const isBackground = e.target === stage || e.target.attrs.id?.startsWith('page-')
    
    // If there's a completed selection, check if clicking inside it to drag (regardless of current tool)
    if (completedSelectionPath.length >= 6 && selection.selectedIds.length > 0) {
      if (isPointInPolygon(transformedPoint, completedSelectionPath)) {
        // Start dragging selected elements
        setIsDraggingSelected(true)
        setDragStartPos(transformedPoint)
        return
      } else if (isBackground) {
        // Clicking outside selection area - clear it and proceed with current tool
        clearSelection()
        setCompletedSelectionPath([])
      }
    }
    
    if (isBackground) {
      console.log('Transformed point:', transformedPoint, 'Tool:', currentTool)
      
      if (currentTool === 'select') {
        // Clear previous selection and start new lasso selection
        console.log('[MASK DEBUG] Starting lasso selection at:', transformedPoint)
        clearSelection()
        setCompletedSelectionPath([])
        setIsDrawingSelection(true)
        setSelectionPath([transformedPoint.x, transformedPoint.y])
      } else if (['rectangle', 'circle', 'line', 'pen'].includes(currentTool)) {
        console.log('Starting drawing with tool:', currentTool)
        startDrawing(transformedPoint)
      } else if (currentTool === 'text' || currentTool === 'sticky') {
        handleClickToCreate(transformedPoint)
      }
    }
  }

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()
    if (!stage) return
    
    const point = stage.getPointerPosition()
    if (!point) return
    
    // Transform point to account for viewport
    const transformedPoint = {
      x: (point.x - viewport.x) / viewport.scale,
      y: (point.y - viewport.y) / viewport.scale,
    }
    
    // Debug: log when isDrawingSelection is true (but only first few times)
    if (isDrawingSelection && selectionPath.length < 10) {
      console.log('[MASK DEBUG] handleMouseMove with isDrawingSelection=true:', {
        currentTool,
        pathLength: selectionPath.length,
      })
    }
    
    // Handle dragging selected elements
    if (isDraggingSelected && dragStartPos && selection.selectedIds.length > 0) {
      const deltaX = transformedPoint.x - dragStartPos.x
      const deltaY = transformedPoint.y - dragStartPos.y
      
      // Update all selected elements positions
      selection.selectedIds.forEach((id) => {
        const element = elements.find((el) => el.id === id)
        if (element) {
          updateElement(id, {
            x: element.x + deltaX,
            y: element.y + deltaY,
          })
        }
      })
      
      // Update drag start position for next frame
      setDragStartPos(transformedPoint)
      
      // Update selection path position
      if (completedSelectionPath.length > 0) {
        const updatedPath = completedSelectionPath.map((val, idx) => {
          return idx % 2 === 0 ? val + deltaX : val + deltaY
        })
        setCompletedSelectionPath(updatedPath)
      }
      
      return
    }
    
    // Handle lasso selection drawing
    if (isDrawingSelection && currentTool === 'select') {
      // Use functional update to avoid stale closure issues
      setSelectionPath(prev => {
        // Only log occasionally to avoid console spam
        if (prev.length % 40 === 0) {
          console.log('[MASK DEBUG] Adding point to lasso path:', {
            currentPathLength: prev.length,
            newPoint: transformedPoint,
          })
        }
        return [...prev, transformedPoint.x, transformedPoint.y]
      })
      return
    }
    
    // Debug: Check why lasso points might not be captured
    if (isDrawingSelection) {
      console.log('[MASK DEBUG] isDrawingSelection=true but currentTool is:', currentTool)
    }
    
    // Handle normal drawing
    if (drawing.isDrawing) {
      continueDrawing(transformedPoint)
    }
  }

  const handleMouseUp = () => {
    console.log('[MASK DEBUG] handleMouseUp called:', {
      isDrawingSelection,
      currentTool,
      selectionPathLength: selectionPath.length,
    })
    
    // Handle lasso selection completion
    if (isDrawingSelection && currentTool === 'select') {
      console.log('[MASK DEBUG] Lasso selection completed:', {
        selectionPathLength: selectionPath.length,
        selectionPoints: selectionPath.length / 2,
      })
      setIsDrawingSelection(false)
      
      // Find all elements inside the selection path
      if (selectionPath.length >= 6) {
        // Capture mouse position at completion
        const stage = stageRef.current
        if (stage) {
          const point = stage.getPointerPosition()
          if (point) {
            setCompletionPosition(point)
          }
        }
        
        // Normalize the path to a single hull
        const normalizedPath = normalizeToSingleHull(selectionPath)
        
        // Display the simplified hull shape
        setCompletedSelectionPath(normalizedPath)
        
        // Clear previous selection
        clearSelection()
        
        // Select elements inside the lasso
        elements.forEach((element) => {
          if (isElementInSelection(element, normalizedPath)) {
            selectElement(element.id, true) // Multi-select
          }
        })
        
        // Check if the selection overlaps with any image element
        let maskContext = null
        const imageElements = elements.filter(e => e.type === 'image')
        console.log('[MASK DEBUG] Checking for image overlap:', {
          totalElements: elements.length,
          imageElements: imageElements.length,
          normalizedPathLength: normalizedPath.length,
        })
        
        for (const element of elements) {
          if (element.type === 'image') {
            const imageElement = element as ImageElement
            console.log('[MASK DEBUG] Checking image element:', {
              id: imageElement.id,
              x: imageElement.x,
              y: imageElement.y,
              width: imageElement.width,
              height: imageElement.height,
            })
            
            const overlaps = pathOverlapsImage(normalizedPath, imageElement)
            console.log('[MASK DEBUG] Path overlaps image:', overlaps)
            
            if (overlaps) {
              // Transform path to image-relative coordinates
              // Assuming the image on canvas might be scaled, but we need original dimensions
              const originalWidth = 1024 // Default generated image width
              const originalHeight = 1536 // Default generated image height
              
              const relativePath = transformPathToImageCoordinates(
                normalizedPath,
                imageElement,
                originalWidth,
                originalHeight
              )
              
              // Use generatedImageId (agent's cache ID) if available, otherwise fall back to element ID
              const imageIdForAgent = imageElement.generatedImageId || imageElement.id
              
              console.log('[MASK DEBUG] Creating mask context:', {
                targetImageId: imageIdForAgent,
                elementId: imageElement.id,
                generatedImageId: imageElement.generatedImageId,
                relativePathLength: relativePath.length,
                relativePathPreview: relativePath.slice(0, 6),
              })
              
              maskContext = {
                selectionPath: normalizedPath,
                targetImageId: imageIdForAgent,
                targetImageElement: imageElement,
                relativeMaskPath: relativePath,
              }
              break // Use the first overlapping image
            }
          }
        }
        
        console.log('[MASK DEBUG] Setting lasso mask context:', maskContext ? {
          targetImageId: maskContext.targetImageId,
          hasRelativePath: !!maskContext.relativeMaskPath,
          pathLength: maskContext.relativeMaskPath?.length,
        } : null)
        setLassoMaskContext(maskContext)
        
        // Open chatbot when a selection is made on an image
        if (maskContext) {
          console.log('[MASK DEBUG] Opening chatbot for image selection')
          setChatbotOpen(true)
        }
      } else {
        // Selection too small, clear completion position
        setCompletionPosition(null)
      }
      
      setSelectionPath([])
      return
    }
    
    // Handle dragging selected elements
    if (isDraggingSelected) {
      setIsDraggingSelected(false)
      setDragStartPos(null)
      return
    }
    
    // Handle normal drawing
    if (drawing.isDrawing) {
      console.log('Finishing drawing')
      finishDrawing()
    }
  }

  // Wheel event for both zoom (pinch) and scroll
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    
    const stage = e.target.getStage()
    if (!stage) return
    
    // Detect pinch gesture (ctrlKey is set on trackpad pinch)
    const isPinch = e.evt.ctrlKey || e.evt.metaKey
    
    if (isPinch) {
      // Pinch gesture - ZOOM
      const oldScale = viewport.scale
      const scaleBy = 1.02 // Smaller increment for smoother pinch zoom
      const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy
      
      // Clamp scale between 0.1 and 5
      const clampedScale = Math.max(0.1, Math.min(5, newScale))

      // Keep the same proportional vertical position
      const scaleRatio = clampedScale / oldScale
      const newY = viewport.y * scaleRatio

      // Apply constraints (this will keep X centered)
      const constrained = constrainViewport(viewport.x, newY, clampedScale)

      setViewport({
        scale: clampedScale,
        x: constrained.x,
        y: constrained.y,
      })
    } else {
      // Two-finger scroll - SCROLL UP/DOWN
      const scrollSpeed = 1
      const newY = viewport.y - e.evt.deltaY * scrollSpeed
      
      // Apply constraints
      const constrained = constrainViewport(viewport.x, newY, viewport.scale)
      
      setViewport({
        x: constrained.x,
        y: constrained.y,
      })
    }
  }

  // Render element based on type
  const renderElement = (element: WhiteboardElement) => {
    const isSelected = selection.selectedIds.includes(element.id)
    
    switch (element.type) {
      case 'rectangle':
        return <RectangleShape key={element.id} element={element} isSelected={isSelected} currentTool={currentTool} />
      case 'circle':
        return <CircleShape key={element.id} element={element} isSelected={isSelected} currentTool={currentTool} />
      case 'line':
        return <LineShape key={element.id} element={element} isSelected={isSelected} currentTool={currentTool} />
      case 'freehand':
        return <FreehandShape key={element.id} element={element} isSelected={isSelected} currentTool={currentTool} />
      case 'text':
        return <TextNode key={element.id} element={element} isSelected={isSelected} currentTool={currentTool} />
      case 'sticky':
        return <StickyNote key={element.id} element={element} isSelected={isSelected} currentTool={currentTool} />
      case 'image':
        return <ImageNode key={element.id} element={element} isSelected={isSelected} currentTool={currentTool} />
      default:
        return null
    }
  }

  // Render current drawing element
  const renderCurrentDrawing = () => {
    if (!drawing.currentElement) return null
    
    const element = {
      ...drawing.currentElement,
      id: 'temp-drawing',
      draggable: false,
    } as WhiteboardElement
    
    return renderElement(element)
  }

  // Get all timestamps for a specific page
  const getPageTimestamps = (pageId: number): number[] => {
    const page = pages.find(p => p.id === pageId)
    if (!page) return []
    
    const pageTop = page.y
    const pageBottom = page.y + PAGE_HEIGHT
    
    // Find all image elements on this page
    const pageImages = elements.filter((el) => {
      if (el.type !== 'image') return false
      const imgEl = el as ImageElement
      const elTop = el.y
      const elBottom = el.y + (imgEl.height || 0)
      return (elTop < pageBottom && elBottom > pageTop)
    }) as ImageElement[]
    
    // Collect all unique timestamps from images on this page
    const allTimestamps = new Set<number>()
    pageImages.forEach((img) => {
      if (img.timestamps && img.timestamps.length > 0) {
        img.timestamps.forEach((ts) => allTimestamps.add(ts))
      }
    })
    
    // Sort timestamps
    return Array.from(allTimestamps).sort((a, b) => a - b)
  }

  // Format timestamp as MM:SS
  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  // Handle timestamp link click
  const handleTimestampClick = (timestamp: number) => {
    // Open video player if not already open
    if (!isVideoPlayerOpenFromStore) {
      setVideoPlayerOpen(true)
    }
    
    // If video URL exists, ensure it's loaded and started before seeking
    if (videoPlayerUrl) {
      // Wait for video/iframe to load and initialize
      // YouTube/Vimeo iframes need more time to be ready for API commands
      setTimeout(() => {
        // Set timestamp first
        setVideoPlayerTimestamp(timestamp)
        // Retry setting timestamp after a delay (for iframes that need more time)
        setTimeout(() => {
          setVideoPlayerTimestamp(timestamp)
        }, 500)
        // Then play after timestamp is set (allows seek to complete)
        setTimeout(() => {
          setVideoPlayerAction('play')
          // Set timestamp one more time after play starts (ensures seek works)
          setTimeout(() => {
            setVideoPlayerTimestamp(timestamp)
          }, 300)
        }, 800)
      }, 1000)
    } else {
      // If no video URL, just set timestamp (video might be loaded via other means)
      setVideoPlayerTimestamp(timestamp)
      // Start playing the video
      setVideoPlayerAction('play')
    }
  }

  return (
    <div className="w-full h-full relative whiteboard-canvas overflow-hidden" style={{ backgroundColor: '#d1d5db' }}>
      {/* Lasso Selection Tooltip - Only shown after completion */}
      {completedSelectionPath.length >= 6 && completionPosition && (
        <div 
          className="fixed pointer-events-none z-50 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg shadow-lg"
          style={{
            left: `${completionPosition.x + 15}px`,
            top: `${completionPosition.y - 10}px`,
          }}
        >
          Add to chat →
        </div>
      )}
      
      {/* Add Page Button */}
      <button
        onClick={addPage}
        className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-800/90 backdrop-blur-sm border border-slate-700 rounded-lg shadow-lg text-white hover:bg-slate-700 transition-colors"
      >
        + Add Page
      </button>

      {/* Timestamp Links on Right Edge of Each Page */}
      {pages.map((page) => {
        const timestamps = getPageTimestamps(page.id)
        if (timestamps.length === 0) return null
        
        // Calculate page position in viewport coordinates
        const pageX = viewport.x + PAGE_WIDTH * viewport.scale
        const pageY = viewport.y + page.y * viewport.scale
        const pageHeight = PAGE_HEIGHT * viewport.scale
        
        return (
          <div
            key={`timestamps-${page.id}`}
            className="absolute z-40 flex flex-col gap-1"
            style={{
              left: `${pageX + 10}px`,
              top: `${pageY}px`,
              maxHeight: `${pageHeight}px`,
            }}
          >
            {timestamps.map((timestamp, index) => (
              <button
                key={`${page.id}-${timestamp}-${index}`}
                onClick={() => handleTimestampClick(timestamp)}
                className="px-2 py-1 text-xs font-mono bg-blue-600/90 hover:bg-blue-700 text-white rounded shadow-md hover:shadow-lg transition-all whitespace-nowrap"
                title={`Seek to ${formatTimestamp(timestamp)}`}
              >
                {formatTimestamp(timestamp)}
              </button>
            ))}
          </div>
        )
      })}

      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        x={viewport.x}
        y={viewport.y}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        draggable={false}
      >
        <Layer>
          {/* Render pages */}
          {pages.map((page) => (
            <Rect
              key={page.id}
              id={`page-${page.id}`}
              x={0}
              y={page.y}
              width={PAGE_WIDTH}
              height={PAGE_HEIGHT}
              fill={pageColor}
              stroke="#cbd5e1"
              strokeWidth={2}
              shadowColor="rgba(0,0,0,0.3)"
              shadowBlur={10}
              shadowOffset={{ x: 0, y: 4 }}
              listening={true}
            />
          ))}

          {/* Grid for pages */}
          {pages.map((page) => {
            const gridElements = []
            const gridSize = 20
            
            if (gridType === 'grid') {
              // Full grid - both vertical and horizontal lines
              // Vertical lines
              for (let i = 0; i <= PAGE_WIDTH; i += gridSize) {
                gridElements.push(
                  <Rect
                    key={`v-${page.id}-${i}`}
                    x={i}
                    y={page.y}
                    width={1}
                    height={PAGE_HEIGHT}
                    fill="#94a3b8"
                    opacity={0.15}
                    listening={false}
                  />
                )
              }
              
              // Horizontal lines
              for (let i = 0; i <= PAGE_HEIGHT; i += gridSize) {
                gridElements.push(
                  <Rect
                    key={`h-${page.id}-${i}`}
                    x={0}
                    y={page.y + i}
                    width={PAGE_WIDTH}
                    height={1}
                    fill="#94a3b8"
                    opacity={0.15}
                    listening={false}
                  />
                )
              }
            } else if (gridType === 'lines') {
              // Horizontal lines only
              for (let i = 0; i <= PAGE_HEIGHT; i += gridSize) {
                gridElements.push(
                  <Rect
                    key={`h-${page.id}-${i}`}
                    x={0}
                    y={page.y + i}
                    width={PAGE_WIDTH}
                    height={1}
                    fill="#94a3b8"
                    opacity={0.15}
                    listening={false}
                  />
                )
              }
            } else if (gridType === 'dots') {
              // Regular dots
              for (let x = 0; x <= PAGE_WIDTH; x += gridSize) {
                for (let y = 0; y <= PAGE_HEIGHT; y += gridSize) {
                  gridElements.push(
                    <Rect
                      key={`dot-${page.id}-${x}-${y}`}
                      x={x - 1}
                      y={page.y + y - 1}
                      width={2}
                      height={2}
                      fill="#94a3b8"
                      opacity={0.3}
                      cornerRadius={1}
                      listening={false}
                    />
                  )
                }
              }
            } else if (gridType === 'large-grid') {
              // Larger grid spacing
              const largeGridSize = 40
              for (let i = 0; i <= PAGE_WIDTH; i += largeGridSize) {
                gridElements.push(
                  <Rect
                    key={`v-${page.id}-${i}`}
                    x={i}
                    y={page.y}
                    width={1}
                    height={PAGE_HEIGHT}
                    fill="#94a3b8"
                    opacity={0.2}
                    listening={false}
                  />
                )
              }
              for (let i = 0; i <= PAGE_HEIGHT; i += largeGridSize) {
                gridElements.push(
                  <Rect
                    key={`h-${page.id}-${i}`}
                    x={0}
                    y={page.y + i}
                    width={PAGE_WIDTH}
                    height={1}
                    fill="#94a3b8"
                    opacity={0.2}
                    listening={false}
                  />
                )
              }
            } else if (gridType === 'small-dots') {
              // Smaller, denser dots
              const smallDotSize = 10
              for (let x = 0; x <= PAGE_WIDTH; x += smallDotSize) {
                for (let y = 0; y <= PAGE_HEIGHT; y += smallDotSize) {
                  gridElements.push(
                    <Rect
                      key={`dot-${page.id}-${x}-${y}`}
                      x={x - 0.5}
                      y={page.y + y - 0.5}
                      width={1}
                      height={1}
                      fill="#94a3b8"
                      opacity={0.25}
                      cornerRadius={0.5}
                      listening={false}
                    />
                  )
                }
              }
            } else if (gridType === 'cross') {
              // Cross pattern
              for (let x = 0; x <= PAGE_WIDTH; x += gridSize) {
                for (let y = 0; y <= PAGE_HEIGHT; y += gridSize) {
                  // Horizontal line of cross
                  gridElements.push(
                    <Rect
                      key={`cross-h-${page.id}-${x}-${y}`}
                      x={x - 3}
                      y={page.y + y}
                      width={6}
                      height={1}
                      fill="#94a3b8"
                      opacity={0.25}
                      listening={false}
                    />
                  )
                  // Vertical line of cross
                  gridElements.push(
                    <Rect
                      key={`cross-v-${page.id}-${x}-${y}`}
                      x={x}
                      y={page.y + y - 3}
                      width={1}
                      height={6}
                      fill="#94a3b8"
                      opacity={0.25}
                      listening={false}
                    />
                  )
                }
              }
            }
            
            return gridElements
          })}
          
          {/* Render all elements */}
          {elements.map((element) => renderElement(element))}
          
          {/* Render current drawing */}
          {renderCurrentDrawing()}
          
          {/* Render lasso selection path while drawing */}
          {isDrawingSelection && selectionPath.length >= 2 && (
            <Line
              points={selectionPath}
              stroke="#3b82f6"
              strokeWidth={2}
              dash={[10, 5]}
              lineCap="round"
              lineJoin="round"
              listening={false}
              opacity={0.8}
            />
          )}
          
          {/* Render completed selection path (stays visible even when tool changes) */}
          {!isDrawingSelection && completedSelectionPath.length >= 6 && (
            <Line
              points={completedSelectionPath}
              stroke="#3b82f6"
              strokeWidth={2}
              dash={[10, 5]}
              lineCap="round"
              lineJoin="round"
              closed={true}
              listening={false}
              opacity={0.6}
              fill="rgba(59, 130, 246, 0.1)"
            />
          )}
        </Layer>
      </Stage>
    </div>
  )
})

// Set displayName for better debugging
WhiteboardCanvas.displayName = 'WhiteboardCanvas'
