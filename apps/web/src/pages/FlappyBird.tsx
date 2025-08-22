import React, { useEffect, useRef } from 'react'
import '../styles.css'

const WIDTH = 300
const HEIGHT = 400
const GAP = 90
const PIPE_WIDTH = 50
const GRAVITY = 0.5
const JUMP = -8

export default function FlappyBird() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bird = useRef({ x: 80, y: HEIGHT / 2, vy: 0 })
  const pipes = useRef<{ x: number; top: number }[]>([])
  const frame = useRef(0)

  useEffect(() => {
    const flap = () => {
      bird.current.vy = JUMP
    }
    window.addEventListener('keydown', flap)
    window.addEventListener('mousedown', flap)
    return () => {
      window.removeEventListener('keydown', flap)
      window.removeEventListener('mousedown', flap)
    }
  }, [])

  useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d')!

    function reset() {
      bird.current = { x: 80, y: HEIGHT / 2, vy: 0 }
      pipes.current = []
      frame.current = 0
    }

    function tick() {
      frame.current++
      if (frame.current % 100 === 0) {
        const top = Math.random() * (HEIGHT - GAP - 40) + 20
        pipes.current.push({ x: WIDTH, top })
      }
      bird.current.vy += GRAVITY
      bird.current.y += bird.current.vy
      pipes.current.forEach(p => (p.x -= 2))
      if (pipes.current.length && pipes.current[0].x < -PIPE_WIDTH) pipes.current.shift()
      if (bird.current.y > HEIGHT || bird.current.y < 0) {
        reset()
      }
      for (const p of pipes.current) {
        if (
          bird.current.x > p.x - 20 &&
          bird.current.x < p.x + PIPE_WIDTH &&
          (bird.current.y < p.top || bird.current.y > p.top + GAP)
        ) {
          reset()
          break
        }
      }
      ctx.fillStyle = '#4ec0ca'
      ctx.fillRect(0, 0, WIDTH, HEIGHT)
      ctx.fillStyle = '#70c000'
      pipes.current.forEach(p => {
        ctx.fillRect(p.x, 0, PIPE_WIDTH, p.top)
        ctx.fillRect(p.x, p.top + GAP, PIPE_WIDTH, HEIGHT - p.top - GAP)
      })
      ctx.fillStyle = 'yellow'
      ctx.beginPath()
      ctx.arc(bird.current.x, bird.current.y, 12, 0, Math.PI * 2)
      ctx.fill()
    }

    reset()
    const id = setInterval(tick, 20)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ padding: '20px' }}>
      <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} style={{ border: '2px solid #555' }} />
      <p style={{ color: 'var(--muted)', marginTop: '10px' }}>点击或按键让小鸟飞</p>
    </div>
  )
}

