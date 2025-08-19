
import React, { useEffect, useRef, useState } from 'react'
import '../styles.css'
import { pop } from '../sfx'

type Fruit = { id:number, x:number,y:number,vx:number,vy:number,r:number,emoji:string,sliced:boolean }
const EMOJIS = ['🍉','🍋','🍊','🥝','🍓','🍎','🍐']

export default function FruitSlice(){
  const canvasRef = useRef<HTMLCanvasElement|null>(null)
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const scoreRef = useRef(score)
  const livesRef = useRef(lives)
  const [holding, setHolding] = useState(false)
  const fruitsRef = useRef<Fruit[]>([])
  const trail = useRef<{x:number,y:number,t:number}[]>([])
  const rafRef = useRef(0)

  useEffect(() => { scoreRef.current = score }, [score])
  useEffect(() => { livesRef.current = lives }, [lives])

  useEffect(()=>{
    const cvs = canvasRef.current!, ctx = cvs.getContext('2d')!
    let rect = cvs.getBoundingClientRect(), DPR = devicePixelRatio||1
    function fit(){ rect=cvs.getBoundingClientRect(); cvs.width=rect.width*DPR; cvs.height=rect.height*DPR; ctx.scale(DPR,DPR) }
    const H = 440; cvs.style.height = H+'px'; cvs.style.width='100%'
    fit(); addEventListener('resize', fit)

    let last = performance.now(), spawnAcc = 0
    function spawn(){
      const r = 22 + Math.random()*12
      const x = 40 + Math.random()*(rect.width-80)
      const y = H + r + 10
      const vy = - (500 + Math.random()*240)
      const vx = (Math.random()*2-1) * 140
      const emoji = EMOJIS[Math.floor(Math.random()*EMOJIS.length)]
      fruitsRef.current.push({id:Math.random(), x, y, vx, vy, r, emoji, sliced:false})
    }
    function lineCircleHit(ax:number,ay:number,bx:number,by:number,cx:number,cy:number,r:number){
      const dx=bx-ax, dy=by-ay, fx=ax-cx, fy=ay-cy
      const a=dx*dx+dy*dy; if(a<1e-6) return false
      let t = -(fx*dx+fy*dy)/a; t=Math.max(0,Math.min(1,t))
      const px=ax+dx*t, py=ay+dy*t
      return Math.hypot(px-cx, py-cy) <= r
    }
    const particles: {x:number,y:number,vx:number,vy:number,t:number,life:number,emoji:string}[] = []
    function splash(x:number,y:number,emoji:string){
      for(let i=0;i<12;i++){
        const ang=Math.random()*Math.PI*2, spd=80+Math.random()*160, life=600+Math.random()*500
        particles.push({x,y,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,t:performance.now(),life,emoji})
      }
    }

    function draw(now:number){
      const dt = Math.min(0.032,(now-last)/1000); last=now
      ctx.clearRect(0,0,rect.width,H)
      // background
      const g = ctx.createLinearGradient(0,0,rect.width,H); g.addColorStop(0,'#bbf7d0'); g.addColorStop(1,'#a2d2ff'); ctx.fillStyle=g; ctx.fillRect(0,0,rect.width,H)

      // spawn
      spawnAcc += dt*1000
      if(spawnAcc>850){ spawn(); spawnAcc=0 }

      // update fruits
      for(let i=fruitsRef.current.length-1;i>=0;i--){
        const f = fruitsRef.current[i]
        f.x += f.vx*dt; f.y += f.vy*dt; f.vy += 980*dt
        if(f.y>H+80){
          fruitsRef.current.splice(i,1);
          setLives(v=>{ const nv=Math.max(0,v-1); livesRef.current=nv; return nv })
        }
      }
      // draw fruits
      for(const f of fruitsRef.current){ ctx.save(); ctx.font=`${f.r*1.6}px system-ui`; ctx.fillText(f.emoji, f.x - f.r*0.8, f.y + f.r*0.6); ctx.restore() }

      // blade trail (nice glow)
      if(trail.current.length>1){
        ctx.lineCap='round'; ctx.lineJoin='round'
        const pts = trail.current.slice(-16)
        for(let i=0;i<pts.length-1;i++){
          const a=pts[i], b=pts[i+1]
          const w = 18 * (i/(pts.length-1))
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'
          ctx.lineWidth = Math.max(2, 18 - w)
          ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke()
        }
        // hit detection only when holding mouse (像“刀”)
        if(holding){
          const a=pts[pts.length-2], b=pts[pts.length-1]
          for(const f of fruitsRef.current){
            if(!f.sliced && lineCircleHit(a.x,a.y,b.x,b.y,f.x,f.y,f.r)){
              f.sliced=true;
              splash(f.x,f.y,f.emoji);
              pop();
              setScore(s=>{ const ns=s+1; scoreRef.current=ns; return ns })
            }
          }
          fruitsRef.current = fruitsRef.current.filter(f=>!f.sliced)
        }
      }

      // particles
      const nowt = performance.now()
      for(let i=particles.length-1;i>=0;i--){
        const p=particles[i]; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=600*dt
        const alpha = 1 - (nowt - p.t)/p.life; if(alpha<=0){ particles.splice(i,1); continue }
        ctx.save(); ctx.globalAlpha=Math.max(0,alpha); ctx.font='16px system-ui'; ctx.fillText(p.emoji, p.x, p.y); ctx.restore()
      }

      // HUD
      ctx.fillStyle = 'rgba(255,255,255,.92)'
      if ((ctx as any).roundRect) {
        (ctx as any).roundRect(10, 10, 200, 38, 16)
      } else {
        ctx.fillRect(10, 10, 200, 38)
      }
      ctx.fill()
      ctx.fillStyle = '#111'
      ctx.font = 'bold 16px system-ui'
      ctx.fillText(`得分 ${scoreRef.current}`, 22, 34)
      ctx.fillText(`❤ ${livesRef.current}`, 110, 34)
      if(livesRef.current<=0){ ctx.fillStyle='rgba(15,23,42,.6)'; ctx.fillRect(0,0,rect.width,H); ctx.fillStyle='#fff'; ctx.font='bold 28px system-ui'; ctx.fillText('游戏结束', rect.width/2-70, H/2) }

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)

    function pos(e:MouseEvent|TouchEvent){ const p=('touches'in e)? e.touches[0] as any : e as MouseEvent; const x=(p.clientX-rect.left), y=(p.clientY-rect.top); return {x,y} }
    function down(e:any){ setHolding(true); trail.current.push({...pos(e), t:performance.now()}); }
    function move(e:any){ const p=pos(e); trail.current.push({x:p.x,y:p.y,t:performance.now()}); if(trail.current.length>32) trail.current=trail.current.slice(-32) }
    function up(){ setHolding(false); trail.current=[] }

    cvs.addEventListener('mousedown', down); cvs.addEventListener('mousemove', move); addEventListener('mouseup', up)
    cvs.addEventListener('touchstart', down, {passive:true}); cvs.addEventListener('touchmove', move, {passive:true}); addEventListener('touchend', up)
    return ()=>{ cancelAnimationFrame(rafRef.current); removeEventListener('mouseup', up); removeEventListener('touchend', up); cvs.removeEventListener('mousedown', down as any); cvs.removeEventListener('mousemove', move as any); cvs.removeEventListener('touchstart', down as any); cvs.removeEventListener('touchmove', move as any); removeEventListener('resize', fit) }
  }, [])

  function restart(){
    setLives(3); setScore(0);
    livesRef.current=3; scoreRef.current=0;
    fruitsRef.current=[]
  }

  return (
    <div className="container">
      <h1>🍉 切水果</h1>
      <p className="desc">按住拖动才算“挥刀”，带刀光轨迹与飞溅粒子。漏接扣生命。</p>
      <div className="stage" style={{position:'relative', height:440}}>
        <canvas ref={canvasRef}/>
      </div>
      <div style={{display:'flex', gap:12, marginTop:12}}>
        <button className="btn ghost" onClick={restart}>重开</button>
        <a className="btn ghost" href="/">返回首页</a>
      </div>
    </div>
  )
}
