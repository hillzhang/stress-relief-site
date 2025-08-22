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
  const [style, setStyle] = useState<'ring'|'heart'|'chrys'|'fountain'|'star'|'spiral'|'butterfly'|'double'|'smile'|'comet'>('ring')
  const [autoplay, setAutoplay] = useState<boolean>(false)
  const [randomStyle, setRandomStyle] = useState<boolean>(false)
  const fireTimer = useRef<number|undefined>(undefined)
  const holdTimer = useRef<number|undefined>(undefined)
  const densityRef = useRef<number>(140) // base particles per burst
  const [density, setDensity] = useState<number>(densityRef.current)
  // physics & power controls
  const gravityRef = useRef<number>(60)
  const [gravityUI, setGravityUI] = useState<number>(gravityRef.current)
  const windRef = useRef<number>(0)
  const [windUI, setWindUI] = useState<number>(0)
  const powerRef = useRef<number>(100) // percentage 60–160
  const [powerUI, setPowerUI] = useState<number>(powerRef.current)
  const [bounce, setBounce] = useState<boolean>(false)
  const rainTimer = useRef<number|undefined>(undefined)
  const showTimer = useRef<number>(0)
  const [showTimeLeft, setShowTimeLeft] = useState<number>(0)
  const [panelOpen, setPanelOpen] = useState<boolean>(true)
  const showTimerId = useRef<number|undefined>(undefined)
  const styleCycleId = useRef<number|undefined>(undefined)

  const palettes = [
    (h:number,i:number)=>`hsl(${(h+i*2)%360},95%,70%)`,
    (h:number,i:number)=>`hsl(${(h+180)%360},90%,65%)`,
    (h:number,i:number)=>`hsl(${(h+(i%5)*12)%360},100%,72%)`,
    (h:number,i:number)=>`hsl(${(h+40)%360},90%,70%)`,
  ]
  const SKY_H = 560
  const LABELS: Record<string,string> = {
    ring:'环形', heart:'爱心', chrys:'菊花', fountain:'喷泉',
    star:'星形', spiral:'螺旋', butterfly:'蝴蝶', double:'双环',
    smile:'笑脸', comet:'彗星'
  }

  useEffect(()=>{
    const cvs = ref.current!, ctx = cvs.getContext('2d')!
    let rect = cvs.getBoundingClientRect(), DPR = Math.max(1, Math.min(2, devicePixelRatio||1))
    function fit(){
      rect = cvs.getBoundingClientRect()
      const w = Math.floor(rect.width * DPR)
      const h = Math.floor(SKY_H * DPR)
      if(cvs.width!==w || cvs.height!==h){
        cvs.width = w; cvs.height = h
      }
      ctx.setTransform(1,0,0,1,0,0)
      ctx.scale(DPR,DPR)
    }
    fit(); addEventListener('resize', fit)

    // (text fireworks removed)

    let last = performance.now()
    function step(now:number){
      const dt = Math.min(0.033,(now-last)/1000); last = now
      // background sky gradient
      const g = ctx.createLinearGradient(0,0,0,SKY_H)
      g.addColorStop(0,'#0b1226')
      g.addColorStop(0.55,'#132a63')
      g.addColorStop(1,'#0b1b3e')
      ctx.fillStyle = g
      ctx.fillRect(0,0,rect.width,SKY_H)
      // subtle vignette
      const rad = ctx.createRadialGradient(rect.width/2, 120, 50, rect.width/2, 200, Math.max(rect.width, SKY_H))
      rad.addColorStop(0,'rgba(0,0,0,0)')
      rad.addColorStop(1,'rgba(0,0,0,0.25)')
      ctx.fillStyle = rad
      ctx.fillRect(0,0,rect.width,SKY_H)

      for(let i=rockets.length-1;i>=0;i--){
        const r = rockets[i]
        if(!r.exploded){
          r.vy -= 240*dt; r.y += r.vy*dt; r.x += r.vx*dt
          ctx.fillStyle = '#fff'; ctx.fillRect(r.x-1, r.y-5, 2, 8)
          if(r.y <= r.explodeY){
            r.exploded = true
            const pool = ['ring','heart','chrys','fountain','star','spiral','butterfly','double','smile','comet'] as const
            const useStyle = randomStyle ? pool[Math.floor(Math.random()*pool.length)] : style
            spawn(r.x, r.y, useStyle)
            boom()
          }
        }else{
          rockets.splice(i,1)
        }
      }

      ctx.globalCompositeOperation = 'lighter'
      for(let i=parts.length-1;i>=0;i--){
        const p = parts[i]
        // physics: gravity & wind
        p.vx += windRef.current * dt
        p.vy += gravityRef.current * dt
        p.x += p.vx*dt; p.y += p.vy*dt
        // optional bounce at the bottom
        if(bounce && p.y >= SKY_H-2 && p.vy>0){
          p.y = SKY_H-2
          p.vy *= -0.45
          p.vx *= 0.85
        }
        const age = (now - p.born)/1000
        const a = Math.max(0, 1 - age/p.life)
        ctx.globalAlpha = a
        ctx.fillStyle = p.color
        ctx.fillRect(p.x, p.y, 2, 2)
        ctx.globalAlpha = 1
        if(a<=0) parts.splice(i,1)
      }
      ctx.globalCompositeOperation = 'source-over'
      // hard cap to prevent runaway
      if(parts.length > 8000){ parts.splice(0, parts.length-8000) }
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)

    function spawn(x:number,y:number, useStyle:typeof style){
      const hue = Math.floor(Math.random()*360)
      const N = Math.max(10, Math.round(densityRef.current))
      const colorOf = palettes[Math.floor(Math.random()*palettes.length)]
      const pow = powerRef.current / 100

      if(useStyle==='ring'){
        for(let i=0;i<N;i++){ const ang=i/N*Math.PI*2; const spd=(120+Math.random()*80)*pow; parts.push({x,y,vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd, life:1.4, born:performance.now(), color:colorOf(hue,i)}) }
      }
      else if(useStyle==='heart'){
        for(let i=0;i<N;i++){ const t=i/N*Math.PI*2; const px=16*Math.pow(Math.sin(t),3); const py=13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t); const spd=6*pow; parts.push({x,y,vx:px*spd, vy:-py*spd, life:1.6, born:performance.now(), color:colorOf(hue,i)}) }
      }
      else if(useStyle==='chrys'){
        for(let i=0;i<N;i++){ const ang=i/N*Math.PI*2+Math.random()*0.15; const spd=(90+Math.random()*180)*pow; parts.push({x,y,vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd, life:1.2, born:performance.now(), color:colorOf((hue+i)%360,i)}) }
      }
      else if(useStyle==='fountain'){
        for(let i=0;i<N;i++){ const ang = -Math.PI/2 + (Math.random()-0.5)*Math.PI/3; const spd=(140+Math.random()*200)*pow; parts.push({x,y,vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd, life:1.0, born:performance.now(), color:colorOf(hue,i)}) }
      }
      else if(useStyle==='star'){
        // five-point star by alternating radius
        const peak = 1.0, valley = 0.42, R = 180
        for(let i=0;i<N;i++){
          const k = i%10
          const r = (k<5?peak:valley) * R
          const ang = (i/N)*Math.PI*2
          const spd = 1.0
          parts.push({x,y,vx:Math.cos(ang)*r*spd/12*pow, vy:Math.sin(ang)*r*spd/12*pow, life:1.5, born:performance.now(), color:colorOf(hue,i)})
        }
      }
      else if(useStyle==='spiral'){
        // Archimedean spiral
        for(let i=0;i<N;i++){
          const t = i/N * (Math.PI*4)
          const r = 12 + 90*(t/(Math.PI*4))
          const vx = Math.cos(t)*r*2.2*pow
          const vy = Math.sin(t)*r*2.2*pow
          parts.push({x,y,vx,vy, life:1.6, born:performance.now(), color:colorOf(hue,i)})
        }
      }
      else if(useStyle==='butterfly'){
        // Butterfly curve: r = e^{cosθ} - 2cos(4θ) + sin^5(θ/12)
        for(let i=0;i<N;i++){
          const t = i/N * Math.PI*2
          const r = Math.exp(Math.cos(t)) - 2*Math.cos(4*t) + Math.pow(Math.sin(t/12),5)
          const s = 90*pow
          const vx = Math.cos(t)*r*s
          const vy = Math.sin(t)*r*s
          parts.push({x,y,vx,vy, life:1.7, born:performance.now(), color:colorOf(hue,i)})
        }
      }
      else if(useStyle==='double'){
        const N2 = Math.floor(N/2)
        for(let i=0;i<N2;i++){ const ang=i/N2*Math.PI*2; const spd=110*pow; parts.push({x,y,vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd, life:1.5, born:performance.now(), color:colorOf(hue,i)}) }
        for(let i=0;i<N2;i++){ const ang=i/N2*Math.PI*2; const spd=180*pow; parts.push({x,y,vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd, life:1.2, born:performance.now(), color:colorOf((hue+50)%360,i)}) }
      }
      else if(useStyle==='smile'){
        // face ring
        const Nring = Math.floor(N*0.7)
        for(let i=0;i<Nring;i++){ const ang=i/Nring*Math.PI*2; const spd=140*pow; parts.push({x,y,vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd, life:1.4, born:performance.now(), color:colorOf(hue,i)}) }
        // smile arc (lower)
        const Marc = N-Nring-40
        for(let i=0;i<Marc;i++){ const t=-Math.PI/3 + (i/(Marc-1))*Math.PI*2/3; const spd=110*pow; parts.push({x,y,vx:Math.cos(t)*spd*0.8, vy:Math.sin(t)*spd*0.8, life:1.2, born:performance.now(), color:colorOf((hue+30)%360,i)}) }
        // eyes
        for(let e=-1;e<=1;e+=2){ const ex = e*60; const ey=-40; for(let i=0;i<18;i++){ const ang=i/18*Math.PI*2; const spd=32*pow; parts.push({x:x+ex,y:y+ey,vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd, life:1.0, born:performance.now(), color:colorOf(hue,i)}) } }
      }
      else if(useStyle==='comet'){
        const dir = (Math.random()<0.5? -1:1) * (Math.PI/3)
        for(let i=0;i<N;i++){
          const ang = dir + (Math.random()-0.5)*Math.PI/6
          const spd = (220 + Math.random()*240)*pow
          parts.push({x,y,vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd, life:0.9, born:performance.now(), color:colorOf(hue,i)})
        }
      }
    }
    function fireAt(x:number,y:number){
      const pow = powerRef.current / 100
      rockets.push({x, y:SKY_H, vx:(Math.random()*2-1)*24, vy:-90*pow, explodeY:y, exploded:false})
    }
    function onClick(e:MouseEvent){ fireAt(e.offsetX, e.offsetY) }
    function onDown(e:MouseEvent){ const go=()=>fireAt(e.offsetX, e.offsetY); go(); holdTimer.current = window.setInterval(go, 180) as any }
    function onUp(){ if(holdTimer.current){ clearInterval(holdTimer.current); holdTimer.current=undefined } }

    cvs.addEventListener('click', onClick)
    cvs.addEventListener('mousedown', onDown)
    addEventListener('mouseup', onUp)

    // autoplay random rockets near top area
    function startAuto(){ if(fireTimer.current) return; fireTimer.current = window.setInterval(()=>{
      if(!autoplay) return
      const x = Math.random()*rect.width
      const y = 80 + Math.random()*200
      fireAt(x,y)
    }, 550) as any }
    function stopAuto(){ if(fireTimer.current){ clearInterval(fireTimer.current); fireTimer.current=undefined } }
    if(autoplay) startAuto(); else stopAuto()

    // keyboard shortcuts
    const onKey = (e:KeyboardEvent)=>{
      if(e.key==='1') setStyle('ring')
      else if(e.key==='2') setStyle('heart')
      else if(e.key==='3') setStyle('chrys')
      else if(e.key==='4') setStyle('fountain')
      else if(e.key.toLowerCase()==='a') setAutoplay(a=>!a)
      else if(e.key.toLowerCase()==='r') setRandomStyle(r=>!r)
    }
    addEventListener('keydown', onKey)

    return ()=>{
      cancelAnimationFrame(raf.current);
      cvs.removeEventListener('click', onClick);
      cvs.removeEventListener('mousedown', onDown);
      removeEventListener('mouseup', onUp);
      removeEventListener('resize', fit);
      removeEventListener('keydown', onKey);
      stopAuto();
      if(showTimerId.current){ clearInterval(showTimerId.current); showTimerId.current=undefined }
      if(styleCycleId.current){ clearInterval(styleCycleId.current); styleCycleId.current=undefined }
      if(rainTimer.current){ clearInterval(rainTimer.current); rainTimer.current=undefined }
    }
  }, [style, autoplay, randomStyle])

  function startShow(durationSec:number=30){
    showTimer.current = durationSec
    setShowTimeLeft(durationSec)
    setAutoplay(true)
    setRandomStyle(true)
    if(showTimerId.current) clearInterval(showTimerId.current)
    showTimerId.current = window.setInterval(()=>{
      showTimer.current -= 1
      setShowTimeLeft(Math.max(0, showTimer.current))
      if(showTimer.current<=0){
        stopShow()
        // Finale: launch multiple rockets across the stage
        const rect = ref.current?.getBoundingClientRect()
        const w = rect ? rect.width : 600
        const lanes = 8
        const top = 100
        for(let i=0;i<lanes;i++){
          const x = ((i+1)/(lanes+1)) * w
          const y = top + Math.random()*200
          rockets.push({ x, y: SKY_H, vx:(Math.random()*2-1)*24, vy:-100, explodeY:y, exploded:false })
        }
      }
    }, 1000) as any
    if(styleCycleId.current) clearInterval(styleCycleId.current)
    const pool = ['ring','heart','chrys','fountain','star','spiral','butterfly','double','smile','comet'] as const
    styleCycleId.current = window.setInterval(()=>{
      setStyle(pool[Math.floor(Math.random()*pool.length)] as any)
      const base = densityRef.current
      const jitter = Math.max(60, Math.min(260, base + (Math.random()*80 - 40)))
      densityRef.current = jitter
      setDensity(jitter)
    }, 1400) as any
  }
  function stopShow(){
    setAutoplay(false)
    setRandomStyle(false)
    if(showTimerId.current){ clearInterval(showTimerId.current); showTimerId.current=undefined }
    if(styleCycleId.current){ clearInterval(styleCycleId.current); styleCycleId.current=undefined }
    setShowTimeLeft(0)
  }

  function fireRain(seconds:number=5, rateMs:number=140){
    if(rainTimer.current) return
    const endAt = performance.now() + seconds*1000
    rainTimer.current = window.setInterval(()=>{
      if(performance.now()>endAt){ clearInterval(rainTimer.current!); rainTimer.current=undefined; return }
      const rect = ref.current?.getBoundingClientRect()
      const w = rect? rect.width : 600
      const x = Math.random()* w
      const y = 100 + Math.random()* (SKY_H*0.5)
      rockets.push({x, y:SKY_H, vx:(Math.random()*2-1)*28, vy:-100, explodeY:y, exploded:false})
    }, rateMs) as any
  }

  return (
    <div className="container">
      <h1>🎆 放烟花</h1>
      <p className="desc">点击发射，按住连发。数字键1~4 快切常用样式（环/心/菊/泉），A 开自动，R 开随机。可调：密度/重力/风向/强度；玩法：落地反弹、烟花雨5s、烟花秀30s。</p>
      <div style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:8}}>
        <span style={{opacity:.75}}>样式：</span>
        {(['ring','heart','chrys','fountain','star','spiral'] as const).map(s=> (
          <button key={s} className={`btn ${style===s?'primary':'secondary'}`} onClick={()=>setStyle(s)}>{LABELS[s]}</button>
        ))}
        <div style={{width:1, height:22}}/>
        {(['butterfly','double','smile','comet'] as const).map(s=> (
          <button key={s} className={`btn ${style===s?'primary':'secondary'}`} onClick={()=>setStyle(s)}>{LABELS[s]}</button>
        ))}
        <span style={{opacity:.75, marginLeft:8}}>密度：</span>
        <input type="range" min={60} max={260} step={10} value={density}
               onChange={e=>{ const v = Number(e.currentTarget.value); setDensity(v); densityRef.current = v }}
               style={{verticalAlign:'middle'}}/>
        <span className="badge">{density}</span>
        <span style={{opacity:.75, marginLeft:8}}>重力：</span>
        <input type="range" min={0} max={120} step={5} value={gravityUI}
               onChange={e=>{ const v=Number(e.currentTarget.value); setGravityUI(v); gravityRef.current=v }} />
        <span className="badge">{gravityUI}</span>
        <span style={{opacity:.75, marginLeft:8}}>风向：</span>
        <input type="range" min={-80} max={80} step={5} value={windUI}
               onChange={e=>{ const v=Number(e.currentTarget.value); setWindUI(v); windRef.current=v }} />
        <span className="badge">{windUI}</span>
        <span style={{opacity:.75, marginLeft:8}}>强度：</span>
        <input type="range" min={60} max={160} step={5} value={powerUI}
               onChange={e=>{ const v=Number(e.currentTarget.value); setPowerUI(v); powerRef.current=v }} />
        <span className="badge">{powerUI}</span>
        <span style={{opacity:.75, marginLeft:8}}>玩法：</span>
        <button className={`btn ${autoplay?'primary':'ghost'}`} onClick={()=>setAutoplay(a=>!a)}>{autoplay?'自动开':'自动关'}</button>
        <button className={`btn ${randomStyle?'primary':'ghost'}`} onClick={()=>setRandomStyle(r=>!r)}>{randomStyle?'随机样式✓':'随机样式'}</button>
        <button className={`btn ${bounce?'primary':'ghost'}`} onClick={()=>setBounce(b=>!b)}>{bounce?'落地反弹✓':'落地反弹'}</button>
        <button className="btn secondary" onClick={()=>fireRain(5, 120)}>烟花雨5s</button>
        {/* 文字烟花输入和按钮已移除 */}
        <button className="btn primary" onClick={()=>startShow(30)}>烟花秀30s</button>
        {showTimeLeft>0 && <span className="badge" style={{marginLeft:4}}>倒计时 {showTimeLeft}s</span>}
        <button className="btn ghost" onClick={()=>{ parts.length=0; rockets.length=0 }}>清屏</button>
      </div>
      <div className="stage" style={{height:SKY_H}}>
        <canvas ref={ref} style={{width:'100%', height:'100%'}}/>
      </div>
      <div style={{marginTop:12}}><a className="btn ghost" href="/">返回首页</a></div>
      {/* 浮动控制面板（保证在页面任何布局下都可见） */}
      <div style={{position:'fixed', right:12, bottom:12, zIndex:9999, width: panelOpen? 300: 140, background:'rgba(0,0,0,0.55)', color:'#fff', backdropFilter:'blur(6px)', border:'1px solid rgba(255,255,255,.15)', borderRadius:12, boxShadow:'0 6px 20px rgba(0,0,0,.25)'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 10px', borderBottom:'1px solid rgba(255,255,255,.12)'}}>
          <strong style={{fontSize:13, opacity:.95}}>⚙️ 控制面板</strong>
          <button className="btn ghost" style={{padding:'2px 8px'}} onClick={()=>setPanelOpen(o=>!o)}>{panelOpen?'收起':'展开'}</button>
        </div>
        {panelOpen && (
          <div style={{padding:10, display:'grid', gridTemplateColumns:'72px 1fr auto', rowGap:8, columnGap:8, fontSize:12}}>
            <span style={{opacity:.8}}>密度</span>
            <input type="range" min={60} max={260} step={10} value={density} onChange={e=>{ const v=Number(e.currentTarget.value); setDensity(v); densityRef.current=v }} />
            <span style={{alignSelf:'center'}} className="badge">{density}</span>
            <span style={{opacity:.8}}>重力</span>
            <input type="range" min={0} max={120} step={5} value={gravityUI} onChange={e=>{ const v=Number(e.currentTarget.value); setGravityUI(v); gravityRef.current=v }} />
            <span style={{alignSelf:'center'}} className="badge">{gravityUI}</span>
            <span style={{opacity:.8}}>风向</span>
            <input type="range" min={-80} max={80} step={5} value={windUI} onChange={e=>{ const v=Number(e.currentTarget.value); setWindUI(v); windRef.current=v }} />
            <span style={{alignSelf:'center'}} className="badge">{windUI}</span>
            <span style={{opacity:.8}}>强度</span>
            <input type="range" min={60} max={160} step={5} value={powerUI} onChange={e=>{ const v=Number(e.currentTarget.value); setPowerUI(v); powerRef.current=v }} />
            <span style={{alignSelf:'center'}} className="badge">{powerUI}</span>
            <span style={{opacity:.8}}>玩法</span>
            <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
              <button className={`btn ${autoplay?'primary':'ghost'}`} onClick={()=>setAutoplay(a=>!a)}>{autoplay?'自动开':'自动关'}</button>
              <button className={`btn ${randomStyle?'primary':'ghost'}`} onClick={()=>setRandomStyle(r=>!r)}>{randomStyle?'随机✓':'随机'}</button>
              <button className={`btn ${bounce?'primary':'ghost'}`} onClick={()=>setBounce(b=>!b)}>{bounce?'反弹✓':'反弹'}</button>
              <button className="btn secondary" onClick={()=>fireRain(5,120)}>烟花雨</button>
              <button className="btn primary" onClick={()=>startShow(30)}>秀30s</button>
              {showTimeLeft>0 && <span className="badge">{showTimeLeft}s</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
