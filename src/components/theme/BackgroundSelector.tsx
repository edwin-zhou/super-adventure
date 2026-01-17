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

const PAGE_COLORS = [
  { name: 'White', value: '#ffffff' },
  { name: 'Cream', value: '#fef3c7' },
  { name: 'Light Yellow', value: '#fef9c3' },
  { name: 'Light Blue', value: '#dbeafe' },
  { name: 'Light Green', value: '#dcfce7' },
  { name: 'Light Pink', value: '#fce7f3' },
  { name: 'Light Purple', value: '#f3e8ff' },
  { name: 'Light Gray', value: '#f3f4f6' },
  { name: 'Beige', value: '#fef2f2' },
  { name: 'Mint', value: '#d1fae5' },
  { name: 'Sky', value: '#e0f2fe' },
  { name: 'Lavender', value: '#ede9fe' },
  { name: 'Peach', value: '#ffedd5' },
  { name: 'Rose', value: '#ffe4e6' },
  { name: 'Ivory', value: '#fffbeb' },
  { name: 'Slate', value: '#e2e8f0' },
]

export function BackgroundSelector() {
  const [showColorPanel, setShowColorPanel] = useState(false)
  const [selectedColor, setSelectedColor] = useState(PAGE_COLORS[0]) // Default to white
  const [customColor, setCustomColor] = useState('#ffffff')

  const applyPageColor = (color: string) => {
    // Update CSS variable for page color
    document.documentElement.style.setProperty('--page-color', color)
  }

  const handleColorSelect = (color: typeof PAGE_COLORS[0]) => {
    setSelectedColor(color)
    setCustomColor(color.value)
    applyPageColor(color.value)
    setShowColorPanel(false)
  }

  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value
    setCustomColor(color)
    applyPageColor(color)
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
          <TooltipContent side="right">Theme Color</TooltipContent>
        </Tooltip>

        {/* Color Panel */}
        {showColorPanel && (
          <div className="absolute bottom-0 left-12 bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-lg p-4 shadow-lg w-80 z-[60] max-h-[500px] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <Label className="text-sm text-white font-semibold">Choose Page Theme Color</Label>
              <button
                onClick={() => setShowColorPanel(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3 mb-4">
              {PAGE_COLORS.map((color) => (
                <button
                  key={color.name}
                  onClick={() => handleColorSelect(color)}
                  className={cn(
                    'relative group rounded-lg p-4 transition-all hover:scale-110 border-2',
                    selectedColor.value === color.value ? 'border-blue-400 shadow-lg' : 'border-slate-500'
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
