import { useState, useEffect } from 'react'
import {
  Pen,
  Type,
  StickyNote as StickyNoteIcon,
  Image as ImageIcon,
  Undo2,
  Redo2,
  BoxSelect,
  Settings,
  ChevronLeft,
  Menu,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { ImageUploadModal } from '@/components/upload/ImageUploadModal'
import { useWhiteboardStore } from '@/stores/useWhiteboardStore'
import type { ToolType } from '@/types/whiteboard'
import { cn } from '@/lib/utils'

interface ToolButtonProps {
  tool: ToolType
  icon: React.ReactNode
  label: string
  shortcut?: string
  tooltipSide?: 'left' | 'right' | 'top' | 'bottom'
}

function ToolButton({ tool, icon, label, shortcut, tooltipSide = 'right' }: ToolButtonProps) {
  const { currentTool, setTool } = useWhiteboardStore()
  const isActive = currentTool === tool

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'w-10 h-10 transition-all',
            isActive 
              ? 'bg-blue-600 hover:bg-blue-700 text-white ring-2 ring-blue-400' 
              : 'text-slate-300 hover:bg-slate-700 hover:text-white'
          )}
          onClick={() => {
            console.log('Tool clicked:', tool)
            setTool(tool)
          }}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide} className="flex items-center gap-2">
        <span>{label}</span>
        {shortcut && (
          <kbd className="px-1.5 py-0.5 text-xs bg-slate-700 rounded">
            {shortcut}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

export function Toolbar() {
  const { viewport, undo, redo, history, currentTool, setTool } = useWhiteboardStore()
  const [showSettings, setShowSettings] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [showImageUpload, setShowImageUpload] = useState(false)

  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0
  
  // Debug: log current tool
  console.log('Current tool in toolbar:', currentTool)
  
  // Close plus menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (showPlusMenu) {
        setShowPlusMenu(false)
      }
    }

    if (showPlusMenu) {
      document.addEventListener('click', handleClickOutside)
    }

    return () => {
      document.removeEventListener('click', handleClickOutside)
    }
  }, [showPlusMenu])

  // Collapsed state - show small circle button
  if (isCollapsed) {
    return (
      <TooltipProvider>
        <div className="fixed left-4 top-20 z-50">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => setIsCollapsed(false)}
                className="w-12 h-12 rounded-full bg-slate-800/90 backdrop-blur-sm border border-slate-700 hover:bg-slate-700 shadow-lg p-0"
              >
                <Menu size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Show Toolbar</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <div className="fixed left-4 top-20 z-50">
        <div className="flex flex-col gap-1 bg-slate-800/90 backdrop-blur-sm border border-slate-700 rounded-lg p-2 shadow-lg">
          {/* Drawing Tools */}
          <ToolButton
            tool="pen"
            icon={<Pen size={18} />}
            label="Pen"
            shortcut="P"
            tooltipSide="right"
          />
          <ToolButton
            tool="select"
            icon={<BoxSelect size={18} />}
            label="Select Area"
            shortcut="V"
            tooltipSide="right"
          />
          
          <Separator className="my-1 bg-slate-600" />
          
          {/* Plus Menu */}
          <div className="relative">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'w-10 h-10 transition-all',
                    (currentTool === 'text' || currentTool === 'sticky' || currentTool === 'image')
                      ? 'bg-blue-600 hover:bg-blue-700 text-white ring-2 ring-blue-400'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowPlusMenu(!showPlusMenu)
                  }}
                >
                  <Plus size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Add Content</TooltipContent>
            </Tooltip>
            
            {/* Plus Menu Dropdown */}
            {showPlusMenu && (
              <div 
                className="absolute left-12 top-0 bg-slate-800 border border-slate-700 rounded-lg shadow-lg py-2 w-48 z-[60]"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    setTool('text')
                    setShowPlusMenu(false)
                  }}
                  className={cn(
                    'w-full px-4 py-2 text-left text-white flex items-center gap-2',
                    currentTool === 'text' ? 'bg-blue-600' : 'hover:bg-slate-700'
                  )}
                >
                  <Type size={16} />
                  <span>Text</span>
                  <kbd className="ml-auto text-xs bg-slate-600 px-1.5 py-0.5 rounded">T</kbd>
                </button>
                <button
                  onClick={() => {
                    setTool('sticky')
                    setShowPlusMenu(false)
                  }}
                  className={cn(
                    'w-full px-4 py-2 text-left text-white flex items-center gap-2',
                    currentTool === 'sticky' ? 'bg-blue-600' : 'hover:bg-slate-700'
                  )}
                >
                  <StickyNoteIcon size={16} />
                  <span>Sticky Note</span>
                  <kbd className="ml-auto text-xs bg-slate-600 px-1.5 py-0.5 rounded">S</kbd>
                </button>
                <button
                  onClick={() => {
                    setShowImageUpload(true)
                    setShowPlusMenu(false)
                  }}
                  className={cn(
                    'w-full px-4 py-2 text-left text-white flex items-center gap-2',
                    currentTool === 'image' ? 'bg-blue-600' : 'hover:bg-slate-700'
                  )}
                >
                  <ImageIcon size={16} />
                  <span>Image</span>
                  <kbd className="ml-auto text-xs bg-slate-600 px-1.5 py-0.5 rounded">I</kbd>
                </button>
              </div>
            )}
          </div>
          
          <Separator className="my-1 bg-slate-600" />
          
          {/* History Controls */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-10 h-10"
                onClick={undo}
                disabled={!canUndo}
              >
                <Undo2 size={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <span>Undo</span>
              <kbd className="ml-2 px-1.5 py-0.5 text-xs bg-slate-700 rounded">
                Ctrl+Z
              </kbd>
            </TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-10 h-10"
                onClick={redo}
                disabled={!canRedo}
              >
                <Redo2 size={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <span>Redo</span>
              <kbd className="ml-2 px-1.5 py-0.5 text-xs bg-slate-700 rounded">
                Ctrl+Y
              </kbd>
            </TooltipContent>
          </Tooltip>
          
          <Separator className="my-1 bg-slate-600" />
          
          {/* Settings Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-10 h-10"
                onClick={() => setShowSettings(true)}
              >
                <Settings size={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Settings</TooltipContent>
          </Tooltip>
          
          <Separator className="my-1 bg-slate-600" />
          
          {/* Collapse Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-10 h-10"
                onClick={() => setIsCollapsed(true)}
              >
                <ChevronLeft size={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Hide Toolbar</TooltipContent>
          </Tooltip>
          
          {/* Zoom Percentage Display */}
          <div className="text-xs text-center text-slate-400 mt-1">
            {Math.round(viewport.scale * 100)}%
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />
      
      {/* Image Upload Modal */}
      <ImageUploadModal isOpen={showImageUpload} onClose={() => setShowImageUpload(false)} />
    </TooltipProvider>
  )
}
