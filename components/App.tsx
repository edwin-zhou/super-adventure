'use client'

import { useState, useRef, useCallback } from 'react'
import { WhiteboardCanvas } from './canvas/WhiteboardCanvas'
import { Toolbar } from './toolbar/Toolbar'
import { TopToolbar } from './toolbar/TopToolbar'
import { ChatBot } from './chat/ChatBot'
import { VideoPlayer } from './video/VideoPlayer'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useImageDrop } from '@/hooks/useImageDrop'
import { useWhiteboardStore } from '@/stores/useWhiteboardStore'
import { GripVertical } from 'lucide-react'
import { Button } from './ui/button'

function App() {
  // Initialize keyboard shortcuts and image drop handling
  useKeyboardShortcuts()
  useImageDrop()
  
  const isVideoPlayerOpen = useWhiteboardStore((state) => state.isVideoPlayerOpen)
  const setVideoPlayerOpen = useWhiteboardStore((state) => state.setVideoPlayerOpen)
  const resetViewport = useWhiteboardStore((state) => state.resetViewport)
  const [isSwapped, setIsSwapped] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  
  // Ref to access WhiteboardCanvas functions
  const whiteboardRef = useRef<{ addImageToPage: (imageUrl: string, pageNumber: number, replace?: boolean, timestamps?: number[], generatedImageId?: string) => void }>(null)

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnd = () => {
    setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    setIsSwapped(!isSwapped)
  }

  // Callback for ChatBot to add images to whiteboard pages
  const handleAddImageToPage = useCallback((imageUrl: string, pageNumber: number, replace?: boolean, timestamps?: number[], generatedImageId?: string) => {
    whiteboardRef.current?.addImageToPage(imageUrl, pageNumber, replace, timestamps, generatedImageId)
  }, [])

  const videoPlayerSection = (
    <div className={`w-1/2 h-full relative ${isVideoPlayerOpen ? '' : 'hidden'}`}>
      <VideoPlayer 
        isOpen={isVideoPlayerOpen} 
        onClose={() => {
          setVideoPlayerOpen(false)
          resetViewport()
        }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        isDragging={isDragging}
      />
    </div>
  )

  const noteSection = (
    <div 
      className={`${isVideoPlayerOpen ? 'w-1/2' : 'w-full'} h-full relative transition-all duration-300`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Note Section Header */}
      {isVideoPlayerOpen && (
        <div 
          className={`absolute top-0 left-0 right-0 z-50 px-4 py-3 bg-slate-800 border-b border-slate-700 cursor-move select-none hover:bg-slate-700 transition-colors ${isDragging ? 'opacity-50 bg-slate-700' : ''}`}
          draggable
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex items-center gap-2">
            <GripVertical size={16} className="text-slate-500" />
            <h3 className="text-sm font-semibold text-white">Note Section</h3>
          </div>
        </div>
      )}

        {/* Whiteboard Canvas */}
        <div className={`w-full h-full ${isVideoPlayerOpen ? 'pt-12' : ''}`}>
          <WhiteboardCanvas ref={whiteboardRef} isVideoPlayerOpen={isVideoPlayerOpen} />
        </div>

      <Toolbar />
      <TopToolbar />
      <ChatBot onAddImageToPage={handleAddImageToPage} />
    </div>
  )

  return (
    <div className="w-full h-full bg-slate-950 text-white relative overflow-hidden flex">
      {/* Render sections based on swap state - always keep video player mounted */}
      {isSwapped ? (
        <>
          {noteSection}
          {videoPlayerSection}
        </>
      ) : (
        <>
          {videoPlayerSection}
          {noteSection}
        </>
      )}

    </div>
  )
}

export default App
