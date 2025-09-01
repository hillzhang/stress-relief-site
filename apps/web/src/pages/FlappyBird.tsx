import React, { useEffect, useMemo, useRef, useState } from 'react'
import '../styles.css'

// ======== Config (by mode) ========
const SIZE = { W: 360, H: 540 }
const PIPE_W = 40
const BIRD_R = 12

const MODES = {
  easy:   { gravity: 0.38, jump: -6.2, pipeGap: 120, pipeSpeed: 1.7, pipeEvery: 90 },
  normal: { gravity: 0.46, jump: -6.8, pipeGap: 100, pipeSpeed: 2.0, pipeEvery: 80 },
  hard:   { gravity: 0.52, jump: -7.2, pipeGap: 88,  pipeSpeed: 2.3, pipeEvery: 72 },
}

export default function FlappyBird(){
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dpr = typeof window!=='undefined' ? Math.min(2, window.devicePixelRatio||1) : 1

  // ===== State =====
  const [mode, setMode] = useState<keyof typeof MODES>('normal')
  const [paused, setPaused] = useState(false)
  const [over, setOver] = useState(false)
  const [started, setStarted] = useState(false)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState<number | null>(null)
  const [soundOn, setSoundOn] = useState(true)

  // ---- Fallback inline styles to match unified game UI ----
  const UI = {
    toolbar: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' as const,
      marginTop: 4, marginBottom: 10,
    },
    modeBtn: {
      padding: '6px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,.08)',
      background: '#0b1220', color: '#e5e7eb', cursor: 'pointer',
    },
    modeBtnOn: {
      background: '#111827', border: '1px solid rgba(255,255,255,.16)', color: '#fff',
    },
    modeBtnSelected: {
      background: '#2563eb', color: '#fff', border: '1px solid #1d4ed8',
    },
    stats: { display: 'flex', gap: 8, flexWrap: 'wrap' as const },
    chip: {
      background: '#0b1220', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12,
      padding: '6px 10px', minWidth: 90,
    },
    chipLabel: { fontSize: 12, color: '#9ca3af' },
    chipValue: { fontWeight: 700, fontSize: 16, color: '#fff' },
  }

  // Derived config
  const CFG = useMemo(()=> MODES[mode], [mode])

  // ===== Game refs =====
  type Pipe = { x:number; top:number; gap:number; passed:boolean }
  const bird = useRef({ x: 84, y: SIZE.H/2, vy: 0 })
  const pipes = useRef<Pipe[]>([])
  const acc = useRef(0)
  const last = useRef<number|null>(null)
  const spawnTick = useRef(0)
  const gameOverAt = useRef<number>(0)
  const audioCtx = useRef<AudioContext | null>(null)

  // --- SFX management ---
  // For buffer-based SFX (if ever used)
  const sfxBuf = useRef<{flap: AudioBuffer|null, score: AudioBuffer|null, hit: AudioBuffer|null}>({flap:null,score:null,hit:null})
  const playedHit = useRef(false)
  // Track currently playing nodes for hard stop/mute (oscillator or buffer source)
  const activeSfx = useRef<Set<{ src: AudioScheduledSourceNode; gain: GainNode }>>(new Set())
  function stopAllSfx(){
    const ctx = audioCtx.current
    for (const n of activeSfx.current){
      try { n.src.onended = null as any; n.src.stop(); } catch {}
      try { n.src.disconnect() } catch {}
      try { n.gain.disconnect() } catch {}
    }
    activeSfx.current.clear()
    // 不关闭 AudioContext（避免后续首帧无声），仅停止当前节点
  }

  // Load best
  useEffect(()=>{ try{ const v=localStorage.getItem('fb_best'); if(v) setBest(parseInt(v)) }catch{} },[])

  function ensureCtx(): boolean {
    if (!audioCtx.current){
      try {
        audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      } catch {}
    }
    const ctx = audioCtx.current
    if (!ctx) return false
    if (ctx.state === 'suspended') {
      // Try immediate resume
      ctx.resume().catch(()=>{})
      // As a hard fallback on iOS/Safari: resume on next user gesture
      const onTap = () => { ctx.resume().catch(()=>{}); window.removeEventListener('touchstart', onTap); window.removeEventListener('mousedown', onTap); }
      window.addEventListener('touchstart', onTap, { once: true })
      window.addEventListener('mousedown', onTap, { once: true })
    }
    // Prebuild hit buffer once
    if (!sfxBuf.current.hit){
      const a = buildTone(ctx, 440, 0.18, 0.003, 0.08, 'square')
      const b = buildTone(ctx, 140, 0.18, 0.003, 0.08, 'square')
      const ch = ctx.createBuffer(1, a.length + b.length, ctx.sampleRate)
      ch.getChannelData(0).set(a.getChannelData(0), 0)
      ch.getChannelData(0).set(b.getChannelData(0), a.length)
      sfxBuf.current.hit = ch
    }
    return ctx.state === 'running'
  }

  // Helper: build a short fail tone buffer
  function buildTone(ctx: AudioContext, freq:number, duration=0.32, attack=0.003, release=0.14, type: 'sine'|'square'|'triangle'='square'){
    const sr = ctx.sampleRate
    const len = Math.max(1, Math.floor(duration * sr))
    const buf = ctx.createBuffer(1, len, sr)
    const data = buf.getChannelData(0)
    for (let i=0;i<len;i++){
      const t = i/sr
      const envA = Math.min(1, attack>0? t/attack : 1)
      const envR = Math.max(0, release>0? 1 - Math.max(0, t - (duration - release))/release : 1)
      const env = Math.min(envA, envR)
      const phase = 2*Math.PI*freq*t
      let v = Math.sign(Math.sin(phase)) // square-like
      data[i] = v * env * 0.5
    }
    return buf
  }

  function sfx(kind: 'flap' | 'score' | 'hit'){
    if (!soundOn) return
    const ok = ensureCtx()
    const ctx = audioCtx.current
    if (!ctx) return
    // If context isn't running yet, attach a one-time resume listener but DO NOT bail out;
    // schedule the sound slightly in the future so it will fire as soon as the context resumes.
    let startAt = ctx.currentTime
    if (!ok || ctx.state !== 'running'){
      const once = () => { ctx.resume().catch(()=>{}); window.removeEventListener('touchstart', once); window.removeEventListener('mousedown', once) }
      window.addEventListener('touchstart', once, { once: true })
      window.addEventListener('mousedown', once, { once: true })
      startAt = Math.max(ctx.currentTime + 0.06, 0) // small positive offset
    }

    const now = ctx.currentTime
    switch(kind){
      case 'flap': {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        activeSfx.current.add({src: osc, gain})
        osc.onended = ()=>{
          try{ osc.disconnect(); gain.disconnect(); }catch{}
          for (const n of activeSfx.current){ if (n.src === osc){ activeSfx.current.delete(n); break } }
        }
        // 将播放时间稍微提前 (~20ms)，让听感更“靠前”
        const t = Math.max(0, Math.min(startAt, now - 0.02))
        osc.frequency.setValueAtTime(600, t)
        gain.gain.setValueAtTime(0.15, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
        osc.start(t)
        osc.stop(t + 0.1)
        break
      }
      case 'score': {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        activeSfx.current.add({src: osc, gain})
        osc.onended = ()=>{
          try{ osc.disconnect(); gain.disconnect(); }catch{}
          for (const n of activeSfx.current){ if (n.src === osc){ activeSfx.current.delete(n); break } }
        }
        // Start a bit earlier (~20ms) to make the pass‑pipe sound feel snappier
        const t2 = Math.max(0, now - 0.02)
        osc.frequency.setValueAtTime(900, t2)
        gain.gain.setValueAtTime(0.2, t2)
        gain.gain.exponentialRampToValueAtTime(0.001, t2 + 0.15)
        osc.start(Math.min(startAt, t2))
        osc.stop(Math.min(startAt, t2) + 0.15)
        break
      }
      case 'hit': {
        const buf = sfxBuf.current.hit
        if (!buf) {
          // 兜底：若 hit 缓冲还未生成，失败时用振荡器应急播放一小段（避免某些浏览器未即时生成 buffer 时“无声”）
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'square'
          osc.connect(gain); gain.connect(ctx.destination)
          activeSfx.current.add({src: osc, gain})
          osc.onended = ()=>{
            try{ osc.disconnect(); gain.disconnect() }catch{}
            for (const n of activeSfx.current){ if (n.src === osc){ activeSfx.current.delete(n); break } }
          }
          const t3 = Math.max(0, startAt)
          osc.frequency.setValueAtTime(440, t3)
          osc.frequency.linearRampToValueAtTime(140, t3 + 0.32)
          gain.gain.setValueAtTime(0.6, t3)
          gain.gain.exponentialRampToValueAtTime(0.0008, t3 + 0.32)
          osc.start(t3); osc.stop(t3 + 0.32)
          break
        }
        const src = ctx.createBufferSource()
        const gain2 = ctx.createGain()
        src.buffer = buf
        gain2.gain.value = 0.6
        src.connect(gain2); gain2.connect(ctx.destination)
        // register & cleanup
        activeSfx.current.add({src, gain: gain2})
        src.onended = ()=>{
          try{ src.disconnect(); gain2.disconnect() }catch{}
          for (const n of activeSfx.current){ if (n.src === src){ activeSfx.current.delete(n); break } }
        }
        src.start(startAt)
        break
      }
    }
  }

  function reset(){
    bird.current = { x: 84, y: SIZE.H/2, vy: 0 }
    pipes.current = []
    setScore(0)
    setOver(false)
    setPaused(false)
    spawnTick.current = 0
    stopAllSfx()
    playedHit.current = false
  }

  // ===== Input =====
  useEffect(()=>{
    const flap = () => {
      ensureCtx()
      if (over) {
        // 给失败音一个最短 250ms 的播放时间，避免被立即 reset 打断
        if (Date.now() - gameOverAt.current < 250) return
        reset();
        return
      }
      if (!started) setStarted(true)
      if (paused) return
      bird.current.vy = CFG.jump
      sfx('flap')
    }
    const key = (e:KeyboardEvent)=>{
      if (e.key===' '||e.key==='ArrowUp'||e.key==='w'){ e.preventDefault(); flap() }
      if (e.key==='Escape'){ setPaused(p=>!p) }
    }
    const down = ()=> flap()
    window.addEventListener('keydown', key)
    window.addEventListener('mousedown', down)
    window.addEventListener('touchstart', down, {passive:false})
    return ()=>{
      window.removeEventListener('keydown', key)
      window.removeEventListener('mousedown', down)
      window.removeEventListener('touchstart', down as any)
    }
  },[started, over, paused, CFG.jump])

  // circle vs rect collision (用于小鸟圆形与管道矩形的精确判定)
  function circleRectHit(bx:number, by:number, r:number, rx:number, ry:number, rw:number, rh:number){
    const cx = Math.max(rx, Math.min(bx, rx + rw))
    const cy = Math.max(ry, Math.min(by, ry + rh))
    const dx = bx - cx
    const dy = by - cy
    return dx*dx + dy*dy <= r*r
  }

  // ===== Game loop (rAF) =====
  useEffect(()=>{
    const ctx = canvasRef.current!.getContext('2d')!
    function fit(){
      const W = SIZE.W, H = SIZE.H
      canvasRef.current!.width = Math.floor(W*dpr)
      canvasRef.current!.height = Math.floor(H*dpr)
      canvasRef.current!.style.width = W+'px'
      canvasRef.current!.style.height = H+'px'
      ctx.setTransform(dpr,0,0,dpr,0,0)
    }
    fit();

    const raf = (ts:number)=>{
      if (last.current==null) last.current = ts
      const dt = ts - last.current
      last.current = ts

      let hit = false;

      if (!paused && !over){
        // physics step at ~60fps
        acc.current += dt
        while(acc.current >= 16 && !hit){ // ~60 Hz
          acc.current -= 16

          spawnTick.current++
          if (spawnTick.current % CFG.pipeEvery === 0){
            const vary = Math.random()*36 - 18
            const top = Math.max(24, Math.min(SIZE.H- CFG.pipeGap - 24, (SIZE.H/2 - CFG.pipeGap/2) + vary))
            pipes.current.push({ x: SIZE.W+10, top, gap: CFG.pipeGap, passed:false })
          }

          // bird physics
          bird.current.vy += CFG.gravity
          bird.current.y += bird.current.vy

          // pipes move
          for (const p of pipes.current) p.x -= CFG.pipeSpeed
          if (pipes.current.length && pipes.current[0].x < -PIPE_W - 20) pipes.current.shift()

          // collisions
          if (bird.current.y + BIRD_R >= SIZE.H || bird.current.y - BIRD_R <= 0){
            if (!playedHit.current){
              // 先立即播放失败音，再结束游戏
              stopAllSfx();
              sfx('hit');
              playedHit.current = true;
            }
            hit = true; gameOver();
          }
          for (const p of pipes.current){
            const bx = bird.current.x, by = bird.current.y
            // 上下两段管子的矩形
            const topRX = p.x, topRY = 0, topRW = PIPE_W, topRH = p.top
            const botRX = p.x, botRY = p.top + p.gap, botRW = PIPE_W, botRH = SIZE.H - (p.top + p.gap)

            if (circleRectHit(bx, by, BIRD_R, topRX, topRY, topRW, topRH) ||
                circleRectHit(bx, by, BIRD_R, botRX, botRY, botRW, botRH)){
              if (!playedHit.current){
                stopAllSfx();
                sfx('hit');
                playedHit.current = true;
              }
              hit = true;
              gameOver();
              break
            }

            if (!hit && !p.passed && bx > p.x + PIPE_W){
              p.passed = true
              setScore(s=>{
                const ns = s+1
                if (best==null || ns>best){ setBest(ns); try{localStorage.setItem('fb_best', String(ns))}catch{} }
                // sfx('score')
                return ns
              })
            }
          }
        }
      }

      draw(ctx)
      requestAnimationFrame(raf)
    }

    const id = requestAnimationFrame(raf)
    return ()=>{
      cancelAnimationFrame(id)
      stopAllSfx()
    }
  }, [paused, over, best, CFG, dpr, soundOn])

  function gameOver(){
    setOver(true)
    setPaused(false)
    gameOverAt.current = Date.now()
    if (!playedHit.current){
      // 若还未播放失败音，这里播放并清理其它音效；
      // 已播放时不要再次 stopAllSfx，避免把刚开始的失败音截断。
      stopAllSfx()
      sfx('hit')
      playedHit.current = true
    }
  }

  // --- Stop all SFX when sound is toggled off ---
  useEffect(()=>{ if (!soundOn) stopAllSfx() }, [soundOn])

  // ===== Draw =====
  function draw(ctx:CanvasRenderingContext2D){
    const W = SIZE.W, H = SIZE.H
    // bg
    const g = ctx.createLinearGradient(0,0,0,H)
    g.addColorStop(0,'#0f172a')
    g.addColorStop(1,'#0b1220')
    ctx.fillStyle = g
    ctx.fillRect(0,0,W,H)

    // ground strip
    ctx.fillStyle = 'rgba(255,255,255,.04)'
    ctx.fillRect(0,H-10,W,10)

    // pipes
    for (const p of pipes.current){
      // pipe body gradient
      const pipeGrad = ctx.createLinearGradient(p.x, 0, p.x, H)
      pipeGrad.addColorStop(0, '#86efac') // light green top
      pipeGrad.addColorStop(1, '#166534') // dark green bottom
      ctx.fillStyle = pipeGrad
      ctx.strokeStyle = '#14532d' // deep green border
      ctx.lineWidth = 2

      // top pipe body with rounded corners
      const radius = 8
      ctx.beginPath()
      ctx.moveTo(p.x + radius, 0)
      ctx.lineTo(p.x + PIPE_W - radius, 0)
      ctx.quadraticCurveTo(p.x + PIPE_W, 0, p.x + PIPE_W, radius)
      ctx.lineTo(p.x + PIPE_W, p.top - radius)
      ctx.quadraticCurveTo(p.x + PIPE_W, p.top, p.x + PIPE_W - radius, p.top)
      ctx.lineTo(p.x + radius, p.top)
      ctx.quadraticCurveTo(p.x, p.top, p.x, p.top - radius)
      ctx.lineTo(p.x, radius)
      ctx.quadraticCurveTo(p.x, 0, p.x + radius, 0)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // bottom pipe body with rounded corners
      const bh = H - (p.top + p.gap)
      ctx.beginPath()
      ctx.moveTo(p.x + radius, p.top + p.gap)
      ctx.lineTo(p.x + PIPE_W - radius, p.top + p.gap)
      ctx.quadraticCurveTo(p.x + PIPE_W, p.top + p.gap, p.x + PIPE_W, p.top + p.gap + radius)
      ctx.lineTo(p.x + PIPE_W, H - radius)
      ctx.quadraticCurveTo(p.x + PIPE_W, H, p.x + PIPE_W - radius, H)
      ctx.lineTo(p.x + radius, H)
      ctx.quadraticCurveTo(p.x, H, p.x, H - radius)
      ctx.lineTo(p.x, p.top + p.gap + radius)
      ctx.quadraticCurveTo(p.x, p.top + p.gap, p.x + radius, p.top + p.gap)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }

    // bird
    const bx = bird.current.x
    const by = bird.current.y
    ctx.save()
    ctx.translate(bx,by)
    ctx.rotate(Math.atan2(bird.current.vy, 12) * 0.15)
    ctx.fillStyle = '#fbbf24'
    ctx.beginPath(); ctx.arc(0,0, 12, 0, Math.PI*2); ctx.fill()
    // wing
    ctx.fillStyle = '#fde68a'
    ctx.beginPath(); ctx.ellipse(-2,3, 6,3, 0, 0, Math.PI*2); ctx.fill()
    // eye
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(3,-2,3,0,Math.PI*2); ctx.fill()
    ctx.fillStyle = '#0b1220'; ctx.beginPath(); ctx.arc(4,-2,1.4,0,Math.PI*2); ctx.fill()
    // beak
    ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.moveTo(10,-1); ctx.lineTo(16,1); ctx.lineTo(10,3); ctx.closePath(); ctx.fill()
    ctx.restore()

    // HUD
    ctx.fillStyle = 'rgba(255,255,255,.92)'
    ctx.font = '700 22px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto'
    ctx.textAlign = 'center'
    ctx.fillText(String(score), W/2, 34)
  }

  // ===== UI =====
  return (
    <div className="page-wrap">
      <div className="shell" style={{ maxWidth: 980, margin: '0 auto' }}>
        <header className="page-header compact">
          <h1 className="title">🐤 跳跃鸟 · 轻量版</h1>
          <p className="subtitle">点击/空格/↑ 起跳，躲避管道。Esc 暂停。</p>
          <div className="toolbar" style={UI.toolbar}>
            <div className="modes">
              <button className={`mode-btn ${mode==='easy'?'on':''}`} style={{...UI.modeBtn, ...(mode==='easy'?UI.modeBtnSelected:{})}} onClick={()=>setMode('easy')}>简单</button>
              <button className={`mode-btn ${mode==='normal'?'on':''}`} style={{...UI.modeBtn, ...(mode==='normal'?UI.modeBtnSelected:{})}} onClick={()=>setMode('normal')}>标准</button>
              <button className={`mode-btn ${mode==='hard'?'on':''}`} style={{...UI.modeBtn, ...(mode==='hard'?UI.modeBtnSelected:{})}} onClick={()=>setMode('hard')}>困难</button>
              <button className="mode-btn" style={UI.modeBtn} onClick={()=>setSoundOn(v=>!v)}>{soundOn ? '音效开' : '音效关'}</button>
              <button className="mode-btn" style={UI.modeBtn} onClick={()=>setPaused(p=>!p)}>{paused? '继续' : '暂停'}</button>
              <button className="mode-btn" style={UI.modeBtn} onClick={()=>reset()}>重新开始</button>
            </div>
            <div className="stats unified" style={UI.stats}>
              <div className="chip" style={UI.chip}><div className="label" style={UI.chipLabel}>分数</div><div className="value" style={UI.chipValue}>{score}</div></div>
              <div className="chip" style={UI.chip}><div className="label" style={UI.chipLabel}>最佳</div><div className="value" style={UI.chipValue}>{best ?? '-'}</div></div>
            </div>
          </div>
        </header>

        <section
          className="board-shell"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03))',
            border: '1px solid rgba(255,255,255,.06)',
            borderRadius: 22,
            padding: 16,
            boxShadow: '0 12px 28px rgba(2,6,23,.28) inset, 0 18px 34px rgba(2,6,23,.18)',
            width: '100%',
          }}
        >
        <main className="board-card" style={{ display:'flex', justifyContent:'center', padding: 16, width: '100%' }}>
          <div className="stage-wrap" style={{ position:'relative', width: SIZE.W, height: SIZE.H, margin:'0 auto', borderRadius: 14, overflow:'hidden', boxShadow: '0 1px 0 rgba(255,255,255,.06) inset, 0 8px 16px rgba(0,0,0,.35)' }}>
            <canvas
              ref={canvasRef}
              width={SIZE.W}
              height={SIZE.H}
              style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}
            />

            {paused && !over && (
              <div className="overlay" style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
                <div className="panel">
                  <div className="result-title">暂停中</div>
                  <div className="result-sub">分数 {score} · 最佳 {best ?? '-'}</div>
                  <div className="overlay-actions">
                    <button className="btn primary" onClick={()=>setPaused(false)}>继续游戏</button>
                    <button className="btn secondary" onClick={()=>reset()}>重新开始</button>
                    <a className="btn secondary" href="/">返回首页</a>
                  </div>
                </div>
              </div>
            )}

            {over && (
              <div className="overlay" style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
                <div className="panel">
                  <div className="result-title">游戏结束</div>
                  <div className="result-sub">分数 {score}{best!=null && score>=best && ' · 新纪录！'}</div>
                  <div className="overlay-actions">
                    <button className="btn primary" onClick={()=>reset()}>再来一局</button>
                    <a className="btn secondary" href="/">返回首页</a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
        </section>
        <div className="bottom-bar">
          <div className="actions">
            <button className="btn primary" onClick={()=>reset()}>再来一局</button>
            <a className="btn secondary" href="/">返回首页</a>
          </div>
          <div className="hint">操作：点击/空格/↑ 起跳；Esc 暂停。提示：穿过管道间隙可得分，撞到管道或地面会结束游戏。</div>
        </div>
      </div>
    </div>
  )
}
