import { useState } from 'react'
import { X, Upload, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWhiteboardStore } from '@/stores/useWhiteboardStore'
import type { ImageElement } from '@/types/whiteboard'
import { cn } from '@/lib/utils'

interface ImageUploadModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ImageUploadModal({ isOpen, onClose }: ImageUploadModalProps) {
  const [dragActive, setDragActive] = useState(false)
  const { addElement, viewport } = useWhiteboardStore()

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files))
    }
  }

  const handleFiles = (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'))
    
    imageFiles.forEach((file, index) => {
      const reader = new FileReader()
      reader.onload = (event) => {
        if (!event.target || !event.target.result) return

        const result = event.target.result as string
        const img = new Image()
        img.src = result
        img.onload = () => {
          // Calculate center position on the visible canvas
          const centerX = (window.innerWidth / 2 - viewport.x) / viewport.scale + index * 50
          const centerY = (window.innerHeight / 2 - viewport.y) / viewport.scale + index * 50

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
            x: centerX - width / 2,
            y: centerY - height / 2,
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
    
    onClose()
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files))
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]"
        onClick={onClose}
      />
      
      {/* Upload Modal */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl w-[450px] z-[101]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">Upload Images</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-12 text-center transition-colors',
              dragActive
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-slate-600 bg-slate-900/50'
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <ImageIcon className="mx-auto mb-4 text-slate-400" size={48} />
            <p className="text-white mb-2 font-medium">Drop your images here</p>
            <p className="text-sm text-slate-400 mb-6">or click to browse</p>
            
            <input
              type="file"
              id="image-upload-input"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileInput}
            />
            
            <Button
              onClick={() => document.getElementById('image-upload-input')?.click()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Upload size={18} className="mr-2" />
              Browse Images
            </Button>
          </div>
          
          <p className="text-xs text-slate-400 mt-4 text-center">
            Supports: JPG, PNG, GIF, WebP, SVG
          </p>
        </div>
      </div>
    </>
  )
}
