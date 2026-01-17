import { WhiteboardCanvas } from './components/canvas/WhiteboardCanvas'
import { Toolbar } from './components/toolbar/Toolbar'
import { TopToolbar } from './components/toolbar/TopToolbar'
import { ChatBot } from './components/chat/ChatBot'
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
      <TopToolbar />
      <ChatBot />
    </div>
  )
}


export default App
