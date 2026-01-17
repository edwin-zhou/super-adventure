import { useState } from 'react'
import { Pipette, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const BACKGROUND_COLORS = [
  { name: 'Dark Slate', value: '#0f172a' },
  { name: 'Midnight', value: '#1e293b' },
  { name: 'Dark Gray', value: '#1f2937' },
  { name: 'Charcoal', value: '#18181b' },
  { name: 'Dark Blue', value: '#1e3a8a' },
  { name: 'Dark Purple', value: '#581c87' },
  { name: 'Dark Indigo', value: '#312e81' },
  { name: 'Dark Green', value: '#14532d' },
  { name: 'Dark Teal', value: '#134e4a' },
  { name: 'Dark Cyan', value: '#164e63' },
  { name: 'Dark Brown', value: '#3f2f23' },
  { name: 'Black', value: '#000000' },
  { name: 'Slate Gray', value: '#334155' },
  { name: 'Cool Gray', value: '#374151' },
  { name: 'Warm Gray', value: '#3f3f46' },
  { name: 'Navy', value: '#1e40af' },
]

export function BackgroundSelector() {
  const [showColorPanel, setShowColorPanel] = useState(false)
  const [selectedColor, setSelectedColor] = useState(BACKGROUND_COLORS[0]) // Default to dark slate
  const [customColor, setCustomColor] = useState('#0f172a')

  const applyBackground = (color: string) => {
    // Update CSS variable
    document.documentElement.style.setProperty('--bg-primary', color)
    
    // Update body and canvas backgrounds
    document.body.style.backgroundColor = color
    const whiteboardCanvas = document.querySelector('.whiteboard-canvas') as HTMLElement
    if (whiteboardCanvas) {
      whiteboardCanvas.style.backgroundColor = color
    }
    
    // Update root element
    const root = document.getElementById('root')
    if (root) {
      root.style.backgroundColor = color
    }
  }

  const handleColorSelect = (color: typeof BACKGROUND_COLORS[0]) => {
    setSelectedColor(color)
    setCustomColor(color.value)
    applyBackground(color.value)
    setShowColorPanel(false)
  }

  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value
    setCustomColor(color)
    applyBackground(color)
    setSelectedColor({ name: 'Custom', value: color })
  }

  return (
    <TooltipProvider>
      <div className="relative">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-10 h-10"
              onClick={() => setShowColorPanel(!showColorPanel)}
            >
              <Pipette size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Background Color</TooltipContent>
        </Tooltip>

        {/* Color Panel */}
        {showColorPanel && (
          <div className="absolute bottom-0 left-12 bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-lg p-4 shadow-lg w-80 z-[60] max-h-[500px] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <Label className="text-sm text-white font-semibold">Choose Background Color</Label>
              <button
                onClick={() => setShowColorPanel(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3 mb-4">
              {BACKGROUND_COLORS.map((color) => (
                <button
                  key={color.name}
                  onClick={() => handleColorSelect(color)}
                  className={cn(
                    'relative group rounded-lg p-4 transition-all hover:scale-110 border-2',
                    selectedColor.value === color.value ? 'border-white' : 'border-slate-600'
                  )}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                >
                  {selectedColor.value === color.value && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                  )}
                  <div className="opacity-0 group-hover:opacity-100 absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-white whitespace-nowrap pointer-events-none">
                    {color.name}
                  </div>
                </button>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-600">
              <Label className="text-xs text-slate-400 mb-2 block">Custom Color</Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={customColor}
                  onChange={handleCustomColorChange}
                  className="w-12 h-12 rounded cursor-pointer border-2 border-slate-600"
                />
                <div className="flex-1">
                  <input
                    type="text"
                    value={customColor}
                    onChange={(e) => handleCustomColorChange(e as any)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-white text-sm"
                    placeholder="#000000"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-600">
              <Label className="text-xs text-slate-400">Current: {selectedColor.name}</Label>
              <div 
                className="mt-2 h-8 rounded flex items-center justify-center text-white text-sm font-medium border border-slate-600"
                style={{ backgroundColor: selectedColor.value }}
              >
                Preview
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
