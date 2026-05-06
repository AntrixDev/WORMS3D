import './MainMenu.css'

interface MainMenuProps {
  onPlay: () => void
}

function MainMenu({ onPlay }: MainMenuProps) {
  return (
    <div className="main-menu">
      <button className="play-btn" onClick={onPlay}>PLAY</button>
    </div>
  )
}

export default MainMenu
