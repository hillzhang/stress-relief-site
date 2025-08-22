import React, { useEffect, useRef, useState } from 'react'
import '../styles.css'

type Particle = { x:number,y:number,vx:number,vy:number,life:number,age:number }

export default function Spinner(){
  const ref = useRef<HTMLCanvasElement|null>(null)
  const raf = useRef(0)
  const angleRef = useRef(0)
  const velRef = useRef(0)          // angular velocity (rad/s)
  const lastAngleRef = useRef<number|null>(null)
  const draggingRef = useRef(false)
  const rectRef = useRef({left:0,top:0,width:0,height:0})
  const [rpm, setRPM] = useState(0)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)
  const [timeLeft, setTimeLeft] = useState(30)
  const [running, setRunning] = useState(true)
  const [muted, setMuted] = useState(false)
  const particlesRef = useRef<Particle[]>([])
  const audioCtxRef = useRef<AudioContext|null>(null)

  // audio
  function ensureCtx(){
    if(!audioCtxRef.current){
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
      if(Ctx) audioCtxRef.current = new Ctx({latencyHint:'interactive'})
    }
    return audioCtxRef.current
  }
  function tickSound(speed:number){
    if(muted) return
    const ctx = ensureCtx(); if(!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(400 + Math.min(600, speed*40), now)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.25, now+0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now+0.10)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now); osc.stop(now+0.12)
  }

  useEffect(()=>{
    const cvs = ref.current!
    const ctx = cvs.getContext('2d')!
    let DPR = window.devicePixelRatio || 1
    function fit(){
      const r = cvs.getBoundingClientRect()
      rectRef.current = {left:r.left,top:r.top,width:r.width,height:r.height}
      DPR = window.devicePixelRatio || 1
      cvs.width = r.width*DPR
      cvs.height = 440*DPR
      ctx.setTransform(DPR,0,0,DPR,0,0)
    }
    cvs.style.width='100%'; cvs.style.height='440px'
    ;(cvs as any).style.touchAction='none'
    fit(); window.addEventListener('resize', fit)

    let last = performance.now()
    let tickAcc = 0
    function draw(now:number){
      const dt = Math.min(0.033, (now-last)/1000)
      last = now

      // physics
      const friction = running ? 0.985 : 0.98
      velRef.current *= Math.pow(friction, dt*60)
      // clamp
      const maxVel = 35   // rad/s ≈ 334 RPM
      if(velRef.current >  maxVel) velRef.current =  maxVel
      if(velRef.current < -maxVel) velRef.current = -maxVel
      angleRef.current += velRef.current*dt

      // score & ui timers
      const curRPM = Math.abs(velRef.current) * 60 / (2*Math.PI)
      setRPM(Math.round(curRPM))
      if(running){
        setScore(s => s + Math.floor(curRPM*dt))
        tickAcc += dt
        if(tickAcc>0.2 && curRPM>60){ tickAcc=0; tickSound(curRPM) }
      }

      // time
      if(running){
        setTimeLeft(t=>{
          const n = Math.max(0, t - dt)
          if(t>0 && n===0){
            setRunning(false)
            setBest(b=>Math.max(b, score))
          }
          return n
        })
      }

      // clear
      ctx.clearRect(0,0,cvs.width, cvs.height)

      // draw spinner
      const cx = rectRef.current.width/2, cy = 220
      drawSpinner(ctx, cx, cy, angleRef.current, curRPM)

      // particles (speed trail)
      emitParticles(cx, cy, curRPM, particlesRef.current)
      updateParticles(ctx, particlesRef.current, dt)

      // HUD
      drawHUD(ctx, curRPM, score, best, timeLeft, running, muted)

      raf.current = requestAnimationFrame(draw)
    }
    raf.current = requestAnimationFrame(draw)

    // pointer controls
    function angleFromPointer(clientX:number, clientY:number){
      const r = rectRef.current
      const x = clientX - r.left - r.width/2
      const y = clientY - r.top  - 220
      return Math.atan2(y,x)
    }
    function down(e:PointerEvent){
      (ensureCtx() as any)?.resume?.()
      draggingRef.current = true
      lastAngleRef.current = angleFromPointer(e.clientX, e.clientY)
    }
    function move(e:PointerEvent){
      if(!draggingRef.current) return
      const a = angleFromPointer(e.clientX, e.clientY)
      const la = lastAngleRef.current
      if(la!=null){
        let da = a - la
        // wrap to [-PI, PI]
        if(da> Math.PI) da -= Math.PI*2
        if(da<-Math.PI) da += Math.PI*2
        // instantaneous velocity boost
        const dt = 1/60
        velRef.current += da/dt * 0.22
      }
      lastAngleRef.current = a
    }
    function up(){
      draggingRef.current = false
      lastAngleRef.current = null
    }
    window.addEventListener('pointerdown', down as any)
    window.addEventListener('pointermove', move as any)
    window.addEventListener('pointerup', up as any)
    window.addEventListener('pointercancel', up as any)

    return ()=> {
      cancelAnimationFrame(raf.current)
      window.removeEventListener('resize', fit)
      window.removeEventListener('pointerdown', down as any)
      window.removeEventListener('pointermove', move as any)
      window.removeEventListener('pointerup', up as any)
      window.removeEventListener('pointercancel', up as any)
    }
  }, [running, score, muted])

  function restart(){
    setScore(0); setTimeLeft(30); setRunning(true); setRPM(0)
    angleRef.current = 0; velRef.current = 0
    particlesRef.current = []
  }

  return (
    <div className="container">
      <h1>🌀 指尖陀螺</h1>
      <p className="desc">沿圆周快速划过让它旋转 · 30 秒内冲高分！</p>
      <div className="card" style={{padding:16}}>
        <div style={{display:'flex',gap:8,justifyContent:'space-between',marginBottom:8}}>
          <div className="btn ghost" onClick={restart}>重新开始</div>
          <div className="btn ghost" onClick={()=>setMuted(v=>!v)}>{muted?'已静音':'有音效'}</div>
        </div>
        <canvas ref={ref} />
      </div>
      <div style={{opacity:.7,fontSize:12,marginTop:6,marginBottom:12}}>Tip：从圆心外沿着圆周方向快速划，瞬间提速更猛。</div>
      <div style={{marginTop:12}}>
        <a href="/" className="btn ghost">← 返回首页</a>
      </div>
    </div>
  )
}

