import React, { useEffect, useMemo, useRef, useState } from 'react'
import '../styles.css'

// ================= Theme =================
const COLOR_BG = '#0b1220'
const COLOR_BOARD_FROM = '#0f172a'
const COLOR_BOARD_TO = '#0b1220'
const COLOR_WALL = '#0e293f'
const COLOR_WALL_EDGE = 'rgba(94,116,141,.7)'
const COLOR_DOT = '#f8fafc'
const COLOR_POWER = '#22d3ee'
const COLOR_PAC = '#fbbf24'
const COLOR_GHOST = '#fb7185'
const COLOR_GHOST_FRIGHT = '#60a5fa'

// ================= Map & Grid =================
// ================= Map & Grid =================
const CELL = 22
const MAPS:string[][] = [
  [
    '#################',
    '#........#......#',
    '#.###.##.#.##.###',
    '#o....#.....#...#',
    '###.#.###.###.#.#',
    '#...#.....o..#..#',
    '#.#####.#.#####.#',
    '#.......#.......#',
    '#################'
  ],
  [
    '#################',
    '#..#....#...o...#',
    '#.##.#.##.#.##.##',
    '#.....#....#....#',
    '###.#.####.#.####',
    '#o..#...........#',
    '##.####.#.####.##',
    '#.......#.......#',
    '#################'
  ],
  [
    '#################',
    '#....o..#.......#',
    '#.###.###..##.#.#',
    '#..#.....#...#..#',
    '##.#.###.###.#.##',
    '#..#...#.....#..#',
    '#.#.##.#..####.##',
    '#.......#..o....#',
    '#################'
  ],
  [
    '#################',
    '#..#..o.#.......#',
    '#.##.#.##.###.###',
    '#....#.....#....#',
    '###.#.###.#.###.#',
    '#....#..o..#....#',
    '###.###.#.##.####',
    '#.......#.......#',
    '#################'
  ],
  [
    '#################',
    '#o......#.......#',
    '##.###.#.#.###.##',
    '#.....#...#.....#',
    '###.#.#####.#.###',
    '#...#...o...#...#',
    '##.###.#.#.###.##',
    '#.......#.......#',
    '#################'
  ],
  [
    '#################',
    '#.......#..o....#',
    '#.#####.#.###.###',
    '#...#...#...#...#',
    '###.#.###.###.#.#',
    '#...#.....o..#..#',
    '###.###.#.###.###',
    '#.......#.......#',
    '#################'
  ]
]
const ROWS = MAPS[0].length
const COLS = MAPS[0][0].length

const FRIGHT_STEPS = 40 // how many ghost grid-steps power lasts

// cell legend: # wall, . dot, o power dot, space empty

type Mode = 'classic' | 'timed' | 'challenge'

