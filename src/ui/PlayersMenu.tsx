import { useState } from 'react'
import './PlayersMenu.css'
import Button from './components/button.tsx'
import character from './assets/characterPlaceholder.png'

interface Player {
  username: string
}

function PlayersMenu() {
  const [players, setPlayers] = useState<Player[]>([
    {username: ''},
    {username: ''},
  ])
  
  async function handleGameStart() {
    const { startGame } = await import('../main.ts')
    document.getElementById('root')!.innerHTML = ''
    startGame(players)
  }

  function addPlayer() {
    setPlayers(prev => [...prev, { username: '' }])
  }

  function updateName(index: number, value: string) {
    setPlayers(prev => prev.map((p, i) => i === index ? { ...p, username: value } : p))
  }

  function removePlayer(index: number) {
    setPlayers(prev => prev.filter((_,i)=> i !== index))
  }

  const canStart = players.length >= 2 && players.every(p => p.username.trim() != '');

  const playerLimit = players.length >= 12;

  return (
    <>
    <section id='playerMenuBckg'>
      <section id='playerMenuMain'>
        <h1>PLAYERS MENU</h1>
        <section id='playersWrap'>
            {players.map((player, index) => (
              <div key={index} style={{ display: 'flex', flexDirection: 'column', maxWidth: '10%', minWidth: '15%', minHeight: '10em', alignItems: 'center', gap: '0.5em'}}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '2em',  width: '100%', columnGap: '2em'}}>
                  <label>Player {index + 1}</label>
                  {index >= 2 && (
                    <button id='btnDel' onClick={() => removePlayer(index)}>✗</button>
                  )}
                </div>
                <input type="text" className="usernameInput" id={`player-${index}`} value={player.username} onChange={e => updateName(index, e.target.value)}/>
                <div id='characterPlaceholder'>
                  <p className='characterArrows'>&lt;</p>
                  <img src={character} alt="Slime character" draggable='false'/>
                  <p className='characterArrows'>&gt;</p>
                </div>
              </div>
            ))}
        </section>
        <div id='btnsWrap'>
          <Button text="+PLAYER" action={addPlayer} isDisabled={playerLimit}/>
          <Button text="START" action={handleGameStart} isDisabled={!canStart}/>
        </div>
      </section>
    </section>
    </>
  )
}

export default PlayersMenu