// ------- drawing helpers -------
function drawSpinner(ctx:CanvasRenderingContext2D, cx:number, cy:number, angle:number, rpm:number){
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)

  const base = 64
  // hub
  const grd = ctx.createRadialGradient(0,0,6, 0,0,28)
  grd.addColorStop(0,'#fff')
  grd.addColorStop(1,'#cbd5e1')
  ctx.fillStyle = grd
  ctx.beginPath()
  ctx.arc(0,0,28,0,Math.PI*2)
  ctx.fill()

  // arms (3-lobed)
  for(let i=0;i<3;i++){
    ctx.save()
    ctx.rotate(i* (Math.PI*2/3))
    const g = ctx.createLinearGradient(0,-base, 0,-base-80)
    const c1 = i===0? '#60a5fa' : i===1? '#f472b6' : '#34d399'
    const c2 = i===0? '#2563eb' : i===1? '#db2777' : '#059669'
    g.addColorStop(0,c1); g.addColorStop(1,c2)
    ctx.fillStyle = g
    roundRect(ctx, 18, -base-80, 36, 80, 18); ctx.fill()
    // tip weight
    const tgrd = ctx.createRadialGradient(0,-base-116,4, 0,-base-116,16)
    tgrd.addColorStop(0,'#e5e7eb'); tgrd.addColorStop(1,'#94a3b8')
    ctx.fillStyle = tgrd
    ctx.beginPath(); ctx.arc(0,-base-116,16,0,Math.PI*2); ctx.fill()
    ctx.restore()
  }

  // subtle glow when fast
  const speed = rpm
  if(speed>120){
    ctx.globalAlpha = Math.min(0.6, (speed-120)/200)
    ctx.strokeStyle = 'rgba(59,130,246,.6)'
    ctx.lineWidth = 18
    ctx.beginPath(); ctx.arc(0,0, base+30, 0, Math.PI*2); ctx.stroke()
    ctx.globalAlpha = 1
  }

  ctx.restore()
}

