import React, { useEffect, useRef, useState } from 'react'
import '../styles.css'

/**
 * 贪吃蛇 · 统一风格升级版（可调格数）
 * - 统一样式 + 模式（撞墙/穿墙）+ 暂停 + 轻微撞击动效 + 触摸滑动
 * - 新增：可调棋盘格数（20/24/30），自适应画布尺寸与逻辑边界
 */

const CELL = 22 // 单元像素尺寸（逻辑上每格1单位，渲染放大）

interface Point { x: number; y: number }

type Mode = 'wall' | 'wrap'

// --- audio helpers ---
const AudioCtx: typeof AudioContext | undefined = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext

function randomFood(snake: Point[], size: number): Point {
  while (true) {
    const p = { x: Math.floor(Math.random() * size), y: Math.floor(Math.random() * size) }
    if (!snake.some(s => s.x === p.x && s.y === p.y)) return p
  }
}

export default function Snake() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const dir = useRef<Point>({ x: 0, y: -1 })
  const nextDir = useRef<Point>({ x: 0, y: -1 }) // 防止一帧内反向
  const [grid, setGrid] = useState<number>(20) // ✅ 可调格数
  const gridRef = useRef(grid)
  useEffect(() => { gridRef.current = grid }, [grid])

  // 音效：首次交互时创建 AudioContext，避免自动播放限制
  const audioRef = useRef<AudioContext | null>(null)
  // 音效开关
  const [soundOn, setSoundOn] = useState(true)
  const soundOnRef = useRef(soundOn)
  useEffect(()=>{ soundOnRef.current = soundOn }, [soundOn])

  function ensureAudio(){
    if (!AudioCtx) return
    if (!soundOnRef.current) return
    if (!audioRef.current) audioRef.current = new AudioCtx()
    // 避免 suspended 导致首声延迟
    // @ts-ignore
    audioRef.current?.resume?.()
  }
  function tone(freq:number, dur=0.09, type:OscillatorType='triangle', gain=0.04, delay=0){
    const ctx = audioRef.current; if (!soundOnRef.current || !ctx) return
    const t = ctx.currentTime + delay
    const osc = ctx.createOscillator(); const g = ctx.createGain()
    osc.type = type; osc.frequency.setValueAtTime(freq, t)
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t+dur)
    osc.connect(g).connect(ctx.destination); osc.start(t); osc.stop(t+dur)
  }
  const sfx = {
    eat(){ ensureAudio(); tone(660, .10, 'triangle', .05); tone(880, .07, 'triangle', .04, .05) },
    start(){ ensureAudio(); tone(520, .08, 'square', .035); },
    pause(){ ensureAudio(); tone(420, .06, 'square', .03) },
    resume(){ ensureAudio(); tone(540, .06, 'square', .03) },
    move(){ ensureAudio(); tone(360, .04, 'square', .02) },
    over(){ ensureAudio(); tone(300, .12, 'sawtooth', .05); tone(200, .18, 'sawtooth', .045, .10) },
  }

  const makeInitialSnake = (n: number): Point[] => {
    const mid = Math.floor(n / 2)
    return [{ x: mid, y: mid }, { x: mid, y: mid + 1 }, { x: mid, y: mid + 2 }]
  }

  const snake = useRef<Point[]>(makeInitialSnake(grid))
  const food = useRef<Point>(randomFood(snake.current, grid))
  const loopId = useRef<number | null>(null)

  const [mode, setMode] = useState<Mode>('wall')
  const [score, setScore] = useState(0)
  const [best, setBest] = useState<number>(() => Number(localStorage.getItem('best_snake') || 0))
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(200) // 毫秒/步，吃到食物逐步加快
  const [bump, setBump] = useState(false)
  const [gameOver, setGameOver] = useState(false)

  useEffect(() => {
    const c = canvasRef.current!
    const ctx = c.getContext('2d')!
    const n0 = gridRef.current
    c.width = n0 * CELL
    c.height = n0 * CELL
    ctxRef.current = ctx
    ctx.setTransform(1,0,0,1,0,0)
    ctx.imageSmoothingEnabled = false
    ctx.scale(CELL, CELL)
    draw()
  }, [])

  // 键盘控制
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      ensureAudio()
      if (e.key === ' '){ e.preventDefault(); togglePause(); return }
      if (paused) return
      if (gameOver) return
      if (e.key === 'ArrowUp'   && dir.current.y !== 1)  nextDir.current = { x: 0, y: -1 }
      if (e.key === 'ArrowDown' && dir.current.y !== -1) nextDir.current = { x: 0, y: 1 }
      if (e.key === 'ArrowLeft' && dir.current.x !== 1)  nextDir.current = { x: -1, y: 0 }
      if (e.key === 'ArrowRight'&& dir.current.x !== -1) nextDir.current = { x: 1, y: 0 }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [paused, gameOver])

  // 触摸滑动
  useEffect(() => {
    let sx = 0, sy = 0, st = 0
    const onStart = (e: TouchEvent) => {
      ensureAudio()
      const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now()
    }
    const onEnd = (e: TouchEvent) => {
      if (paused) return
      const t = e.changedTouches[0]
      const dx = t.clientX - sx, dy = t.clientY - sy
      const adx = Math.abs(dx), ady = Math.abs(dy)
      if (Date.now() - st < 500 && Math.max(adx, ady) > 20) {
        if (adx > ady) nextDir.current = (dx > 0 && dir.current.x !== -1) ? {x:1,y:0} : (dx < 0 && dir.current.x !== 1) ? {x:-1,y:0} : dir.current
        else           nextDir.current = (dy > 0 && dir.current.y !== -1) ? {x:0,y:1} : (dy < 0 && dir.current.y !== 1) ? {x:0,y:-1} : dir.current
      }
    }
    const el = canvasRef.current
    if (!el) return
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchend', onEnd)
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchend', onEnd) }
  }, [paused])

  // 游戏主循环（根据 speed 重建 interval）
  useEffect(() => {
    if (paused) return
    if (loopId.current) clearInterval(loopId.current)
    loopId.current = window.setInterval(step, speed)
    return () => { if (loopId.current) clearInterval(loopId.current) }
  }, [speed, paused, mode])

  useEffect(() => { if (score > best) { setBest(score); localStorage.setItem('best_snake', String(score)) } }, [score, best])

  function togglePause(){
    setPaused(p => { const np = !p; np ? sfx.pause() : sfx.resume(); return np })
  }

  function resetGame(newGrid?: number){
    const n = newGrid ?? gridRef.current
    gridRef.current = n
    setPaused(false)
    setGameOver(false)
    setScore(0)
    setSpeed(200)
    sfx.start()
    if (newGrid) { setGrid(newGrid) }

    const init = makeInitialSnake(n)
    snake.current = init
    dir.current = { x: 0, y: -1 }
    nextDir.current = { x: 0, y: -1 }
    food.current = randomFood(init, n)
    // 重设画布实际大小并恢复缩放
    const c = canvasRef.current!
    c.width = n * CELL
    c.height = n * CELL
    const ctx = ctxRef.current!
    ctx.setTransform(1,0,0,1,0,0)
    ctx.imageSmoothingEnabled = false
    ctx.scale(CELL, CELL)
    draw()
  }

  function wrap(p: Point, n: number): Point { // 穿墙
    return { x: (p.x + n) % n, y: (p.y + n) % n }
  }

  function step(){
    const ctx = ctxRef.current!
    const n = gridRef.current
    // 应用方向（每步只更新一次，避免反向自撞）
    dir.current = nextDir.current

    let head = { x: snake.current[0].x + dir.current.x, y: snake.current[0].y + dir.current.y }

    if (mode === 'wrap') {
      head = wrap(head, n)
    } else {
      // 撞墙：显示游戏结束并暂停
      if (head.x < 0 || head.x >= n || head.y < 0 || head.y >= n) {
        setBump(true); setTimeout(()=>setBump(false), 150)
        sfx.over()
        setPaused(true)
        setGameOver(true)
        draw()
        return
      }
    }

    // 撞自己
    if (snake.current.some((p, i) => i < snake.current.length && p.x === head.x && p.y === head.y)) {
      setBump(true); setTimeout(()=>setBump(false), 150)
      sfx.over()
      setPaused(true)
      setGameOver(true)
      draw()
      return
    }

    // 前进
    snake.current = [head, ...snake.current]
    sfx.move()

    // 吃食物
    if (head.x === food.current.x && head.y === food.current.y) {
      sfx.eat()
      setScore(s => s + 10)
      food.current = randomFood(snake.current, n)
      // 逐步加速，最低 80ms
      setSpeed(ms => Math.max(80, ms - 10))
    } else {
      snake.current.pop()
    }

    // 绘制
    draw()

    // 轻微“撞击/移动”反馈
    if (bump) {
      ctx.save(); ctx.translate(0, -0.06); draw(); ctx.restore(); setBump(false)
    }
  }

  // --- New drawing helpers (candy style) ---
  function drawApple(ctx: CanvasRenderingContext2D, x:number, y:number){
    // body
    const grad = ctx.createLinearGradient(0, y, 0, y+1)
    grad.addColorStop(0, '#ff7a7a')
    grad.addColorStop(1, '#e11d48')
    ctx.fillStyle = grad
    roundRect(ctx, x+0.12, y+0.12, 0.76, 0.76, 0.28)
    // highlight
    ctx.fillStyle = 'rgba(255,255,255,.55)'
    roundRect(ctx, x+0.24, y+0.20, 0.22, 0.16, 0.08)
    // stem
    ctx.fillStyle = '#5b3b1f'
    roundRect(ctx, x+0.48, y+0.02, 0.08, 0.18, 0.04)
    // leaf
    ctx.fillStyle = '#22c55e'
    roundRect(ctx, x+0.56, y+0.06, 0.20, 0.12, 0.08)
  }

  function drawSnakeSegment(ctx: CanvasRenderingContext2D, x:number, y:number, isHead:boolean){
    // glossy gradient body with outline
    const grad = ctx.createLinearGradient(0, y, 0, y+1)
    grad.addColorStop(0, '#6ee7b7')
    grad.addColorStop(1, '#10b981')
    ctx.fillStyle = grad
    roundRect(ctx, x+0.08, y+0.08, 0.84, 0.84, 0.28)
    // outline
    ctx.strokeStyle = 'rgba(0,0,0,.25)'
    ctx.lineWidth = 1 / CELL
    ctx.stroke()
    // glossy top streak
    ctx.fillStyle = 'rgba(255,255,255,.28)'
    roundRect(ctx, x+0.12, y+0.14, 0.60, 0.10, 0.05)
    if(isHead){
      // eyes
      ctx.fillStyle = '#fff'
      const eR = 0.08
      ctx.beginPath(); ctx.arc(x+0.35, y+0.35, eR, 0, Math.PI*2); ctx.fill()
      ctx.beginPath(); ctx.arc(x+0.65, y+0.35, eR, 0, Math.PI*2); ctx.fill()
      ctx.fillStyle = '#0f172a'
      ctx.beginPath(); ctx.arc(x+0.35, y+0.35, eR*0.45, 0, Math.PI*2); ctx.fill()
      ctx.beginPath(); ctx.arc(x+0.65, y+0.35, eR*0.45, 0, Math.PI*2); ctx.fill()
    }
  }

  function draw(){
    const ctx = ctxRef.current!
    const n = gridRef.current
    // 背景
    ctx.fillStyle = '#0b1220'
    ctx.fillRect(0, 0, n, n)

    // 网格淡线
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1 / CELL
    for (let i = 0; i <= n; i++){
      ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,n); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(n,i); ctx.stroke()
    }

    // 食物（苹果）
    drawApple(ctx, food.current.x, food.current.y)

    // 蛇（糖果光泽风格 + 头部眼睛）
    for (let i=0; i<snake.current.length; i++){
      const s = snake.current[i]
      drawSnakeSegment(ctx, s.x, s.y, i===0)
    }
  }

  function roundRect(ctx: CanvasRenderingContext2D, x:number, y:number, w:number, h:number, r:number){
    ctx.beginPath()
    ctx.moveTo(x+r, y)
    ctx.arcTo(x+w, y, x+w, y+h, r)
    ctx.arcTo(x+w, y+h, x, y+h, r)
    ctx.arcTo(x, y+h, x, y, r)
    ctx.arcTo(x, y, x+w, y, r)
    ctx.closePath()
    ctx.fill()
  }

  // 便捷按钮：切换格数
  const SizeButtons = () => (
    <div className="modes">
      <span className="sec-title" style={{marginRight:6}}>格数</span>
      <button className={`mode-btn ${grid===20?'on':''}`} onClick={()=>resetGame(20)}>20×20</button>
      <button className={`mode-btn ${grid===24?'on':''}`} onClick={()=>resetGame(24)}>24×24</button>
      <button className={`mode-btn ${grid===30?'on':''}`} onClick={()=>resetGame(30)}>30×30</button>
    </div>
  )

  return (
    <div className="page-wrap">
      <div className="shell">
        <div className="left">
          <header className="page-header compact">
            <h1 className="title">🐍 贪吃蛇 · 升级版</h1>
            <p className="subtitle">统一 UI · 方向键/滑动控制 · 支持暂停、穿墙模式、逐步加速。</p>

            <div className="modes">
              <span className="sec-title" style={{marginRight:6}}>玩法</span>
              <button className={`mode-btn ${mode==='wall'?'on':''}`} onClick={()=>setMode('wall')}>撞墙</button>
              <button className={`mode-btn ${mode==='wrap'?'on':''}`} onClick={()=>setMode('wrap')}>穿墙</button>
              <button className="mode-btn" onClick={togglePause}>{paused ? '继续' : '暂停'}</button>
              <button className="mode-btn" aria-label="切换音效" onClick={()=>setSoundOn(v=>!v)}>{soundOn ? '音效：开' : '音效：关'}</button>
            </div>

            <SizeButtons />

            <div className="stats unified">
              <div className="chip"><div className="label">分数</div><div className="value">{score}</div></div>
              <div className="chip"><div className="label">最高分</div><div className="value">{best}</div></div>
              <div className="chip"><div className="label">速度(ms/步)</div><div className="value">{speed}</div></div>
              <div className="chip"><div className="label">格数</div><div className="value">{grid}×{grid}</div></div>
            </div>
          </header>

          <div className={`board-card ${bump ? 'bump' : ''}`} style={{ maxWidth: '100%', width: '100%', margin: '0 auto', display:'flex', justifyContent:'center' }}>
            <div className="grid" style={{ gridTemplateColumns: `repeat(1, 1fr)` }}>
              <canvas
                ref={canvasRef}
                style={{ width: '100%', maxWidth: `${grid * CELL}px`, aspectRatio: '1 / 1', display:'block', borderRadius: 18, background:'#0b1220' }}
              />
            </div>
            {paused && !gameOver && (
              <div className="overlay">
                <div className="panel">
                  <div className="result-title">⏸ 暂停中</div>
                  <div className="result-sub">当前分数 {score} · 速度 {speed}ms/步</div>
                  <div className="overlay-actions">
                    <button className="btn primary" onClick={togglePause}>继续游戏</button>
                  </div>
                </div>
              </div>
            )}
            {gameOver && (
              <div className="overlay">
                <div className="panel">
                  <div className="result-title">💀 游戏结束</div>
                  <div className="result-sub">本局分数 {score} · 最高分 {best}</div>
                  <div className="overlay-actions">
                    <button className="btn primary" onClick={()=>resetGame()}>再来一局</button>
                    <a className="btn secondary" href="/">返回首页</a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bottom-bar">
          <div className="actions">
            <button className="btn primary" onClick={()=>resetGame()}>再来一局</button>
            <a className="btn secondary" href="/">返回首页</a>
          </div>
          <p className="help">操作：← → ↑ ↓ 或触摸滑动；空格暂停/继续。</p>
        </div>
      </div>

      <style>{`
        .page-wrap{ min-height:100vh; display:flex; align-items:flex-start; justify-content:center; padding:16px 24px 24px; background:radial-gradient(1000px 600px at 20% 0%,#f8fafc,#eef2f7); }
        .shell{ width:min(100%,980px); display:grid; grid-template-columns: 1fr; gap:16px; }
        .page-header.compact{ width:100%; margin:0 0 10px; }
        .page-header .title{ font-size:clamp(24px,3.2vw,34px); margin:0; letter-spacing:.2px; }
        .page-header .subtitle{ font-size:14px; color:#475569; margin:6px 0 10px; }

        .modes{ display:flex; gap:8px; margin:6px 0 8px; flex-wrap:wrap; }
        .mode-btn{ appearance:none; border:1px solid #e2e8f0; background:#fff; border-radius:10px; padding:8px 10px; font-weight:700; cursor:pointer; }
        .mode-btn.on{ background:#0ea5e9; color:#062a37; border-color:#0ea5e9; box-shadow: 0 6px 14px rgba(14,165,233,.25); }
        .mode-btn:hover{ background:#f8fafc; }
        .mode-btn:active{ transform:translateY(1px); }
        .sec-title{ font-size:12px; font-weight:800; color:#0f172a; }

        .board-card{ background: linear-gradient(135deg,#ffffff,#f1f5f9); border-radius: 18px; box-shadow: 0 14px 28px rgba(2,6,23,.14); padding: 20px; position:relative; overflow:hidden; width:100%; }
        .board-card::before{ content:""; position:absolute; inset:10px; border-radius:14px; box-shadow: inset 0 0 0 1px rgba(226,232,240,.8), inset 0 -30px 60px rgba(2,6,23,.06); pointer-events:none; }
        .grid{ display:grid; gap: 0; justify-content:center; }

        .stats{ display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin:10px 0 14px; }
        .chip{ flex:0 0 auto; min-width:140px; background:#0f172a; color:#e2e8f0; border-radius:12px; padding:10px 12px; box-shadow: inset 0 -2px 0 rgba(255,255,255,.06); }
        .chip .label{ font-size:12px; opacity:.8; }
        .chip .value{ font-size:20px; font-weight:800; line-height:1.1; }

        .actions{ display:flex; gap:12px; margin:8px 0 10px; }
        .btn{ appearance:none; border:none; border-radius:10px; padding:10px 14px; font-weight:700; cursor:pointer; }
        .btn.primary{ background:#10b981; color:#053a2b; box-shadow: 0 6px 14px rgba(16,185,129,.28); }
        .btn.secondary{ background:#ffffff; color:#0f172a; border:1px solid #e2e8f0; }

        .help{ color:#64748b; font-size:12px; margin-top:6px; text-align:center; }
        .bottom-bar{ background: linear-gradient(135deg,#ffffff,#f8fafc); border:1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; display:flex; align-items:center; justify-content:space-between; box-shadow: 0 12px 26px rgba(2,6,23,.10); }
        @media (max-width: 640px){ .bottom-bar{ flex-direction:column; gap:8px; align-items:stretch; text-align:center; } .bottom-bar .actions{ justify-content:center; } }

        @keyframes board-bump{ 0%{ transform:translateY(0)} 30%{ transform:translateY(-2px)} 60%{ transform:translateY(1px)} 100%{ transform:translateY(0)} }
        .board-card.bump{ animation: board-bump .18s ease; box-shadow: 0 14px 30px rgba(2,6,23,.16); }

        .overlay{ position:absolute; inset:0; background:rgba(15,23,42,.55); display:flex; align-items:center; justify-content:center; border-radius:16px; backdrop-filter:saturate(140%) blur(2px); }
        .panel{ background:linear-gradient(135deg,#ffffff,#f8fafc); border:1px solid #e2e8f0; border-radius:14px; padding:16px; width:min(92%, 360px); text-align:center; box-shadow:0 20px 40px rgba(2,6,23,.25); }
        .result-title{ font-size:20px; font-weight:800; color:#0f172a; margin-bottom:6px; }
        .result-sub{ color:#475569; font-size:13px; margin-bottom:12px; }
        .overlay-actions{ display:flex; gap:10px; justify-content:center; }
      `}</style>
    </div>
  )
}
