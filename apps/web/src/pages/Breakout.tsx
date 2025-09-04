import React, { useEffect, useRef, useState } from 'react'
import '../styles.css'

function useSfx(muted:boolean){
  const ctxRef = React.useRef<AudioContext|null>(null)
  const ensure = () => {
    if(!ctxRef.current){
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
      if (Ctx) ctxRef.current = new Ctx({ latencyHint:'interactive' })
    }
    const c = ctxRef.current
    if(c && (c.state==='suspended' || (c as any).state==='interrupted')){ try{ (c as any).resume?.() }catch{} }
    return c
  }

  // 初次交互预热
  React.useEffect(()=>{
    const prewarm = () => { const c = ensure(); try{ (c as any)?.resume?.() }catch{} }
    document.addEventListener('pointerdown', prewarm, { once:true, passive:true })
    document.addEventListener('keydown', prewarm, { once:true })
    return ()=> { document.removeEventListener('pointerdown', prewarm); document.removeEventListener('keydown', prewarm) }
  }, [])

  // --- Master chain: gentle limiter + master gain ---
  const masterRef = React.useRef<{g:GainNode, comp:DynamicsCompressorNode} | null>(null)
  const master = () => {
    const c = ensure(); if(!c) return null
    if(!masterRef.current){
      const g = c.createGain(); g.gain.value = 0.8
      const comp = c.createDynamicsCompressor()
      comp.threshold.value = -24; comp.knee.value = 20; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.15
      g.connect(comp).connect(c.destination)
      masterRef.current = { g, comp }
    }
    return masterRef.current
  }

  // 工具：ADSR 包络
  function env(c:AudioContext, node:GainNode, t0:number, a=0.002, d=0.06, s=0.0008, r=0.08, peak=0.6){
    node.gain.cancelScheduledValues(t0)
    node.gain.setValueAtTime(0.0001, t0)
    node.gain.linearRampToValueAtTime(peak, t0+a)
    node.gain.exponentialRampToValueAtTime(s, t0+a+d)
    node.gain.exponentialRampToValueAtTime(0.0001, t0+a+d+r)
  }

  // 工具：简易“咚/啪”噪声（带滤波，避免刺耳）
  function noiseHit(freq:number, dur=0.05, q=0.7, peak=0.5){
    return (when:number=0) => { if(muted) return; const c = ensure(); const m = master(); if(!c || !m) return
      const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate*dur)), c.sampleRate)
      const ch = buf.getChannelData(0)
      for(let i=0;i<ch.length;i++){ const t=i/ch.length; ch[i] = (Math.random()*2-1) * (1-t) }
      const src = c.createBufferSource(); src.buffer = buf
      const g = c.createGain()
      const f = c.createBiquadFilter(); f.type='lowpass'; f.frequency.setValueAtTime(freq, c.currentTime+when); f.Q.value = q
      env(c, g, c.currentTime+when, 0.002, dur*0.6, 0.001, dur*0.6, peak)
      src.connect(f).connect(g).connect(m.g)
      src.start(c.currentTime+when)
    }
  }

  // 工具：音调音效（更柔和的三角/正弦，避免刺耳方波/锯齿）
  function tone(type:OscillatorType, f0:number, f1:number, dur:number, peak=0.35){
    return (when:number=0) => { if(muted) return; const c = ensure(); const m = master(); if(!c || !m) return
      const o = c.createOscillator(); o.type = type
      const g = c.createGain()
      const t0 = c.currentTime + when
      o.frequency.setValueAtTime(f0, t0)
      // 轻微滑音
      o.frequency.exponentialRampToValueAtTime(Math.max(1,f1), t0 + dur*0.7)
      env(c, g, t0, 0.003, dur*0.5, 0.0012, dur*0.6, peak)
      o.connect(g).connect(m.g)
      o.start(t0); o.stop(t0 + dur + 0.05)
    }
  }

  // 乐音：和弦小结（用于胜利提示）
  function winChord(){
    return (when:number=0) => { if(muted) return; const c = ensure(); const m = master(); if(!c || !m) return
      const base = 523.25; // C5
      const notes = [base, base*1.25, base*1.5] // C-E-G
      notes.forEach((f, i)=> tone('triangle', f*0.9, f, 0.14, 0.25)(when + i*0.05))
    }
  }

  return {
    // 发球：柔和的三角滑音
    launch: tone('triangle', 660, 520, 0.10, 0.28),
    // 打到砖块：轻快“滴”声，带少许随机音高
    brick:  (when:number=0) => { const r = 720 + Math.random()*180; return tone('sine', r, r*0.92, 0.07, 0.30)(when) },
    // 拍到板：低频“咚”——低通噪声
    paddle: noiseHit(600, 0.045, 0.9, 0.35),
    // 撞墙：更轻的“嘀”——高频较多但不刺耳
    wall:   (when:number=0) => { if(muted) return; const c = ensure(); const m = master(); if(!c || !m) return;
      const o = c.createOscillator(); o.type='sine'; const g = c.createGain(); const t0=c.currentTime+when; o.frequency.setValueAtTime(1400, t0); env(c,g,t0,0.0015,0.03,0.0009,0.04,0.18); o.connect(g).connect(m.g); o.start(t0); o.stop(t0+0.08)
    },
    // 失败：柔和下滑的正弦，避免刺耳
    lose:   tone('sine', 300, 120, 0.35, 0.32),
    // 胜利：小和弦提示
    win:    winChord(),
  }
}

