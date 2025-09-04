import React, { useEffect, useMemo, useRef, useState } from 'react'
import '../styles.css'

// ===== Types =====
interface Star { x: number; y: number; r: number; a: number; vx: number; vy: number; life: number; maxLife: number }
type Mode = 'classic' | 'timed' | 'limited' | 'combo'

export default function Stars(){
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const spawnRef = useRef<number | null>(null)
  const resizeObs = useRef<ResizeObserver | null>(null)
  const stars = useRef<Star[]>([])

  // ===== Gameplay states =====
  const [mode, setMode] = useState<Mode>('classic')
  const [score, setScore] = useState(0)
  const [paused, setPaused] = useState(false)
  const [over, setOver] = useState(false)
  const [started, setStarted] = useState(false)

  // Sound
  const [sfxOn, setSfxOn] = useState(true)
  const acRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)
  function ensureAC(){
    if(!acRef.current){
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext
      if(!AC) return null
      const ac = new AC()
      acRef.current = ac
      const g = ac.createGain()
      g.gain.value = 0.35
      g.connect(ac.destination)
      masterRef.current = g
    }
    return acRef.current
  }
  async function sfxResume(){ try{ const ac = ensureAC(); if(ac && ac.state==='suspended'){ await ac.resume() } }catch{} }
  function sfxHit(){ if(!sfxOn) return; const ac = ensureAC(); if(!ac || !masterRef.current) return; const t = ac.currentTime; const o = ac.createOscillator(); const g = ac.createGain(); o.type='sine'; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(220, t+0.09); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.8, t+0.01); g.gain.exponentialRampToValueAtTime(0.0001, t+0.12); o.connect(g); g.connect(masterRef.current as GainNode); o.start(t); o.stop(t+0.14) }

  // Timers / counters per mode
  const [timeLeft, setTimeLeft] = useState(60) // for timed
  const [movesLeft, setMovesLeft] = useState(30) // for limited
  const [combo, setCombo] = useState(0) // for combo mode visual
  const lastHitAt = useRef<number>(0)

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1

  // ===== Helpers =====
  function rand(min:number,max:number){ return Math.random()*(max-min)+min }
  function spawnStar(cvs: HTMLCanvasElement){
    const r = rand(10, 20)
    const margin = 10
    const x = rand(margin, cvs.width - margin)
    const y = rand(margin, cvs.height - margin)
    const vx = rand(-0.25, 0.25)
    const vy = rand(-0.25, 0.25)
    const life = 0
    const maxLife = rand(1200, 3000)
    stars.current.push({ x, y, r, a: 1, vx, vy, life, maxLife })
    if (stars.current.length > 70) stars.current.shift()
  }

  function draw(){
    const cvs = canvasRef.current!
    const ctx = cvs.getContext('2d')!

    // background (darker slate gradient for better contrast)
    const g = ctx.createLinearGradient(0,0,0,cvs.height)
    g.addColorStop(0, '#0b1220')
    g.addColorStop(1, '#0a0f1d')
    ctx.fillStyle = g
    ctx.fillRect(0,0,cvs.width,cvs.height)

    // update & draw stars
    const now = performance.now()
    for(let i=stars.current.length-1;i>=0;i--){
      const s = stars.current[i]
      s.x += s.vx
      s.y += s.vy
      s.life += 16
      // fade out near end of life
      s.a = Math.max(0, 1 - s.life / s.maxLife)
      if (s.life >= s.maxLife) { stars.current.splice(i,1); continue }

      // border bounce
      if (s.x < s.r) { s.x = s.r; s.vx *= -1 }
      if (s.y < s.r) { s.y = s.r; s.vy *= -1 }
      if (s.x > cvs.width - s.r) { s.x = cvs.width - s.r; s.vx *= -1 }
      if (s.y > cvs.height - s.r) { s.y = cvs.height - s.r; s.vy *= -1 }

      ctx.save()
      // Keep a minimum visibility even when fading
      ctx.globalAlpha = Math.max(0.65, s.a)

      // Outer halo (slightly larger than r)
      const haloR = s.r * 1.6
      const halo = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, haloR)
      halo.addColorStop(0, 'rgba(255,255,255,.30)')
      halo.addColorStop(1, 'rgba(245,158,11,.75)') // amber-500
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.arc(s.x, s.y, haloR, 0, Math.PI*2)
      ctx.fill()

      // Solid bright core
      ctx.globalAlpha = 0.95
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r * 0.55, 0, Math.PI*2)
      ctx.fill()

      // Accent ring for crisp edge
      ctx.globalAlpha = 0.9
      ctx.strokeStyle = 'rgba(255,255,255,.65)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, Math.PI*2)
      ctx.stroke()

      ctx.restore()
    }
  }

  function startSpawn(){
    const cvs = canvasRef.current!
    // spawn interval depends on mode
    const interval = mode==='classic' ? 900 : mode==='timed' ? 700 : mode==='limited' ? 800 : 650
    spawnRef.current = window.setInterval(()=> spawnStar(cvs), interval)
  }
  function stopSpawn(){ if (spawnRef.current!=null){ clearInterval(spawnRef.current); spawnRef.current=null } }

  function gameReset(){
    stopSpawn()
    stars.current = []
    setScore(0)
    setPaused(false)
    setOver(false)
    setStarted(false)
    setCombo(0)
    setTimeLeft(60)
    setMovesLeft(30)
    // spawn a few initially
    const cvs = canvasRef.current
    if (cvs) for(let i=0;i<6;i++) spawnStar(cvs)
  }

  // ===== Effects: canvas size & loop =====
  useEffect(()=>{
    const stage = stageRef.current!
    const cvs = canvasRef.current!
    const ctx = cvs.getContext('2d')!

    const handleResize = ()=>{
      const rect = stage.getBoundingClientRect()
      const w = Math.max(260, rect.width)
      const h = Math.max(220, rect.height)
      cvs.width = Math.floor(w * dpr)
      cvs.height = Math.floor(h * dpr)
      cvs.style.width = w+'px'
      cvs.style.height = h+'px'
      ctx.setTransform(dpr,0,0,dpr,0,0)
    }
    handleResize()

    if (!resizeObs.current){
      resizeObs.current = new ResizeObserver(()=> handleResize())
      resizeObs.current.observe(stage)
      window.addEventListener('resize', handleResize)
    }

    const loop = ()=>{ draw(); rafRef.current = requestAnimationFrame(loop) }
    if (rafRef.current==null) rafRef.current = requestAnimationFrame(loop)

    return ()=>{
      if (rafRef.current!=null){ cancelAnimationFrame(rafRef.current); rafRef.current=null }
      if (resizeObs.current){ resizeObs.current.disconnect(); resizeObs.current=null }
      window.removeEventListener('resize', handleResize)
    }
  }, [dpr])

  // Spawn controller re-run on mode change
  useEffect(()=>{ if (started && !paused && !over){ stopSpawn(); startSpawn() } }, [mode])

  // Timed mode countdown
  useEffect(()=>{
    if (mode!=='timed') return
    if (!started || paused || over) return
    const t = setInterval(()=> setTimeLeft(v=>{
      if (v<=1){ clearInterval(t); setOver(true); stopSpawn() }
      return Math.max(0, v-1)
    }), 1000)
    return ()=> clearInterval(t)
  }, [mode, started, paused, over])

  // ===== Handlers =====
  function begin(){ if (!started){ setStarted(true); stopSpawn(); startSpawn() } }

  function onClickCanvas(e: React.MouseEvent){
    if (paused || over) return
    sfxResume()
    const cvs = canvasRef.current!
    const rect = cvs.getBoundingClientRect()
    const x = (e.clientX - rect.left) * dpr
    const y = (e.clientY - rect.top) * dpr

    // limited moves mode
    if (mode==='limited'){
      setMovesLeft(m=>{
        const next = Math.max(0, m-1)
        if (next===0) { setOver(true); stopSpawn() }
        return next
      })
    }

    let hitIndex = -1
    for(let i=stars.current.length-1;i>=0;i--){
      const s = stars.current[i]
      if (Math.hypot(s.x - x, s.y - y) <= s.r){ hitIndex = i; break }
    }
    if (hitIndex>=0){
      const s = stars.current.splice(hitIndex,1)[0]
      sfxHit()
      const base = s.r < 9 ? 3 : s.r < 12 ? 2 : 1 // smaller = harder = more score
      let mult = 1
      if (mode==='combo'){
        const now = performance.now()
        if (now - lastHitAt.current <= 800){ setCombo(c=>Math.min(5,c+1)); mult = Math.min(5, combo+1) }
        else { setCombo(1); mult = 1 }
        lastHitAt.current = now
      }
      setScore(sc => sc + base * mult)
    }else{
      if (mode==='combo') setCombo(0)
    }
    begin()
  }

  function togglePause(){ if (over) return; setPaused(p=>!p) }
  function reset(){ gameReset(); begin() }

  // Best score per mode
  const bestKey = useMemo(()=> `stars_best_${mode}`, [mode])
  const [best, setBest] = useState<number | null>(null)
  useEffect(()=>{ const v = localStorage.getItem(bestKey); setBest(v? Number(v): null) }, [bestKey])
  useEffect(()=>{ if (over){ if (best==null || score>best){ localStorage.setItem(bestKey, String(score)); setBest(score) } } }, [over])

  // Auto reset on mode change
  useEffect(()=>{ gameReset() }, [mode])

  return (
    <div className="page-wrap">
      <div className="shell">
        <header className="page-header compact">
          <h1 className="title">✨ 点点星星</h1>
          <p className="subtitle">点击漂浮与渐隐的星星来得分。支持 <b>经典</b> / <b>限时</b> / <b>限步</b> / <b>连击</b> 四种玩法。</p>

          <div className="modes">
            <span className="sec-title">模式</span>
            <button className={`mode-btn ${mode==='classic'?'on':''}`} onClick={()=> setMode('classic')}>经典</button>
            <button className={`mode-btn ${mode==='timed'?'on':''}`} onClick={()=> setMode('timed')}>限时 60s</button>
            <button className={`mode-btn ${mode==='limited'?'on':''}`} onClick={()=> setMode('limited')}>限步 30</button>
            <button className="mode-btn" onClick={togglePause}>{paused? '继续':'暂停'}</button>
            <button className="mode-btn" onClick={reset}>重开</button>
            <button className={`mode-btn ${mode==='combo'?'on':''}`} onClick={()=> setMode('combo')}>连击</button>
          </div>

          <div className="stats unified">
            <div className="chip"><div className="label">得分</div><div className="value">{score}</div></div>
            {mode==='timed' && <div className="chip"><div className="label">剩余时间</div><div className="value">{timeLeft}s</div></div>}
            {mode==='limited' && <div className="chip"><div className="label">剩余步数</div><div className="value">{movesLeft}</div></div>}
            {mode==='combo' && <div className="chip"><div className="label">连击</div><div className="value">×{Math.max(1, combo)}</div></div>}
            <div className="chip"><div className="label">历史最佳</div><div className="value">{best ?? '-'}</div></div>
          </div>
        </header>

        <main className="board-card">
          <div ref={stageRef} className="stage" style={{ width:'100%', height: 'clamp(300px, 56vh, 560px)', margin:0 }}>
            <canvas ref={canvasRef} onClick={onClickCanvas} />
          </div>
          <div className="help">提示：小星星分数更高；连击模式中 0.8 秒内连续命中会提升倍率。</div>

          {paused && !over && (
            <div className="overlay"><div className="panel">
              <div className="result-title">暂停中</div>
              <div className="result-sub">随时继续或重开一局</div>
              <div className="overlay-actions">
                <button className="btn primary" onClick={togglePause}>继续</button>
                <button className="btn secondary" onClick={reset}>重开</button>
                <a className="btn secondary" href="/">返回首页</a>
              </div>
            </div></div>
          )}

          {over && (
            <div className="overlay"><div className="panel">
              <div className="result-title">本局结束</div>
              <div className="result-sub">本局得分 {score}{best!=null && score>=best && ' · 新纪录！'}</div>
              <div className="overlay-actions">
                <button className="btn primary" onClick={reset}>再来一局</button>
                <a className="btn secondary" href="/">返回首页</a>
              </div>
            </div></div>
          )}
        </main>

        <div className="bottom-bar">
          <div className="actions">
            <button className="btn primary" onClick={reset}>再来一局</button>
            <a className="btn secondary" href="/">返回首页</a>
            <button className="btn secondary" onClick={()=>{ setSfxOn(v=>!v); sfxResume() }}>音效：{sfxOn?'开':'关'}</button>
          </div>
          <div className="help">点击画布内的星星即可得分；移动端同样支持点按。</div>
        </div>
      </div>

      {/* Scoped styles aligned with site theme */}
      <style>{`
        .page-wrap{ min-height:100vh; display:flex; align-items:flex-start; justify-content:center; padding:16px 24px 24px; background:radial-gradient(1000px 600px at 20% 0%,#eef2f7,#e2e8f0); }
        .shell{ width:min(100%,980px); display:grid; grid-template-columns: 1fr; gap:16px; }
        .page-header.compact{ width:100%; margin:0 0 10px; }
        .page-header .title{ font-size:clamp(24px,3.2vw,34px); margin:0; letter-spacing:.2px; }
        .page-header .subtitle{ font-size:14px; color:#475569; margin:6px 0 10px; }
        .modes{ display:flex; gap:8px; margin:6px 0 8px; flex-wrap:wrap; align-items:center; }
        .mode-btn{ appearance:none; border:1px solid #e2e8f0; background:#fff; border-radius:10px; padding:8px 10px; font-weight:700; cursor:pointer; }
        .mode-btn.on{ background:#0ea5e9; color:#062a37; border-color:#0ea5e9; box-shadow: 0 6px 14px rgba(14,165,233,.25); }
        .mode-btn:hover{ background:#f8fafc; }
        .mode-btn:active{ transform:translateY(1px); }
        .sec-title{ font-size:12px; font-weight:800; color:#0f172a; }

        .board-card{ background: linear-gradient(135deg,#0f172a,#0b1220); border-radius: 18px; box-shadow: 0 14px 28px rgba(2,6,23,.35); padding: 12px; position:relative; overflow:hidden; width:100%; }
        .board-card::before{ content:""; position:absolute; inset:10px; border-radius:14px; box-shadow: inset 0 0 0 1px rgba(51,65,85,.55), inset 0 -24px 48px rgba(2,6,23,.22); pointer-events:none; }

        .stats{ display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin:10px 0 14px; }
        .chip{ flex:0 0 auto; min-width:140px; background:#dde6ef; color:#0b1220; border-radius:12px; padding:10px 12px; box-shadow: inset 0 -2px 0 rgba(255,255,255,.04); }
        .chip .label{ font-size:12px; opacity:.8; }
        .chip .value{ font-size:20px; font-weight:800; line-height:1.1; }

        .help{ color:#8a9bb2; font-size:12px; margin-top:6px; text-align:center; }

        .bottom-bar{ background: linear-gradient(135deg,#ffffff,#f8fafc); border:1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; display:flex; align-items:center; justify-content:space-between; box-shadow: 0 12px 26px rgba(2,6,23,.10); }
        @media (max-width: 640px){ .bottom-bar{ flex-direction:column; gap:8px; align-items:stretch; text-align:center; } .bottom-bar .actions{ justify-content:center; } }
        .bottom-bar .actions{ display:flex; gap:12px; }

        .overlay{ position:absolute; inset:0; background:rgba(15,23,42,.22); display:flex; align-items:center; justify-content:center; border-radius:16px; backdrop-filter:saturate(120%) blur(1.2px); pointer-events:none; }
        .panel{ background:linear-gradient(135deg, rgba(255,255,255,.92), rgba(248,250,252,.90)); border:1px solid rgba(226,232,240,.9); border-radius:14px; padding:16px; width:min(92%, 360px); text-align:center; box-shadow:0 20px 40px rgba(2,6,23,.25); pointer-events:auto; }
        .result-title{ font-size:20px; font-weight:800; color:#0f172a; margin-bottom:6px; }
        .result-sub{ color:#475569; font-size:13px; margin-bottom:12px; }
        .overlay-actions{ display:flex; gap:10px; justify-content:center; }
      `}</style>
    </div>
  )
}
