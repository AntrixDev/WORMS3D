import { useState } from 'react'

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
      <h3>PLAYERS MENU</h3>

      {players.map((player, index) => (
        <div key={player.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <label htmlFor={`player-${player.id}`}>Player {index + 1}</label>
          <input
            id={`player-${player.id}`}
            type="text"
            value={player.name}
            onChange={e => updateName(player.id, e.target.value)}
          />
        </div>
      ))}

      <button onClick={addPlayer}>+ Add Player</button>

      <button
        id="startBtn"
        onClick={() => handleGameStart()}
      >
        START
      </button>
    </>
  )
}

export default PlayersMenu