export default function Pacman(){
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const pacTick = useRef(0)
  const ghostTick = useRef(0)
  const lastTs = useRef<number | null>(null)
  const pacAccum = useRef(0)
  const ghostAccum = useRef(0)
  const PAC_MAX_STEPS = 1
  const GHOST_MAX_STEPS = 1
  const elapsedMsRef = useRef(0)
  const [elapsed, setElapsed] = useState(0) // seconds
  const [frightLeft, setFrightLeft] = useState(0) // seconds remaining to eat ghosts
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1

  // game state
  const [mode, setMode] = useState<Mode>('classic')
  const [paused, setPaused] = useState(false)
  const [over, setOver] = useState(false)
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [timeLeft, setTimeLeft] = useState(60)
  const [started, setStarted] = useState(false)
  const [level, setLevel] = useState(1)
  const currentMap = useMemo(()=> MAPS[(level-1) % MAPS.length], [level])
  const [levelComplete, setLevelComplete] = useState(false)

  // ==== Audio (WebAudio, low-latency) ====
  const [soundOn, setSoundOn] = useState(true)
  const audioCtx = useRef<AudioContext|null>(null)
  const sfxBuf = useRef<{chomp: AudioBuffer|null, power: AudioBuffer|null, eat: AudioBuffer|null, die: AudioBuffer|null, level: AudioBuffer|null}>({chomp:null,power:null,eat:null,die:null,level:null})
  const activeSfx = useRef<Set<{ src: AudioScheduledSourceNode; gain: GainNode }>>(new Set())
  const chompFlip = useRef(0)

  function stopAllSfx(){
    for (const n of activeSfx.current){
      try{ n.src.stop() }catch{}
      try{ n.src.disconnect() }catch{}
      try{ n.gain.disconnect() }catch{}
    }
    activeSfx.current.clear()
  }

  function buildTone(ctx: AudioContext, freq:number, dur=0.12, type: OscillatorType='sine', gain=0.22){
    const sr = ctx.sampleRate
    const len = Math.max(1, Math.floor(dur*sr))
    const buf = ctx.createBuffer(1, len, sr)
    const ch = buf.getChannelData(0)
    for (let i=0;i<len;i++){
      const t = i/sr
      const env = Math.exp(-10*t)
      const ph = 2*Math.PI*freq*t
      let v = Math.sin(ph)
      if (type==='square') v = Math.sign(Math.sin(ph))
      else if (type==='triangle') v = 2/Math.PI*Math.asin(Math.sin(ph))
      ch[i] = v * env * gain
    }
    return buf
  }
  function buildSweep(ctx: AudioContext, f0:number, f1:number, dur=0.4, type: OscillatorType='square', gain=0.6){
    const sr = ctx.sampleRate
    const len = Math.max(1, Math.floor(dur*sr))
    const buf = ctx.createBuffer(1, len, sr)
    const ch = buf.getChannelData(0)
    for (let i=0;i<len;i++){
      const t = i/sr
      const f = f0 + (f1-f0)*(t/dur)
      const env = Math.exp(-6*t)
      const ph = 2*Math.PI*f*t
      let v = Math.sign(Math.sin(ph))
      ch[i] = v * env * gain
    }
    return buf
  }

  function ensureCtx(): boolean{
    if (!audioCtx.current){
      try{ audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive' }) }catch{}
    }
    const ctx = audioCtx.current
    if (!ctx) return false
    if (ctx.state === 'suspended'){
      ctx.resume().catch(()=>{})
      const once = ()=>{ ctx.resume().catch(()=>{}); window.removeEventListener('touchstart', once); window.removeEventListener('mousedown', once) }
      window.addEventListener('touchstart', once, { once:true })
      window.addEventListener('mousedown', once, { once:true })
    }
    if (!sfxBuf.current.chomp){ sfxBuf.current.chomp = buildTone(ctx, 760, 0.08, 'sine', 0.20) }
    if (!sfxBuf.current.power){ sfxBuf.current.power = buildTone(ctx, 520, 0.22, 'triangle', 0.26) }
    if (!sfxBuf.current.eat){ sfxBuf.current.eat = buildTone(ctx, 980, 0.14, 'square', 0.26) }
    if (!sfxBuf.current.die){ sfxBuf.current.die = buildSweep(ctx, 540, 160, 0.38, 'square', 0.6) }
    if (!sfxBuf.current.level){ sfxBuf.current.level = buildTone(ctx, 660, 0.20, 'triangle', 0.22) }
    return ctx.state === 'running'
  }

  function sfx(kind: 'chomp'|'power'|'eat'|'die'|'level'){
    if (!soundOn) return
    const ok = ensureCtx(); const ctx = audioCtx.current
    if (!ctx) return
    // 若上下文仍未运行，则安排一个稍后的开始时间，并挂一次性 resume；这样不会错过当前音效
    let startAt = ctx.currentTime
    if (!ok || ctx.state !== 'running'){
      const once=()=>{ ctx.resume().catch(()=>{}); window.removeEventListener('touchstart', once); window.removeEventListener('mousedown', once) }
      window.addEventListener('touchstart', once, {once:true}); window.addEventListener('mousedown', once, {once:true})
      startAt = Math.max(ctx.currentTime + 0.06, 0) // 小幅正向偏移，保证解锁后立刻播放
    }
    const src = ctx.createBufferSource()
    const gain = ctx.createGain()
    if (kind==='chomp'){
      const alt = (chompFlip.current++ % 2)
      src.buffer = buildTone(ctx, alt? 720:800, 0.06, 'sine', 0.22)
      gain.gain.value = 0.22
    } else if (kind==='power'){
      src.buffer = sfxBuf.current.power!
      gain.gain.value = 0.26
    } else if (kind==='eat'){
      src.buffer = sfxBuf.current.eat!
      gain.gain.value = 0.26
    } else if (kind==='die'){
      src.buffer = sfxBuf.current.die!
      gain.gain.value = 0.6
    } else { // level
      src.buffer = sfxBuf.current.level!
      gain.gain.value = 0.22
    }
    src.connect(gain); gain.connect(ctx.destination)
    activeSfx.current.add({src, gain})
    src.onended = ()=>{ try{ src.disconnect(); gain.disconnect() }catch{}; for (const n of activeSfx.current){ if (n.src===src){ activeSfx.current.delete(n); break } } }
    src.start(startAt)
  }

  useEffect(()=>{ if (!soundOn) stopAllSfx() }, [soundOn])

  const grid = useRef(currentMap.map(r=>r.split('')))
  const remaining = useRef(grid.current.flat().filter(c=> c==='.' || c==='o').length)

  const pac = useRef({x:1,y:1, dir:{x:0,y:0}, mouth:0})
  const ghosts = useRef([{x:COLS-2,y:ROWS-2, dir:{x:0,y:0}, fright:0}])

  const speed = useMemo(()=> mode==='challenge'? 8 : mode==='classic'? 7 : 7, [mode]) // lower is faster in timestep calc
  const ghostSpeed = useMemo(()=> mode==='challenge'? 7 : 8, [mode])
  const pacInterval = useMemo(()=> mode==='challenge'? 160 : 240, [mode])
  const ghostIntervalBase = useMemo(()=> (mode==='challenge'? 140 : 240), [mode])
  const ghostInterval = useMemo(()=> Math.max(90, ghostIntervalBase - (level-1)*10), [ghostIntervalBase, level])

  // input
  useEffect(()=>{
    const key = (e: KeyboardEvent)=>{
      if (e.key==='ArrowUp') pac.current.dir = {x:0,y:-1}
      if (e.key==='ArrowDown') pac.current.dir = {x:0,y:1}
      if (e.key==='ArrowLeft') pac.current.dir = {x:-1,y:0}
      if (e.key==='ArrowRight') pac.current.dir = {x:1,y:0}
      if (e.key===' '){ if (!over) setPaused(p=>!p) }
    }
    window.addEventListener('keydown', key)
    return ()=> window.removeEventListener('keydown', key)
  }, [over])

  // timer for timed mode
  useEffect(()=>{
    if (mode!=='timed' || !started || paused || over) return
    const t = setInterval(()=> setTimeLeft(v=>{
      if (v<=1){ clearInterval(t); setOver(true) }
      return Math.max(0, v-1)
    }), 1000)
    return ()=> clearInterval(t)
  }, [mode, started, paused, over])

  function resetGrid(){
    grid.current = currentMap.map(r=>r.split(''))
    remaining.current = grid.current.flat().filter(c=> c==='.' || c==='o').length
  }

  function reset(){
    setScore(0); setOver(false); setPaused(false); setStarted(false)
    setLives(3); setTimeLeft(60)
    pac.current = {x:1,y:1, dir:{x:0,y:0}, mouth:0}
    const ghostCount = Math.min(1 + (level-1), 4)
    ghosts.current = Array.from({length: ghostCount}).map((_,i)=> ({
      x: COLS-2 - (i%2),
      y: ROWS-2 - Math.floor(i/2),
      dir:{x:0,y:0}, fright:0
    }))
    resetGrid()
    pacTick.current = 0
    ghostTick.current = 0
    lastTs.current = null
    pacAccum.current = 0
    ghostAccum.current = 0
    elapsedMsRef.current = 0
    setElapsed(0)
    setFrightLeft(0)
    setLevelComplete(false)
    stopAllSfx()
  }

  function nextLevel(){
    setLevel(l=> l+1)
    setLevelComplete(false)
    setPaused(false)
  }
  // canvas sizing
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
    const ro = new ResizeObserver(handleResize)
    ro.observe(stage)
    window.addEventListener('resize', handleResize)

    return ()=>{ ro.disconnect(); window.removeEventListener('resize', handleResize) }
  }, [dpr])

  // helpers
  const idxOk = (x:number,y:number)=> x>=0 && x<COLS && y>=0 && y<ROWS
  const canWalk = (x:number,y:number)=> idxOk(x,y) && grid.current[y][x] !== '#'

  // draw board
  function draw(){
    const cvs = canvasRef.current!
    const ctx = cvs.getContext('2d')!

    // board bg
    const g = ctx.createLinearGradient(0,0,0,cvs.height)
    g.addColorStop(0, COLOR_BOARD_FROM)
    g.addColorStop(1, COLOR_BOARD_TO)
    ctx.fillStyle = g
    ctx.fillRect(0,0,cvs.width,cvs.height)

    // compute cell size based on canvas vs col/row
    const cw = Math.floor((cvs.width/dpr) / COLS)
    const ch = Math.floor((cvs.height/dpr) / ROWS)
    const size = Math.min(cw, ch)
    const ox = Math.floor(((cvs.width/dpr) - size*COLS)/2)
    const oy = Math.floor(((cvs.height/dpr) - size*ROWS)/2)

    // board container shadow frame
    ctx.save()
    ctx.strokeStyle = COLOR_WALL_EDGE
    ctx.lineWidth = 1
    ctx.strokeRect(ox-6, oy-6, size*COLS+12, size*ROWS+12)
    ctx.restore()

    // grid content
    for(let y=0;y<ROWS;y++){
      for(let x=0;x<COLS;x++){
        const cell = grid.current[y][x]
        const px = ox + x*size
        const py = oy + y*size
        if (cell === '#'){
          ctx.fillStyle = COLOR_WALL
          ctx.fillRect(px, py, size, size)
          ctx.strokeStyle = COLOR_WALL_EDGE
          ctx.strokeRect(px+.5, py+.5, size-1, size-1)
        } else if (cell === '.'){
          ctx.fillStyle = COLOR_DOT
          ctx.beginPath()
          ctx.arc(px+size/2, py+size/2, Math.max(1.8, size*0.08), 0, Math.PI*2)
          ctx.fill()
        } else if (cell === 'o'){
          const r = Math.max(3, size*0.18)
          const halo = ctx.createRadialGradient(px+size/2, py+size/2, 0, px+size/2, py+size/2, r*1.8)
          halo.addColorStop(0,'rgba(255,255,255,.7)')
          halo.addColorStop(1, 'rgba(34,211,238,.55)')
          ctx.fillStyle = halo
          ctx.beginPath(); ctx.arc(px+size/2, py+size/2, r*1.4, 0, Math.PI*2); ctx.fill()
          ctx.fillStyle = COLOR_POWER
          ctx.beginPath(); ctx.arc(px+size/2, py+size/2, r, 0, Math.PI*2); ctx.fill()
        }
      }
    }

    // pacman (classic wedge mouth)
    const px = ox + pac.current.x*size + size/2
    const py = oy + pac.current.y*size + size/2
    const pr = Math.min(size*0.42, 12)

    // direction to angle
    const dir = pac.current.dir
    const angle = dir.x===1? 0 : dir.x===-1? Math.PI : dir.y===-1? -Math.PI/2 : dir.y===1? Math.PI/2 : 0
    // subtler mouth animation
    const t = elapsedMsRef.current || 0
    const open = 0.22 + 0.08*Math.sin(t/140)
    const a1 = angle + open*Math.PI
    const a2 = angle - open*Math.PI

    ctx.fillStyle = COLOR_PAC
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.arc(px, py, pr, a1, a2, false)
    ctx.closePath()
    ctx.fill()

    // eye
    const ex = px + pr*0.45*Math.cos(angle - Math.PI/2)
    const ey = py + pr*0.45*Math.sin(angle - Math.PI/2)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath(); ctx.arc(ex, ey, Math.max(1.2, pr*0.12), 0, Math.PI*2); ctx.fill()
    ctx.fillStyle = '#0b1220'
    ctx.beginPath(); ctx.arc(ex+pr*0.06, ey, Math.max(0.8, pr*0.07), 0, Math.PI*2); ctx.fill()

    // ghosts (classic body with scalloped bottom + eyes)
    for(const gh of ghosts.current){
      const gx = ox + gh.x*size + size/2
      const gy = oy + gh.y*size + size/2
      const gr = Math.min(size*0.42, 12)
      const bodyColor = gh.fright>0 ? COLOR_GHOST_FRIGHT : COLOR_GHOST

      ctx.fillStyle = bodyColor
      ctx.beginPath()
      // head (semi-circle)
      ctx.arc(gx, gy - gr*0.1, gr, Math.PI, 0)
      // sides down
      ctx.lineTo(gx+gr, gy + gr*0.6)
      // scalloped bottom with 4 bumps
      const bumps = 4
      const step = (gr*2)/bumps
      let bx = gx+gr
      const by = gy + gr*0.6
      for(let i=0;i<bumps;i++){
        const cx = gx+gr - step*(i+0.5)
        ctx.quadraticCurveTo(cx, by + gr*0.55, gx+gr - step*(i+1), by)
      }
      ctx.lineTo(gx-gr, gy + gr*0.6)
      ctx.closePath()
      ctx.fill()

      // eyes
      const eyeOffsetX = gr*0.35
      const eyeOffsetY = -gr*0.15
      const eyeR = Math.max(1.2, gr*0.26)
      const pupilR = Math.max(0.8, gr*0.12)

      // pupils bias towards Pac-Man when not frightened
      const pvx = pac.current.x
      const pvy = pac.current.y
      const dx = Math.sign(pvx - gh.x)
      const dy = Math.sign(pvy - gh.y)
      const biasX = gh.fright>0 ? 0 : dx*gr*0.10
      const biasY = gh.fright>0 ? 0 : dy*gr*0.10

      // left eye
      ctx.fillStyle = '#ffffff'
      ctx.beginPath(); ctx.arc(gx - eyeOffsetX, gy + eyeOffsetY, eyeR, 0, Math.PI*2); ctx.fill()
      // right eye
      ctx.beginPath(); ctx.arc(gx + eyeOffsetX, gy + eyeOffsetY, eyeR, 0, Math.PI*2); ctx.fill()

      ctx.fillStyle = '#0b1220'
      ctx.beginPath(); ctx.arc(gx - eyeOffsetX + biasX, gy + eyeOffsetY + biasY, pupilR, 0, Math.PI*2); ctx.fill()
      ctx.beginPath(); ctx.arc(gx + eyeOffsetX + biasX, gy + eyeOffsetY + biasY, pupilR, 0, Math.PI*2); ctx.fill()
    }
  }

  // resolve Pac-Man vs ghosts collision (called after both Pac move and ghost move)
  function resolveCollision(){
    const pv = pac.current
    for (const g of ghosts.current){
      if (g.x===pv.x && g.y===pv.y){
        if (g.fright>0){
          setScore(s=>s+200)
          g.x = COLS-2; g.y = ROWS-2; g.fright = 0; g.dir = {x:0,y:0}
          sfx('eat')
        } else {
          sfx('die')
          setLives(v=>{ const nv=v-1; if (nv<=0) { setOver(true) }
            pac.current = {x:1,y:1, dir:{x:0,y:0}, mouth:0}
            return nv
          })
        }
      }
    }
  }
  // tick loop (time-based, consistent speed)
  useEffect(()=>{
    function step(ts:number){
      if (lastTs.current==null) lastTs.current = ts
      const dt = ts - lastTs.current
      lastTs.current = ts

      if (!paused && !over){
        // accumulate elapsed play time
        elapsedMsRef.current += dt
        const sec = Math.floor(elapsedMsRef.current / 1000)
        if (sec !== elapsed) setElapsed(sec)

        pacAccum.current += dt
        ghostAccum.current += dt

        // Pacman grid step by fixed interval
        let pacSteps = 0
        while (pacAccum.current >= pacInterval && pacSteps < PAC_MAX_STEPS){
          pacAccum.current -= pacInterval
          pacSteps++
          const pv = pac.current
          const nx = pv.x + pv.dir.x
          const ny = pv.y + pv.dir.y
          if (canWalk(nx,ny)) { pv.x = nx; pv.y = ny }
          const c = grid.current[pv.y][pv.x]
          if (c === '.') { grid.current[pv.y][pv.x] = ' '; setScore(s=>s+10); remaining.current--; sfx('chomp') }
          if (c === 'o') { grid.current[pv.y][pv.x] = ' '; setScore(s=>s+50); remaining.current--; ghosts.current.forEach(g=> g.fright = FRIGHT_STEPS); sfx('power') }
          if (remaining.current<=0){ setLevelComplete(true); setPaused(true) }
          // check collision immediately after Pac-Man moves (prevents miss when ghost moves away later in the same frame)
          resolveCollision()
        }

        // Ghosts grid step by fixed interval
        let ghostSteps = 0
        while (ghostAccum.current >= ghostInterval && ghostSteps < GHOST_MAX_STEPS){
          ghostAccum.current -= ghostInterval
          ghostSteps++
          const pv = pac.current
          for (const g of ghosts.current){
            if (g.fright>0) g.fright--
            const dirs = [ {x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1} ]

            // all walkable directions
            let options = dirs.filter(d=> canWalk(g.x+d.x, g.y+d.y))

            // avoid immediate reversal when there are other choices
            const rev = { x: -g.dir.x, y: -g.dir.y }
            if (options.length > 1 && (g.dir.x!==0 || g.dir.y!==0)){
              options = options.filter(d=> !(d.x===rev.x && d.y===rev.y))
            }

            // score options: chase when normal; flee when frightened
            const scored = options
              .map(d=>{
                const dx = (g.x+d.x) - pv.x
                const dy = (g.y+d.y) - pv.y
                const dist = Math.abs(dx)+Math.abs(dy)
                let score = g.fright>0 ? dist : -dist
                // prefer to keep moving in the same direction to prevent jitter
                if (d.x===g.dir.x && d.y===g.dir.y) score -= 0.1
                // slight penalty to reversing if it still exists
                if (d.x===rev.x && d.y===rev.y) score += 0.2
                return { d, score }
              })
              .sort((a,b)=> a.score - b.score)

            const pick = scored[0]?.d || options[0] || {x:0,y:0}
            g.x += pick.x; g.y += pick.y
            g.dir = pick

            resolveCollision()
          }
        }
      }

      // update "power time left" (max fright among ghosts), show in seconds with 0.1s precision
      const maxSteps = Math.max(0, ...ghosts.current.map(g=> g.fright || 0))
      const secLeft = Math.max(0, Math.round((maxSteps * ghostInterval) / 100) / 10) // one decimal
      setFrightLeft(secLeft)

      draw()
      rafRef.current = requestAnimationFrame(step)
    }
    if (rafRef.current==null){ rafRef.current = requestAnimationFrame(step) }
    return ()=>{
      if (rafRef.current){ cancelAnimationFrame(rafRef.current); rafRef.current=null }
      stopAllSfx()
    }
  }, [paused, over, mode, pacInterval, ghostInterval])

  useEffect(()=>{ if (levelComplete) sfx('level') }, [levelComplete])

  // best score per mode
  const bestKey = useMemo(()=> `pac_best_${mode}`, [mode])
  const [best, setBest] = useState<number | null>(null)
  useEffect(()=>{ const v = localStorage.getItem(bestKey); setBest(v? Number(v): null) }, [bestKey])
  useEffect(()=>{ if (over){ if (best==null || score>best){ localStorage.setItem(bestKey, String(score)); setBest(score) } } }, [over])

  function begin(){
    if (!started){ setStarted(true) }
    // 预热音频上下文与缓冲，避免首次触发延迟
    ensureCtx()
  }
  function togglePause(){ if (!over) setPaused(p=>!p) }
  function hardReset(){ reset(); begin() }

  useEffect(()=>{ reset() }, [mode, level, currentMap])

  return (
    <div className="page-wrap">
      <div className="shell">
        <header className="page-header compact">
          <h1 className="title">👻 吃豆人 · 升级版</h1>
          <p className="subtitle">统一 UI · 方向键/空格暂停 · 能量豆（反吃幽灵） · 支持 经典 / 限时 / 挑战 模式。</p>
          <div className="modes">
            <span className="sec-title">模式</span>
            <button className={`mode-btn ${mode==='classic'?'on':''}`} onClick={()=> setMode('classic')}>经典</button>
            <button className={`mode-btn ${mode==='timed'?'on':''}`} onClick={()=> setMode('timed')}>限时 60s</button>
            <button className={`mode-btn ${mode==='challenge'?'on':''}`} onClick={()=> setMode('challenge')}>挑战</button>
            <button className="mode-btn" onClick={togglePause}>{paused? '继续':'暂停'}</button>
            <button className="mode-btn" onClick={hardReset}>重开</button>
            <button className="mode-btn" onClick={()=> setSoundOn(v=>!v)}>{soundOn? '音效开' : '音效关'}</button>
          </div>
          <div className="stats unified">
            <div className="chip">
              <div className="label">分数</div>
              <div className="value">{score}</div>
            </div>
            <div className="chip">
              <div className="label">关卡</div>
              <div className="value">{level}</div>
            </div>
            <div className="chip">
              <div className="label">命数</div>
              <div className="value">{lives}</div>
            </div>
            {mode === 'timed' && <div className="chip">
              <div className="label">剩余时间</div>
              <div className="value">{timeLeft}s</div>
            </div>}
            <div className="chip">
              <div className="label">用时</div>
              <div className="value">{elapsed}s</div>
            </div>
            {frightLeft > 0 && (
                <div className="chip">
                  <div className="label">能量剩余</div>
                  <div className="value">{frightLeft.toFixed(1)}s</div>
                </div>
            )}
            <div className="chip">
              <div className="label">最佳</div>
              <div className="value">{best ?? '-'}</div>
            </div>
          </div>
        </header>

        <main className="board-card">
          <div ref={stageRef} className="stage" style={{width: '100%', height: 'clamp(320px, 54vh, 560px)', margin: 0}}
               onClick={begin}>
            <canvas ref={canvasRef}/>
          </div>
          <div className="help">提示：吃下 <b style={{color:COLOR_POWER}}>能量豆</b> 后短时间内可反吃幽灵；空格键可暂停/继续。</div>

          {paused && !over && (
            <div className="overlay"><div className="panel">
              <div className="result-title">暂停中</div>
              <div className="result-sub">分数 {score} · 命数 {lives}</div>
              <div className="overlay-actions">
                <button className="btn primary" onClick={togglePause}>继续</button>
                <button className="btn secondary" onClick={hardReset}>重开</button>
                <a className="btn secondary" href="/">返回首页</a>
              </div>
            </div></div>
          )}
          {levelComplete && !over && (
              <div className="overlay"><div className="panel">
                <div className="result-title">关卡 {level} 通关</div>
                <div className="result-sub">分数 {score} · 用时 {elapsed}s</div>
                <div className="overlay-actions">
                  <button className="btn primary" onClick={nextLevel}>下一关</button>
                  <a className="btn secondary" href="/">返回首页</a>
                </div>
              </div></div>
          )}

          {over && (
            <div className="overlay"><div className="panel">
              <div className="result-title">本局结束</div>
              <div className="result-sub">分数 {score} · 用时 {elapsed}s{best!=null && score>=best && ' · 新纪录！'}</div>
              <div className="overlay-actions">
                <button className="btn primary" onClick={hardReset}>再来一局</button>
                <a className="btn secondary" href="/">返回首页</a>
              </div>
            </div></div>
          )}
        </main>

        <div className="bottom-bar">
          <div className="actions">
            <button className="btn primary" onClick={hardReset}>再来一局</button>
            <a className="btn secondary" href="/">返回首页</a>
          </div>
          <div className="help">方向键移动，吃掉全部豆子即可过关并进入下一关；挑战模式下幽灵更凶。</div>
        </div>
      </div>

      <style>{`
        .page-wrap{ min-height:100vh; display:flex; align-items:flex-start; justify-content:center; padding:16px 24px 24px; background:radial-gradient(1000px 600px at 20% 0%,#eef2f7,#e2e8f0); }
        .shell{ width:min(100%,980px); display:grid; grid-template-columns: 1fr; gap:16px; }
        .page-header .title{ font-size:clamp(24px,3.2vw,34px); margin:0; letter-spacing:.2px; }
        .page-header .subtitle{ font-size:14px; color:#475569; margin:6px 0 10px; }
        .modes{ display:flex; gap:8px; margin:6px 0 8px; flex-wrap:wrap; align-items:center; }
        .mode-btn{ appearance:none; border:1px solid #e2e8f0; background:#fff; border-radius:10px; padding:8px 10px; font-weight:700; cursor:pointer; }
        .mode-btn.on{ background:#0ea5e9; color:#062a37; border-color:#0ea5e9; box-shadow: 0 6px 14px rgba(14,165,233,.25); }
        .mode-btn:hover{ background:#f8fafc; }
        .mode-btn:active{ transform:translateY(1px); }
        .sec-title{ font-size:12px; font-weight:800; color:#0f172a; }

        .board-card{ background: linear-gradient(135deg,${COLOR_BOARD_FROM},${COLOR_BOARD_TO}); border-radius: 18px; box-shadow: 0 14px 28px rgba(2,6,23,.35); padding: 12px; position:relative; overflow:hidden; width:100%; }
        .board-card::before{ content:""; position:absolute; inset:10px; border-radius:14px; box-shadow: inset 0 0 0 1px rgba(51,65,85,.55), inset 0 -24px 48px rgba(2,6,23,.22); pointer-events:none; }

        .stats{ display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin:10px 0 14px; }
        .chip{ flex:0 0 auto; min-width:120px; background:#dde6ef; color:#0b1220; border-radius:12px; padding:10px 12px; box-shadow: inset 0 -2px 0 rgba(255,255,255,.04); }
        .chip .label{ font-size:12px; opacity:.8; }
        .chip .value{ font-size:20px; font-weight:800; line-height:1.1; }

        .bottom-bar{ background: linear-gradient(135deg,#ffffff,#f8fafc); border:1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; display:flex; align-items:center; justify-content:space-between; box-shadow: 0 12px 26px rgba(2,6,23,.10); }
        @media (max-width: 640px){ .bottom-bar{ flex-direction:column; gap:8px; align-items:stretch; text-align:center; } .bottom-bar .actions{ justify-content:center; } }

        .overlay{ position:absolute; inset:0; background:rgba(15,23,42,.22); display:flex; align-items:center; justify-content:center; border-radius:16px; backdrop-filter:saturate(120%) blur(1.2px); pointer-events:none; }
        .panel{ background:linear-gradient(135deg, rgba(255,255,255,.92), rgba(248,250,252,.90)); border:1px solid rgba(226,232,240,.9); border-radius:14px; padding:16px; width:min(92%, 360px); text-align:center; box-shadow:0 20px 40px rgba(2,6,23,.25); pointer-events:auto; }
        .result-title{ font-size:20px; font-weight:800; color:#0f172a; margin-bottom:6px; }
        .result-sub{ color:#475569; font-size:13px; margin-bottom:12px; }
        .overlay-actions{ display:flex; gap:10px; justify-content:center; }
      `}</style>
    </div>
  )
}
