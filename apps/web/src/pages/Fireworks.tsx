
import React, { useEffect, useRef, useState } from 'react'
import '../styles.css'
import { boom } from '../sfx'

type Rocket = { x:number, y:number, vx:number, vy:number, explodeY:number, exploded:boolean }
type Particle = { x:number, y:number, vx:number, vy:number, life:number, born:number, color:string }

export default function Fireworks(){
  const ref = useRef<HTMLCanvasElement|null>(null)
  const rockets: Rocket[] = []
  const parts: Particle[] = []
  const raf = useRef(0)
  const [style, setStyle] = useState<'ring'|'heart'|'chrys'|'fountain'>('ring')

  useEffect(()=>{
    const cvs = ref.current!, ctx = cvs.getContext('2d')!
    let rect = cvs.getBoundingClientRect(), DPR = devicePixelRatio||1
    function fit(){ rect=cvs.getBoundingClientRect(); cvs.width=rect.width*DPR; cvs.height=420*DPR; ctx.scale(DPR,DPR) }
    fit(); addEventListener('resize', fit)

    let last = performance.now()
    function step(now:number){
      const dt = Math.min(0.033,(now-last)/1000); last = now
      ctx.clearRect(0,0,rect.width,420)
      const g = ctx.createLinearGradient(0,0,0,420); g.addColorStop(0,'#0f172a'); g.addColorStop(1,'#1e3a8a'); ctx.fillStyle=g; ctx.fillRect(0,0,rect.width,420)

      for(let i=rockets.length-1;i>=0;i--){
        const r = rockets[i]
        if(!r.exploded){
          r.vy -= 260*dt; r.y += r.vy*dt; r.x += r.vx*dt
          ctx.fillStyle = '#fff'; ctx.fillRect(r.x-1, r.y-4, 2, 6)
          if(r.y <= r.explodeY){ r.exploded=true; spawn(r.x, r.y); boom() }
        }else{ rockets.splice(i,1) }
      }

      for(let i=parts.length-1;i>=0;i--){
        const p = parts[i]
        p.vy += 60*dt; p.x += p.vx*dt; p.y += p.vy*dt
        const age = (now - p.born)/1000
        const a = Math.max(0, 1 - age/p.life)
        ctx.globalAlpha = a
        ctx.fillStyle = p.color
        ctx.fillRect(p.x, p.y, 2, 2)
        ctx.globalAlpha = 1
        if(a<=0) parts.splice(i,1)
      }
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)

    function spawn(x:number,y:number){
      const hue = Math.floor(Math.random()*360)
      const N = 140
      if(style==='ring'){
        for(let i=0;i<N;i++){ const ang=i/N*Math.PI*2; const spd=120+Math.random()*80; parts.push({x,y,vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd, life:1.4, born:performance.now(), color:`hsl(${hue},90%,70%)`}) }
      }else if(style==='heart'){
        for(let i=0;i<N;i++){ const t=i/N*Math.PI*2; const px=16*Math.pow(Math.sin(t),3); const py=13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t); const spd=6; parts.push({x,y,vx:px*spd, vy:-py*spd, life:1.6, born:performance.now(), color:`hsl(${hue},90%,75%)`}) }
      }else if(style==='chrys'){
        for(let i=0;i<N;i++){ const ang=i/N*Math.PI*2+Math.random()*0.2; const spd=80+Math.random()*160; parts.push({x,y,vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd, life:1.2, born:performance.now(), color:`hsl(${(hue+i)%360},90%,70%)`}) }
      }else if(style==='fountain'){
        for(let i=0;i<N;i++){ const ang = -Math.PI/2 + (Math.random()-0.5)*Math.PI/3; const spd=100+Math.random()*200; parts.push({x,y,vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd, life:1.0, born:performance.now(), color:`hsl(${hue},90%,70%)`}) }
      }
    }
    function click(e:MouseEvent){ const x=e.offsetX, y=e.offsetY; rockets.push({x, y:420, vx:(Math.random()*2-1)*20, vy:-80, explodeY:y, exploded:false}) }
    cvs.addEventListener('click', click)

    return ()=>{ cancelAnimationFrame(raf.current); cvs.removeEventListener('click', click); removeEventListener('resize', fit) }
  }, [style])

  return (
    <div className="container">
      <h1>🎆 放烟花</h1>
      <p className="desc">点击任意位置发射。样式：环形 / 爱心 / 菊花 / 喷泉。</p>
      <div style={{display:'flex', gap:12, flexWrap:'wrap', marginBottom:8}}>
        {(['ring','heart','chrys','fountain'] as any[]).map(s=>(<button key={s} className="btn ghost" onClick={()=>setStyle(s)}>{s}</button>))}
      </div>
      <div className="stage" style={{height:420}}>
        <canvas ref={ref} style={{width:'100%', height:'100%'}}/>
      </div>
      <div style={{marginTop:12}}><a className="btn ghost" href="/">返回首页</a></div>
    </div>
  )
}
