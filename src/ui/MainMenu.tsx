import './mainMenu.css'
import ceilingSlime from './assets/ceilingSlime.png'
import explosion from './assets/explosion.png'
import logo from './assets/logo.png'
import Button from './components/button'

interface MainMenuProps {
  onPlay: () => void
}

function MainMenu({ onPlay }: MainMenuProps) {
  return (
    <section id='mainMenu'>
      <div className='flexCol'>
        <img src={ceilingSlime} alt="Blue slime" id='ceilSlime' draggable='false'/>
        <img src={explosion} alt="explosion" id='explosion' draggable='false'/>
      </div>
      <div className='flexCol' id='right'>
        <img src={logo} alt="JELLYS 3D" id='logo' draggable='false'/>
        <Button text="PLAY" action={onPlay}/>
      </div>
    </section>
  )
}

export default MainMenu
