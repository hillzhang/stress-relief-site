import React, { useEffect, useRef, useState } from 'react'
import '../styles.css'

// --- 基本尺寸与棋盘 ---
const COLS = 10
const ROWS = 20
const SIZE = 30 // 稍大一点，泡泡纸风格更饱满

// --- 方块形状 ---
const SHAPES: number[][][] = [
  [[1,1,1,1]],                         // I
  [[1,1],[1,1]],                       // O
  [[0,1,0],[1,1,1]],                   // T
  [[1,0,0],[1,1,1]],                   // J
  [[0,0,1],[1,1,1]],                   // L
  [[1,1,0],[0,1,1]],                   // S
  [[0,1,1],[1,1,0]],                   // Z
]

// 泡泡纸风格：柔和半透明彩泡
const COLORS = ['#60d5f8','#fee07a','#c4b5fd','#f9b087','#93c5fd','#86efac','#fca5a5']

interface Piece { shape: number[][]; x: number; y: number; colorIdx: number }

function randomPiece(): Piece {
  const idx = Math.floor(Math.random() * SHAPES.length)
  return { shape: SHAPES[idx], x: 3, y: 0, colorIdx: idx }
}

function rotate(shape: number[][]): number[][] {
  return shape[0].map((_, i) => shape.map(row => row[i]).reverse())
}

function ghostY(px:number, py:number, shape:number[][], collide:(x:number,y:number,s:number[][])=>boolean){
  let y = py
  while(!collide(px, y+1, shape)) y++
  return y
}

// --- WebAudio 简易音效 ---
function makeAudio(getOn:()=>boolean, getVol:()=>number){
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  const now = () => ctx.currentTime
  async function resume(){ try{ await ctx.resume() }catch(_){} }
  function beep(freq:number, dur=0.07, type:OscillatorType='sine', base=0.06){
    if(!getOn()) return
    const v = Math.max(0, Math.min(1, getVol()))
    if(v <= 0) return
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq
    const g = ctx.createGain(); g.gain.value = 0
    o.connect(g).connect(ctx.destination)
    const t = now()
    o.start(t)
    // 10ms 起音 + 指数衰减：避免“啪”声
    const peak = base * v
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.stop(t + dur + 0.02)
  }
  return {
    move(){ beep(420, 0.05, 'sine', 0.035) },
    rotate(){ beep(660, 0.06, 'triangle', 0.05) },
    lock(){ beep(220, 0.08, 'sawtooth', 0.05) },
    line(){ beep(880, 0.08, 'square', 0.06); setTimeout(()=>beep(660,0.06,'square',0.05), 35) },
    drop(){ beep(300, 0.09, 'triangle', 0.06) },
    hold(){ beep(520, 0.06, 'sine', 0.045) },
    pause(){ beep(280, 0.05, 'sine', 0.04) },
    resume
  }
}

