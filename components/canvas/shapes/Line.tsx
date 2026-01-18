'use client'

import { useRef, useEffect } from 'react'
import { Line, Transformer } from 'react-konva'
import Konva from 'konva'
import { useWhiteboardStore } from '@/stores/useWhiteboardStore'
import type { LineElement } from '@/types/whiteboard'

interface LineShapeProps {
  element: LineElement
  isSelected: boolean
}

export function LineShape({ element, isSelected }: LineShapeProps) {
  const shapeRef = useRef<Konva.Line>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const { updateElement, selectElement } = useWhiteboardStore()

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
        lineCap={element.lineCap || 'round'}
        rotation={element.rotation}
        scaleX={element.scaleX}
        scaleY={element.scaleY}
        draggable={element.draggable}
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
