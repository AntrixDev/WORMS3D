import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import MainMenu from './ui/MainMenu'
import PlayerMenu from './ui/PlayersMenu'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlayerMenu />
  </StrictMode>,
)
