import React, { useEffect, useRef, useState } from 'react'
import '../styles.css'

interface Star { x: number; y: number; r: number }

export default function Stars() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stars = useRef<Star[]>([])
  const [score, setScore] = useState(0)

  useEffect(() => {
    const cvs = canvasRef.current!
    const ctx = cvs.getContext('2d')!

    function draw() {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, cvs.width, cvs.height)
      ctx.fillStyle = '#ff0'
      stars.current.forEach(s => {
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
      })
    }

    function addStar() {
      const r = 5 + Math.random() * 5
      stars.current.push({ x: Math.random() * cvs.width, y: Math.random() * cvs.height, r })
      if (stars.current.length > 20) stars.current.shift()
    }

    const click = (e: MouseEvent) => {
      const rect = cvs.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      stars.current = stars.current.filter(s => {
        const hit = Math.hypot(s.x - x, s.y - y) < s.r
        if (hit) setScore(sc => sc + 1)
        return !hit
      })
      draw()
    }

    const loop = () => { draw(); requestAnimationFrame(loop) }
    const spawn = setInterval(addStar, 1000)
    loop()
    cvs.addEventListener('click', click)
    return () => { clearInterval(spawn); cvs.removeEventListener('click', click) }
  }, [])

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ color: 'var(--muted)', marginBottom: '8px' }}>得分: {score}</div>
      <canvas ref={canvasRef} width={400} height={400} style={{ border: '2px solid #555' }} />
      <p style={{ color: 'var(--muted)', marginTop: '10px' }}>点击星星得分</p>
    </div>
  )
}
