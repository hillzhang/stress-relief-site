import React, { useEffect, useRef, useState } from 'react'

// --- Simple local persistence helpers ---
const LS = {
  xp: 'incense_xp',
  streak: 'incense_streak',
  last: 'incense_last_date',
  wishLog: 'incense_wishes'
}

function todayKey(){
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`
}

// --- Types ---
type Smoke = {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  life: number // 1..0
  r: number
}

type Stick = {
  burning: boolean
  burn: number // 0..1 progress
  duration: number // seconds to full burn
  startAt: number // performance.now()
}

const DPR = Math.max(1, (typeof window!== 'undefined' ? window.devicePixelRatio : 1) || 1)

// --- Component ---
export default function Incense(){
  const cvsRef = useRef<HTMLCanvasElement|null>(null)
  const rafRef = useRef<number|undefined>()
  const lastRef = useRef(0)
  const smokeId = useRef(1)

  // UI state
  const [wish, setWish] = useState('')
  const [kind, setKind] = useState<'light'|'classic'|'rich'>('classic')
  const [xp, setXp] = useState<number>(()=> Number(localStorage.getItem(LS.xp) || 0))
  const [streak, setStreak] = useState<number>(()=> Number(localStorage.getItem(LS.streak) || 0))
  const [banner, setBanner] = useState<string>('')

  // incense stick runtime
  const stickRef = useRef<Stick>({ burning:false, burn:0, duration:60, startAt:0 })
  const smokesRef = useRef<Smoke[]>([])

  // Sync duration when kind changes
  useEffect(()=>{
    const s = stickRef.current
    s.duration = kind==='light' ? 40 : kind==='rich' ? 90 : 60
  }, [kind])

  // Resize & fit
  function fit(){
    const cvs = cvsRef.current!
    const rect = cvs.getBoundingClientRect()
    const w = Math.max(480, Math.floor(rect.width))
    const h = 560
    cvs.width = Math.floor(w * DPR)
    cvs.height = Math.floor(h * DPR)
    const ctx = cvs.getContext('2d', { alpha:false }) as CanvasRenderingContext2D
    ctx.setTransform(DPR,0,0,DPR,0,0)
  }

  // Start burning
  function start(){
    if(stickRef.current.burning) return
    stickRef.current.burning = true
    stickRef.current.burn = 0
    stickRef.current.startAt = performance.now()
    setBanner('')
  }

  function reset(){
    stickRef.current.burning = false
    stickRef.current.burn = 0
    smokesRef.current = []
    setBanner('')
  }

  // Complete routine: award xp + streak, show banner
  function onComplete(){
    const key = todayKey()
    const last = localStorage.getItem(LS.last)
    let newStreak = streak
    if(last !== key){
      // advance streak if last is yesterday, else reset to 1
      const prev = last ? new Date(last) : null
      const now = new Date()
      const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate()-1)
      if(prev && prev.getFullYear()===yest.getFullYear() && prev.getMonth()===yest.getMonth() && prev.getDate()===yest.getDate()){
        newStreak = streak + 1
      } else {
        newStreak = Math.max(1, streak ? 1 : 1)
      }
      setStreak(newStreak)
      localStorage.setItem(LS.streak, String(newStreak))
      localStorage.setItem(LS.last, key)
    }
    const nxp = xp + 10
    setXp(nxp)
    localStorage.setItem(LS.xp, String(nxp))

    // wish log append
    try{
      const arr = JSON.parse(localStorage.getItem(LS.wishLog) || '[]') as Array<{t:number,w:string}>
      arr.push({ t: Date.now(), w: wish || '(无愿望文本)' })
      localStorage.setItem(LS.wishLog, JSON.stringify(arr.slice(-100)))
    }catch{}

    setBanner(`🎉 上香完成 · 香火值 +10${wish? ' · 『'+wish+'』': ''}`)
    // gentle auto-hide
    setTimeout(()=> setBanner(''), 2600)
  }

  // Draw helpers
  function drawScene(ctx:CanvasRenderingContext2D, w:number, h:number){
    // background gradient
    const bg = ctx.createLinearGradient(0,0,0,h)
    bg.addColorStop(0, '#f3f4f6')
    bg.addColorStop(1, '#e2e8f0')
    ctx.fillStyle = bg
    ctx.fillRect(0,0,w,h)

    // altar table
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, h-120, w, 120)
    const wood = ctx.createLinearGradient(0,h-120,0,h)
    wood.addColorStop(0,'#1f2937')
    wood.addColorStop(1,'#111827')
    ctx.fillStyle = wood
    ctx.fillRect(0,h-118, w, 116)

    // censer (香炉)
    const cx = w/2, cy = h-128
    ctx.save()
    ctx.translate(cx, cy)
    // base
    ctx.fillStyle = '#c4b5fd'
    ctx.beginPath(); ctx.ellipse(0, 98, 120, 28, 0, 0, Math.PI*2); ctx.fill()
    // bowl
    const g = ctx.createLinearGradient(0,-10,0,80)
    g.addColorStop(0,'#ede9fe')
    g.addColorStop(1,'#a78bfa')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.ellipse(0, 40, 110, 60, 0, 0, Math.PI*2); ctx.fill()
    // rim highlight
    ctx.fillStyle='rgba(255,255,255,.7)'
    ctx.beginPath(); ctx.ellipse(0, 0, 112, 16, 0, 0, Math.PI*2); ctx.fill()
    ctx.restore()
  }

  function drawStickAndSmoke(ctx:CanvasRenderingContext2D, w:number, h:number, t:number){
    const baseX = w/2
    const baseY = h-168
    const stickH = 160

    // stick body
    ctx.save()
    ctx.translate(baseX, baseY)
    ctx.fillStyle = '#b45309'
    ctx.fillRect(-2, -stickH, 4, stickH)

    // burning tip position based on progress
    const s = stickRef.current
    const burned = Math.min(1, s.burn)
    const tipY = -stickH + burned*stickH

    // glow ember
    ctx.fillStyle = 'rgba(255, 99, 71, 0.9)'
    ctx.beginPath(); ctx.arc(0, tipY, 3.6, 0, Math.PI*2); ctx.fill()
    ctx.fillStyle = 'rgba(255, 169, 64, 0.35)'
    ctx.beginPath(); ctx.arc(0, tipY, 8, 0, Math.PI*2); ctx.fill()

    // emit smoke every frame while burning
    if(s.burning && burned < 1){
      for(let i=0;i< (kind==='rich'? 3: kind==='classic'? 2: 1); i++){
        smokesRef.current.push({
          id: smokeId.current++,
          x: 0 + (Math.random()*2-1) * 1.5,
          y: tipY - 2,
          vx: (Math.random()*2-1) * 0.18,
          vy: -0.9 - Math.random()*0.35,
          life: 1,
          r: 6 + Math.random()*8
        })
      }
    }

    // update & draw smoke
    const arr = smokesRef.current
    for(let i=arr.length-1;i>=0;i--){
      const p = arr[i]
      // curl drift
      const curl = Math.sin((t*0.002 + p.id*0.13)) * 0.22
      p.vx += curl * 0.02
      p.x += p.vx
      p.y += p.vy
      p.vy += -0.01 // float up (slightly accelerates)
      p.life -= 0.012
      if(p.life <= 0 || p.y < -h){ arr.splice(i,1); continue }
      const alpha = Math.max(0, Math.min(1, p.life))
      const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r)
      grd.addColorStop(0, `rgba(220,230,240,${0.28*alpha})`)
      grd.addColorStop(1, `rgba(220,230,240,0)`)
      ctx.fillStyle = grd
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill()
    }

    ctx.restore()
  }

  // Main loop
  useEffect(()=>{
    const cvs = cvsRef.current!
    fit()
    const ctx = cvs.getContext('2d', { alpha:false }) as CanvasRenderingContext2D

    const step = (now:number)=>{
      const dt = Math.min(0.033, (now - lastRef.current)/1000 || 0)
      lastRef.current = now

      const w = Math.floor(cvs.width / DPR)
      const h = Math.floor(cvs.height / DPR)

      // clear
      ctx.setTransform(DPR,0,0,DPR,0,0)
      drawScene(ctx, w, h)

      // update burning
      const s = stickRef.current
      if(s.burning && s.burn < 1){
        const elapsed = (now - s.startAt)/1000
        s.burn = Math.min(1, elapsed / s.duration)
        if(s.burn >= 1){
          s.burning = false
          onComplete()
        }
      }

      // draw stick + smoke
      drawStickAndSmoke(ctx, w, h, now)

      rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)

    const onResize = ()=> fit()
    window.addEventListener('resize', onResize)
    return ()=>{
      if(rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // --- UI ---
  return (
    <div style={{minHeight:'100vh', display:'grid', alignItems:'start', justifyItems:'center', padding:'32px 0 64px', background:'linear-gradient(180deg,#f8fafc 0%,#eef2f7 100%)'}}>
      <div style={{width:'min(720px,92vw)', background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:16, boxShadow:'0 12px 32px rgba(2,6,23,.12)', padding:16, display:'grid', gap:12}}>
        {/* Top HUD */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12}}>
          <div style={{fontWeight:700, fontSize:18}}>🪷 上香祈愿</div>
          <div style={{opacity:.9, fontSize:14}}>香火值 <b>{xp}</b> · 连签 <b>{streak}</b> 天</div>
        </div>

        {/* Canvas stage */}
        <div style={{borderRadius:12, overflow:'hidden', border:'1px solid #e5e7eb', boxShadow:'0 10px 30px rgba(2,6,23,.08)'}}>
          <canvas ref={cvsRef} style={{width:'100%', height:560, display:'block', background:'#e5e7eb'}} />
        </div>

        {/* Controls */}
        <div style={{display:'grid', gridTemplateColumns:'1fr auto auto', gap:12, alignItems:'center'}}>
          <input
            placeholder="写下你的愿望（可选）"
            value={wish}
            onChange={e=> setWish(e.target.value)}
            maxLength={40}
            style={{height:40, padding:'0 12px', border:'1px solid #e5e7eb', borderRadius:8, outline:'none'}}
          />
          <select value={kind} onChange={e=> setKind(e.target.value as any)} style={{height:40, padding:'0 10px', border:'1px solid #e5e7eb', borderRadius:8}}>
            <option value="light">清香（≈40s）</option>
            <option value="classic">檀香（≈60s）</option>
            <option value="rich">沉香（≈90s）</option>
          </select>
          <div style={{display:'flex', gap:8}}>
            <button onClick={start} style={{height:40, padding:'0 14px', borderRadius:8, border:'1px solid #e5e7eb', background:'#0ea5e9', color:'#fff'}}>点香</button>
            <button onClick={reset} style={{height:40, padding:'0 14px', borderRadius:8, border:'1px solid #e5e7eb', background:'#f9fafb'}}>重置</button>
          </div>
        </div>

        {/* Banner */}
        {banner && (
          <div style={{height:42, display:'grid', placeItems:'center', background:'#fef3c7', border:'1px solid #fde68a', borderRadius:8}}>
            {banner}
          </div>
        )}
      </div>
    </div>
  )
}