function roundRect(ctx:CanvasRenderingContext2D, x:number,y:number,w:number,h:number,r:number){
  ctx.beginPath()
  ctx.moveTo(x+r,y)
  ctx.arcTo(x+w,y,x+w,y+h,r)
  ctx.arcTo(x+w,y+h,x,y+h,r)
  ctx.arcTo(x,y+h,x,y,r)
  ctx.arcTo(x,y,x+w,y,r)
  ctx.closePath()
}

function emitParticles(cx:number, cy:number, rpm:number, arr:Particle[]){
  if(rpm<100) return
  const n = Math.min(12, Math.floor((rpm-100)/20))
  for(let i=0;i<n;i++){
    const a = Math.random()*Math.PI*2
    arr.push({
      x: cx + Math.cos(a)*90,
      y: cy + Math.sin(a)*90,
      vx: Math.cos(a)*40 + (Math.random()*40-20),
      vy: Math.sin(a)*40 + (Math.random()*40-20),
      life: .6, age: 0
    })
  }
}

function updateParticles(ctx:CanvasRenderingContext2D, arr:Particle[], dt:number){
  for(let i=arr.length-1;i>=0;i--){
    const p = arr[i]
    p.age += dt
    p.vy += 20*dt
    p.x += p.vx*dt; p.y += p.vy*dt
    const a = 1 - p.age/p.life
    if(a<=0){ arr.splice(i,1); continue }
    ctx.globalAlpha = Math.max(0, Math.min(1, a))
    ctx.fillStyle = 'rgba(148,163,184,.9)'
    ctx.beginPath(); ctx.arc(p.x,p.y,2.2,0,Math.PI*2); ctx.fill()
    ctx.globalAlpha = 1
  }
}

function drawHUD(
  ctx:CanvasRenderingContext2D,
  rpm:number, score:number, best:number, timeLeft:number, running:boolean, muted:boolean
){
  // panel
  ctx.fillStyle='rgba(255,255,255,.92)'
  if((ctx as any).roundRect){ (ctx as any).roundRect(10,10,260,52,14); ctx.fill() } else { ctx.fillRect(10,10,260,52) }
  ctx.fillStyle='#111'; ctx.font='600 14px system-ui, -apple-system, Roboto, Segoe UI'
  ctx.fillText(`RPM：${Math.round(rpm)}`, 20, 28)
  ctx.fillText(`得分：${score}`, 120, 28)
  ctx.fillText(`最佳：${best}`, 200, 28)

  // timer
  ctx.fillStyle='rgba(15,23,42,.85)'; ctx.beginPath()
  ctx.roundRect ? (ctx as any).roundRect(10,68,120,28,12) : ctx.fillRect(10,68,120,28)
  ctx.fill()
  ctx.fillStyle='#fff'; ctx.font='700 14px system-ui'
  ctx.fillText(`剩余：${Math.ceil(timeLeft)}s`, 20, 87)

  // mute badge
  ctx.fillStyle='rgba(15,23,42,.08)'; ctx.beginPath()
  ctx.roundRect ? (ctx as any).roundRect(140,68,60,28,12) : ctx.fillRect(140,68,60,28)
  ctx.fill()
  ctx.fillStyle='#111'; ctx.fillText(muted?'静音🔇':'音效🔊', 150, 87)

  // game over overlay
  if(!running && timeLeft===0){
    const W = (ctx.canvas as HTMLCanvasElement).width / (window.devicePixelRatio||1)
    const H = (ctx.canvas as HTMLCanvasElement).height/ (window.devicePixelRatio||1)
    ctx.fillStyle='rgba(2,6,23,.55)'; ctx.fillRect(0,0,W,H)
    ctx.fillStyle='#fff'; ctx.font='bold 28px system-ui'
    ctx.fillText('时间到！', W/2-64, H/2-20)
    ctx.font='16px system-ui'
    ctx.fillText('点击重新开始', W/2-64, H/2+8)
  }
}
