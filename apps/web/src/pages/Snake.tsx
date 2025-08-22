import React, { useEffect, useRef } from 'react'
import '../styles.css'

const SIZE = 20
const CELL = 20

interface Point { x: number; y: number }

function randomFood(): Point {
  return { x: Math.floor(Math.random() * SIZE), y: Math.floor(Math.random() * SIZE) }
}

export default function Snake() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dir = useRef<Point>({ x: 0, y: -1 })
  const snake = useRef<Point[]>([{ x: 10, y: 10 }])
  const food = useRef<Point>(randomFood())

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' && dir.current.y !== 1) dir.current = { x: 0, y: -1 }
      if (e.key === 'ArrowDown' && dir.current.y !== -1) dir.current = { x: 0, y: 1 }
      if (e.key === 'ArrowLeft' && dir.current.x !== 1) dir.current = { x: -1, y: 0 }
      if (e.key === 'ArrowRight' && dir.current.x !== -1) dir.current = { x: 1, y: 0 }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.scale(CELL, CELL)
    function draw() {
      ctx.fillStyle = '#111'
      ctx.fillRect(0, 0, SIZE, SIZE)
      ctx.fillStyle = '#0f0'
      snake.current.forEach(s => ctx.fillRect(s.x, s.y, 1, 1))
      ctx.fillStyle = '#f00'
      ctx.fillRect(food.current.x, food.current.y, 1, 1)
    }
    const tick = () => {
      const head = { x: snake.current[0].x + dir.current.x, y: snake.current[0].y + dir.current.y }
      if (head.x < 0 || head.x >= SIZE || head.y < 0 || head.y >= SIZE || snake.current.some(p => p.x === head.x && p.y === head.y)) {
        snake.current = [{ x: 10, y: 10 }]
        food.current = randomFood()
      } else {
        snake.current = [head, ...snake.current]
        if (head.x === food.current.x && head.y === food.current.y) {
          food.current = randomFood()
        } else {
          snake.current.pop()
        }
      }
      draw()
    }
    const id = setInterval(tick, 120)
    draw()
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ padding: '20px' }}>
      <canvas ref={canvasRef} width={SIZE * CELL} height={SIZE * CELL} style={{ border: '2px solid #555' }} />
      <p style={{ color: 'var(--muted)', marginTop: '10px' }}>使用方向键控制蛇</p>
    </div>
  )
}
