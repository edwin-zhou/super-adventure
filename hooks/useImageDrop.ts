import { useEffect } from 'react'
import { useWhiteboardStore } from '@/stores/useWhiteboardStore'
import type { ImageElement } from '@/types/whiteboard'

export function useImageDrop() {
  const { addElement, viewport } = useWhiteboardStore()

  useEffect(() => {
    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (!e.dataTransfer) return

      const files = Array.from(e.dataTransfer.files)
      const imageFiles = files.filter((file) => file.type.startsWith('image/'))

      imageFiles.forEach((file, index) => {
        const reader = new FileReader()
        reader.onload = (event) => {
          if (!event.target || !event.target.result) return

          const result = event.target.result as string
          const img = new Image()
          img.src = result
          img.onload = () => {
            // Transform drop position to account for viewport
            const x = (e.clientX - viewport.x) / viewport.scale + index * 20
            const y = (e.clientY - viewport.y) / viewport.scale + index * 20

            // Calculate dimensions to fit within reasonable bounds
            const maxWidth = 400
            const maxHeight = 400
            let width = img.width
            let height = img.height

            if (width > maxWidth || height > maxHeight) {
              const ratio = Math.min(maxWidth / width, maxHeight / height)
              width *= ratio
              height *= ratio
            }

            const imageElement: ImageElement = {
              id: `image-${Date.now()}-${Math.random()}`,
              type: 'image',
              x,
              y,
              src: result,
              width,
              height,
              draggable: true,
              visible: true,
            }

            addElement(imageElement)
          }
        }
        reader.readAsDataURL(file)
      })
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }

    window.addEventListener('drop', handleDrop)
    window.addEventListener('dragover', handleDragOver)

    return () => {
      window.removeEventListener('drop', handleDrop)
      window.removeEventListener('dragover', handleDragOver)
    }
  }, [addElement, viewport])
}
