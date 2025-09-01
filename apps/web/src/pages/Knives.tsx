import React, { useEffect, useRef, useState } from 'react'
import '../styles.css'

// ---------- Types ----------
type Knife = { angle:number }
type Flying = { angle:number, t:number, dur:number }     // 飞行中的刀：0→dur 线性前进
type Apple = { angle:number, r:number }                  // 旋转中的苹果（加分物件）
type Theme = {
  name: string
  bg: [string,string]
  woodInner: string
  woodOuter: string
  woodRing: string
  blade: string
  handle: string
  tipGlow: string
}

// ---------- Themes ----------
const THEMES: Theme[] = [
  {
    name: '经典木纹',
    bg: ['#cbd5e1','#e2e8f0'],
    woodInner: '#f3d9b1',
    woodOuter: '#b88958',
    woodRing: '#8b5e3488',
    blade: '#e5e7eb',
    handle: '#8b5e34',
    tipGlow: 'rgba(59,130,246,.6)'
  },
  {
    name: '霓虹夜色',
    bg: ['#0f172a','#1f2937'],
    woodInner: '#374151',
    woodOuter: '#111827',
    woodRing: 'rgba(147,197,253,.25)',
    blade: '#a5b4fc',
    handle: '#9333ea',
    tipGlow: 'rgba(125,211,252,.7)'
  },
  {
    name: '赛博金属',
    bg: ['#0b1220','#0e1726'],
    woodInner: '#94a3b8',
    woodOuter: '#475569',
    woodRing: 'rgba(226,232,240,.24)',
    blade: '#f8fafc',
    handle: '#0ea5e9',
    tipGlow: 'rgba(14,165,233,.65)'
  }
]

