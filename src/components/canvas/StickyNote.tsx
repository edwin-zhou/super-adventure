import { useRef, useEffect, useState } from 'react'
import { Rect, Text, Group, Transformer } from 'react-konva'
import Konva from 'konva'
import { useWhiteboardStore } from '@/stores/useWhiteboardStore'
import type { StickyNoteElement } from '@/types/whiteboard'

interface StickyNoteProps {
  element: StickyNoteElement
  isSelected: boolean
}

export function StickyNote({ element, isSelected }: StickyNoteProps) {
  const groupRef = useRef<Konva.Group>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const { updateElement, selectElement } = useWhiteboardStore()
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    if (isSelected && transformerRef.current && groupRef.current && !isEditing) {
      transformerRef.current.nodes([groupRef.current])
      transformerRef.current.getLayer()?.batchDraw()
    }
  }, [isSelected, isEditing])

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    updateElement(element.id, {
      x: e.target.x(),
      y: e.target.y(),
    })
  }

  const handleTransformEnd = () => {
    const node = groupRef.current
    if (!node) return

    const scaleX = node.scaleX()
    const scaleY = node.scaleY()

    node.scaleX(1)
    node.scaleY(1)

    updateElement(element.id, {
      x: node.x(),
      y: node.y(),
      width: Math.max(100, element.width * scaleX),
      height: Math.max(100, element.height * scaleY),
      rotation: node.rotation(),
    })
  }

  const handleDoubleClick = () => {
    setIsEditing(true)
    const group = groupRef.current
    if (!group) return

    const stage = group.getStage()
    if (!stage) return

    const groupPosition = group.absolutePosition()
    const stageBox = stage.container().getBoundingClientRect()

    const areaPosition = {
      x: stageBox.left + groupPosition.x,
      y: stageBox.top + groupPosition.y,
    }

    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)

    textarea.value = element.text
    textarea.style.position = 'absolute'
    textarea.style.top = `${areaPosition.y}px`
    textarea.style.left = `${areaPosition.x}px`
    textarea.style.width = `${element.width}px`
    textarea.style.height = `${element.height}px`
    textarea.style.fontSize = `${element.fontSize}px`
    textarea.style.border = '2px solid #3b82f6'
    textarea.style.padding = '10px'
    textarea.style.margin = '0'
    textarea.style.overflow = 'auto'
    textarea.style.background = element.backgroundColor
    textarea.style.outline = 'none'
    textarea.style.resize = 'none'
    textarea.style.fontFamily = 'Arial'
    textarea.style.color = element.textColor
    textarea.style.zIndex = '1000'
    textarea.style.borderRadius = '4px'
    textarea.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.3)'

    textarea.focus()
    textarea.select()

    const removeTextarea = () => {
      textarea.parentNode?.removeChild(textarea)
      setIsEditing(false)
    }

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        removeTextarea()
      }
    })

    textarea.addEventListener('blur', () => {
      updateElement(element.id, { text: textarea.value })
      removeTextarea()
    })
  }

  return (
    <>
      <Group
        ref={groupRef}
        id={element.id}
        x={element.x}
        y={element.y}
        rotation={element.rotation}
        draggable={element.draggable && !isEditing}
        onClick={() => selectElement(element.id)}
        onTap={() => selectElement(element.id)}
        onDblClick={handleDoubleClick}
        onDblTap={handleDoubleClick}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        visible={!isEditing}
      >
        <Rect
          width={element.width}
          height={element.height}
          fill={element.backgroundColor}
          shadowBlur={5}
          shadowOpacity={0.3}
          shadowOffsetY={3}
          cornerRadius={4}
        />
        <Text
          text={element.text}
          fontSize={element.fontSize}
          fontFamily="Arial"
          fill={element.textColor}
          width={element.width - 20}
          height={element.height - 20}
          x={10}
          y={10}
          padding={5}
          wrap="word"
        />
      </Group>
      {isSelected && !isEditing && (
        <Transformer
          ref={transformerRef}
          rotateEnabled={true}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 100 || newBox.height < 100) {
              return oldBox
            }
            return newBox
          }}
        />
      )}
    </>
  )
}
