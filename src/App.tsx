import { useState } from 'react'
import { StoryCanvas } from './components/StoryCanvas'
import './App.css'

function App() {
  const [restartKey, setRestartKey] = useState(0)
  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Connect <span>the Story</span></h1>
      </header>
      <StoryCanvas key={restartKey} onRestart={() => setRestartKey((k) => k + 1)} />
    </div>
  )
}

export default App
