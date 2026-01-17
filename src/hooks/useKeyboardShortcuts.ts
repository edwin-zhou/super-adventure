import { useEffect } from 'react'
import { useWhiteboardStore } from '@/stores/useWhiteboardStore'

export function useKeyboardShortcuts() {
  const {
    setTool,
    deleteSelectedElements,
    undo,
    redo,
    selectAll,
    selection,
  } = useWhiteboardStore()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in an input/textarea
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      // Tool shortcuts
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'v':
            setTool('select')
            e.preventDefault()
            break
          case 'h':
            setTool('pan')
            e.preventDefault()
            break
          case 'r':
            setTool('rectangle')
            e.preventDefault()
            break
          case 'c':
            setTool('circle')
            e.preventDefault()
            break
          case 'l':
            setTool('line')
            e.preventDefault()
            break
          case 'p':
            setTool('pen')
            e.preventDefault()
            break
          case 't':
            setTool('text')
            e.preventDefault()
            break
          case 's':
            setTool('sticky')
            e.preventDefault()
            break
          case 'i':
            setTool('image')
            e.preventDefault()
            break
          case 'delete':
          case 'backspace':
            if (selection.selectedIds.length > 0) {
              deleteSelectedElements()
              e.preventDefault()
            }
            break
          case 'escape':
            // Clear selection or reset tool handled by canvas
            break
        }
      }

      // Ctrl/Cmd shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'z':
            if (e.shiftKey) {
              redo()
            } else {
              undo()
            }
            e.preventDefault()
            break
          case 'y':
            redo()
            e.preventDefault()
            break
          case 'a':
            selectAll()
            e.preventDefault()
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setTool, deleteSelectedElements, undo, redo, selectAll, selection])
}
