async function handleGameStart() {
  document.getElementById('root')!.innerHTML = ''
  const { startGame } = await import('../main.ts')
  startGame()
}

function PlayersMenu() {

  return (
    <>
        <h3>PLAYERS MENU</h3>
        <p>Player adding, nicknames, colors</p>
        <button id="startBtn" onClick={handleGameStart}>START</button>
    </>
  )
}

export default PlayersMenu