export default function Tetris(){
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nextRef = useRef<HTMLCanvasElement>(null)
  const holdRef = useRef<HTMLCanvasElement>(null)

  const board = useRef<number[][]>(Array.from({length:ROWS},()=>Array(COLS).fill(0)))
  const current = useRef<Piece>(randomPiece())
  const nextPiece = useRef<Piece>(randomPiece())
  const holdPiece = useRef<Piece|null>(null)
  const canHold = useRef(true)

  const [score, setScore] = useState(0)
  // 高分记录：从 localStorage 读取
  const [highScore, setHighScore] = useState(() => Number(localStorage.getItem('tetrisHighScore') || 0))
  // 分数超越最高分时，自动更新并持久化
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score)
      localStorage.setItem('tetrisHighScore', String(score))
    }
  }, [score, highScore])
  const [lines, setLines] = useState(0)
  const [level, setLevel] = useState(1)
  const [paused, setPaused] = useState(false)
  // keep a live ref for paused state (used by timers)
  const pausedRef = useRef(false)
  useEffect(() => { pausedRef.current = paused }, [paused])
  // --- 游戏结束状态 ---
  const [gameOver, setGameOver] = useState(false)
  const gameOverRef = useRef(false)
  useEffect(()=>{ gameOverRef.current = gameOver }, [gameOver])
  // 用于“冰冻”道具的自动解冻令牌；当令牌失效时不再自动恢复
  const freezeTokenRef = useRef(0)
  // —— 调试开关/HUD —— (已移除)
  const lastEventRef = useRef('ready')
  const bannerRef = useRef<{text:string, until:number} | null>(null)
  // 屏幕抖动效果（道具反馈）
  const shakeRef = useRef<{until:number, amp:number}>({until:0, amp:0})
  // 彩虹 sweep 行可见效果
  const rainbowRef = useRef<{ until:number, y:number } | null>(null)
  function shake(ms:number, amp:number){
    shakeRef.current = { until: performance.now() + ms, amp }
  }
  type Mode = 'classic' | 'garbage' | 'timed' | 'marathon' | 'items' | 'turbo'
  const [mode, setMode] = useState<Mode>('classic')
  // --- 道具模式辅助 ---
  // Banner: 显示短消息
  function flashBanner(text: string, ms: number) {
    bannerRef.current = { text, until: performance.now() + ms }
  }

  // collapseBoard: 按列向下压实（空格上移）
  function collapseBoard() {
    for (let x = 0; x < COLS; x++) {
      // 收集当前列的非0格
      const stack: number[] = []
      for (let y = ROWS - 1; y >= 0; y--) {
        if (board.current[y][x]) stack.push(board.current[y][x])
      }
      // 从底部开始填充
      for (let y = ROWS - 1; y >= 0; y--) {
        board.current[y][x] = stack[ROWS - 1 - y] || 0
      }
    }
  }

  // spawnParticlesForCells: 为指定格子生成粒子（颜色从棋盘读取，若已清空则忽略）
    function spawnParticlesForCells(cells: {x:number, y:number}[]) {
      const parts = particlesRef.current
      for (const {x, y} of cells) {
        if (x < 0 || x >= COLS || y < 0 || y >= ROWS) continue
        const v = board.current[y][x]
        if (!v) continue
        const color = COLORS[v-1]
        const count = 7 // 提升密度，效果更明显
        for (let i=0; i<count; i++) {
          if (Math.random() < 0.7 && parts.length < MAX_PARTICLES) {
            parts.push({
              x: x+0.5,
              y: y+0.5,
              vx: (Math.random()-0.5)*1.1,        // 更快的水平飞散
              vy: (-Math.random()*1.1)-0.25,      // 更快的向上爆裂
              a: 1,
              r: Math.random()*0.14+0.06,         // 稍小更利落
              color
            })
          }
        }
      }
      if (parts.length > MAX_PARTICLES) {
        parts.splice(0, parts.length - MAX_PARTICLES)
      }
    }

  // triggerRandomItem: 道具触发
    function triggerRandomItem(removed: number) {
      if (mode !== 'items' || removed === 0) return
      if (Math.random() > 0.3) return // 30% 概率跳过，70% 触发（更容易看到效果）
      const itemType = Math.random()
      // 💥 爆炸
      if (itemType < 0.34) {
        // 找到所有非空格
        const filled: {x:number, y:number}[] = []
        for (let y=0; y<ROWS; y++) for (let x=0; x<COLS; x++) if (board.current[y][x]) filled.push({x,y})
        if (filled.length === 0) return
        const idx = Math.floor(Math.random()*filled.length)
        const cx = filled[idx].x, cy = filled[idx].y
        // 清除3x3区域
        const affected: {x:number, y:number}[] = []
        for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++) {
          const x = cx+dx, y = cy+dy
          if (x>=0 && x<COLS && y>=0 && y<ROWS && board.current[y][x]) {
            affected.push({x,y})
          }
        }
        spawnParticlesForCells(affected)
        for (const {x, y} of affected) {
          board.current[y][x] = 0
        }
        collapseBoard()
        shake(140, 0.26)         // 更短更猛
        sfxRef.current?.line()
        setScore(s=>s+affected.length*12)
        flashBanner('💥 爆炸', 700)
      }
      // 🌈 彩虹
      else if (itemType < 0.67) {
        // 找到所有非空行
        const filledRows: number[] = []
        for (let y=0; y<ROWS; y++) {
          if (board.current[y].some(v=>v) && board.current[y].every(v=>v)) filledRows.push(y)
        }
        // 如果没有整行全满的，随机找一条有非空格的行
        let targetRow: number|undefined = undefined
        if (filledRows.length > 0) {
          targetRow = filledRows[Math.floor(Math.random()*filledRows.length)]
        } else {
          const nonEmptyRows = []
          for (let y=0; y<ROWS; y++) if (board.current[y].some(v=>v)) nonEmptyRows.push(y)
          if (nonEmptyRows.length === 0) return
          targetRow = nonEmptyRows[Math.floor(Math.random()*nonEmptyRows.length)]
        }
        if (typeof targetRow === 'number') {
          // 生成该行所有格子的粒子（不依赖 useEffect 内的 spawnParticles）
          spawnParticlesForCells(Array.from({ length: COLS }, (_, x) => ({ x, y: targetRow! })))
          // 彩虹 sweep 行可见 overlay
          rainbowRef.current = { until: performance.now() + 650, y: targetRow }
          board.current.splice(targetRow, 1)
          board.current.unshift(Array(COLS).fill(0))
          shake(120, 0.14)
          sfxRef.current?.line()
          setScore(s=>s+100*level)
          flashBanner('🌈 彩虹行', 900)
        }
      }
      // ❄️ 冰冻
      else {
        // 1.5秒暂停（若期间用户手动暂停，则不自动恢复）
        if (!pausedRef.current) {
          setPaused(true)
          flashBanner('❄️ 冰冻 1.5s', 1200)
          // 生成一次性的解冻令牌；若期间用户手动暂停，我们会使令牌失效
          const token = ++freezeTokenRef.current
          setTimeout(() => {
            // 只有令牌仍然有效时才自动解冻，避免打断用户手动暂停
            if (freezeTokenRef.current === token) {
              setPaused(false)
            }
          }, 1500)
        } else {
          flashBanner('❄️ 冰冻 1.5s', 1200)
        }
      }
      // draw() // 移除此处的 draw()，因为 RAF 循环会自动重绘
    }
  const [timeLeft, setTimeLeft] = useState(60)
  const garbageAccRef = useRef(0)
  const GARBAGE_INTERVAL = 10000
  // 音效开关与音量
  const [sfxOn, setSfxOn] = useState(true)
  const [sfxVol, setSfxVol] = useState(0.7)
  const onRef = useRef(true)
  const volRef = useRef(0.7)
  useEffect(()=>{ onRef.current = sfxOn }, [sfxOn])
  useEffect(()=>{ volRef.current = sfxVol }, [sfxVol])

  const sfxRef = useRef<ReturnType<typeof makeAudio>|null>(null)
  const lastMergeRef = useRef<{key:string, until:number}[]>([])
  const particlesRef = useRef<{x:number,y:number,vx:number,vy:number,a:number,r:number,color:string}[]>([])
  const stepTRef = useRef(999)        // 距上次落一格的时间(ms)，用于“一下下”动画
  const STEP_MS = 120                 // 每次落格短动画时长
  const MAX_PARTICLES = 200           // 粒子总数上限
  const justSpawnedRef = useRef(false) // 避免落地同帧立刻推垃圾行导致“块消失”的观感
  const spawnQueuedRef = useRef(false) // 硬降/点按落地后，延后一帧再出新块，避免“瞬间消失”的观感

  useEffect(()=>{ sfxRef.current = makeAudio(()=>onRef.current, ()=>volRef.current) }, [])

  useEffect(()=>{
    const ctx = canvasRef.current!.getContext('2d')!
    const nctx = nextRef.current!.getContext('2d')!
    const hctx = holdRef.current!.getContext('2d')!
    ctx.imageSmoothingEnabled = true; (ctx as any).imageSmoothingQuality = 'high'
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, COLS * SIZE, ROWS * SIZE);
    ctx.setTransform(SIZE, 0, 0, SIZE, 0, 0);

    function drawCell(x:number, y:number, color:string){
      const pad = 0.06
      const x0 = x+pad, y0 = y+pad, w = 1-pad*2, h = 1-pad*2
      const r = 0.45
      ctx.beginPath()
      ctx.moveTo(x0+r, y0)
      ctx.lineTo(x0+w-r, y0)
      ctx.quadraticCurveTo(x0+w, y0, x0+w, y0+r)
      ctx.lineTo(x0+w, y0+h-r)
      ctx.quadraticCurveTo(x0+w, y0+h, x0+w-r, y0+h)
      ctx.lineTo(x0+r, y0+h)
      ctx.quadraticCurveTo(x0, y0+h, x0, y0+h-r)
      ctx.lineTo(x0, y0+r)
      ctx.quadraticCurveTo(x0, y0, x0+r, y0)
      ctx.closePath()

      ctx.fillStyle = color
      ctx.globalAlpha = 0.85
      ctx.fill()

      // 添加气泡感的渐变
      const gradBubble = ctx.createRadialGradient(x0+w/2, y0+h/2, 0, x0+w/2, y0+h/2, Math.max(w,h))
      gradBubble.addColorStop(0, 'rgba(255,255,255,0.5)')
      gradBubble.addColorStop(0.6, color)
      gradBubble.addColorStop(1, 'rgba(0,0,0,0.15)')
      ctx.fillStyle = gradBubble
      ctx.fill()

      // 添加高光
      const gradHL = ctx.createRadialGradient(x0+w*0.3, y0+h*0.3, 0, x0+w*0.3, y0+h*0.3, Math.max(w,h)*0.5)
      gradHL.addColorStop(0, 'rgba(255,255,255,0.8)')
      gradHL.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gradHL
      ctx.fill()

      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(15,23,42,.25)'
      ctx.lineWidth = 0.05
      ctx.stroke()
    }

    function drawCellPulse(x:number,y:number,color:string,scale:number){
      const cx=x+0.5, cy=y+0.5; ctx.save(); ctx.translate(cx,cy); ctx.scale(scale,scale); ctx.translate(-cx,-cy)
      drawCell(x,y,color); ctx.restore()
    }

    function drawGrid(){
      const bg = ctx.createLinearGradient(0,0,0,ROWS)
      bg.addColorStop(0,'#eef2ff'); bg.addColorStop(1,'#e2e8f0')
      ctx.fillStyle = bg; ctx.fillRect(0,0,COLS,ROWS)
      const vign = ctx.createRadialGradient(COLS/2, ROWS/2, Math.min(COLS,ROWS)*0.2, COLS/2, ROWS/2, Math.max(COLS,ROWS))
      vign.addColorStop(0,'rgba(0,0,0,0)'); vign.addColorStop(1,'rgba(0,0,0,0.10)')
      ctx.fillStyle = vign; ctx.fillRect(0,0,COLS,ROWS)
      ctx.save(); ctx.strokeStyle='rgba(2,6,23,0.06)'; ctx.lineWidth=0.02
      for(let i=1;i<COLS;i++){ ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,ROWS); ctx.stroke() }
      for(let j=1;j<ROWS;j++){ ctx.beginPath(); ctx.moveTo(0,j); ctx.lineTo(COLS,j); ctx.stroke() }
      ctx.restore()
    }

    function collide(px:number, py:number, shape:number[][]):boolean{
      return shape.some((row,r)=> row.some((v,c)=> v && (
        px+c<0 || px+c>=COLS || py+r>=ROWS || board.current[py+r][px+c]
      )))
    }

    function merge(){
      const hit: {key:string, until:number}[] = []
      const until = performance.now() + 180
      current.current.shape.forEach((row,r)=> row.forEach((v,c)=>{
        if(v){
          const gx = current.current.x + c
          const gy = current.current.y + r
          board.current[gy][gx] = current.current.colorIdx + 1
          hit.push({key:`${gx},${gy}`, until})
        }
      }))
      lastMergeRef.current = hit
      sfxRef.current?.lock()
    }

    function spawnParticles(rows:number[]){
      const parts = particlesRef.current
      rows.forEach(ry=>{
        if(ry<0 || ry>=ROWS) return
        for(let x=0;x<COLS;x++){
          const v = board.current[ry][x]
          if(!v) continue
          const color = COLORS[v-1]
          const count = 2 // 数量更少
          for(let i=0;i<count;i++){
            if(Math.random() < 0.6 && parts.length < MAX_PARTICLES){
              parts.push({
                x:x+0.5,
                y:ry+0.5,
                vx:(Math.random()-0.5)*0.6,
                vy:(-Math.random()*0.8)-0.15,
                a:1,
                r:Math.random()*0.16+0.08,
                color
              })
            }
          }
        }
      })
      // 上限裁剪
      if(parts.length > MAX_PARTICLES){
        parts.splice(0, parts.length - MAX_PARTICLES)
      }
    }

    function clearLines(){
      const fullRows:number[] = []
      for(let r=0;r<ROWS;r++){
        if(board.current[r].every(v=>v)) fullRows.push(r)
      }
      const removed = fullRows.length
      if(removed===0){ return }

      // 粒子效果：在被清除的行每个有色格子上生成彩色小颗粒
      spawnParticles(fullRows)

      // 重建棋盘（移除满行，顶部补空行）
      const newRows: number[][] = []
      for(let r=0;r<ROWS;r++){
        if(!fullRows.includes(r)) newRows.push([...board.current[r]])
      }
      while(newRows.length<ROWS) newRows.unshift(Array(COLS).fill(0))
      board.current = newRows

      // 计分与升级
      const add = [0,100,300,500,800][removed] || 0
      setScore(s=> s+add*level)
      setLines(l=>{
        const nl = l + removed
        setLevel(L => (nl >= L*10 ? L+1 : L))
        return nl
      })
      sfxRef.current?.line()
      // —— 道具模式：触发道具 ——
      triggerRandomItem(removed)
    }

    function spawnNext(){
      current.current = { ...nextPiece.current, x:3, y:0 }
      nextPiece.current = randomPiece()
      canHold.current = true
      if(collide(current.current.x, current.current.y, current.current.shape)){
        // game over: 冻结当前画面，显示覆盖层，不自动重开
        setPaused(true)
        setGameOver(true)
        bannerRef.current = { text: 'GAME OVER', until: performance.now() + 1200 }
        lastEventRef.current = 'game_over'
        return
      }
      justSpawnedRef.current = true
    }

    function addGarbageRow(){
      const hole = Math.floor(Math.random()*COLS)
      const colorId = 1 + Math.floor(Math.random()*COLORS.length)
      // 上移一行
      board.current.shift()
      // 底部推入带缺口的一行
      const row = Array.from({length:COLS}, (_,i)=> i===hole ? 0 : colorId)
      board.current.push(row)
    }

    function drawNext(canvas:HTMLCanvasElement, piece:Piece|null){
      const c = canvas.getContext('2d')!; const cw = 6, ch = 6
      c.reset?.();
      c.clearRect(0,0, cw*SIZE, ch*SIZE)
      c.save(); c.scale(SIZE, SIZE)
      // panel bg
      c.fillStyle = '#f1f5f9'; c.fillRect(0,0,cw,ch)
      c.strokeStyle = 'rgba(2,6,23,.08)'; c.strokeRect(0,0,cw,ch)
      if(piece){
        const shape = piece.shape
        const color = COLORS[piece.colorIdx]
        const offX = Math.floor((cw - shape[0].length)/2)
        const offY = Math.floor((ch - shape.length)/2)
        shape.forEach((row,r)=> row.forEach((v,cx)=>{ if(v){
          // simple rounded bubble
          const x = offX+cx, y = offY+r
          const pad=0.08, x0=x+pad, y0=y+pad, w=1-pad*2, h=1-pad*2, r0=0.45
          c.beginPath()
          c.moveTo(x0+r0, y0)
          c.lineTo(x0+w-r0, y0)
          c.quadraticCurveTo(x0+w, y0, x0+w, y0+r0)
          c.lineTo(x0+w, y0+h-r0)
          c.quadraticCurveTo(x0+w, y0+h, x0+w-r0, y0+h)
          c.lineTo(x0+r0, y0+h)
          c.quadraticCurveTo(x0, y0+h, x0, y0+h-r0)
          c.lineTo(x0, y0+r0)
          c.quadraticCurveTo(x0, y0, x0+r0, y0)
          c.closePath()
          c.fillStyle = color; c.globalAlpha=0.9; c.fill(); c.globalAlpha=1
          c.strokeStyle='rgba(15,23,42,.2)'; c.lineWidth=0.04; c.stroke()
        }}))
      }
      c.restore()
    }

    function hold(){
      if(!canHold.current) return
      const cur = current.current
      if(holdPiece.current){
        const tmp = holdPiece.current
        holdPiece.current = { shape: cur.shape, x:3, y:0, colorIdx: cur.colorIdx }
        current.current = { shape: tmp.shape, x:3, y:0, colorIdx: tmp.colorIdx }
      } else {
        holdPiece.current = { shape: cur.shape, x:3, y:0, colorIdx: cur.colorIdx }
        spawnNext()
      }
      canHold.current = false
      sfxRef.current?.hold()
      drawNext(holdRef.current!, holdPiece.current)
      draw()
    }

    function draw(){
      drawGrid()
      const now = performance.now()
      // 轻微抖动：只影响棋盘主画布
      let shaken = false
      if (shakeRef.current.until > now){
        const a = shakeRef.current.amp
        const dx = (Math.random()-0.5) * a
        const dy = (Math.random()-0.5) * a
        ctx.save(); ctx.translate(dx, dy); shaken = true
      }
      // 固定块
      board.current.forEach((row,r)=> row.forEach((v,c)=>{
        if(!v) return
        const col = COLORS[v-1]
        const k = `${c},${r}`
        const pulse = lastMergeRef.current.find(m=>m.key===k && m.until>now)
        if(pulse){
          const t = Math.max(0,(pulse.until-now)/180)
          const s = 1 + t*0.08
          drawCellPulse(c,r,col,s)
        }else{
          drawCell(c,r,col)
        }
      }))
      // Rainbow sweep overlay
      if (rainbowRef.current && rainbowRef.current.until > now){
        const yy = rainbowRef.current.y
        const life = (rainbowRef.current.until - now) / 650
        const alpha = Math.max(0, Math.min(1, life)) * 0.9
        ctx.save()
        ctx.globalAlpha = alpha
        const grad = ctx.createLinearGradient(0, yy, COLS, yy+1)
        grad.addColorStop(0.00, '#ff477e')
        grad.addColorStop(0.20, '#ffb703')
        grad.addColorStop(0.40, '#f9f871')
        grad.addColorStop(0.60, '#5eead4')
        grad.addColorStop(0.80, '#60a5fa')
        grad.addColorStop(1.00, '#a78bfa')
        ctx.fillStyle = grad
        // a slightly thicker band centered on the row
        ctx.fillRect(0, yy - 0.2, COLS, 1.4)
        ctx.restore()
      }
      if (rainbowRef.current && rainbowRef.current.until <= now){ rainbowRef.current = null }
      // 幽灵落点（空心泡泡轮廓）
      const gy = ghostY(current.current.x, current.current.y, current.current.shape, collide)
      current.current.shape.forEach((row, r) => row.forEach((v, c) => {
        if (v) {
          const x = current.current.x + c, y = gy + r
          ctx.save(); ctx.globalAlpha = 0.35
          const pad=0.06, x0=x+pad, y0=y+pad, w=1-pad*2, h=1-pad*2, rr=0.45
          ctx.beginPath()
          ctx.moveTo(x0+rr, y0)
          ctx.lineTo(x0+w-rr, y0)
          ctx.quadraticCurveTo(x0+w, y0, x0+w, y0+rr)
          ctx.lineTo(x0+w, y0+h-rr)
          ctx.quadraticCurveTo(x0+w, y0+h, x0+w-rr, y0+h)
          ctx.lineTo(x0+rr, y0+h)
          ctx.quadraticCurveTo(x0, y0+h, x0, y0+h-rr)
          ctx.lineTo(x0, y0+rr)
          ctx.quadraticCurveTo(x0, y0, x0+rr, y0)
          ctx.closePath()
          ctx.strokeStyle='rgba(30,41,59,0.5)'
          ctx.lineWidth=0.05
          ctx.stroke(); ctx.restore()
        }
      }))
      // 当前块（一步一停：仅在刚落一格后的短时间内从上方滑到位）
      const phase = Math.min(stepTRef.current / STEP_MS, 1)
      const ease = 1 - Math.pow(1 - phase, 3) // easeOutCubic
      const offset = (1 - ease) * 0.1      // 初始上移0.3格，快速落到0
      ctx.save()
      ctx.translate(0, offset)
      current.current.shape.forEach((row,r)=> row.forEach((v,c)=>{ if(v) drawCell(current.current.x+c, current.current.y+r, COLORS[current.current.colorIdx]) }))
      ctx.restore()

      // 粒子爆裂层（消行小颗粒）
      const parts = particlesRef.current
      ctx.save()
      parts.forEach(p=>{
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.045          // 更快坠落
        p.a -= 0.085           // 更快淡出
        if(p.a<0) p.a = 0
        ctx.globalAlpha = p.a
        ctx.fillStyle = p.color
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill()
      })
      ctx.restore()
      particlesRef.current = parts.filter(p=> p.a>0 && p.y < ROWS+2)

      if (shaken){ ctx.restore() }

      // 右侧面板
      drawNext(nextRef.current!, nextPiece.current)
      drawNext(holdRef.current!, holdPiece.current)

      // —— Debug HUD & Banner ——
      // Banner (e.g., GAME OVER) — drawn on the main ctx
      const nowT = performance.now()
      if (bannerRef.current && bannerRef.current.until > nowT){
        ctx.save()
        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        ctx.fillRect(0, ROWS*0.45, COLS, ROWS*0.1)
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 0.8px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText(bannerRef.current.text, COLS/2, ROWS*0.52)
        ctx.restore()
      }
      if (bannerRef.current && bannerRef.current.until <= nowT){ bannerRef.current = null }

      // Debug HUD 已移除
    }

    function drop(){
      if(paused) return
      if(!collide(current.current.x, current.current.y+1, current.current.shape)){
        current.current.y += 1
      }else{
        merge(); clearLines(); spawnNext()
      }
      draw()
    }

    const key = (e: KeyboardEvent) => {
      sfxRef.current?.resume?.()
      if (e.key === ' ') e.preventDefault()
      if (gameOverRef.current) { return }
      if (paused && e.key.toLowerCase() !== 'p') { return }
      // 移除 debug toggle
      if (e.key === 'ArrowLeft' && !collide(current.current.x - 1, current.current.y, current.current.shape)) { current.current.x -= 1; sfxRef.current?.move() }
      if (e.key === 'ArrowRight' && !collide(current.current.x + 1, current.current.y, current.current.shape)) { current.current.x += 1; sfxRef.current?.move() }
      if (e.key === 'ArrowDown') {
        if (!collide(current.current.x, current.current.y + 1, current.current.shape)) {
          current.current.y += 1; sfxRef.current?.move()
          stepTRef.current = 0
          // @ts-ignore 复用外层闭包中的 acc，阻止下一帧再次立刻下落
          acc = 0
          lastEventRef.current = 'soft_drop'
        }
      }
      if (e.key === 'ArrowUp') {
        const rot = rotate(current.current.shape)
        if (!collide(current.current.x, current.current.y, rot)) { current.current.shape = rot; sfxRef.current?.rotate(); lastEventRef.current = 'rotate' }
      }
      if (e.key === ' ') { // Hard drop
        const gy = ghostY(current.current.x, current.current.y, current.current.shape, collide)
        current.current.y = gy
        stepTRef.current = 0
        // @ts-ignore
        acc = 0
        sfxRef.current?.drop();
        merge();
        clearLines();
        justSpawnedRef.current = true // 标记以避免同帧垃圾行
        spawnNext();                   // 立即生成新块（不排队），避免“消失”错觉
        draw();                        // 当帧立即渲染新块
        lastEventRef.current = 'hard_drop_spawn'
        return;                        // 结束处理，避免后续 draw 再次被调用产生闪烁
      }
      if (e.key.toLowerCase() === 'c' || e.key === 'Shift') { hold() }
      if (e.key.toLowerCase() === 'p') {
        // 用户手动暂停/恢复，取消任何尚未生效的“冰冻”自动解冻
        freezeTokenRef.current = 0
        setPaused(p => { const np = !p; sfxRef.current?.pause(); return np })
      }
      draw()
    }
    window.addEventListener('keydown', key)

    // --- Pointer/tap handler for board: tap to drop one step or lock ---
    function tap() {
      sfxRef.current?.resume?.()
      if (paused) return
      if (!collide(current.current.x, current.current.y + 1, current.current.shape)) {
        current.current.y += 1
        sfxRef.current?.move()
        stepTRef.current = 0
        // @ts-ignore 复用外层闭包中的 acc，阻止下一帧再次立刻下落
        acc = 0
        lastEventRef.current = 'tap_step'
      } else {
        merge();
        clearLines();
        justSpawnedRef.current = true
        spawnNext();
        draw();
        lastEventRef.current = 'tap_lock_spawn'
        return;
      }
      draw()
    }
    canvasRef.current!.addEventListener('pointerdown', tap)

    // 使用 RAF 控制下落节奏：基础更慢，随等级递进
    let last = performance.now()
    let acc = 0
    let raf = 0 as number
    function loop(t:number){
      const dt = t - last; last = t
      if(!paused){
        acc += dt
        stepTRef.current += dt
        // 普通/超快模式下落速度
        let delay: number
        if (mode === 'turbo') {
          const delayBase = Math.max(70, 250 - (level-1)*30)
          delay = delayBase
        } else {
          delay = Math.max(180, 900 - (level-1)*70)
        }
        while(acc >= delay){
          drop()
          acc -= delay
          stepTRef.current = 0 // 触发一次“一下下”的短动画
        }
        // —— 模式逻辑 ——
        if(mode === 'garbage'){
          if(justSpawnedRef.current){
            // 刚落地/生成新块的这一帧跳过推垃圾，避免视觉上像“块消失”
            justSpawnedRef.current = false
          } else {
            garbageAccRef.current += dt
            if(garbageAccRef.current >= GARBAGE_INTERVAL){
              garbageAccRef.current = 0
              addGarbageRow()
              draw()
            }
          }
        }
        if(mode === 'timed'){
          setTimeLeft(t => {
            const nt = Math.max(0, t - dt/1000)
            if(nt === 0){ if(!paused){ setPaused(true); sfxRef.current?.pause() } }
            return nt
          })
        }
      } else {
        // 暂停时不播放步进动画
        stepTRef.current = STEP_MS
      }
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    draw()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', key)
      canvasRef.current?.removeEventListener('pointerdown', tap)
    }
  }, [level, paused, mode])

  // --- 全局重置函数 ---
  function resetAll(){
    spawnQueuedRef.current = false;
    justSpawnedRef.current = false;
    setTimeLeft(60);
    garbageAccRef.current = 0;
    board.current = Array.from({length: ROWS}, () => Array(COLS).fill(0));
    current.current = randomPiece();
    nextPiece.current = randomPiece();
    holdPiece.current = null;
    canHold.current = true;
    setScore(0);
    setLines(0);
    setLevel(1);
    setPaused(false);
    setGameOver(false);
  }

  return (
    <div className="container">
      <h1>🧩 俄罗斯方块 · 泡泡纸</h1>
      <p className="desc">点击或使用方向键操作；泡泡气泡的圆润质感与轻微音效，解压又顺手。</p>

      <div
        className="card fade-in"
        style={{
          position: 'relative',
          overflow: 'hidden',
          margin: 0,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          gap: 24,
          padding: 16,
          background: 'linear-gradient(135deg,#a2d2ff,#ffafcc)',
          borderRadius: 12,
          width: 'fit-content'
        }}
      >
        {gameOver && (
          <div style={{position:'absolute', inset:0, background:'rgba(2,6,23,.36)', display:'flex', alignItems:'center', justifyContent:'center'}}>
            <div style={{background:'#ffffff', padding:16, borderRadius:12, boxShadow:'0 16px 48px rgba(2,6,23,.28)', textAlign:'center', minWidth:260}}>
              <div style={{fontSize:18, fontWeight:700, color:'#0f172a', marginBottom:10}}>游戏结束</div>
              <div style={{display:'flex', gap:12, justifyContent:'center'}}>
                <button className="btn primary" onClick={resetAll}>重新开始</button>
                <a className="btn ghost" href="/">返回首页</a>
              </div>
            </div>
          </div>
        )}
        <div style={{background:'linear-gradient(180deg,#f8fafc,#e2e8f0)', padding:12, borderRadius:20, boxShadow:'0 16px 48px rgba(2,6,23,.18)'}}>
          <canvas
              ref={canvasRef}
              width={COLS * SIZE}
              height={ROWS * SIZE}
              onClick={() => sfxRef.current?.resume?.()}
              style={{borderRadius: 12, display: 'block'}}
          />
        </div>
        <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              alignItems: 'center',
              minWidth: 240,
              flexShrink: 0
            }}
        >
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, width: '100%'}}>
            <div style={{textAlign: 'center'}}>
              <div style={{fontSize: 12, color: '#475569', marginBottom: 4}}>下一个</div>
              <canvas ref={nextRef} width={6 * SIZE} height={6 * SIZE} style={{
                borderRadius: 12,
                background: '#f8fafc',
                boxShadow: 'inset 0 0 0 1px rgba(2,6,23,.06)',
                display: 'block',
                margin: '0 auto'
              }}/>
            </div>
            <div style={{textAlign: 'center'}}>
              <div style={{fontSize: 12, color: '#475569', marginBottom: 4}}>暂存 (C/Shift)</div>
              <canvas ref={holdRef} width={6 * SIZE} height={6 * SIZE} style={{
                borderRadius: 12,
                background: '#f8fafc',
                boxShadow: 'inset 0 0 0 1px rgba(2,6,23,.06)',
                display: 'block',
                margin: '0 auto'
              }}/>
            </div>
          </div>
          <div style={{fontSize: 14, color: '#334155', textAlign: 'center'}}>
            分数：<b>{score}</b> 行数：<b>{lines}</b> 等级：<b>{level}</b>
            <br />
            最高分：<b>{highScore}</b>
          </div>
          {mode === 'timed' && (
            <div style={{fontSize:14, color:'#ef4444', textAlign:'center'}}>
              倒计时：<b>{Math.ceil(timeLeft)}s</b>
            </div>
          )}
          {mode === 'garbage' && (
            <div style={{fontSize:12, color:'#64748b', textAlign:'center'}}>
              垃圾行：每 <b>{GARBAGE_INTERVAL/1000}</b>s 推入一行
            </div>
          )}
          <p style={{color: '#475569', fontSize: 12, marginTop: 4, textAlign: 'center', lineHeight: 1.4}}>
            操作：← → 移动 · ↑ 旋转 · ↓ 下落一格 · 空格 硬降 · C/Shift 暂存 · P 暂停
          </p>
          <div style={{display: 'flex', alignItems: 'center', gap: 8, marginTop: 4}}>
            <label style={{display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155'}}>
              <input type="checkbox" checked={sfxOn} onChange={e => setSfxOn(e.target.checked)}/> 音效
            </label>
            <input
                type="range" min={0} max={1} step={0.05}
                value={sfxVol}
                onChange={e => setSfxVol(Number(e.target.value))}
                style={{width: 120}}
            />
            <span style={{fontSize: 12, color: '#64748b'}}>{Math.round(sfxVol * 100)}%</span>
          </div>
        </div>
      </div>
      <div style={{display:'flex', gap:8, marginTop:12, flexWrap:'wrap'}}>
        <button className={`btn ${mode==='classic'?'primary':'secondary'}`} title="标准节奏，行数升级加速" onClick={()=>{
          setGameOver(false);
          setMode('classic'); setPaused(false); setTimeLeft(60); garbageAccRef.current=0;
          spawnQueuedRef.current = false; justSpawnedRef.current = false;
          board.current = Array.from({length:ROWS},()=>Array(COLS).fill(0));
          current.current = randomPiece(); nextPiece.current = randomPiece();
          holdPiece.current = null; canHold.current = true;
          setScore(0); setLines(0); setLevel(1);
        }}>经典</button>
        <button className={`btn ${mode==='garbage'?'primary':'secondary'}`} title="每隔一段时间从底部推垃圾行，尽快清！" onClick={()=>{
          setGameOver(false);
          setMode('garbage'); setPaused(false); setTimeLeft(60); garbageAccRef.current=0;
          spawnQueuedRef.current = false; justSpawnedRef.current = false;
          board.current = Array.from({length:ROWS},()=>Array(COLS).fill(0));
          current.current = randomPiece(); nextPiece.current = randomPiece();
          holdPiece.current = null; canHold.current = true;
          setScore(0); setLines(0); setLevel(1);
        }}>垃圾行挑战</button>
        <button className={`btn ${mode==='timed'?'primary':'secondary'}`} title="60秒内冲高分，时间到自动结算" onClick={()=>{
          setGameOver(false);
          setMode('timed'); setPaused(false); setTimeLeft(60); garbageAccRef.current=0;
          spawnQueuedRef.current = false; justSpawnedRef.current = false;
          board.current = Array.from({length:ROWS},()=>Array(COLS).fill(0));
          current.current = randomPiece(); nextPiece.current = randomPiece();
          holdPiece.current = null; canHold.current = true;
          setScore(0); setLines(0); setLevel(1);
        }}>限时60秒</button>
        <button className={`btn ${mode==='marathon'?'primary':'secondary'}`} title="长时间游玩，逐步加速（按行数升级）" onClick={()=>{
          setGameOver(false);
          setMode('marathon'); setPaused(false); setTimeLeft(60); garbageAccRef.current=0;
          spawnQueuedRef.current = false; justSpawnedRef.current = false;
          board.current = Array.from({length:ROWS},()=>Array(COLS).fill(0));
          current.current = randomPiece(); nextPiece.current = randomPiece();
          holdPiece.current = null; canHold.current = true;
          setScore(0); setLines(0); setLevel(1);
        }}>马拉松</button>
        <button className={`btn ${mode==='items'?'primary':'secondary'}`} title="道具模式：消行有概率触发💥爆炸/🌈彩虹/❄️冰冻" onClick={()=>{
          setGameOver(false);
          setMode('items'); setPaused(false); setTimeLeft(60); garbageAccRef.current=0;
          spawnQueuedRef.current = false; justSpawnedRef.current = false;
          board.current = Array.from({length:ROWS},()=>Array(COLS).fill(0));
          current.current = randomPiece(); nextPiece.current = randomPiece();
          holdPiece.current = null; canHold.current = true;
          setScore(0); setLines(0); setLevel(1);
        }}>道具模式</button>
        <button className={`btn ${mode==='turbo'?'primary':'secondary'}`} title="超快模式：下落极快，手速挑战" onClick={()=>{
          setGameOver(false);
          setMode('turbo'); setPaused(false); setTimeLeft(60); garbageAccRef.current=0;
          spawnQueuedRef.current = false; justSpawnedRef.current = false;
          board.current = Array.from({length:ROWS},()=>Array(COLS).fill(0));
          current.current = randomPiece(); nextPiece.current = randomPiece();
          holdPiece.current = null; canHold.current = true;
          setScore(0); setLines(0); setLevel(1);
        }}>超快模式</button>
      </div>

      {/* 模式说明区域（内联到组件内部，避免作用域错误） */}
      <div style={{marginTop: 8, color: '#64748b', fontSize: 13, minHeight: 22}}>
        {mode === 'turbo' && (
          <span>超快下落，小心手速！</span>
        )}
        {mode === 'items' && (
          <span>
            消行有几率触发道具：💥爆炸/🌈彩虹/❄️冰冻。<br />
            <b>🌈 彩虹行</b>会清除一行随机行并洒落彩虹粒子。
          </span>
        )}
      </div>

      <div style={{display: 'flex', gap: 12, marginTop: 12}}>
        <button className="btn primary" onClick={resetAll}>再来一局
        </button>
        <button className="btn secondary" onClick={() =>setPaused(p=>!p)}>{paused ? '继续' : '暂停'}</button>
        <a className="btn ghost" href="/">返回首页</a>
      </div>
    </div>
  )
}