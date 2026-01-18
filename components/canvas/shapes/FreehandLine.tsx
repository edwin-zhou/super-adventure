'use client'

import { useRef, useEffect } from 'react'
import { Line, Transformer } from 'react-konva'
import Konva from 'konva'
import { useWhiteboardStore } from '@/stores/useWhiteboardStore'
import type { FreehandElement } from '@/types/whiteboard'

interface FreehandShapeProps {
  element: FreehandElement
  isSelected: boolean
  currentTool?: string
}

export function FreehandShape({ element, isSelected, currentTool }: FreehandShapeProps) {
  const shapeRef = useRef<Konva.Line>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const { updateElement, selectElement } = useWhiteboardStore()
  
  // Disable dragging when lasso tool is active
  const isDraggable = currentTool !== 'select' && element.draggable

  useEffect(() => {
    if (isSelected && transformerRef.current && shapeRef.current) {
      transformerRef.current.nodes([shapeRef.current])
      transformerRef.current.getLayer()?.batchDraw()
    }
  }, [isSelected])

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    updateElement(element.id, {
      x: e.target.x(),
      y: e.target.y(),
    })
  }

  const handleTransformEnd = () => {
    const node = shapeRef.current
    if (!node) return

    updateElement(element.id, {
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
    })
  }

  return (
    <>
      <Line
        ref={shapeRef}
        id={element.id}
        x={element.x}
        y={element.y}
        points={element.points}
        stroke={element.stroke}
        strokeWidth={element.strokeWidth}
        tension={element.tension || 0.5}
        lineCap={element.lineCap || 'round'}
        lineJoin={element.lineJoin || 'round'}
        rotation={element.rotation}
        scaleX={element.scaleX}
        scaleY={element.scaleY}
        draggable={isDraggable}
        listening={currentTool !== 'select'}
        onClick={() => selectElement(element.id)}
        onTap={() => selectElement(element.id)}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
      />
      {isSelected && (
        <Transformer
          ref={transformerRef}
          rotateEnabled={true}
        />
      )}
    </>
  )
}
