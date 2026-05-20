import { useState } from 'react'
import './playersMenu.css'
import Button from './components/button.tsx'
import { slimeColors, defaultColorIndex, colorAt } from '../colors'

interface Player {
  username: string
  colorIndex: number
}

function PlayersMenu({ initialPlayers }: { initialPlayers?: Player[] }) {
  const [players, setPlayers] = useState<Player[]>(
    initialPlayers && initialPlayers.length >= 2
      ? initialPlayers
      : [
          { username: '', colorIndex: defaultColorIndex },
          { username: '', colorIndex: defaultColorIndex },
        ],
  )

  async function handleGameStart() {
    const { startGame } = await import('../main.ts')
    document.getElementById('root')!.innerHTML = ''
    startGame(players)
  }

  function addPlayer() {
    setPlayers(prev => [...prev, { username: '', colorIndex: defaultColorIndex }])
  }

  function updateName(index: number, value: string) {
    if(value.length >30 ) value = value.slice(0, 30);
    setPlayers(prev => prev.map((p, i) => i === index ? { ...p, username: value } : p))
  }

  function cycleColor(index: number, dir: number) {
    setPlayers(prev => prev.map((p, i) =>
      i === index
        ? { ...p, colorIndex: (p.colorIndex + dir + slimeColors.length)%slimeColors.length }
        : p,
    ))
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
            {players.map((player, index) => {
              const color = colorAt(player.colorIndex)
              return (
              <div key={index} style={{ display: 'flex', flexDirection: 'column', maxWidth: '10%', minWidth: '15%', minHeight: '10em', alignItems: 'center', gap: '0.5em'}}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '2em',  width: '100%', columnGap: '2em'}}>
                  <label>Player {index + 1}</label>
                  {index >= 2 && (
                    <button id='btnDel' onClick={() => removePlayer(index)}>✗</button>
                  )}
                </div>
                <input type="text" className="usernameInput" id={`player-${index}`} value={player.username} onChange={e => updateName(index, e.target.value)} maxLength={30}/>
                <div id='characterPlaceholder'>
                  <p className='characterArrows' onClick={() => cycleColor(index, -1)}>&lt;</p>
                  <img
                    src={`/src/ui/assets/${color.name}Slime.png`}
                    alt={color.name}
                    title={color.name}
                    draggable='false'
                    style={{ minWidth: '4em', minHeight: '4em', color: color.hex, fontWeight: 800 }}
                  />
                  <p className='characterArrows' onClick={() => cycleColor(index, 1)}>&gt;</p>
                </div>
              </div>
              )
            })}
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
