import { useRef, useEffect } from 'react'
import { Stage, Layer } from 'react-konva'
import Konva from 'konva'
import { useWhiteboardStore } from '@/stores/useWhiteboardStore'
import { RectangleShape } from './shapes/Rectangle'
import { CircleShape } from './shapes/Circle'
import { LineShape } from './shapes/Line'
import { FreehandShape } from './shapes/FreehandLine'
import { TextNode } from './TextNode'
import { StickyNote } from './StickyNote'
import { ImageNode } from './ImageNode'
import type { WhiteboardElement, TextElement, StickyNoteElement } from '@/types/whiteboard'

export function WhiteboardCanvas() {
  const stageRef = useRef<Konva.Stage>(null)
  
  const {
    elements,
    viewport,
    currentTool,
    drawing,
    selection,
    defaultStyles,
    setViewport,
    clearSelection,
    startDrawing,
    continueDrawing,
    finishDrawing,
    addElement,
  } = useWhiteboardStore()

  // Handle click-to-create for text and sticky notes
  const handleClickToCreate = (point: { x: number; y: number }) => {
    if (currentTool === 'text') {
      const textElement: TextElement = {
        id: `text-${Date.now()}-${Math.random()}`,
        type: 'text',
        x: point.x,
        y: point.y,
        text: 'Double-click to edit',
        fontSize: defaultStyles.fontSize,
        fontFamily: 'Arial',
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
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Mouse/pointer event handlers
  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // If clicking on stage (background)
    if (e.target === e.target.getStage()) {
      if (currentTool === 'select') {
        clearSelection()
      } else if (['rectangle', 'circle', 'line', 'pen'].includes(currentTool)) {
        const stage = e.target.getStage()
        if (!stage) return
        
        const point = stage.getPointerPosition()
        if (!point) return
        
        // Transform point to account for viewport
        const transformedPoint = {
          x: (point.x - viewport.x) / viewport.scale,
          y: (point.y - viewport.y) / viewport.scale,
        }
        
        startDrawing(transformedPoint)
      } else if (currentTool === 'text' || currentTool === 'sticky') {
        const stage = e.target.getStage()
        if (!stage) return
        
        const point = stage.getPointerPosition()
        if (!point) return
        
        // Transform point to account for viewport
        const transformedPoint = {
          x: (point.x - viewport.x) / viewport.scale,
          y: (point.y - viewport.y) / viewport.scale,
        }
        
        handleClickToCreate(transformedPoint)
      }
    }
  }

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!drawing.isDrawing) return
    
    const stage = e.target.getStage()
    if (!stage) return
    
    const point = stage.getPointerPosition()
    if (!point) return
    
    // Transform point to account for viewport
    const transformedPoint = {
      x: (point.x - viewport.x) / viewport.scale,
      y: (point.y - viewport.y) / viewport.scale,
    }
    
    continueDrawing(transformedPoint)
  }

  const handleMouseUp = () => {
    if (drawing.isDrawing) {
      finishDrawing()
    }
  }

  // Wheel event for zoom
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    
    const stage = e.target.getStage()
    if (!stage) return
    
    const oldScale = viewport.scale
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    // Zoom factor
    const scaleBy = 1.1
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy
    
    // Clamp scale between 0.1 and 5
    const clampedScale = Math.max(0.1, Math.min(5, newScale))

    // Calculate new position to zoom towards cursor
    const mousePointTo = {
      x: (pointer.x - viewport.x) / oldScale,
      y: (pointer.y - viewport.y) / oldScale,
    }

    const newPos = {
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    }

    setViewport({
      scale: clampedScale,
      x: newPos.x,
      y: newPos.y,
    })
  }

  // Render element based on type
  const renderElement = (element: WhiteboardElement) => {
    const isSelected = selection.selectedIds.includes(element.id)
    
    switch (element.type) {
      case 'rectangle':
        return <RectangleShape key={element.id} element={element} isSelected={isSelected} />
      case 'circle':
        return <CircleShape key={element.id} element={element} isSelected={isSelected} />
      case 'line':
        return <LineShape key={element.id} element={element} isSelected={isSelected} />
      case 'freehand':
        return <FreehandShape key={element.id} element={element} isSelected={isSelected} />
      case 'text':
        return <TextNode key={element.id} element={element} isSelected={isSelected} />
      case 'sticky':
        return <StickyNote key={element.id} element={element} isSelected={isSelected} />
      case 'image':
        return <ImageNode key={element.id} element={element} isSelected={isSelected} />
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
    <div className="w-full h-full bg-slate-900 relative">
      {/* Grid Background */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `
            linear-gradient(to right, #475569 1px, transparent 1px),
            linear-gradient(to bottom, #475569 1px, transparent 1px)
          `,
          backgroundSize: `${20 * viewport.scale}px ${20 * viewport.scale}px`,
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        }}
      />
      
      <Stage
        ref={stageRef}
        width={window.innerWidth}
        height={window.innerHeight}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        x={viewport.x}
        y={viewport.y}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        draggable={currentTool === 'pan'}
        onDragEnd={(e) => {
          if (currentTool === 'pan') {
            setViewport({
              x: e.target.x(),
              y: e.target.y(),
            })
          }
        }}
      >
        <Layer>
          {/* Render all elements */}
          {elements.map((element) => renderElement(element))}
          
          {/* Render current drawing */}
          {renderCurrentDrawing()}
        </Layer>
      </Stage>
    </div>
  )
}
