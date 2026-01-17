import {
  Pen,
  Type,
  StickyNote as StickyNoteIcon,
  Image as ImageIcon,
  Hand,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  BoxSelect,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { BackgroundSelector } from '@/components/theme/BackgroundSelector'
import { useWhiteboardStore } from '@/stores/useWhiteboardStore'
import type { ToolType } from '@/types/whiteboard'
import { cn } from '@/lib/utils'

interface ToolButtonProps {
  tool: ToolType
  icon: React.ReactNode
  label: string
  shortcut?: string
}

function ToolButton({ tool, icon, label, shortcut }: ToolButtonProps) {
  const { currentTool, setTool } = useWhiteboardStore()
  const isActive = currentTool === tool

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={isActive ? 'default' : 'ghost'}
          size="icon"
          className={cn(
            'w-10 h-10',
            isActive && 'bg-theme-primary bg-theme-primary-hover'
          )}
          onClick={() => setTool(tool)}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-2">
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
  const { viewport, setViewport, undo, redo, history } = useWhiteboardStore()

  const handleZoomIn = () => {
    const newScale = Math.min(5, viewport.scale * 1.2)
    setViewport({ scale: newScale })
  }

  const handleZoomOut = () => {
    const newScale = Math.max(0.1, viewport.scale / 1.2)
    setViewport({ scale: newScale })
  }

  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0

  return (
    <TooltipProvider>
      <div className="fixed left-4 top-20 z-50">
        <div className="flex flex-col gap-1 bg-slate-800/90 backdrop-blur-sm border border-slate-700 rounded-lg p-2 shadow-lg">
          {/* Selection & Drawing Tools */}
          <ToolButton
            tool="pan"
            icon={<Hand size={18} />}
            label="Pan"
            shortcut="H"
          />
          
          <Separator className="my-1 bg-slate-600" />
          
          {/* Shape Tools */}
          <ToolButton
            tool="pen"
            icon={<Pen size={18} />}
            label="Pen"
            shortcut="P"
          />
          <ToolButton
            tool="select"
            icon={<BoxSelect size={18} />}
            label="Select Area"
            shortcut="V"
          />
          
          <Separator className="my-1 bg-slate-600" />
          
          {/* Content Tools */}
          <ToolButton
            tool="text"
            icon={<Type size={18} />}
            label="Text"
            shortcut="T"
          />
          <ToolButton
            tool="sticky"
            icon={<StickyNoteIcon size={18} />}
            label="Sticky Note"
            shortcut="S"
          />
          <ToolButton
            tool="image"
            icon={<ImageIcon size={18} />}
            label="Image"
            shortcut="I"
          />
          
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
          
          {/* Zoom Controls */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-10 h-10"
                onClick={handleZoomIn}
              >
                <ZoomIn size={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Zoom In</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-10 h-10"
                onClick={handleZoomOut}
              >
                <ZoomOut size={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Zoom Out</TooltipContent>
          </Tooltip>
          
          <Separator className="my-1 bg-slate-600" />
          
          {/* Background Color Selector */}
          <BackgroundSelector />
          
          {/* Zoom Percentage Display */}
          <div className="text-xs text-center text-slate-400 mt-1">
            {Math.round(viewport.scale * 100)}%
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
