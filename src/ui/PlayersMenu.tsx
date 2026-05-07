import { useState } from 'react'
import './PlayersMenu.css'
import Button from './components/button.tsx'
import character from './assets/characterPlaceholder.png'

interface Player {
  id: number
  name: string
}

let nextId = 3

async function handleGameStart() {
  document.getElementById('root')!.innerHTML = ''
  const { startGame } = await import('../main.ts')
  startGame()
}

function PlayersMenu() {
  const [players, setPlayers] = useState<Player[]>([
    {id: 1, name: ''},
    {id: 2, name: ''},
  ])

  function addPlayer() {
    setPlayers(prev => [...prev, { id: nextId++, name: '' }])
  }

  function updateName(id: number, value: string) {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, name: value } : p))
  }

  function removePlayer(id: number) {
    setPlayers(prev => prev.filter(p => p.id !== id))
  }

  const canStart = players.length >= 2 && players.every(p => p.name.trim() != '');

  const playerLimit = players.length >= 12;

  return (
    <>
    <section id='playerMenuBckg'>
      <section id='playerMenuMain'>
        <h1>PLAYERS MENU</h1>
        <section id='playersWrap'>
            {players.map((player, index) => (
              <div key={player.id} style={{ display: 'flex', flexDirection: 'column', maxWidth: '10%', minWidth: '15%', minHeight: '10em', alignItems: 'center', gap: '0.5em'}}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', gap: '2em'}}>
                  <label>Player {index + 1}</label>
                  {index >= 2 && (
                    <button id='btnDel' onClick={() => removePlayer(player.id)}>✗</button>
                  )}
                </div>
                <input type="text" className="usernameInput" id={`player-${player.id}`} value={player.name} onChange={e => updateName(player.id, e.target.value)}/>
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
