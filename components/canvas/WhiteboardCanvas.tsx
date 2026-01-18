'use client'

import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react'
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
  addImageToPage: (imageUrl: string, pageNumber: number, replace?: boolean) => void
  getStageRef: () => React.RefObject<Konva.Stage>
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
  } = useWhiteboardStore()

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
  const addImageToPage = (imageUrl: string, pageNumber: number, replace: boolean = true) => {
    // Ensure the page exists - create pages if pageNumber is out of bounds
    const currentPages = [...pages] // Create a copy to avoid mutating state directly
    while (currentPages.length < pageNumber) {
      const newPageY = currentPages.length * (PAGE_HEIGHT + PAGE_MARGIN)
      currentPages.push({ id: currentPages.length + 1, y: newPageY })
    }
    if (currentPages.length > pages.length) {
      setPages(currentPages)
    }
    
    // Get the page's Y position - handle both existing and newly created pages
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
    }
    
    addElement(imageElement)
  }

  // Expose addImageToPage to parent via ref
  useImperativeHandle(ref, () => ({
    addImageToPage,
    getStageRef: () => stageRef,
  }), [pages, addElement, deleteElement, elements])

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

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (stageRef.current) {
        const container = stageRef.current.container()
        stageRef.current.width(container.offsetWidth)
        stageRef.current.height(container.offsetHeight)
        
        // Recenter pages horizontally within the container
        const containerWidth = container.offsetWidth
        const centeredX = (containerWidth - PAGE_WIDTH * viewport.scale) / 2
        setViewport({ x: centeredX })
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [viewport.scale, isVideoPlayerOpen])

  // Position the first page centered on initial load
  useEffect(() => {
    if (stageRef.current) {
      const container = stageRef.current.container()
      const containerWidth = container.offsetWidth
      const centerX = (containerWidth - PAGE_WIDTH) / 2
      const topY = 50
      setViewport({ x: centerX, y: topY, scale: 1 })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideoPlayerOpen])

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
      setSelectionPath([...selectionPath, transformedPoint.x, transformedPoint.y])
      return
    }
    
    // Handle normal drawing
    if (drawing.isDrawing) {
      continueDrawing(transformedPoint)
    }
  }

  const handleMouseUp = () => {
    // Handle lasso selection completion
    if (isDrawingSelection && currentTool === 'select') {
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
        for (const element of elements) {
          if (element.type === 'image') {
            const imageElement = element as ImageElement
            if (pathOverlapsImage(normalizedPath, imageElement)) {
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
              
              maskContext = {
                selectionPath: normalizedPath,
                targetImageId: imageElement.id,
                targetImageElement: imageElement,
                relativeMaskPath: relativePath,
              }
              break // Use the first overlapping image
            }
          }
        }
        
        setLassoMaskContext(maskContext)
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