// ---------- Component ----------
export default function Knives(){
  // Core game state
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)
  const [over, setOver] = useState(false)
  const [muted, setMuted] = useState(false)
  const [failReason, setFailReason] = useState<string | null>(null)
  const [showResult, setShowResult] = useState(false)

  // Level / challenge
  const [level, setLevel] = useState(1)
  const [knivesLeft, setKnivesLeft] = useState(6)      // 每关可投掷刀数
  const [applesGoal, setApplesGoal] = useState(1)      // 本关需要命中的苹果数
  const [applesGot, setApplesGot] = useState(0)
  const [levelCleared, setLevelCleared] = useState(false)

  // Theme
  const [themeIdx, setThemeIdx] = useState(0)
  const theme = THEMES[themeIdx]
  const themeRef = useRef(theme)
  useEffect(()=>{ themeRef.current = theme }, [theme])
  // 切主题或重绘时，保持 <canvas> 背景不闪白
  useEffect(()=>{
    const cvs = document.getElementById('knv') as HTMLCanvasElement | null
    if(cvs){ cvs.style.background = themeRef.current.bg[0] }
  }, [theme])

  // 临时抑制预览（命中后的短时间，避免“影子”）
  const previewSuppressRef = useRef(0)

  // Refs
  const knives = useRef<Knife[]>([])
  const apples = useRef<Apple[]>([])
  const angle = useRef(0)          // 靶当前角度（旋转）
  const speed = useRef(1.4)        // 旋转速度（基础）
  const flying = useRef<Flying|null>(null)  // 正在飞行的一把刀
  const raf = useRef(0)
  const ctxRef = useRef<CanvasRenderingContext2D|null>(null)
  const rectRef = useRef({width:0,height:0,left:0,top:0})
  const audioCtxRef = useRef<AudioContext|null>(null)
  const backCanvasRef = useRef<HTMLCanvasElement|null>(null)
  const backCtxRef = useRef<CanvasRenderingContext2D|null>(null)

  // ---------- audio helpers ----------
  function ensureCtx(){
    if(!audioCtxRef.current){
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
      if(Ctx) audioCtxRef.current = new Ctx({latencyHint:'interactive'})
    }
    return audioCtxRef.current
  }
  function sfxThud(){ if(muted) return
    const ctx = ensureCtx(); if(!ctx) return
    const now = ctx.currentTime
    const o = ctx.createOscillator(); o.type='triangle'
    const g = ctx.createGain()
    o.frequency.setValueAtTime(160, now)
    o.frequency.exponentialRampToValueAtTime(80, now+0.08)
    g.gain.setValueAtTime(0.0001, now)
    g.gain.linearRampToValueAtTime(0.36, now+0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, now+0.12)
    o.connect(g).connect(ctx.destination)
    o.start(now); o.stop(now+0.13)
  }
  function sfxClang(){ if(muted) return
    const ctx = ensureCtx(); if(!ctx) return
    const now = ctx.currentTime
    const o = ctx.createOscillator(); o.type='square'
    const g = ctx.createGain()
    o.frequency.setValueAtTime(420, now)
    o.frequency.exponentialRampToValueAtTime(170, now+0.12)
    g.gain.setValueAtTime(0.0001, now)
    g.gain.linearRampToValueAtTime(0.5, now+0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, now+0.18)
    o.connect(g).connect(ctx.destination)
    o.start(now); o.stop(now+0.2)
  }
  function sfxPop(){ if(muted) return
    const ctx = ensureCtx(); if(!ctx) return
    const now = ctx.currentTime
    const o = ctx.createOscillator(); o.type='sine'
    const g = ctx.createGain()
    o.frequency.setValueAtTime(900, now)
    o.frequency.exponentialRampToValueAtTime(500, now+0.08)
    g.gain.setValueAtTime(0.0001, now)
    g.gain.linearRampToValueAtTime(0.3, now+0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, now+0.10)
    o.connect(g).connect(ctx.destination)
    o.start(now); o.stop(now+0.11)
  }

  // ---------- mount ----------
  useEffect(()=>{
    const cvs = document.getElementById('knv') as HTMLCanvasElement
    // 申请不透明canvas，避免首帧白闪
    const ctx = (cvs.getContext('2d', { alpha: false }) as CanvasRenderingContext2D) || (cvs.getContext('2d') as CanvasRenderingContext2D)
    ctxRef.current = ctx
    // 创建离屏 back buffer，避免首帧/交互帧白闪
    const back = document.createElement('canvas')
    const bctx = (back.getContext('2d', { alpha: false }) as CanvasRenderingContext2D) || (back.getContext('2d') as CanvasRenderingContext2D)
    backCanvasRef.current = back
    backCtxRef.current = bctx
    // 初始背景，避免首帧白闪
    cvs.style.background = themeRef.current.bg[0]
    let DPR = window.devicePixelRatio||1
    function fit(){
      const r = cvs.getBoundingClientRect()
      rectRef.current = {width:r.width,height:480,left:r.left,top:r.top}
      DPR = window.devicePixelRatio||1
      cvs.width = r.width*DPR
      cvs.height = 480*DPR
      ctx.setTransform(DPR,0,0,DPR,0,0)
      // back buffer 也同步缩放和尺寸
      const back = backCanvasRef.current!
      const bctx = backCtxRef.current!
      back.width = cvs.width
      back.height = cvs.height
      bctx.setTransform(DPR,0,0,DPR,0,0)
    }
    cvs.style.width='100%'; cvs.style.height='480px'
    ;(cvs as any).style.touchAction='none'
    fit(); addEventListener('resize', fit)
    // 先同步绘制一帧到 back buffer，并一次性 blit 到可见画布
    draw(0)
    requestAnimationFrame(() => draw(0))

    // 初始苹果
    if(apples.current.length===0){
      spawnApples(applesGoal)
    }

    let last = performance.now()
    function loop(now:number){
      const dt = Math.min(0.033, (now-last)/1000); last = now
      draw(dt)
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)

    return ()=>{ cancelAnimationFrame(raf.current); removeEventListener('resize', fit) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- spawns ----------
  function spawnApples(n:number){
    for(let i=0;i<n;i++){
      const a = Math.random()*Math.PI*2
      apples.current.push({ angle:a, r:96 })
    }
  }

  // ---------- drawing ----------
function woodTexture(ctx:CanvasRenderingContext2D, x:number,y:number,r:number){
  // Solid base coat first — guarantees no white shows through even on the very first interactive frame
  ctx.fillStyle = themeRef.current.woodInner
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill()

  // Radial gradient over the base
  const g = ctx.createRadialGradient(x,y,10,x,y,r)
  g.addColorStop(0, themeRef.current.woodInner); g.addColorStop(1, themeRef.current.woodOuter)
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill()

  // Inner safety fill (use outer wood tone so center不会偏白)
  ctx.fillStyle = themeRef.current.woodOuter
  ctx.beginPath(); ctx.arc(x, y, r-6, 0, Math.PI*2); ctx.fill()
  // Extra mid‑tone glaze to further darken the center (very light, no transparency issues)
  ctx.globalAlpha = 0.18
  ctx.fillStyle = themeRef.current.woodOuter
  ctx.beginPath(); ctx.arc(x, y, r-18, 0, Math.PI*2); ctx.fill()
  ctx.globalAlpha = 1

  // Concentric rings
  ctx.strokeStyle = themeRef.current.woodRing
  for(let i=12;i<r;i+=10){ ctx.beginPath(); ctx.arc(x,y,i,0,Math.PI*2); ctx.stroke() }

  // Subtle highlight
  ctx.strokeStyle='rgba(255,255,255,.16)'
  ctx.beginPath(); ctx.arc(x-8,y-8,r-6,0.2,1.2); ctx.stroke()
}

  // Fallback rounded-rect
  function rr(ctx:CanvasRenderingContext2D, x:number, y:number, w:number, h:number, rad:number){
    const r = Math.max(0, Math.min(rad, Math.min(w,h)/2))
    ctx.beginPath()
    ctx.moveTo(x+r, y)
    ctx.lineTo(x+w-r, y)
    ctx.quadraticCurveTo(x+w, y, x+w, y+r)
    ctx.lineTo(x+w, y+h-r)
    ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h)
    ctx.lineTo(x+r, y+h)
    ctx.quadraticCurveTo(x, y+h, x, y+h-r)
    ctx.lineTo(x, y+r)
    ctx.quadraticCurveTo(x, y, x+r, y)
    ctx.closePath()
  }

  function drawKnife(ctx:CanvasRenderingContext2D, r:number){
    // blade
    ctx.fillStyle = themeRef.current.blade
    ctx.beginPath()
    if((ctx as any).roundRect){ (ctx as any).roundRect(-4, -r-54, 8, 54, 4) } else { rr(ctx, -4, -r-54, 8, 54, 4) }
    ctx.fill()
    // spine line
    ctx.strokeStyle='rgba(148,163,184,.8)'; ctx.lineWidth=1
    ctx.beginPath(); ctx.moveTo(0, -r-54); ctx.lineTo(0, -r-8); ctx.stroke()
    // handle
    ctx.fillStyle = themeRef.current.handle
    ctx.beginPath()
    if((ctx as any).roundRect){ (ctx as any).roundRect(-5, -r-74, 10, 20, 4) } else { rr(ctx, -5, -r-74, 10, 20, 4) }
    ctx.fill()
    ctx.fillStyle='#e5e7eb'; ctx.beginPath(); ctx.arc(0,-r-63,1.6,0,Math.PI*2); ctx.fill()
  }

  function drawApple(ctx:CanvasRenderingContext2D, r:number){
    // body
    ctx.fillStyle='#ef4444'
    ctx.beginPath(); ctx.arc(0,-r,9,0,Math.PI*2); ctx.fill()
    // leaf
    ctx.fillStyle='#16a34a'
    ctx.beginPath(); ctx.ellipse(-4,-r-7,4,2, -0.6, 0, Math.PI*2); ctx.fill()
    // highlight
    ctx.fillStyle='rgba(255,255,255,.6)'
    ctx.beginPath(); ctx.ellipse(3,-r-2.4,2.8,1.5, 0.5, 0, Math.PI*2); ctx.fill()
  }

  function drawPreview(ctx:CanvasRenderingContext2D, cx:number, cy:number, r:number){
    const aHit = - (angle.current % (Math.PI*2))
    let danger = false
    for(const k of knives.current){
      const diff = Math.abs(((k.angle - aHit + Math.PI) % (Math.PI*2)) - Math.PI)
      if(diff < (12*Math.PI/180)){ danger = true; break }
    }
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(aHit)
    // ring tick (outside only)
    ctx.strokeStyle = danger ? '#ef4444' : 'rgba(255,255,255,.85)'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(0, -(r+2))
    ctx.lineTo(0, -(r+14))
    ctx.stroke()
    // small triangle pointer outside the ring
    ctx.fillStyle = danger ? 'rgba(239,68,68,.9)' : themeRef.current.tipGlow
    ctx.beginPath()
    ctx.moveTo(0, -(r+14))
    ctx.lineTo(-5, -(r+24))
    ctx.lineTo(5, -(r+24))
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  function drawTopHint(ctx:CanvasRenderingContext2D, cx:number, cy:number, r:number){
    ctx.save()
    ctx.translate(cx, cy)
    ctx.globalAlpha = 0.55
    // tick above ring
    ctx.strokeStyle = 'rgba(255,255,255,.85)'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(0, -(r+12)); ctx.lineTo(0, -(r+26)); ctx.stroke()
    // small ghost knife above
    ctx.fillStyle = 'rgba(255,255,255,.45)'
    ctx.beginPath()
    if((ctx as any).roundRect){ (ctx as any).roundRect(-3, -(r+56), 6, 50, 3) } else { rr(ctx, -3, -(r+56), 6, 50, 3) }
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.restore()
  }

  // 绘制飞行中的刀（刀尖在(0,0)，竖直朝上，blade 向上延伸）
  function drawKnifeFlight(ctx:CanvasRenderingContext2D){
    // TIP at (0,0), blade extends UP to avoid penetrating the ring
    ctx.fillStyle = themeRef.current.blade
    ctx.beginPath()
    if((ctx as any).roundRect){ (ctx as any).roundRect(-4, -54, 8, 54, 4) } else { rr(ctx, -4, -54, 8, 54, 4) }
    ctx.fill()
    // spine (upwards)
    ctx.strokeStyle='rgba(148,163,184,.8)'; ctx.lineWidth=1
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -46); ctx.stroke()
    // handle (still above tip at y∈[-18,0])
    ctx.fillStyle = themeRef.current.handle
    ctx.beginPath()
    if((ctx as any).roundRect){ (ctx as any).roundRect(-5, -18, 10, 18, 4) } else { rr(ctx, -5, -18, 10, 18, 4) }
    ctx.fill()
    ctx.fillStyle='#e5e7eb'; ctx.beginPath(); ctx.arc(0,-6,1.6,0,Math.PI*2); ctx.fill()
  }

  function draw(dt:number){
    const vctx = ctxRef.current!    // visible context
    const ctx = backCtxRef.current! // draw everything into back buffer
    const back = backCanvasRef.current!
    const {width} = rectRef.current
    const cx = width/2, cy = 240, r = 112
    // Reset blend state; 绘制背景避免白闪
    ctx.globalAlpha = 1
    ;(ctx as any).globalCompositeOperation = 'source-over'
    // 先铺纯色，再叠加渐变，避免首帧白闪
    ctx.fillStyle = themeRef.current.bg[0]
    ctx.fillRect(0,0,width,480)
    const bg = ctx.createLinearGradient(0,0,width,480)
    bg.addColorStop(0, themeRef.current.bg[0]);
    bg.addColorStop(1, themeRef.current.bg[1])
    ctx.fillStyle = bg
    ctx.fillRect(0,0,width,480)

    // 旋转更新（随分数渐进加速）
    const base = 1.2 + Math.min(1.6, Math.floor(score/6)*0.25)
    speed.current += (base - speed.current) * (dt*2)
    angle.current += speed.current * 0.01

    // 靶心&木纹 + 顶部方向提示
    woodTexture(ctx, cx, cy, r)
    drawTopHint(ctx, cx, cy, r)

    // 旋转层：苹果 + 已命中刀
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(angle.current)

    // 苹果
    for(const ap of apples.current){
      ctx.save(); ctx.rotate(ap.angle); drawApple(ctx, ap.r); ctx.restore()
    }

    // 中心分割线
    ctx.strokeStyle='rgba(0,0,0,.06)'; ctx.beginPath(); ctx.arc(0,0,r-10,0,Math.PI*2); ctx.stroke()

    // 刀（贴环绘制）
    for(const k of knives.current){
      ctx.save(); ctx.rotate(k.angle); drawKnife(ctx, r); ctx.restore()
    }

    ctx.restore()

    // 飞行中的刀（从顶部飞向靶心）
    if(flying.current){
      const fl = flying.current
      fl.t += dt
      const t = Math.min(1, fl.t / fl.dur)
      const tt = t*t*(3 - 2*t) // smoothstep easing

      // 刀尖从画面上方直落到“环的正上方外沿一点点”，避免看似进入圆盘内部
      const ringTopY = cy - (r + 0.5)
      const startTipY = ringTopY - 220
      const tipY = startTipY + tt * (ringTopY - startTipY)

      ctx.save()
      ctx.translate(cx, tipY)
      drawKnifeFlight(ctx)
      ctx.restore()

      if(t>=1){
        previewSuppressRef.current = performance.now() + 220
        // 到达：判定是否撞刀
        const aHit = - (angle.current % (Math.PI*2))
    for(const k of knives.current){
      const diff = Math.abs(((k.angle - aHit + Math.PI) % (Math.PI*2)) - Math.PI)
      if(diff < (10*Math.PI/180)){
        sfxClang()
        setFailReason('飞刀相撞')
        setOver(true)
        flying.current = null
        setBest(b=>Math.max(b, score))
        return
      }
    }
        // 命中苹果？
        let ate = false
        for(let i=apples.current.length-1;i>=0;i--){
          const ap = apples.current[i]
          const diff = Math.abs(((ap.angle - aHit + Math.PI) % (Math.PI*2)) - Math.PI)
          if(diff < (14*Math.PI/180)){
            apples.current.splice(i,1)
            ate = true
          }
        }
        knives.current.push({angle:aHit})
        flying.current = null
        // force immediate next frame scheduling (avoids 1-frame blank on some devices)
        // requestAnimationFrame will fire soon anyway, but this hints the loop
        if(ate){
          setApplesGot(g=>g+1)
          setScore(s=>s+3)
          sfxPop()
        }
        setScore(s=>s+1)
        sfxThud()
        // 适度补充玩法
        const total = score+1+(ate?3:0)
        if(total>0 && total%7===0) spawnApples(1)
        setKnivesLeft(k=>k-1)
      }
    } else {
      // 预览（命中后短暂抑制，避免重影）
      if(performance.now() > previewSuppressRef.current){
        drawPreview(ctx, cx, cy, r)
      }
    }

    // HUD
    drawHUD(ctx)

    // 将离屏内容一次性拷贝到可见画布，避免中间态闪烁
    vctx.setTransform(1,0,0,1,0,0) // 用像素坐标拷贝
    vctx.drawImage(back, 0, 0)
    // 恢复（下一帧仍由 back buffer 负责缩放变换）
  }

  function drawHUD(ctx:CanvasRenderingContext2D){
    ctx.fillStyle='rgba(255,255,255,.92)'
    if((ctx as any).roundRect){ ctx.beginPath(); (ctx as any).roundRect(10,10,340,72,14); ctx.fill() } else { ctx.fillRect(10,10,340,72) }
    ctx.fillStyle='#111'; ctx.font='600 14px system-ui, -apple-system, Segoe UI'
    ctx.fillText(`得分：${score}`, 20, 30)
    ctx.fillText(`最佳：${best}`, 120, 30)
    ctx.fillText(`关卡：${level}`, 220, 30)
    ctx.fillText(`剩余刀数：${knivesLeft}`, 20, 58)
    ctx.fillText(`苹果目标：${applesGot} / ${applesGoal}`, 140, 58)
    ctx.fillText(`音效：${muted?'关':'开'}`, 280, 58)
  }

  function throwKnife(){
    if(over || flying.current || levelCleared) return
    if(knivesLeft <= 0) return
    (ensureCtx() as any)?.resume?.()
    const a = - (angle.current % (Math.PI*2))
    // 建议：如需更利索，可把 0.16 改成 0.12
    flying.current = { angle:a, t:0, dur:0.16 }
  }

  function reset(){
    knives.current=[]
    setScore(0)
    setOver(false)
    setFailReason(null)
    angle.current=0
    speed.current=1.4
    flying.current=null
    apples.current=[]
    setApplesGot(0)
    setKnivesLeft(6)
    setApplesGoal(1)
    setLevel(1)
    setLevelCleared(false)
    setShowResult(false)
    spawnApples(1)
  }

  // 过关判定
  useEffect(()=>{
    if(applesGot >= applesGoal && !levelCleared){
      setLevelCleared(true)
    }
  }, [applesGot, applesGoal, levelCleared])
  useEffect(()=>{
    if(levelCleared) setShowResult(true)
  }, [levelCleared])

  // 刀用尽时判定胜负（优先过关）
  useEffect(()=>{
    if(knivesLeft === 0){
      if(applesGot >= applesGoal){
        if(!levelCleared) setLevelCleared(true)
      }else{
        if(!over){ setFailReason('刀已用尽'); setOver(true) }
      }
    }
  }, [knivesLeft, applesGot, applesGoal, levelCleared, over])
  useEffect(()=>{
    if(over) setShowResult(true)
  }, [over])

  function nextLevel(){
    if(!levelCleared) return
    setLevel(lv => {
      const newLevel = lv + 1
      setKnivesLeft(6 + Math.floor(newLevel / 3)) // 每3关 +1 刀
      setApplesGoal(1 + Math.floor(newLevel / 2)) // 每2关 +1 苹果目标
      setApplesGot(0)
      knives.current = []
      apples.current = []
      spawnApples(1 + Math.floor(newLevel / 2))
      setScore(s => s + 10 * newLevel) // 奖励分
      setLevelCleared(false)
      setOver(false)
      setFailReason(null)
      setShowResult(false)
      angle.current = 0
      speed.current = 1.4
      flying.current = null
      return newLevel
    })
  }

  function changeTheme(){
    setThemeIdx(i => (i + 1) % THEMES.length)
  }

  // Keyboard support for better feel — guard when over/cleared to prevent negative knives
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(e.code==='Space'){
        e.preventDefault()
        if(!over && !levelCleared && knivesLeft>0 && !flying.current){
          throwKnife()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  }, [over, levelCleared, knivesLeft])

  return (
      <div className="container" style={{position:'relative', userSelect:'none'}}>
        <h1>🎯 飞刀靶 - 关卡挑战 & 主题皮肤</h1>
        <p className="desc">更大舞台 · 自上而下投掷 · 预落点提示 · 关卡目标 + 失败弹窗</p>

        <div className="stage" style={{height:480, display:'grid', placeItems:'center', background: theme.bg[0], boxShadow:'0 8px 24px rgba(2,6,23,.25)', borderRadius:12, overflow:'hidden'}} onClick={()=>{ if(!over && !levelCleared && knivesLeft>0 && !flying.current) throwKnife() }}>
          <canvas id="knv" style={{width:'100%', height:'100%'}}/>
        </div>

        <div style={{display:'flex', gap:12, marginTop:12, alignItems:'center', flexWrap:'wrap'}}>
          <div className="badge">得分 {score}</div>
          <div className="badge">最佳 {best}</div>
          <div className="badge">关卡 {level}</div>
          <div className="badge">剩余刀数 {knivesLeft}</div>
          <div className="badge">苹果目标 {applesGot} / {applesGoal}</div>

          {!over && !levelCleared ? (
              <button className="btn primary" onClick={throwKnife} disabled={knivesLeft <= 0}>投掷</button>
          ) : over ? (
              <button className="btn secondary" onClick={reset}>重来</button>
          ) : (
              <button className="btn primary" onClick={nextLevel}>下一关</button>
          )}

          <button className="btn ghost" onClick={reset}>重新开始</button>
          <button className="btn ghost" onClick={changeTheme}>主题：{theme.name}</button>
          <button className="btn ghost" onClick={()=>setMuted(v=>!v)}>{muted?'静音':'有音效'}</button>
          <a className="btn ghost" href="/">返回首页</a>
        </div>

        {/* 失败弹窗（方案 A） */}
        {/* 结果弹窗（失败 / 过关） */}
        {showResult && (over || levelCleared) && (
            <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0,0,0,.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  color: '#fff',
                  fontSize: 20,
                  zIndex: 10,
                }}
            >
              {over ? (
                  <>
                    <div style={{ marginBottom: 12 }}>
                      关卡失败：{failReason ?? '未知原因'}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn secondary" onClick={reset}>重来</button>
                      <button
                          className="btn ghost"
                          onClick={() => { setShowResult(false); }}
                      >
                        关闭
                      </button>
                    </div>
                  </>
              ) : (
                  <>
                    <div style={{ marginBottom: 12 }}>
                      第 {level} 关完成！
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn primary" onClick={nextLevel}>下一关</button>
                      <button
                          className="btn ghost"
                          onClick={() => { setShowResult(false); }}
                      >
                        关闭
                      </button>
                    </div>
                  </>
              )}
            </div>
        )}
      </div>
  )
}