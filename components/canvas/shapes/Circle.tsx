'use client'

import { useRef, useEffect } from 'react'
import { Circle, Transformer } from 'react-konva'
import Konva from 'konva'
import { useWhiteboardStore } from '@/stores/useWhiteboardStore'
import type { CircleElement } from '@/types/whiteboard'

interface CircleShapeProps {
  element: CircleElement
  isSelected: boolean
  currentTool?: string
}

export function CircleShape({ element, isSelected, currentTool }: CircleShapeProps) {
  const shapeRef = useRef<Konva.Circle>(null)
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

    const scaleX = node.scaleX()
    const scaleY = node.scaleY()
    const avgScale = (scaleX + scaleY) / 2

    // Reset scale
    node.scaleX(1)
    node.scaleY(1)

    updateElement(element.id, {
      x: node.x(),
      y: node.y(),
      radius: Math.max(5, node.radius() * avgScale),
      rotation: node.rotation(),
    })
  }

  return (
    <>
      <Circle
        ref={shapeRef}
        id={element.id}
        x={element.x}
        y={element.y}
        radius={element.radius}
        fill={element.fill}
        stroke={element.stroke}
        strokeWidth={element.strokeWidth}
        rotation={element.rotation}
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
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 10 || newBox.height < 10) {
              return oldBox
            }
            return newBox
          }}
        />
      )}
    </>
  )
}
