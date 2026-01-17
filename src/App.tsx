import { WhiteboardCanvas } from './components/canvas/WhiteboardCanvas'
import { Toolbar } from './components/toolbar/Toolbar'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useImageDrop } from './hooks/useImageDrop'

function App() {
  // Initialize keyboard shortcuts and image drop handling
  useKeyboardShortcuts()
  useImageDrop()

  return (
    <div className="w-full h-full bg-slate-950 text-white relative overflow-hidden">
      <WhiteboardCanvas />
      <Toolbar />
    </div>
  )
}

export default App
