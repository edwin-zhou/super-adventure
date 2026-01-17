import { useRef, useEffect, useState } from 'react'
import { Text, Transformer } from 'react-konva'
import Konva from 'konva'
import { useWhiteboardStore } from '@/stores/useWhiteboardStore'
import type { TextElement } from '@/types/whiteboard'

interface TextNodeProps {
  element: TextElement
  isSelected: boolean
}

export function TextNode({ element, isSelected }: TextNodeProps) {
  const shapeRef = useRef<Konva.Text>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const { updateElement, selectElement } = useWhiteboardStore()
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    if (isSelected && transformerRef.current && shapeRef.current && !isEditing) {
      transformerRef.current.nodes([shapeRef.current])
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
    const node = shapeRef.current
    if (!node) return

    const scaleX = node.scaleX()
    const scaleY = node.scaleY()

    node.scaleX(1)
    node.scaleY(1)

    updateElement(element.id, {
      x: node.x(),
      y: node.y(),
      width: Math.max(node.width() * scaleX, 20),
      fontSize: Math.max(node.fontSize() * scaleY, 8),
      rotation: node.rotation(),
    })
  }

  const handleDoubleClick = () => {
    setIsEditing(true)
    const textNode = shapeRef.current
    if (!textNode) return

    const stage = textNode.getStage()
    if (!stage) return

    const textPosition = textNode.absolutePosition()
    const stageBox = stage.container().getBoundingClientRect()

    const areaPosition = {
      x: stageBox.left + textPosition.x,
      y: stageBox.top + textPosition.y,
    }

    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)

    textarea.value = element.text
    textarea.style.position = 'absolute'
    textarea.style.top = `${areaPosition.y}px`
    textarea.style.left = `${areaPosition.x}px`
    textarea.style.width = `${textNode.width()}px`
    textarea.style.fontSize = `${element.fontSize}px`
    textarea.style.border = '2px solid #3b82f6'
    textarea.style.padding = '4px'
    textarea.style.margin = '0'
    textarea.style.overflow = 'hidden'
    textarea.style.background = '#1e293b'
    textarea.style.outline = 'none'
    textarea.style.resize = 'none'
    textarea.style.lineHeight = String(textNode.lineHeight())
    textarea.style.fontFamily = element.fontFamily || 'Arial'
    textarea.style.color = element.fill
    textarea.style.zIndex = '1000'
    textarea.style.borderRadius = '4px'

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
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        updateElement(element.id, { text: textarea.value })
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
      <Text
        ref={shapeRef}
        id={element.id}
        x={element.x}
        y={element.y}
        text={element.text}
        fontSize={element.fontSize}
        fontFamily={element.fontFamily || 'Arial'}
        fill={element.fill}
        width={element.width}
        align={element.align}
        fontStyle={element.fontStyle}
        rotation={element.rotation}
        draggable={element.draggable && !isEditing}
        onClick={() => selectElement(element.id)}
        onTap={() => selectElement(element.id)}
        onDblClick={handleDoubleClick}
        onDblTap={handleDoubleClick}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        visible={!isEditing}
      />
      {isSelected && !isEditing && (
        <Transformer
          ref={transformerRef}
          rotateEnabled={true}
          enabledAnchors={['middle-left', 'middle-right']}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 20) {
              return oldBox
            }
            return newBox
          }}
        />
      )}
    </>
  )
}
