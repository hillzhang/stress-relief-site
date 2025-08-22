import React, { useEffect, useRef } from 'react'
import '../styles.css'

const CELL = 20
const MAP = [
  '###############',
  '#.............#',
  '#.###.###.###.#',
  '#.............#',
  '#.###.#.#.###.#',
  '#.#.......#.#.#',
  '#.#.###.#.#.#.#',
  '#.............#',
  '###############'
]
const ROWS = MAP.length
const COLS = MAP[0].length

export default function Pacman() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const grid = useRef(MAP.map(r => r.split('')))
  const pac = useRef({ x: 1, y: 1, dir: { x: 0, y: 0 } })
  const ghost = useRef({ x: COLS - 2, y: ROWS - 2, dir: { x: 0, y: 0 } })
  const remaining = useRef(grid.current.flat().filter(c => c === '.').length)

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') pac.current.dir = { x: 0, y: -1 }
      if (e.key === 'ArrowDown') pac.current.dir = { x: 0, y: 1 }
      if (e.key === 'ArrowLeft') pac.current.dir = { x: -1, y: 0 }
      if (e.key === 'ArrowRight') pac.current.dir = { x: 1, y: 0 }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.scale(CELL, CELL)

    function reset() {
      grid.current = MAP.map(r => r.split(''))
      pac.current = { x: 1, y: 1, dir: { x: 0, y: 0 } }
      ghost.current = { x: COLS - 2, y: ROWS - 2, dir: { x: 0, y: 0 } }
      remaining.current = grid.current.flat().filter(c => c === '.').length
    }

    function move(entity: any) {
      const nx = entity.x + entity.dir.x
      const ny = entity.y + entity.dir.y
      if (grid.current[ny][nx] !== '#') {
        entity.x = nx
        entity.y = ny
      }
    }

    function draw() {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, COLS, ROWS)
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const cell = grid.current[y][x]
          if (cell === '#') {
            ctx.fillStyle = '#222'
            ctx.fillRect(x, y, 1, 1)
          } else if (cell === '.') {
            ctx.fillStyle = '#ff0'
            ctx.beginPath()
            ctx.arc(x + 0.5, y + 0.5, 0.1, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }
      ctx.fillStyle = 'yellow'
      ctx.beginPath()
      ctx.arc(pac.current.x + 0.5, pac.current.y + 0.5, 0.45, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'red'
      ctx.beginPath()
      ctx.arc(ghost.current.x + 0.5, ghost.current.y + 0.5, 0.45, 0, Math.PI * 2)
      ctx.fill()
    }

    function tick() {
      move(pac.current)
      const pc = grid.current[pac.current.y][pac.current.x]
      if (pc === '.') {
        grid.current[pac.current.y][pac.current.x] = ' '
        remaining.current--
        if (remaining.current === 0) reset()
      }
      if (Math.random() < 0.3) {
        const dirs = [
          { x: 1, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: 1 },
          { x: 0, y: -1 }
        ]
        const poss = dirs.filter(d => grid.current[ghost.current.y + d.y][ghost.current.x + d.x] !== '#')
        ghost.current.dir = poss[Math.floor(Math.random() * poss.length)]
      }
      move(ghost.current)
      if (pac.current.x === ghost.current.x && pac.current.y === ghost.current.y) reset()
      draw()
    }

    reset()
    draw()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="container">
      <h1>👻 吃豆人</h1>
      <p className="desc">使用方向键躲避幽灵并吃掉豆子。</p>
      <div className="stage" style={{ width: COLS * CELL, height: ROWS * CELL, margin: '0 auto' }}>
        <canvas
          ref={canvasRef}
          width={COLS * CELL}
          height={ROWS * CELL}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <a className="btn ghost" href="/">返回首页</a>
      </div>
    </div>
  )
}