export default function Breakout(){
  const ref = useRef<HTMLCanvasElement|null>(null)

  // UI/Game states
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [lives, setLives] = useState(3)
  const [over, setOver] = useState(false)
  const [won, setWon] = useState(false)
  const [muted, setMuted] = useState(false)
  const [runKey, setRunKey] = useState(0)
  const livesRef = useRef(lives)
  const overRef = useRef(over)
  const wonRef = useRef(won)
  useEffect(()=>{ livesRef.current = lives }, [lives])
  useEffect(()=>{ overRef.current = over }, [over])
  useEffect(()=>{ wonRef.current = won }, [won])
  const sfx = useSfx(muted)
  const sfxRef = useRef(sfx)
  useEffect(()=>{ sfxRef.current = sfx }, [sfx])

  useEffect(()=>{
    const cvs = ref.current!
    const ctx = (cvs.getContext('2d', { alpha:false }) as CanvasRenderingContext2D) || cvs.getContext('2d')!

    // Snapshot canvas for freezing the last frame on end states
    const snap = document.createElement('canvas')
    const sctx = snap.getContext('2d') as CanvasRenderingContext2D
    let hasSnap = false

    // devicePixelRatio‑safe sizing
    let rect = cvs.getBoundingClientRect()
    let DPR = window.devicePixelRatio || 1
    function fit(){
      rect = cvs.getBoundingClientRect()
      DPR = window.devicePixelRatio || 1
      cvs.width = Math.max(320, rect.width * DPR)
      cvs.height = 520 * DPR
      ctx.setTransform(DPR,0,0,DPR,0,0)
      // 如果已有快照，先把快照按新尺寸绘回画布，避免因 resize 清空导致的空白
      if(hasSnap){
        // 临时用 1:1 变换绘制整幅快照，再恢复 DPR 变换
        ctx.save()
        ctx.setTransform(1,0,0,1,0,0)
        ctx.drawImage(snap, 0, 0, cvs.width, cvs.height)
        ctx.restore()
      }
    }
    cvs.style.width='100%'; cvs.style.height='520px'
    fit(); addEventListener('resize', fit)


    // World
    const W = () => rect.width
    const H = 520

    const PAD_W_BASE = 90
    const PAD_W_LEVEL = Math.max(60, PAD_W_BASE - (level-1)*4)
    const paddle = { x: W()/2- PAD_W_LEVEL/2, y: H-26, w: PAD_W_LEVEL, h: 12, speed: 360 }

    type Ball = { x:number,y:number,vx:number,vy:number,r:number,held:boolean }
    const balls: Ball[] = [ { x: W()/2, y: H-48, vx: 160, vy: -180, r: 8, held:true } ]

    type Brick = { x:number,y:number,w:number,h:number,alive:boolean,color:string }
    const bricks: Brick[] = []

    type PowerUp = { x:number,y:number,w:number,h:number,vy:number,kind:'multi'|'widen'|'slow'|'sticky'|'fire' }
    const powerUps: PowerUp[] = []
    type Obstacle = { x:number,y:number,w:number,h:number }
    const obstacles: Obstacle[] = []

    // 临时增益效果（秒）
    let widenT = 0, slowT = 0, stickyT = 0, fireT = 0, lifeFreezeT = 0

    function makeBricks(rows:number, cols:number){
      bricks.length = 0
      const gapX = 6, gapY = 14
      const marginX = 16, marginTop = 56
      const bw = (W() - marginX*2 - gapX*(cols-1)) / cols
      const bh = 16
      const palette = ['#60a5fa','#34d399','#fbbf24','#f87171','#a78bfa']
      for(let r=0;r<rows;r++){
        for(let c=0;c<cols;c++){
          const x = marginX + c*(bw+gapX)
          const y = marginTop + r*(bh+gapY)
          bricks.push({ x, y, w:bw, h:bh, alive:true, color: palette[r % palette.length] })
        }
      }
    }

    function makeObstacles(lv:number){
      obstacles.length = 0
      const w = W(), h = H
      // 关卡变化：按关卡取模放置不同形状
      const m = (lv-1) % 3
      if(m===0 && lv>=2){
        // 中央细柱
        const ow = Math.max(10, Math.min(18, w*0.03))
        obstacles.push({ x: w*0.5 - ow/2, y: h*0.32, w: ow, h: h*0.22 })
      } else if(m===1){
        // 左右两侧柱子
        const ow = Math.max(10, Math.min(18, w*0.03))
        obstacles.push({ x: w*0.28 - ow/2, y: h*0.28, w: ow, h: h*0.26 })
        obstacles.push({ x: w*0.72 - ow/2, y: h*0.28, w: ow, h: h*0.26 })
      } else if(m===2){
        // 横梁，限制直线穿过
        const oh = 10
        obstacles.push({ x: w*0.2, y: h*0.45, w: w*0.6, h: oh })
      }
    }

    function resetBall(){
      // 重置为单球，附着在球拍上（不要直接改 balls[0]，重新构造对象以避免 undefined）
      const lvScale = 1 + (level-1)*0.05
      const newBall: Ball = {
        x: paddle.x + paddle.w/2,
        y: paddle.y - 12,
        vx: ((Math.random() * 120) - 60) * lvScale,
        vy: (-200 - Math.random()*60) * lvScale,
        r: 8,
        held: true,
      }
      balls.length = 0
      balls.push(newBall)
    }

    function addBall(base?: Ball){
      const b = base || balls[0]
      const ang = Math.atan2(b.vy, b.vx) + (Math.random()*0.6 - 0.3)
      const spd = Math.hypot(b.vx, b.vy)
      balls.push({ x:b.x, y:b.y, vx: Math.cos(ang)*spd, vy: Math.sin(ang)*spd, r:8, held:false })
    }

    makeBricks(Math.min(4 + level, 10), 12)
    resetBall()
    makeObstacles(level)

    // input
    let left=false,right=false
    function key(e:KeyboardEvent){
      if(e.key==='ArrowLeft' || e.key==='a') left = e.type==='keydown'
      if(e.key==='ArrowRight'|| e.key==='d') right = e.type==='keydown'
      if(e.type==='keydown' && (e.key===' ' || e.key==='Enter')){
        // 结束态不允许再发球
        if(overRef.current || wonRef.current) return
        // 任意有持球则发球并播放一次
        const anyHeld = balls.some(b=>b.held)
        if(anyHeld) sfxRef.current.launch()
        balls.forEach(b=> b.held = false)
      }
      if(e.type==='keydown' && e.key.toLowerCase()==='r'){ // quick restart
        if(overRef.current || wonRef.current){ setOver(false); setWon(false); setScore(0); setLives(3); setLevel(1); makeBricks(4,9); resetBall(); }
      }
    }
    addEventListener('keydown', key); addEventListener('keyup', key)

    function pointerMove(e:PointerEvent){
      const x = e.clientX - rect.left
      paddle.x = Math.max(10, Math.min(W()-paddle.w-10, x - paddle.w/2))
      const main = balls[0]
      if(main && main.held){ main.x = paddle.x + paddle.w/2; main.y = paddle.y - 12 }
    }
    cvs.addEventListener('pointermove', pointerMove)
    const onPointerDown = () => {
      if(overRef.current || wonRef.current) return
      const anyHeld = balls.some(b=>b.held)
      if(anyHeld){ sfxRef.current.launch() }
      balls.forEach(b=> b.held = false)
    }
    cvs.addEventListener('pointerdown', onPointerDown)

    // helpers
    // 颜色明暗辅助（-1..1），用于砖块渐变/描边
    function shade(hex:string, amt:number){
      const h = hex.replace('#','')
      const num = parseInt(h,16)
      const r = Math.max(0, Math.min(255, ((num>>16)&255) + Math.floor(amt*255)))
      const g = Math.max(0, Math.min(255, ((num>>8)&255)  + Math.floor(amt*255)))
      const b = Math.max(0, Math.min(255, (num&255)       + Math.floor(amt*255)))
      return `#${(r<<16 | g<<8 | b).toString(16).padStart(6,'0')}`
    }
    function drawPaddle(){
      ctx.fillStyle = '#ffffff'
      if ((ctx as any).roundRect){ (ctx as any).roundRect(paddle.x, paddle.y, paddle.w, paddle.h, 6); ctx.fill() } else { ctx.fillRect(paddle.x,paddle.y,paddle.w,paddle.h) }
      // top highlight
      ctx.fillStyle = 'rgba(255,255,255,.35)'
      ctx.fillRect(paddle.x, paddle.y, paddle.w, 3)
    }

    function drawBalls(){
      for(const ball of balls){
        // shadow
        ctx.fillStyle='rgba(0,0,0,.18)'
        ctx.beginPath(); ctx.ellipse(ball.x+2, ball.y+4, ball.r*1.1, ball.r*0.8, 0, 0, Math.PI*2); ctx.fill()
        // body
        const g = ctx.createRadialGradient(ball.x-3, ball.y-3, 2, ball.x, ball.y, ball.r+1)
        g.addColorStop(0,'#fff'); g.addColorStop(1,'#cbd5e1')
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2); ctx.fill()
      }
    }

    function drawBrick(b:Brick){
      // 路径
      ctx.beginPath()
      if ((ctx as any).roundRect){ (ctx as any).roundRect(b.x,b.y,b.w,b.h,4) } else { ctx.rect(b.x,b.y,b.w,b.h) }

      // 渐变主体（上下明暗）
      const g = ctx.createLinearGradient(0,b.y,0,b.y+b.h)
      g.addColorStop(0, shade(b.color, 0.22))
      g.addColorStop(0.55, b.color)
      g.addColorStop(1, shade(b.color, -0.18))
      ctx.fillStyle = g
      ctx.fill()

      // 外描边（更深一档）
      ctx.strokeStyle = shade(b.color, -0.28)
      ctx.lineWidth = 1
      ctx.stroke()

      // 亮边高光（上沿内发光）
      ctx.save()
      ctx.beginPath()
      if ((ctx as any).roundRect){ (ctx as any).roundRect(b.x+1,b.y+1,b.w-2,5,3) } else { ctx.rect(b.x+1,b.y+1,b.w-2,5) }
      const hg = ctx.createLinearGradient(0,b.y+1,0,b.y+6)
      hg.addColorStop(0,'rgba(255,255,255,.55)')
      hg.addColorStop(1,'rgba(255,255,255,0)')
      ctx.fillStyle = hg
      ctx.fill()
      ctx.restore()

      // 底部内阴影
      ctx.save()
      ctx.beginPath()
      if ((ctx as any).roundRect){ (ctx as any).roundRect(b.x+1,b.y+b.h-4,b.w-2,3,2) } else { ctx.rect(b.x+1,b.y+b.h-4,b.w-2,3) }
      const sg = ctx.createLinearGradient(0,b.y+b.h-4,0,b.y+b.h)
      sg.addColorStop(0,'rgba(0,0,0,.18)')
      sg.addColorStop(1,'rgba(0,0,0,0)')
      ctx.fillStyle = sg
      ctx.fill()
      ctx.restore()

      // 细节：两侧铆钉感点缀（可选）
      ctx.fillStyle = 'rgba(255,255,255,.18)'
      ctx.beginPath(); ctx.arc(b.x+6, b.y+b.h/2, 1.2, 0, Math.PI*2); ctx.fill()
      ctx.beginPath(); ctx.arc(b.x+b.w-6, b.y+b.h/2, 1.2, 0, Math.PI*2); ctx.fill()
    }

    // Draw a power-up tile with a more realistic glossy style
    function drawPowerUp(p: PowerUp){
      // base color by kind
      const base = p.kind==='multi' ? '#0ea5e9' // cyan-blue
          : p.kind==='widen' ? '#f59e0b' // amber
              : p.kind==='slow'  ? '#3b82f6' // blue
                  : p.kind==='sticky'? '#8b5cf6' // violet
                      : '#ef4444'                     // red (fire)

      const x=p.x, y=p.y, w=p.w, h=p.h, r=4

      // soft drop shadow
      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,.25)'
      if((ctx as any).roundRect){ (ctx as any).roundRect(x+1.5, y+2.5, w, h, r); ctx.fill() } else { ctx.fillRect(x+1.5,y+2.5,w,h) }
      ctx.restore()

      // glossy gradient body
      const g = ctx.createLinearGradient(0,y,0,y+h)
      g.addColorStop(0, shade(base, 0.20))
      g.addColorStop(0.5, base)
      g.addColorStop(1, shade(base, -0.25))
      ctx.fillStyle = g
      ctx.beginPath(); if((ctx as any).roundRect){ (ctx as any).roundRect(x,y,w,h,r) } else { ctx.rect(x,y,w,h) } ctx.fill()

      // inner stroke
      ctx.strokeStyle = shade(base, -0.35)
      ctx.lineWidth = 1
      ctx.stroke()

      // top glossy highlight
      ctx.save()
      const hg = ctx.createLinearGradient(0,y,0,y+h*0.45)
      hg.addColorStop(0, 'rgba(255,255,255,.7)')
      hg.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = hg
      ctx.beginPath(); if((ctx as any).roundRect){ (ctx as any).roundRect(x+1,y+1,w-2,Math.max(4,h*0.45), r*0.7) } else { ctx.rect(x+1,y+1,w-2,Math.max(4,h*0.45)) } ctx.fill()
      ctx.restore()

      // icon (white w/ tiny shadow)
      const cx = x + w/2, cy = y + h/2
      ctx.save();
      ctx.translate(cx, cy)
      ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur=1.2; ctx.shadowOffsetY=0.6
      ctx.strokeStyle = 'rgba(255,255,255,.95)'
      ctx.fillStyle   = 'rgba(255,255,255,.95)'
      ctx.lineWidth = 1.6

      if(p.kind==='multi'){
        // three glossy balls
        const balls = [ [-4,0], [0,-3], [4,2] ]
        for(const [dx,dy] of balls){
          const bx = dx, by = dy, br = 2.1
          // ball body w/ radial highlight
          const rg = ctx.createRadialGradient(bx-0.8, by-0.8, 0.2, bx, by, br)
          rg.addColorStop(0,'#fff'); rg.addColorStop(1,'#dbeafe')
          ctx.fillStyle = rg
          ctx.beginPath(); ctx.arc(bx,by,br,0,Math.PI*2); ctx.fill()
        }
      } else if(p.kind==='widen'){
        // double arrow ↔ (filled heads + stroke line)
        ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-3, -3); ctx.lineTo(-3, 3); ctx.closePath(); ctx.fill()
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(3, -3); ctx.lineTo(3, 3); ctx.closePath(); ctx.fill()
      } else if(p.kind==='slow'){
        // hourglass with hollow center
        ctx.beginPath(); ctx.moveTo(-5,-5); ctx.lineTo(5,-5); ctx.lineTo(-2,0); ctx.lineTo(5,5); ctx.lineTo(-5,5); ctx.lineTo(2,0); ctx.closePath(); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(-2,0); ctx.lineTo(2,0); ctx.stroke()
      } else if(p.kind==='sticky'){
        // glossy droplet
        ctx.beginPath(); ctx.moveTo(0,-5); ctx.quadraticCurveTo(5,-1, 3,3); ctx.quadraticCurveTo(0,6, -3,3); ctx.quadraticCurveTo(-5,-1, 0,-5); ctx.closePath(); ctx.fill()
        // droplet highlight
        ctx.fillStyle='rgba(255,255,255,.6)'
        ctx.beginPath(); ctx.ellipse(-1.2, -1.8, 1.6, 0.9, -0.6, 0, Math.PI*2); ctx.fill()
      } else if(p.kind==='fire'){
        // flame with inner gradient
        const fg = ctx.createLinearGradient(0,-6,0,6)
        fg.addColorStop(0,'#fff7ad'); fg.addColorStop(1,'#ffd166')
        ctx.fillStyle = fg
        ctx.beginPath(); ctx.moveTo(0,-6); ctx.quadraticCurveTo(3,-2, 1.8,2); ctx.quadraticCurveTo(0,6, -1.8,2); ctx.quadraticCurveTo(-3,-2, 0,-6); ctx.closePath(); ctx.fill()
      }
      ctx.restore()
    }

    // 顶部 HUD 已移除：得分/关卡/生命等信息在画布下方的工具条展示
    function drawHUD(){ /* no-op */ }

    // 一次性完整渲染当前场景（避免某些分支里只保留渐变背景导致“空白”）
    function renderScene(){
      const w=W(), h=H
      // 背景
      const bg=ctx.createLinearGradient(0,0,w,h); bg.addColorStop(0,'#a2d2ff'); bg.addColorStop(1,'#cdb4db')
      ctx.fillStyle=bg; ctx.fillRect(0,0,w,h)
      // HUD/砖块/障碍/道具/拍子/球
      drawHUD()
      bricks.forEach(b=> b.alive && drawBrick(b))
      ctx.fillStyle = 'rgba(30,41,59,0.25)'
      obstacles.forEach(o=>{
        if((ctx as any).roundRect){ (ctx as any).roundRect(o.x,o.y,o.w,o.h,3); ctx.fill() }
        else { ctx.fillRect(o.x,o.y,o.w,o.h) }
      })
      for(const p of powerUps){ drawPowerUp(p) }
      drawPaddle()
      drawBalls()
    }

    let last=performance.now(), raf=0
    function step(now:number){
      const dt=Math.min(0.033,(now-last)/1000); last=now
      // 本帧音效队列：先收集，绘制完成后统一触发，避免“先声后画”错觉
      const sounds: Array<() => void> = []
      // 若处于掉命冻结期，直接显示上一帧快照，避免任何清空/重排造成的空白
      if(lifeFreezeT > 0){
        lifeFreezeT = Math.max(0, lifeFreezeT - dt)
        ctx.save()
        ctx.setTransform(1,0,0,1,0,0)
        ctx.drawImage(snap, 0, 0, cvs.width, cvs.height)
        ctx.restore()
        raf = requestAnimationFrame(step)
        return
      }
      // 增益计时衰减 & 生效
      widenT = Math.max(0, widenT - dt)
      slowT  = Math.max(0, slowT  - dt)
      stickyT= Math.max(0, stickyT- dt)
      fireT  = Math.max(0, fireT  - dt)
      // 生效：球拍宽度
      paddle.w = widenT>0 ? 130 : PAD_W_BASE
      // 生效：全局减速
      const speedScale = slowT>0 ? 0.6 : 1.0

      // bg
      const w=W(), h=H
      const bg=ctx.createLinearGradient(0,0,w,h); bg.addColorStop(0,'#a2d2ff'); bg.addColorStop(1,'#cdb4db')
      ctx.fillStyle=bg; ctx.fillRect(0,0,w,h)

      // move paddle
      if(left) paddle.x-=paddle.speed*dt*speedScale; if(right) paddle.x+=paddle.speed*dt*speedScale
      paddle.x=Math.max(10, Math.min(w-paddle.w-10, paddle.x))

      // balls physics & collisions
      const outIdx:number[] = []
      for(let i=0;i<balls.length;i++){
        const ball = balls[i]
        const prevX = ball.x, prevY = ball.y

        // move
        if(ball.held){
          ball.x = paddle.x + paddle.w/2
          ball.y = paddle.y - 12
        } else {
          ball.x += ball.vx*dt*speedScale; ball.y += ball.vy*dt*speedScale
        }

        // walls
        if(ball.x-ball.r<8){ ball.x=8+ball.r; ball.vx=Math.abs(ball.vx); if(!ball.held) sounds.push(()=>sfxRef.current.wall()) }
        if(ball.x+ball.r>w-8){ ball.x=w-8-ball.r; ball.vx=-Math.abs(ball.vx); if(!ball.held) sounds.push(()=>sfxRef.current.wall()) }
        if(ball.y-ball.r<8){ ball.y=8+ball.r; ball.vy=Math.abs(ball.vy); if(!ball.held) sounds.push(()=>sfxRef.current.wall()) }

        // bottom – mark out
        if(ball.y-ball.r>h){ outIdx.push(i); continue }

        // paddle collide
        if(!ball.held && ball.x>paddle.x && ball.x<paddle.x+paddle.w && ball.y+ball.r>paddle.y && ball.y-ball.r<paddle.y+paddle.h){
          ball.vy = -Math.abs(ball.vy)
          const ratio=(ball.x-(paddle.x+paddle.w/2))/(paddle.w/2)
          ball.vx = ratio * 260
          ball.y = paddle.y - ball.r - 0.1
          if(!ball.held) sounds.push(()=>sfxRef.current.paddle())
          if(stickyT>0){ ball.held = true }
        }

        // bricks collide
        for(const b of bricks){
          if(!b.alive) continue
          if (ball.x + ball.r > b.x && ball.x - ball.r < b.x + b.w && ball.y + ball.r > b.y && ball.y - ball.r < b.y + b.h) {
            b.alive=false
            setScore(s=>s+1)
            sounds.push(()=>sfxRef.current.brick())
            // 掉落概率：基础20% + 每级+2%，上限40%
            const dropChance = Math.min(0.2 + 0.02*(level-1), 0.4)
            if(Math.random() < dropChance){
              const kinds: PowerUp['kind'][] = ['multi','widen','slow','sticky','fire']
              const kind = kinds[Math.floor(Math.random()*kinds.length)]
              powerUps.push({ x:b.x+b.w/2-8, y:b.y+b.h, w:16, h:16, vy:120, kind })
            }
            // 反弹：火球时穿透不反弹
            if(fireT <= 0){ ball.vy *= -1 }
          }
        }
        // obstacle collide (AABB with simple axis response)
        for(const o of obstacles){
          if(ball.x + ball.r > o.x && ball.x - ball.r < o.x + o.w && ball.y + ball.r > o.y && ball.y - ball.r < o.y + o.h){
            const leftPen = (o.x + o.w) - (ball.x - ball.r)
            const rightPen = (ball.x + ball.r) - o.x
            const topPen = (o.y + o.h) - (ball.y - ball.r)
            const bottomPen = (ball.y + ball.r) - o.y
            const minPen = Math.min(leftPen, rightPen, topPen, bottomPen)
            if(minPen === leftPen){ ball.x = o.x + o.w + ball.r; ball.vx = Math.abs(ball.vx) }
            else if(minPen === rightPen){ ball.x = o.x - ball.r; ball.vx = -Math.abs(ball.vx) }
            else if(minPen === topPen){ ball.y = o.y + o.h + ball.r; ball.vy = Math.abs(ball.vy) }
            else { ball.y = o.y - ball.r; ball.vy = -Math.abs(ball.vy) }
            if(!ball.held) sounds.push(()=>sfxRef.current.wall())
          }
        }
      }

      // 处理掉底球：先删除多余球；若全没了，扣命/重置
      if(outIdx.length){
        // 从后往前删，避免索引移动
        outIdx.sort((a,b)=>b-a).forEach(idx=>{ balls.splice(idx,1) })
        if(balls.length===0){
          sfxRef.current.lose()
          const nl = livesRef.current - 1
          if(nl <= 0){
            setLives(0)
            setOver(true)

            // 渲染一帧并建立快照后定格，确保不是空背景
            renderScene()
            snap.width = cvs.width
            snap.height = cvs.height
            sctx.clearRect(0,0,snap.width,snap.height)
            sctx.drawImage(cvs,0,0)
            hasSnap = true

            ctx.save()
            ctx.setTransform(1,0,0,1,0,0)
            ctx.drawImage(snap, 0, 0, cvs.width, cvs.height)
            ctx.restore()

            sounds.forEach(fn=>{ try{ fn() }catch{} })
            return
          } else {
            setLives(nl)
            resetBall()
            // 开启 250ms 冻结：定格完整画面
            lifeFreezeT = 0.25
            // 先完整渲染一帧（砖块/拍子/球/道具），再更新快照并立刻贴到画布
            renderScene()
            snap.width = cvs.width
            snap.height = cvs.height
            sctx.clearRect(0,0,snap.width,snap.height)
            sctx.drawImage(cvs,0,0)
            hasSnap = true
            ctx.save()
            ctx.setTransform(1,0,0,1,0,0)
            ctx.drawImage(snap, 0, 0, cvs.width, cvs.height)
            ctx.restore()

            sounds.forEach(fn=>{ try{ fn() }catch{} })
            raf=requestAnimationFrame(step)
            return
          }
        }
      }

      // power-ups 下落与拾取
      for(let i=powerUps.length-1;i>=0;i--){
        const p = powerUps[i]
        p.y += p.vy*dt*speedScale
        // 拾取
        if(p.y+p.h>=paddle.y && p.y<=paddle.y+paddle.h && p.x+p.w>=paddle.x && p.x<=paddle.x+paddle.w){
          switch(p.kind){
            case 'multi': { const base = balls[0]; if(base){ addBall(base); addBall(base) } break }
            case 'widen': { widenT = 12; paddle.w = 130; break }
            case 'slow': { slowT = 10; break }
            case 'sticky': { stickyT = 10; break }
            case 'fire': { fireT = 8; break }
          }
          powerUps.splice(i,1)
        } else if(p.y>h+40){
          powerUps.splice(i,1)
        }
      }

      // 检查胜利
      let aliveCount = 0
      for(const b of bricks){
        if(b.alive) aliveCount++
      }
      if(aliveCount===0){
        sounds.push(()=>sfxRef.current.win())
        setWon(true)
        balls.forEach(b=>{ b.held = true; b.vx = 0; b.vy = 0 })

// 完整渲染一帧定格
        renderScene()
        sounds.forEach(fn=>{ try{ fn() }catch{} })

// cache the final frame for overlay display
        snap.width = cvs.width
        snap.height = cvs.height
        sctx.clearRect(0,0,snap.width,snap.height)
        sctx.drawImage(cvs,0,0)
        hasSnap = true
        return
      }

      // draw（统一一次完整渲染，防止只绘背景导致的“空白帧”）
      renderScene()

      // 画面已更新，再触发本帧音效，保证“看到接触”的瞬间才听到
      sounds.forEach(fn=>{ try{ fn() }catch{} })
      // cache the fully rendered frame
      snap.width = cvs.width
      snap.height = cvs.height
      sctx.clearRect(0,0,snap.width,snap.height)
      sctx.drawImage(cvs,0,0)
      hasSnap = true

      raf=requestAnimationFrame(step)
    }

    raf=requestAnimationFrame(step)

    return ()=>{ cancelAnimationFrame(raf); removeEventListener('keydown', key); removeEventListener('keyup', key); removeEventListener('resize', fit); cvs.removeEventListener('pointermove', pointerMove); cvs.removeEventListener('pointerdown', onPointerDown) }
  }, [level, runKey])

  // overlay actions
  function restartAll(){ setScore(0); setLevel(1); setLives(3); setOver(false); setWon(false); setRunKey(k=>k+1) }
  function nextLevel(){ setLevel(l=>l+1); setOver(false); setWon(false) }

  return (
      <div className="container" style={{position:'relative'}}>
        <h1>🧱 打砖块（升级版）</h1>
        <p className="desc">左右键 / A·D 移动；点击或空格发球；有生命、关卡与更好的手感。</p>
        <div className="stage" style={{height:520, position:'relative'}}>
          <canvas ref={ref} style={{width:'100%', height:'100%'}}/>
        </div>
        <div style={{display:'flex', gap:12, marginTop:12, flexWrap:'wrap', alignItems:'center'}}>
          <div className="badge">得分 {score}</div>
          <div className="badge">关卡 {level}</div>
          <div className="badge">生命 {lives}</div>
          <button className="btn ghost" onClick={restartAll}>重新开始</button>
          <button className="btn ghost" onClick={()=>setMuted(m=>!m)}>音效：{muted?'关':'开'}</button>
          <a className="btn ghost" href="/">返回首页</a>
        </div>

        {(over || won) && (
            <div style={{
              position:'absolute', inset:0, background:'rgba(0,0,0,.55)', color:'#fff',
              display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column',
              zIndex:10
            }}>
              <div style={{fontSize:22, marginBottom:12}}>{won ? `关卡 ${level} 完成！` : '游戏结束'}</div>
              <div style={{display:'flex', gap:8}}>
                <button className="btn primary" onClick={won ? nextLevel : restartAll}>{won ? '下一关' : '重新开始'}</button>
                <button className="btn ghost" onClick={()=>{
                  if(won){ setWon(false); setRunKey(k=>k+1) }
                  else { setOver(false); setRunKey(k=>k+1) }
                }}>关闭</button>
              </div>
            </div>
        )}
      </div>
  )
}
