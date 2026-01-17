import { useWhiteboardStore } from '@/stores/useWhiteboardStore'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#000000', // black
  '#ffffff', // white
  '#64748b', // slate
  '#71717a', // zinc
]

const STICKY_COLORS = [
  '#fef08a', // yellow
  '#bfdbfe', // blue
  '#bbf7d0', // green
  '#fecaca', // red
  '#e9d5ff', // purple
  '#fed7aa', // orange
]

export function PropertiesSidebar() {
  const {
    selection,
    elements,
    defaultStyles,
    updateDefaultStyles,
    updateSelectedElementsStyle,
  } = useWhiteboardStore()

  const selectedElements = elements.filter((el) =>
    selection.selectedIds.includes(el.id)
  )
  const hasSelection = selectedElements.length > 0

  // Get common properties from selected elements
  const getCommonProperty = (prop: string) => {
    if (!hasSelection) return null
    const values = selectedElements.map((el: any) => el[prop])
    const allSame = values.every((v) => v === values[0])
    return allSame ? values[0] : null
  }

  const currentFill = hasSelection ? getCommonProperty('fill') : defaultStyles.fill
  const currentStroke = hasSelection ? getCommonProperty('stroke') : defaultStyles.stroke
  const currentStrokeWidth = hasSelection
    ? getCommonProperty('strokeWidth')
    : defaultStyles.strokeWidth
  const currentFontSize = hasSelection
    ? getCommonProperty('fontSize')
    : defaultStyles.fontSize

  const handleStyleChange = (style: any) => {
    if (hasSelection) {
      updateSelectedElementsStyle(style)
    } else {
      updateDefaultStyles(style)
    }
  }

  return (
    <div className="fixed right-4 top-1/2 -translate-y-1/2 z-50 w-64">
      <div className="bg-slate-800/90 backdrop-blur-sm border border-slate-700 rounded-lg p-4 shadow-lg space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">
            {hasSelection
              ? `Properties (${selectedElements.length} selected)`
              : 'Default Styles'}
          </h3>
        </div>

        <Separator className="bg-slate-600" />

        {/* Fill Color */}
        <div className="space-y-2">
          <Label className="text-xs text-slate-300">Fill Color</Label>
          <div className="grid grid-cols-5 gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                className="w-8 h-8 rounded border-2 border-slate-600 hover:border-slate-400 transition-colors"
                style={{ backgroundColor: color }}
                onClick={() => handleStyleChange({ fill: color })}
                title={color}
              />
            ))}
          </div>
          <Input
            type="color"
            value={currentFill || defaultStyles.fill}
            onChange={(e) => handleStyleChange({ fill: e.target.value })}
            className="w-full h-8"
          />
        </div>

        <Separator className="bg-slate-600" />

        {/* Stroke Color */}
        <div className="space-y-2">
          <Label className="text-xs text-slate-300">Stroke Color</Label>
          <div className="grid grid-cols-5 gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                className="w-8 h-8 rounded border-2 border-slate-600 hover:border-slate-400 transition-colors"
                style={{ backgroundColor: color }}
                onClick={() => handleStyleChange({ stroke: color })}
                title={color}
              />
            ))}
          </div>
          <Input
            type="color"
            value={currentStroke || defaultStyles.stroke}
            onChange={(e) => handleStyleChange({ stroke: e.target.value })}
            className="w-full h-8"
          />
        </div>

        <Separator className="bg-slate-600" />

        {/* Stroke Width */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className="text-xs text-slate-300">Stroke Width</Label>
            <span className="text-xs text-slate-400">
              {currentStrokeWidth || defaultStyles.strokeWidth}px
            </span>
          </div>
          <Slider
            value={[currentStrokeWidth || defaultStyles.strokeWidth]}
            onValueChange={([value]) =>
              handleStyleChange({ strokeWidth: value })
            }
            min={1}
            max={20}
            step={1}
            className="w-full"
          />
        </div>

        <Separator className="bg-slate-600" />

        {/* Font Size */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className="text-xs text-slate-300">Font Size</Label>
            <span className="text-xs text-slate-400">
              {currentFontSize || defaultStyles.fontSize}px
            </span>
          </div>
          <Slider
            value={[currentFontSize || defaultStyles.fontSize]}
            onValueChange={([value]) => handleStyleChange({ fontSize: value })}
            min={8}
            max={72}
            step={1}
            className="w-full"
          />
        </div>

        {/* Sticky Note Colors */}
        {(hasSelection
          ? selectedElements.some((el) => el.type === 'sticky')
          : true) && (
          <>
            <Separator className="bg-slate-600" />
            <div className="space-y-2">
              <Label className="text-xs text-slate-300">Sticky Note Color</Label>
              <div className="grid grid-cols-3 gap-2">
                {STICKY_COLORS.map((color) => (
                  <button
                    key={color}
                    className="w-full h-10 rounded border-2 border-slate-600 hover:border-slate-400 transition-colors"
                    style={{ backgroundColor: color }}
                    onClick={() =>
                      handleStyleChange({ backgroundColor: color })
                    }
                    title={color}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
