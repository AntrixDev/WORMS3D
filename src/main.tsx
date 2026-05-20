import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import MainMenu from './ui/MainMenu'
import PlayersMenu from './ui/PlayersMenu'

type Screen = 'main' | 'players'

interface SavedPlayer {
  username: string
  colorIndex: number
}

function readReplayPlayers(): SavedPlayer[] | null {
  try {
    const raw = sessionStorage.getItem('replayPlayers')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length >= 2) return parsed
  } catch {
  }
  return null
}

function App() {
  const [replay]= useState<SavedPlayer[] | null>(() => readReplayPlayers())
  const [screen, setScreen] = useState<Screen>(replay ? 'players' : 'main')

  useEffect(() => {
    sessionStorage.removeItem('replayPlayers')
  }, [])

  return screen === 'main' ? <MainMenu onPlay={() => setScreen('players')} /> : <PlayersMenu initialPlayers={replay ?? undefined} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
