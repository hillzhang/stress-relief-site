
import React, { useEffect, useRef, useState } from 'react'
import '../styles.css'

type Knife = { angle:number }
export default function Knives(){
  const [score, setScore] = useState(0)
  const [over, setOver] = useState(false)
  const knives = useRef<Knife[]>([])
  const angle = useRef(0)
  const raf = useRef(0)
  const speed = useRef(1.2)

  useEffect(()=>{
    const cvs = document.getElementById('knv') as HTMLCanvasElement
    const ctx = cvs.getContext('2d')!
    let rect = cvs.getBoundingClientRect(), DPR = devicePixelRatio||1
    function fit(){ rect=cvs.getBoundingClientRect(); cvs.width=rect.width*DPR; cvs.height=360*DPR; ctx.scale(DPR,DPR) }
    fit(); addEventListener('resize', fit)

    function woodTexture(x:number,y:number,r:number){
      const g = ctx.createRadialGradient(x,y,10,x,y,r)
      g.addColorStop(0,'#e3caa1'); g.addColorStop(1,'#b88958')
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill()
      ctx.strokeStyle='#8b5e34aa'; for(let i=8;i<r;i+=8){ ctx.beginPath(); ctx.arc(x,y,i,0,Math.PI*2); ctx.stroke() }
    }

    function draw(){
      ctx.clearRect(0,0,rect.width,360)
      const cx = rect.width/2, cy = 180, r = 80
      // bg
      const bg = ctx.createLinearGradient(0,0,rect.width,360); bg.addColorStop(0,'#cbd5e1'); bg.addColorStop(1,'#e2e8f0'); ctx.fillStyle=bg; ctx.fillRect(0,0,rect.width,360)
      // target wood
      woodTexture(cx,cy,r)
      // rotate knives
      angle.current += speed.current*0.01
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(angle.current)
      for(const k of knives.current){
        ctx.save(); ctx.rotate(k.angle)
        // blade
        ctx.fillStyle='#e5e7eb'
        ctx.beginPath(); ctx.roundRect?.(-4, -r-48, 8, 48, 4); ctx.fill()
        // handle
        ctx.fillStyle='#8b5e34'; ctx.beginPath(); ctx.roundRect?.(-5, -r-65, 10, 17, 4); ctx.fill()
        ctx.restore()
      }
      ctx.restore()
      if(!over) raf.current = requestAnimationFrame(draw)
    }
    raf.current = requestAnimationFrame(draw)
    return ()=> cancelAnimationFrame(raf.current)
  }, [over])

  function throwKnife(){
    if(over) return
    const a = - (angle.current % (Math.PI*2))
    for(const k of knives.current){
      const diff = Math.abs(((k.angle - a + Math.PI) % (Math.PI*2)) - Math.PI)
      if(diff < (12*Math.PI/180)){ setOver(true); return }
    }
    knives.current.push({angle:a})
    setScore(s=>s+1)
    if(score>0 && score%6===0) speed.current += 0.2
  }
  function reset(){ knives.current=[]; setScore(0); setOver(false); speed.current=1.2 }

  return (
    <div className="container">
      <h1>🎯 飞刀靶</h1>
      <p className="desc">木质靶心 + 钢刀造型。点击投掷，避免重叠。</p>
      <div className="stage" style={{height:360, display:'grid', placeItems:'center'}} onClick={throwKnife}>
        <canvas id="knv" style={{width:'100%', height:'100%'}}/>
      </div>
      <div style={{display:'flex', gap:12, marginTop:12, alignItems:'center'}}>
        <div className="badge">得分 {score}</div>
        {!over ? <button className="btn primary" onClick={throwKnife}>投掷</button> : <button className="btn secondary" onClick={reset}>重来</button>}
        <a className="btn ghost" href="/">返回首页</a>
      </div>
    </div>
  )
}
