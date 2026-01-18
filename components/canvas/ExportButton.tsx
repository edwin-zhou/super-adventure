'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWhiteboardStore } from '@/stores/useWhiteboardStore'

interface ExportButtonProps {
  stageRef: React.RefObject<any>
  isVideoPlayerOpen?: boolean
}

export function ExportButton({ stageRef, isVideoPlayerOpen }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false)
  const elements = useWhiteboardStore((state) => state.elements)

  const handleExport = async () => {
    if (!stageRef.current) return

    setIsExporting(true)

    try {
      const stage = stageRef.current
      
      // Get the stage as data URL
      const dataURL = stage.toDataURL({
        pixelRatio: 2, // Higher quality
        mimeType: 'image/png',
      })

      // Create a temporary link and download
      const link = document.createElement('a')
      link.download = `whiteboard-notes-${new Date().toISOString().slice(0, 10)}.png`
      link.href = dataURL
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // For PDF export, we can use a library like jsPDF or just download as PNG for now
      // If you want PDF, we can add jsPDF library
    } catch (error) {
      console.error('Error exporting:', error)
      alert('Failed to export. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Button
      onClick={handleExport}
      disabled={isExporting || elements.length === 0}
      className={`absolute ${isVideoPlayerOpen ? 'top-16' : 'top-4'} right-4 z-50 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 shadow-lg`}
      title="Export as PNG"
    >
      {isExporting ? (
        <>
          <Loader2 size={18} className="mr-2 animate-spin" />
          Exporting...
        </>
      ) : (
        <>
          <Download size={18} className="mr-2" />
          Export
        </>
      )}
    </Button>
  )
}
