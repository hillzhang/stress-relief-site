import React, { useEffect, useRef } from 'react'
import '../styles.css'

const COLS = 10
const ROWS = 20
const SIZE = 20

const SHAPES = [
  [[1, 1, 1, 1]],
  [[1, 1], [1, 1]],
  [[0, 1, 0], [1, 1, 1]],
  [[1, 0, 0], [1, 1, 1]],
  [[0, 0, 1], [1, 1, 1]],
  [[1, 1, 0], [0, 1, 1]],
  [[0, 1, 1], [1, 1, 0]],
]

const COLORS = ['#0ff', '#ff0', '#f0f', '#f80', '#08f', '#0f0', '#f00']

interface Piece { shape: number[][]; x: number; y: number; color: string }

function randomPiece(): Piece {
  const idx = Math.floor(Math.random() * SHAPES.length)
  return { shape: SHAPES[idx], x: 3, y: 0, color: COLORS[idx] }
}

function rotate(shape: number[][]): number[][] {
  const res = shape[0].map((_, i) => shape.map(row => row[i]).reverse())
  return res
}

export default function Tetris() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const board = useRef<number[][]>(Array.from({ length: ROWS }, () => Array(COLS).fill(0)))
  const current = useRef<Piece>(randomPiece())

  useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.scale(SIZE, SIZE)

    function drawCell(x: number, y: number, color: string) {
      ctx.fillStyle = color
      ctx.fillRect(x, y, 1, 1)
      ctx.strokeStyle = '#111'
      ctx.strokeRect(x, y, 1, 1)
    }

    function merge() {
      current.current.shape.forEach((row, r) => row.forEach((v, c) => {
        if (v) board.current[current.current.y + r][current.current.x + c] = COLORS.indexOf(current.current.color) + 1
      }))
    }

    function collide(px: number, py: number, shape: number[][]): boolean {
      return shape.some((row, r) => row.some((v, c) => v && (
        px + c < 0 || px + c >= COLS || py + r >= ROWS || board.current[py + r][px + c]
      )))
    }

    function clearLines() {
      board.current = board.current.filter(row => row.some(v => !v))
      while (board.current.length < ROWS) board.current.unshift(Array(COLS).fill(0))
    }

    function draw() {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, COLS, ROWS)
      board.current.forEach((row, r) => row.forEach((v, c) => {
        if (v) drawCell(c, r, COLORS[v - 1])
      }))
      current.current.shape.forEach((row, r) => row.forEach((v, c) => {
        if (v) drawCell(current.current.x + c, current.current.y + r, current.current.color)
      }))
    }

    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && !collide(current.current.x - 1, current.current.y, current.current.shape)) current.current.x -= 1
      if (e.key === 'ArrowRight' && !collide(current.current.x + 1, current.current.y, current.current.shape)) current.current.x += 1
      if (e.key === 'ArrowDown' && !collide(current.current.x, current.current.y + 1, current.current.shape)) current.current.y += 1
      if (e.key === 'ArrowUp') {
        const rot = rotate(current.current.shape)
        if (!collide(current.current.x, current.current.y, rot)) current.current.shape = rot
      }
      draw()
    }
    window.addEventListener('keydown', key)

    function drop() {
      if (!collide(current.current.x, current.current.y + 1, current.current.shape)) {
        current.current.y += 1
      } else {
        merge()
        clearLines()
        current.current = randomPiece()
        if (collide(current.current.x, current.current.y, current.current.shape)) {
          board.current = Array.from({ length: ROWS }, () => Array(COLS).fill(0))
        }
      }
      draw()
    }
    const id = setInterval(drop, 500)
    draw()
    return () => { clearInterval(id); window.removeEventListener('keydown', key) }
  }, [])

  return (
    <div className="container">
      <h1>🔷 俄罗斯方块</h1>
      <p className="desc">方向键移动，上键旋转方块。</p>
      <div className="stage" style={{ width: COLS * SIZE, height: ROWS * SIZE, margin: '0 auto' }}>
        <canvas
          ref={canvasRef}
          width={COLS * SIZE}
          height={ROWS * SIZE}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <a className="btn ghost" href="/">返回首页</a>
      </div>
    </div>
  )
}
