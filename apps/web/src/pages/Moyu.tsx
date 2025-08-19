
import React, { useEffect, useRef, useState } from 'react'
import '../styles.css'

type Fish = { x:number,y:number,vx:number,vy:number,angle:number,size:number,color:string, hunger:number }
type Pellet = { x:number,y:number,vy:number,life:number }

export default function Moyu(){
  const [night, setNight] = useState(false)
  const [count, setCount] = useState(8)
  const ref = useRef<HTMLCanvasElement|null>(null)
  const fishRef = useRef<Fish[]>([])
  const pellets: Pellet[] = []
  const raf = useRef(0)

  useEffect(()=>{
    const cvs = ref.current!
    const ctx = cvs.getContext('2d')!
    let rect = cvs.getBoundingClientRect()
    const DPR = window.devicePixelRatio || 1
    function fit(){ rect = cvs.getBoundingClientRect(); cvs.width = rect.width*DPR; cvs.height = 440*DPR; ctx.scale(DPR,DPR) }
    fit(); window.addEventListener('resize', fit)

    // init fishes
    fishRef.current = [...Array(count)].map((_,i)=> ({
      x: 60+Math.random()*(rect.width-120),
      y: 60+Math.random()*(440-120),
      vx: (Math.random()*2-1)*40,
      vy: (Math.random()*2-1)*20,
      angle: 0,
      size: 14 + Math.random()*8,
      color: `hsl(${Math.random()*360},70%,60%)`,
      hunger: Math.random()
    }))

    let last = performance.now()
    function drawFish(f:Fish){
      ctx.save()
      ctx.translate(f.x,f.y); ctx.rotate(f.angle)
      ctx.fillStyle = f.color
      ctx.beginPath()
      ctx.ellipse(0,0,f.size*1.6,f.size,0,0,Math.PI*2)
      ctx.fill()
      // tail
      ctx.beginPath()
      ctx.moveTo(-f.size*1.6,0)
      ctx.lineTo(-f.size*2.2, f.size*0.6)
      ctx.lineTo(-f.size*2.2,-f.size*0.6)
      ctx.closePath()
      ctx.fill()
      // eye
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(f.size*0.9,-f.size*0.2,2,0,Math.PI*2); ctx.fill()
      ctx.restore()
    }
    function drawPellet(p:Pellet){
      ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI*2); ctx.fill()
    }
    function drawBubbles(now:number){
      ctx.save(); ctx.globalAlpha = .2
      for(let i=0;i<20;i++){
        const x = (i*53 + (now*0.03)%rect.width)%rect.width
        const y = 440 - ((now*0.02 + i*30)%500)
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI*2); ctx.fillStyle = '#fff'; ctx.fill()
      }
      ctx.restore()
    }

    function step(now:number){
      const dt = Math.min(0.032, (now-last)/1000); last = now
      ctx.clearRect(0,0,rect.width,440)
      // background
      const g = ctx.createLinearGradient(0,0,0,440)
      g.addColorStop(0, night ? '#0ea5e9' : '#22d3ee')
      g.addColorStop(1, night ? '#0f172a' : '#a78bfa')
      ctx.fillStyle = g; ctx.fillRect(0,0,rect.width,440)
      drawBubbles(now)

      // pellets
      for(let i=pellets.length-1;i>=0;i--){
        const p = pellets[i]; p.vy += 200*dt; p.y += p.vy*dt; p.life -= dt
        if(p.y>440){ pellets.splice(i,1); continue }
        drawPellet(p)
      }

      // fish logic
      fishRef.current.forEach(f=>{
        // target nearest pellet
        let tx = f.x + f.vx*0.5, ty = f.y + f.vy*0.5
        if(pellets.length){
          let best = 1e9, target:Pellet|null = null
          for(const p of pellets){ const d = (p.x-f.x)**2 + (p.y-f.y)**2; if(d<best){ best=d; target=p } }
          if(target){ tx = target.x; ty = target.y }
        }
        const ax = (tx - f.x)*0.3, ay = (ty - f.y)*0.3
        f.vx = (f.vx + ax*dt); f.vy = (f.vy + ay*dt)
        const speed = Math.hypot(f.vx, f.vy); const max = 60
        if(speed>max){ f.vx = f.vx/speed*max; f.vy = f.vy/speed*max }
        f.x += f.vx*dt; f.y += f.vy*dt
        if(f.x<20||f.x>rect.width-20) f.vx*=-1
        if(f.y<20||f.y>420) f.vy*=-1
        f.angle = Math.atan2(f.vy, f.vx)
        drawFish(f)
      })

      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)

    function click(e:MouseEvent){
      const x = e.offsetX, y = e.offsetY
      pellets.push({x,y,vy:0,life:6})
    }
    cvs.addEventListener('click', click)

    return ()=>{
      cancelAnimationFrame(raf.current)
      cvs.removeEventListener('click', click)
      window.removeEventListener('resize', fit)
    }
  }, [night, count])

  return (
    <div className="container">
      <h1>🐟 摸鱼模拟器</h1>
      <p className="desc">点击投喂小饵，鱼儿会靠近；开/关夜晚；看它们慢慢游，摸一会儿鱼。</p>
      <div className="stage" style={{height:440}}>
        <canvas ref={ref} style={{width:'100%', height:'100%'}}/>
      </div>
      <div style={{display:'flex', gap:12, marginTop:12, alignItems:'center', flexWrap:'wrap'}}>
        <label style={{display:'flex', alignItems:'center', gap:6}}>
          <input type="checkbox" checked={night} onChange={e=>setNight(e.target.checked)}/> 夜晚
        </label>
        <label style={{display:'flex', alignItems:'center', gap:6}}>
          鱼数
          <input type="range" min={3} max={14} value={count} onChange={e=>setCount(parseInt(e.target.value))}/>
          <span className="badge">{count}</span>
        </label>
        <a className="btn ghost" href="/">返回首页</a>
      </div>
    </div>
  )
}
