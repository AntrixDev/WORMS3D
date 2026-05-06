import './MainMenu.css'
import ceilingSlime from './assets/ceilingSlime.png'
import explosion from './assets/explosion.png'
import logo from './assets/logo.png'

interface MainMenuProps {
  onPlay: () => void
}

function MainMenu({ onPlay }: MainMenuProps) {
  return (
    <section id='main-menu'>
      <div className='flexCol'>
        <img src={ceilingSlime} alt="Blue slime" id='ceilSlime' draggable='false'/>
        <img src={explosion} alt="explosion" id='explosion' draggable='false'/>
      </div>
      <div className='flexCol' id='right'>
        <img src={logo} alt="JELLYS 3D" id='logo' draggable='false'/>
        <button className='play-btn' onClick={onPlay}>PLAY</button>
      </div>
    </section>
  )
}

export default MainMenu
