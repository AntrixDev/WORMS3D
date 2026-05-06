import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import MainMenu from './ui/MainMenu'
import PlayersMenu from './ui/PlayersMenu'

type Screen = 'main' | 'players'

function App() {
  const [screen, setScreen] = useState<Screen>('main')

  return screen==='main' ? <MainMenu onPlay={() => setScreen('players')} /> : <PlayersMenu/>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
