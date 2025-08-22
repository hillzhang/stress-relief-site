import React, { useEffect, useRef } from 'react'
import '../styles.css'

type Fruit = {x:number,y:number,vy:number,falling:boolean}

export default function TreeShake(){
  const canvasRef = useRef<HTMLCanvasElement|null>(null)
  const fruitsRef = useRef<Fruit[]>([])
  const raf = useRef(0)

  useEffect(()=>{
    const cvs = canvasRef.current!
    const ctx = cvs.getContext('2d')!
    cvs.width = 400; cvs.height = 500

    fruitsRef.current = Array.from({length:5},()=>({x:200+Math.random()*60-30,y:150+Math.random()*40,vy:0,falling:false}))

    function draw(){
      ctx.clearRect(0,0,cvs.width,cvs.height)
      // tree
      ctx.fillStyle = '#8B4513'
      ctx.fillRect(180,200,40,200)
      ctx.fillStyle = '#228B22'
      ctx.beginPath(); ctx.arc(200,200,100,0,Math.PI*2); ctx.fill()
      // fruits
      fruitsRef.current.forEach(f=>{
        if(f.falling){ f.vy += 0.5; f.y += f.vy }
        if(f.y>420){ f.y=420 }
        ctx.fillStyle = 'orange'
        ctx.beginPath(); ctx.arc(f.x,f.y,10,0,Math.PI*2); ctx.fill()
      })
      // basket
      ctx.fillStyle = '#654321'
      ctx.fillRect(140,420,120,20)
      raf.current = requestAnimationFrame(draw)
    }
    draw()
    return ()=> cancelAnimationFrame(raf.current)
  },[])

  function shake(){
    fruitsRef.current.forEach(f=>{ if(!f.falling) f.falling = true })
  }

  return (
    <div style={{textAlign:'center',padding:'20px'}}>
      <canvas ref={canvasRef} style={{border:'1px solid #ccc'}} width={400} height={500}></canvas>
      <div style={{marginTop:'10px'}}><button onClick={shake}>摇一摇</button></div>
    </div>
  )
}

