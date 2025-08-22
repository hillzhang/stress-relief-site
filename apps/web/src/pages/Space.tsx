import React, { useEffect, useRef } from 'react'
import '../styles.css'

const WIDTH = 300
const HEIGHT = 400

export default function Space() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const player = useRef({ x: WIDTH / 2 })
  const bullets = useRef<{ x: number; y: number }[]>([])
  const enemies = useRef<{ x: number; y: number }[]>([])
  const dir = useRef(0)
  const enemyDir = useRef(1)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') dir.current = -4
      if (e.key === 'ArrowRight') dir.current = 4
      if (e.key === ' ') bullets.current.push({ x: player.current.x, y: HEIGHT - 40 })
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') dir.current = 0
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d')!

    function reset() {
      player.current = { x: WIDTH / 2 }
      bullets.current = []
      enemies.current = []
      enemyDir.current = 1
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 6; c++) {
          enemies.current.push({ x: 40 + c * 40, y: 40 + r * 30 })
        }
      }
    }

    function tick() {
      player.current.x += dir.current
      if (player.current.x < 20) player.current.x = 20
      if (player.current.x > WIDTH - 20) player.current.x = WIDTH - 20

      bullets.current.forEach(b => (b.y -= 6))
      bullets.current = bullets.current.filter(b => b.y > -10)

      for (const b of bullets.current) {
        for (const e of enemies.current) {
          if (Math.abs(b.x - e.x) < 15 && Math.abs(b.y - e.y) < 15) {
            enemies.current = enemies.current.filter(en => en !== e)
            bullets.current = bullets.current.filter(bl => bl !== b)
            break
          }
        }
      }

      let edge = false
      enemies.current.forEach(e => {
        e.x += enemyDir.current
        if (e.x > WIDTH - 20 || e.x < 20) edge = true
      })
      if (edge) {
        enemyDir.current *= -1
        enemies.current.forEach(e => (e.y += 10))
      }
      if (enemies.current.some(e => e.y > HEIGHT - 60)) reset()

      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, WIDTH, HEIGHT)
      ctx.fillStyle = '#0f0'
      ctx.fillRect(player.current.x - 15, HEIGHT - 30, 30, 15)
      ctx.fillStyle = '#ff0'
      bullets.current.forEach(b => ctx.fillRect(b.x - 2, b.y - 10, 4, 10))
      ctx.fillStyle = '#f00'
      enemies.current.forEach(e => ctx.fillRect(e.x - 15, e.y - 15, 30, 30))
    }

    reset()
    const id = setInterval(tick, 30)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ padding: '20px' }}>
      <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} style={{ border: '2px solid #555' }} />
      <p style={{ color: 'var(--muted)', marginTop: '10px' }}>左右移动，空格射击</p>
    </div>
  )
}

