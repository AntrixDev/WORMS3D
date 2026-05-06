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

  return (
    <>
    <section id='playerMenuBckg'>
      <section id='playerMenuMain'>
        <h1>PLAYERS MENU</h1>
        <section id='playersWrap'>
            {players.map((player, index) => (
              <div key={player.id} style={{ display: 'flex', flexDirection: 'column', maxWidth: '10%', minHeight: '10em', maxHeight: '10%', alignItems: 'center', gap: '1em', marginBottom: '1.5em'}}>
                <label>Player {index + 1}</label>
                <input type="text" value={player.name} id={`player-${player.id}`} onChange={e => updateName(player.id, e.target.value)}/>
                <div id='characterPlaceholder'>
                  <img src={character} alt="Slime character" draggable='false'/>
                </div>
              </div>
            ))}
        </section>
        <div id='btnsWrap'>
          <Button text="+PLAYER" action={addPlayer}/>
          <Button text="START" action={handleGameStart}/>
        </div>
      </section>
    </section>
    </>
  )
}

export default PlayersMenu
