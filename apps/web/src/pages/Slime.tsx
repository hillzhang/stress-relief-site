import React, { useRef, useEffect } from 'react'
import '../styles.css'

export default function Slime(){
  const canvasRef = useRef<HTMLCanvasElement|null>(null)
  const pos = useRef({x:200,y:200,r:80})
  const dragging = useRef(false)
  const raf = useRef(0)

  useEffect(()=>{
    const cvs = canvasRef.current!
    const ctx = cvs.getContext('2d')!
    function resize(){
      const r = cvs.getBoundingClientRect()
      cvs.width = r.width * window.devicePixelRatio
      cvs.height = r.height * window.devicePixelRatio
      ctx.setTransform(window.devicePixelRatio,0,0,window.devicePixelRatio,0,0)
    }
    resize();
    window.addEventListener('resize', resize)

    function draw(){
      ctx.clearRect(0,0,cvs.width,cvs.height)
      const {x,y,r} = pos.current
      ctx.fillStyle = '#8ef'
      ctx.beginPath()
      ctx.ellipse(x,y,r,r*0.8,0,0,Math.PI*2)
      ctx.fill()
      raf.current = requestAnimationFrame(draw)
    }
    draw()

    function up(){ dragging.current = false; pos.current.r = 80 }
    function down(e:PointerEvent){ dragging.current = true; move(e); pos.current.r = 120 }
    function move(e:PointerEvent){ if(!dragging.current) return; pos.current.x = e.clientX; pos.current.y = e.clientY }

    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return ()=>{
      cancelAnimationFrame(raf.current)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  },[])

  return <canvas ref={canvasRef} style={{width:'100%',height:'100vh',touchAction:'none',background:'#222'}}></canvas>
}

