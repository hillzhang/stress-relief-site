import React, { useEffect, useRef, useState } from 'react'
import '../styles.css'

// ==== Stage size (aligned with other games) ====
const WIDTH = 480
const HEIGHT = 720

// Difficulty presets
const MODES = {
  easy:   { enemySpeed: 0.6, enemyStep: 10, fireEvery: 1400, bulletSpeed: 2.4 },
  normal: { enemySpeed: 0.9, enemyStep: 12, fireEvery: 1100, bulletSpeed: 2.9 },
  hard:   { enemySpeed: 1.2, enemyStep: 14, fireEvery: 900,  bulletSpeed: 3.4 },
}

type ModeKey = keyof typeof MODES
type PickupType = 'shield' | 'triple' | 'slow'
type EnemyType = 'green' | 'red' | 'blue' | 'tank' | 'fast'

export default function Space(){
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D|null>(null)

  // Game state
  const [mode, setMode] = useState<ModeKey>('easy')
  const [paused, setPaused] = useState(false)
  const [over, setOver] = useState(false)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState<number|null>(null)
  const [lives, setLives] = useState(3)
  const [started, setStarted] = useState(false)
  // New scoring/combo state
  const [combo, setCombo] = useState(0)
  const [mult, setMult] = useState(1)
  const CFG = MODES[mode]

  // Sync refs for started/paused/over state
  const startedRef = useRef(false)
  const pausedRef = useRef(false)
  const overRef = useRef(false)
  useEffect(() => { startedRef.current = started }, [started])
  useEffect(() => { pausedRef.current = paused }, [paused])
  useEffect(() => { overRef.current = over }, [over])

  // Entities
  const player = useRef({ x: WIDTH/2 })
  const dir = useRef(0)
  const bullets = useRef<{x:number;y:number}[]>([])
  const enemies = useRef<{x:number;y:number; hp:number; type: EnemyType}[]>([])
  const enemyDir = useRef(1)
  const enemyBullets = useRef<{x:number;y:number; vy?:number}[]>([])
  // Power-up & combo state
  const pickups = useRef<{x:number;y:number; type: PickupType; vy:number}[]>([])
  const tripleUntil = useRef(0)
  const slowUntil = useRef(0)
  const shieldCount = useRef(0)
  const lastFireAt = useRef(0)
  const edgeCooldownAt = useRef(0)
  const hitCooldownAt = useRef(0)
  const lastKillAt = useRef(0)

  // Boss
  const boss = useRef<{x:number;y:number;hp:number;alive:boolean}>({x:WIDTH/2, y:80, hp:0, alive:false})
  const bossFireAt = useRef(0)

  // Waves & banner
  const wave = useRef(1)
  const [waveUI, setWaveUI] = useState(1)
  const themeNameRef = useRef<string>('混合')
  const bannerUntil = useRef(0)
  const [bannerText, setBannerText] = useState<string|null>(null)

  // ===== Audio (low-latency WebAudio with toggle) =====
  const [soundOn, setSoundOn] = useState(true)
  const audioCtx = useRef<AudioContext|null>(null)
  const sfxBuf = useRef<{shoot:AudioBuffer|null, boom:AudioBuffer|null, hit:AudioBuffer|null}>({shoot:null,boom:null,hit:null})
  const activeSfx = useRef<Set<{src: AudioScheduledSourceNode; gain: GainNode}>>(new Set())
  function stopAllSfx(){
    for(const n of activeSfx.current){ try{n.src.stop()}catch{}; try{n.src.disconnect()}catch{}; try{n.gain.disconnect()}catch{} }
    activeSfx.current.clear()
  }
  function ensureCtx(): boolean{
    if(!audioCtx.current){ try{ audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)({latencyHint:'interactive'}) }catch{} }
    const ctx = audioCtx.current; if(!ctx) return false
    if(ctx.state==='suspended'){
      ctx.resume().catch(()=>{})
      const once = ()=>{ ctx.resume().catch(()=>{}); window.removeEventListener('touchstart', once); window.removeEventListener('mousedown', once) }
      window.addEventListener('touchstart', once, {once:true}); window.addEventListener('mousedown', once, {once:true})
    }
    // build buffers once
    if(!sfxBuf.current.shoot){ sfxBuf.current.shoot = buildGunshot(ctx, 0.24) }
    if(!sfxBuf.current.boom){ sfxBuf.current.boom  = buildSweep(ctx, 520, 180, 0.28, 'square', 0.5) }
    if(!sfxBuf.current.hit){  sfxBuf.current.hit   = buildTone(ctx, 260, 0.10, 'triangle', 0.22) }
    return ctx.state==='running'
  }
  function buildTone(ctx:AudioContext, freq:number, dur=0.12, type:OscillatorType='sine', gain=0.22){
    const sr=ctx.sampleRate, len=Math.max(1,Math.floor(dur*sr)); const buf=ctx.createBuffer(1,len,sr); const ch=buf.getChannelData(0)
    for(let i=0;i<len;i++){ const t=i/sr; const env=Math.exp(-10*t); const ph=2*Math.PI*freq*t; let v=Math.sin(ph); if(type==='square') v=Math.sign(Math.sin(ph)); else if(type==='triangle') v=2/Math.PI*Math.asin(Math.sin(ph)); ch[i]=v*env*gain }
    return buf
  }
  function buildSweep(ctx:AudioContext, f0:number, f1:number, dur=0.32, type:OscillatorType='square', gain=0.5){
    const sr=ctx.sampleRate, len=Math.max(1,Math.floor(dur*sr)); const buf=ctx.createBuffer(1,len,sr); const ch=buf.getChannelData(0)
    for(let i=0;i<len;i++){ const t=i/sr; const f=f0+(f1-f0)*(t/dur); const env=Math.exp(-6*t); const ph=2*Math.PI*f*t; let v=Math.sign(Math.sin(ph)); ch[i]=v*env*gain }
    return buf
  }

  function buildGunshot(ctx:AudioContext, dur=0.22){
    const sr = ctx.sampleRate
    const len = Math.max(1, Math.floor(dur*sr))
    const buf = ctx.createBuffer(1, len, sr)
    const ch = buf.getChannelData(0)

    // Dry crack/body we build first, then add a short early reflection
    const dry = new Float32Array(len)
    const thumpFreq = 150 // lower and quieter than before
    const clickT = 0.0018 // earlier, shorter

    // generate dry (crack + very light thump + click)
    let n1 = 0, n2 = 0
    for(let i=0;i<len;i++){
      const t = i/sr
      // high-frequency crack: bandpassed-ish by two-point highpass (pre-emphasis)
      const n = Math.random()*2-1
      const hp = (n - n1) - 0.5*(n1 - n2) // emphasize >2kHz
      n2 = n1; n1 = n
      const envCrack = Math.exp(-60*t) // very fast decay
      const crack = hp * envCrack * 0.85

      // subtle low body (thump) — much quieter than before
      const envThump = Math.exp(-10*t)
      const thump = Math.sin(2*Math.PI*thumpFreq*t) * envThump * 0.16

      // tiny mechanical click
      const click = (t>clickT && t<clickT+0.0008) ? 0.5 : 0

      dry[i] = crack + thump + click
    }

    // add early reflection (~28ms) for small-room feel
    const dSamp = Math.floor(0.028 * sr)
    for(let i=0;i<len;i++){
      let v = dry[i]
      const j = i - dSamp
      if(j >= 0) v += dry[j] * 0.35
      // soft limiter
      ch[i] = Math.tanh(v * 1.5)
    }
    return buf
  }
  function sfx(kind:'shoot'|'boom'|'hit'){
    if(!soundOn) return; const ok=ensureCtx(); const ctx=audioCtx.current; if(!ctx) return
    let startAt = ctx.currentTime; if(!ok||ctx.state!=='running'){ const once=()=>{ ctx.resume().catch(()=>{}); window.removeEventListener('touchstart',once); window.removeEventListener('mousedown',once) }; window.addEventListener('touchstart',once,{once:true}); window.addEventListener('mousedown',once,{once:true}); startAt = Math.max(ctx.currentTime+0.05,0) }
    const src = ctx.createBufferSource(); const g = ctx.createGain()
    src.buffer = kind==='shoot'? sfxBuf.current.hit! : kind==='boom'? sfxBuf.current.boom! : sfxBuf.current.shoot!
    g.gain.value = kind==='boom'? 0.55 : kind==='hit'? 0.24 : 0.26
    src.connect(g); g.connect(ctx.destination); activeSfx.current.add({src,gain:g}); src.onended=()=>{ try{src.disconnect(); g.disconnect()}catch{}; for(const n of activeSfx.current){ if(n.src===src){ activeSfx.current.delete(n); break } } }
    src.start(startAt)
  }
  useEffect(()=>{ if(!soundOn) stopAllSfx() },[soundOn])

  // ===== Input =====
  useEffect(()=>{
    const down = (e:KeyboardEvent)=>{
      if(e.key==='ArrowLeft') dir.current = -4
      if(e.key==='ArrowRight') dir.current = 4
      if(e.key===' '){
        if(!started) setStarted(true)
        // triple shot if active
        const now = Date.now()
        const isTriple = now < tripleUntil.current
        bullets.current.push({x: player.current.x, y: HEIGHT-40})
        if(isTriple){
          bullets.current.push({x: player.current.x - 8, y: HEIGHT-40})
          bullets.current.push({x: player.current.x + 8, y: HEIGHT-40})
        }
        sfx('shoot')
      }
      if(e.key==='p' || e.key==='P'){ setPaused(p=>!p) }
    }
    const up = (e:KeyboardEvent)=>{ if(e.key==='ArrowLeft'||e.key==='ArrowRight') dir.current = 0 }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return ()=>{ window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  },[started])

  // ===== Init enemies =====
  function initEnemies(){
    enemies.current = []
    enemyDir.current = 1
    boss.current = { x: WIDTH/2, y: 80, hp: 0, alive: false }
    const w = wave.current
    // introduce cycle and seeded randomness
    const cycle = Math.floor((w - 1) / 5) // 0-based cycle index per 5 waves
    const seedBase = w * 9973
    const rand = (n:number)=> { const x = Math.sin(n + seedBase) * 10000; return x - Math.floor(x) }
    // wave theme by modulo
    const theme = (w - 1) % 5
    let cols = 9, rows = 5
    if (w >= 3) rows = 6
    if (w >= 6) { cols = 10; rows = 6 }
    const marginX = 28
    const marginY = 56
    const areaW = WIDTH - marginX*2
    const stepX = areaW / (cols - 1)
    const stepY = 44
    // pushEnemy with jitter and optional corridor gap
    const pushEnemy = (cx:number, cy:number, t:EnemyType)=>{
      // optional vertical corridor gap on odd cycles to change dodge routes
      const makeGap = (cycle % 2 === 1) && cols >= 9 && (cx % 7 === 3) && cy > 0 && cy < rows - 1
      if (makeGap) return
      const hp = t==='tank' ? (w>=7? 4 : 3) : 1
      const jitter = (rand(cx*37 + cy*101) - 0.5) * 2 // ±1px jitter
      enemies.current.push({ x: Math.round(marginX + cx*stepX + jitter), y: marginY + cy*stepY, hp, type: t })
    }

    if(theme===0){ // Mixed 默认
      themeNameRef.current = '混合编队'
      for(let r=0;r<rows;r++){
        for(let c=0;c<cols;c++){
          let t: EnemyType = 'green'
          if(r===0) t = (c%3===0)? 'blue' : 'red'
          else if(r===1) t = (c%4===0)? 'tank' : 'red'
          else if(r===2) t = (c%2===0)? 'green' : 'blue'
          else if(r===3) t = (c%3===1)? 'fast' : 'green'
          else t = (c%5===0)? 'tank' : (c%2===0? 'red':'blue')
          // variety by cycle: occasionally flip red/blue on odd cycles
          if(cycle % 2 === 1){
            if(t==='red' && rand(c*13 + r*7) > 0.6) t='blue'
            else if(t==='blue' && rand(c*19 + r*5) > 0.7) t='red'
          }
          pushEnemy(c,r,t)
        }
      }
    }else if(theme===1){ // Red Rush: 敏捷偏多
      themeNameRef.current = '敏捷突击'
      for(let r=0;r<rows;r++){
        for(let c=0;c<cols;c++){
          let t: EnemyType = (c%3===0)? 'red' : (r%2===0? 'fast':'green')
          if(cycle % 2 === 1){ // swap roles on odd cycles
            if(t==='red') t='fast'; else if(t==='fast') t='red'
          }
          pushEnemy(c,r,t)
        }
      }
    }else if(theme===2){ // Blue Barrage: 蓝色火力多
      themeNameRef.current = '蓝色火力'
      for(let r=0;r<rows;r++){
        for(let c=0;c<cols;c++){
          let t: EnemyType = (r%2===0)? (c%4===0?'tank':'blue') : (c%2===0?'blue':'green')
          // on certain cycles, insert a mid tank line and flip some blue/green
          if(cycle % 3 === 1 && r === Math.floor(rows/2) && c%2===0) t='tank'
          if(cycle % 2 === 1 && t!=='tank' && rand(c*11 + r*23) > 0.7){ t = (t==='blue' ? 'green' : 'blue') }
          pushEnemy(c,r,t)
        }
      }
    }else if(theme===3){ // Tank Wall: 坦克墙 + 交错
      themeNameRef.current = '坦克防线'
      for(let r=0;r<rows;r++){
        for(let c=0;c<cols;c++){
          let t: EnemyType = (r%3===0)? 'tank' : (c%2===0? 'green' : 'red')
          if(cycle % 2 === 0 && r%2===0 && c%3!==1) t='tank' // denser tanks on even cycles
          pushEnemy(c,r,t)
        }
      }
    }else{ // theme===4 Fast ZigZag: 快速/红混合
      themeNameRef.current = '疾行之字'
      for(let r=0;r<rows;r++){
        for(let c=0;c<cols;c++){
          let t: EnemyType = (c%2===0)? 'fast' : 'red'
          if(cycle % 2 === 1){ // odd cycles: more red columns
            if(c%4===0) t='red'
          }
          pushEnemy(c,r,t)
        }
      }
    }

    // banner
    setWaveUI(w)
    setBannerText(`第 ${w} 波 · ${themeNameRef.current}`)
    bannerUntil.current = Date.now() + 1300
  }

  function initBoss(){
    enemies.current = []
    enemyDir.current = 1
    const w = wave.current
    const hp = 24 + Math.floor(w*3)
    boss.current = { x: WIDTH/2, y: 86, hp, alive: true }
    // banner
    setWaveUI(w)
    setBannerText(`第 ${w} 波 · BOSS 来袭`)
    bannerUntil.current = Date.now() + 1500
  }

  function reset(){
    setOver(false); setPaused(false); setScore(0); setLives(3); setStarted(false)
    player.current = { x: WIDTH/2 }
    bullets.current = []; enemyBullets.current = []
    pickups.current = []
    tripleUntil.current = 0
    slowUntil.current = 0
    shieldCount.current = 0
    setCombo(0)
    setMult(1)
    wave.current = 1
    setWaveUI(1)
    setBannerText(null)
    initEnemies()
    try{ const b = localStorage.getItem('space_best'); if(b!=null) setBest(Number(b)) }catch{}
    stopAllSfx()
    hitCooldownAt.current = 0
  }

  // ===== Game loop (rAF) =====
  useEffect(()=>{
    const ctx = canvasRef.current!.getContext('2d')!; ctxRef.current = ctx
    reset()

    let last = performance.now()
    function frame(now:number){
      const dt = Math.min(40, now - last); last = now
      if (!pausedRef.current && !overRef.current && startedRef.current) { step(dt/16) }
      render()
      id = requestAnimationFrame(frame)
    }
    function step(k:number){
      // global slow motion if active
      const nowGlobal = nowMs()
      const slowFactor = nowGlobal < slowUntil.current ? 0.6 : 1
      // Move player
      player.current.x += dir.current * k
      if(player.current.x<20) player.current.x = 20
      if(player.current.x>WIDTH-20) player.current.x = WIDTH-20

      // Player bullets
      bullets.current.forEach(b=> b.y -= 6*k)
      bullets.current = bullets.current.filter(b=> b.y>-12)

      // Bullet vs enemies
      for(const b of [...bullets.current]){
        for(const e of [...enemies.current]){
          if(Math.abs(b.x-e.x)<18 && Math.abs(b.y-e.y)<18){
            // hit: reduce hp; remove bullet
            bullets.current = bullets.current.filter(bl=>bl!==b)
            e.hp -= 1
            let died = false
            if(e.hp <= 0){
              died = true
              enemies.current = enemies.current.filter(en=>en!==e)
            }

            // scoring & combo only on kill
            if(died){
              lastKillAt.current = nowMs()
              setCombo(c => {
                const nc = c + 1
                const nm = Math.min(5, 1 + Math.floor(nc / 5))
                setMult(nm)
                return nc
              })
              setScore(s=>{
                const base = 10 + (e.type==='tank'? 10 : 0)
                const ns = s + base * mult
                if(best==null||ns>best){ setBest(ns); try{localStorage.setItem('space_best', String(ns))}catch{} }
                return ns
              })
              sfx('boom')
              // Theme-aware drop chance (lowered)
              {
                const base = 0.12
                const bonus = themeNameRef.current==='蓝色火力' ? 0.04 : themeNameRef.current==='坦克防线' ? -0.03 : themeNameRef.current==='敏捷突击' ? 0.01 : 0
                const chance = Math.max(0.05, Math.min(0.28, base + bonus))
                if (Math.random() < chance) {
                  const r = Math.random()
                  const ptype: PickupType = r < 0.34 ? 'shield' : r < 0.67 ? 'triple' : 'slow'
                  pickups.current.push({ x: e.x, y: e.y, type: ptype, vy: 0.7 })
                }
              }
            } else {
              // small hit sound on damage (no kill)
              sfx('hit')
            }
            break
          }
        }
      }

      // Bullets vs Boss
      if(boss.current.alive){
        for(const b of [...bullets.current]){
          const dx = b.x - boss.current.x
          const dy = b.y - boss.current.y
          if(Math.hypot(dx,dy) < 34){
            bullets.current = bullets.current.filter(bl=>bl!==b)
            boss.current.hp -= 1
            if(boss.current.hp <= 0){
              boss.current.alive = false
              setScore(s=>s+200)
              lastKillAt.current = nowMs()
              setCombo(c=>{ const nc=c+1; const nm=Math.min(5,1+Math.floor(nc/5)); setMult(nm); return nc })
              sfx('boom')
            }else{
              sfx('hit')
            }
            break
          }
        }
      }

      // Enemies move
      let edge=false
      const speedFor = (t:EnemyType)=> t==='fast'? 1.6 : t==='red'? 1.25 : t==='tank'? 0.65 : t==='blue'? 0.95 : 1
      enemies.current.forEach(e=>{
        const waveMul = Math.min(1.6, 1 + (wave.current-1)*0.06)
        e.x += enemyDir.current * CFG.enemySpeed * speedFor(e.type) * waveMul * k * slowFactor
        if (e.type==='fast') {
          // small lateral zig‑zag based on time & row
          const wobble = Math.sin(nowGlobal/160 + e.y*0.02) * 1.4 * k * slowFactor
          e.x += wobble
        }
        if (e.x > WIDTH-20 || e.x < 20) edge = true
      })
      const nowT = nowMs()
      if (edge && nowT >= edgeCooldownAt.current) {
        enemyDir.current *= -1
        enemies.current.forEach(e=>{
          e.y += CFG.enemyStep
          // 夹紧到边界内，避免下一帧仍然判定越界而再次下落
          if (e.x > WIDTH-20) e.x = WIDTH-20
          if (e.x < 20) e.x = 20
        })
        edgeCooldownAt.current = nowT + 250 // 250ms 冷却，防止连续多次下落
      }
      if(enemies.current.some(e=> e.y>HEIGHT-80)){ // enemies reached too low -> lose life
        damage()
      }
      // Boss move (sinus wobble)
      if(boss.current.alive){
        boss.current.x += Math.sin(nowGlobal/900)*1.6 * k
        const by = 80 + Math.sin(nowGlobal/1200)*6
        boss.current.y = by
      }

      // Enemies fire
      const fireEveryEff = Math.max(650, CFG.fireEvery - (wave.current-1)*60)
      if(nowMs()-lastFireAt.current > fireEveryEff){
        lastFireAt.current = nowMs()
        const shooters = enemies.current.slice(0,3) // take top few
        shooters.forEach(e=> {
          const extra = e.type==='blue'? 0.9 : e.type==='fast'? 0.6 : e.type==='tank'? -0.45 : e.type==='red'? 0.3 : 0
          const vy = Math.max(1.2, CFG.bulletSpeed + extra)
          if (e.type==='blue') {
            enemyBullets.current.push({ x:e.x-6, y:e.y+12, vy })
            enemyBullets.current.push({ x:e.x,   y:e.y+12, vy })
            enemyBullets.current.push({ x:e.x+6, y:e.y+12, vy })
          } else {
            enemyBullets.current.push({ x:e.x, y:e.y+12, vy })
          }
        })
      }
      // Boss fire: slower but bursty
      if(boss.current.alive && nowMs()-bossFireAt.current > Math.max(900, 1600 - wave.current*40)){
        bossFireAt.current = nowMs()
        const bx = boss.current.x, by = boss.current.y + 16
        const vy = Math.max(1.0, CFG.bulletSpeed + 0.6)
        enemyBullets.current.push({ x: bx-18, y: by, vy })
        enemyBullets.current.push({ x: bx,    y: by, vy })
        enemyBullets.current.push({ x: bx+18, y: by, vy })
      }

      // Enemy bullets move & collide
      enemyBullets.current.forEach(b=> b.y += (b.vy ?? CFG.bulletSpeed) * k * slowFactor)
      enemyBullets.current = enemyBullets.current.filter(b=> b.y<HEIGHT+10)
      for(const b of [...enemyBullets.current]){
        if(Math.abs(b.x - player.current.x) < 14 && Math.abs(b.y - (HEIGHT-24)) < 14){
          enemyBullets.current = enemyBullets.current.filter(x=>x!==b)
          sfx('hit'); damage(); break
        }
      }

      // Power‑up pickups
      pickups.current.forEach(p => { p.y += p.vy * k })
      pickups.current = pickups.current.filter(p => p.y < HEIGHT + 12)
      for(const p of [...pickups.current]){
        if(Math.abs(p.x - player.current.x) < 16 && Math.abs(p.y - (HEIGHT-24)) < 16){
          // activate
          if(p.type==='shield'){
            shieldCount.current = Math.min(2, shieldCount.current + 1)
          }else if(p.type==='triple'){
            tripleUntil.current = nowMs() + 8000
          }else if(p.type==='slow'){
            slowUntil.current = nowMs() + 6000
          }
          pickups.current = pickups.current.filter(x=>x!==p)
          sfx('hit')
        }
      }

      // Combo grace window: 2s without a kill resets combo/mult
      if (combo > 0) {
        const tnow = nowMs()
        if (tnow - lastKillAt.current > 2000) {
          setCombo(0); setMult(1)
        }
      }

      // Win wave -> new wave, bonus
      if(enemies.current.length===0 && !boss.current.alive){
        setScore(s=>s+100)
        wave.current += 1
        if(wave.current % 5 === 0){
          initBoss()
        }else{
          initEnemies()
        }
      }
      // When boss dies and no small enemies remain, start next wave
      if(boss.current.alive===false && enemies.current.length===0 && Date.now()>0){
        // handled by the block above after kill; nothing extra
      }
    }

    function damage(){
      const now = nowMs()
      // 防止同一帧/短时间内多次结算伤害（导致生命变成负数）
      if (over || now < hitCooldownAt.current) return
      hitCooldownAt.current = now + 700 // 700ms 无敌时间

      // consume shield if available
      if (shieldCount.current > 0) {
        shieldCount.current -= 1
        // taking a hit still resets combo/multiplier
        setCombo(0); setMult(1)
        return
      }

      setLives(v => {
        const nv = Math.max(0, v - 1)
        if (nv <= 0) {
          setOver(true)
        } else {
          // small reset
          player.current = { x: WIDTH/2 }
          bullets.current = []
          enemyBullets.current = []
          enemyDir.current = 1
        }
        setCombo(0); setMult(1)
        return nv
      })
    }

    // === Drawing helpers ===
    function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, hasShield: boolean) {
      ctx.save();
      ctx.translate(x, y);
      ctx.shadowColor = "#1e293b";
      ctx.shadowBlur = 8;
      // Body
      ctx.beginPath();
      ctx.moveTo(-17, 6);
      ctx.quadraticCurveTo(-17, -7, 0, -9);
      ctx.quadraticCurveTo(17, -7, 17, 6);
      ctx.quadraticCurveTo(17, 13, 0, 9);
      ctx.quadraticCurveTo(-17, 13, -17, 6);
      ctx.closePath();
      ctx.fillStyle = "#1f2a44";
      ctx.fill();
      // Rim
      ctx.lineWidth = 2.1;
      ctx.strokeStyle = "#93c5fd";
      ctx.stroke();
      // Cockpit canopy
      const grad = ctx.createLinearGradient(-7, -6, 7, 4);
      grad.addColorStop(0, "#e2e8f0");
      grad.addColorStop(1, "#cbd5e1");
      ctx.beginPath();
      ctx.ellipse(0, -3, 7, 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.93;
      ctx.fill();
      ctx.globalAlpha = 1;
      // Thruster flame (animated)
      const t = performance.now() / 80;
      ctx.save();
      ctx.translate(0, 10);
      ctx.scale(1, 1 + 0.2 * Math.sin(t));
      ctx.beginPath();
      ctx.moveTo(-3.1, 0);
      ctx.quadraticCurveTo(0, 5 + 5 * Math.abs(Math.sin(t)), 3.1, 0);
      ctx.closePath();
      ctx.fillStyle = "#fbbf24";
      ctx.globalAlpha = 0.82 + 0.13 * Math.sin(t * 1.2);
      ctx.shadowColor = "#fbbf24";
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
      // Shield aura
      if (hasShield) {
        ctx.save();
        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        ctx.ellipse(0, -1, 22, 16, 0, 0, Math.PI * 2);
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#60a5fa';
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    function drawAlien(ctx: CanvasRenderingContext2D, x: number, y: number, phase: number) {
      ctx.save();
      ctx.translate(x, y);
      // Body
      ctx.beginPath();
      ctx.moveTo(-12, -10);
      ctx.quadraticCurveTo(-14, 0, -12, 10);
      ctx.quadraticCurveTo(0, 15, 12, 10);
      ctx.quadraticCurveTo(14, 0, 12, -10);
      ctx.quadraticCurveTo(0, -16, -12, -10);
      ctx.closePath();
      ctx.fillStyle = "#34d399";
      ctx.shadowColor = "#059669";
      ctx.shadowBlur = 4;
      ctx.fill();
      ctx.shadowBlur = 0;
      // Eyes
      ctx.beginPath();
      ctx.arc(-5.5, -2, 2.2, 0, Math.PI * 2);
      ctx.arc(5.5, -2, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      // Pupils
      ctx.beginPath();
      ctx.arc(-5.5, -2, 1, 0, Math.PI * 2);
      ctx.arc(5.5, -2, 1, 0, Math.PI * 2);
      ctx.fillStyle = "#0b1220";
      ctx.fill();
      // Tiny legs (animated)
      let legOffset = Math.round(Math.sin(phase) * 1.2);
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(i * 4, 13 + ((i % 2 === 0) ? -legOffset : legOffset), 2, 0, Math.PI * 2);
        ctx.fillStyle = "#34d399";
        ctx.globalAlpha = 0.92;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    function drawAlienRed(ctx: CanvasRenderingContext2D, x:number, y:number, phase:number){
      ctx.save(); ctx.translate(x,y);
      ctx.beginPath(); ctx.moveTo(-12,-10); ctx.quadraticCurveTo(-14,0,-12,10); ctx.quadraticCurveTo(0,15,12,10); ctx.quadraticCurveTo(14,0,12,-10); ctx.quadraticCurveTo(0,-16,-12,-10); ctx.closePath();
      ctx.fillStyle = '#f87171'; ctx.shadowColor = '#dc2626'; ctx.shadowBlur = 4; ctx.fill(); ctx.shadowBlur=0;
      ctx.beginPath(); ctx.arc(-5.5,-2,2.2,0,Math.PI*2); ctx.arc(5.5,-2,2.2,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();
      ctx.beginPath(); ctx.arc(-5.5,-2,1.1,0,Math.PI*2); ctx.arc(5.5,-2,1.1,0,Math.PI*2); ctx.fillStyle='#0b1220'; ctx.fill();
      ctx.restore();
    }
    function drawAlienBlue(ctx: CanvasRenderingContext2D, x:number, y:number, phase:number){
      ctx.save(); ctx.translate(x,y);
      ctx.beginPath(); ctx.moveTo(-12,-10); ctx.quadraticCurveTo(-14,0,-12,10); ctx.quadraticCurveTo(0,15,12,10); ctx.quadraticCurveTo(14,0,12,-10); ctx.quadraticCurveTo(0,-16,-12,-10); ctx.closePath();
      ctx.fillStyle = '#60a5fa'; ctx.shadowColor = '#2563eb'; ctx.shadowBlur = 5; ctx.fill(); ctx.shadowBlur=0;
      ctx.beginPath(); ctx.arc(-5.5,-2,2.2,0,Math.PI*2); ctx.arc(5.5,-2,2.2,0,Math.PI*2); ctx.fillStyle='#e0f2fe'; ctx.fill();
      ctx.beginPath(); ctx.arc(-5.5,-2,1.2,0,Math.PI*2); ctx.arc(5.5,-2,1.2,0,Math.PI*2); ctx.fillStyle='#0b1220'; ctx.fill();
      ctx.restore();
    }
    function drawAlienTank(ctx: CanvasRenderingContext2D, x:number, y:number, phase:number){
      ctx.save(); ctx.translate(x,y); ctx.scale(1.3,1.3);
      ctx.beginPath(); ctx.moveTo(-12,-10); ctx.quadraticCurveTo(-14,0,-12,10); ctx.quadraticCurveTo(0,15,12,10); ctx.quadraticCurveTo(14,0,12,-10); ctx.quadraticCurveTo(0,-16,-12,-10); ctx.closePath();
      ctx.fillStyle = '#a3a3a3'; ctx.shadowColor = '#525252'; ctx.shadowBlur = 6; ctx.fill(); ctx.shadowBlur=0;
      ctx.lineWidth=2; ctx.strokeStyle='#e5e7eb'; ctx.stroke();
      ctx.beginPath(); ctx.arc(-5.5,-2,2.0,0,Math.PI*2); ctx.arc(5.5,-2,2.0,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();
      ctx.beginPath(); ctx.arc(-5.5,-2,1.0,0,Math.PI*2); ctx.arc(5.5,-2,1.0,0,Math.PI*2); ctx.fillStyle='#0b1220'; ctx.fill();
      ctx.restore();
    }
    function drawAlienFast(ctx: CanvasRenderingContext2D, x:number, y:number, phase:number){
      ctx.save(); ctx.translate(x,y); ctx.scale(0.9,0.9);
      ctx.beginPath(); ctx.moveTo(-13,-9); ctx.quadraticCurveTo(-10,-2,-13,9); ctx.quadraticCurveTo(0,13,13,9); ctx.quadraticCurveTo(10,-2,13,-9); ctx.quadraticCurveTo(0,-14,-13,-9); ctx.closePath();
      ctx.fillStyle = '#f59e0b'; ctx.shadowColor = '#b45309'; ctx.shadowBlur = 4; ctx.fill(); ctx.shadowBlur=0;
      ctx.beginPath(); ctx.arc(-5.5,-2,2.0,0,Math.PI*2); ctx.arc(5.5,-2,2.0,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();
      ctx.beginPath(); ctx.arc(-5.5,-2,1.0,0,Math.PI*2); ctx.arc(5.5,-2,1.0,0,Math.PI*2); ctx.fillStyle='#0b1220'; ctx.fill();
      ctx.restore();
    }

    function render(){
      const ctx = ctxRef.current!; ctx.clearRect(0,0,WIDTH,HEIGHT)
      // background
      ctx.fillStyle = '#0b1220'; ctx.fillRect(0,0,WIDTH,HEIGHT)
      // stars
      ctx.fillStyle = 'rgba(255,255,255,.8)'; for(let i=0;i<40;i++){ ctx.fillRect((i*37)%WIDTH, (i*53+performance.now()/30)%HEIGHT, 1, 1) }
      // player ship
      drawShip(ctx, player.current.x, HEIGHT-20, shieldCount.current > 0);
      // bullets (player)
      bullets.current.forEach(b => {
        ctx.save();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        // Capsule: top cap
        ctx.arc(b.x, b.y-6, 3, Math.PI, 0, false);
        // Side rect
        ctx.rect(b.x-3, b.y-6, 6, 9);
        ctx.closePath();
        ctx.shadowColor = "#fbbf24";
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      });
      // enemy bullets
      enemyBullets.current.forEach(b => {
        ctx.save();
        ctx.fillStyle = '#f871b7';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
        ctx.shadowColor = "#f871b7";
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      });
      // pickups
      pickups.current.forEach(p => {
        ctx.save()
        ctx.translate(p.x, p.y)
        // slight glow by type
        ctx.shadowBlur = 10
        if(p.type==='shield'){ ctx.shadowColor = '#60a5fa' }
        else if(p.type==='triple'){ ctx.shadowColor = '#f59e0b' }
        else { ctx.shadowColor = '#34d399' }

        // draw emoji icon: 🛡️ / 🔱 / 🐢
        const emoji = p.type==='shield' ? '🛡️' : p.type==='triple' ? '🔱' : '🐢'
        ctx.font = '22px system-ui, -apple-system, \'Segoe UI Emoji\', \'Apple Color Emoji\', sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(emoji, 0, 0)

        // reset glow
        ctx.shadowBlur = 0
        ctx.restore()
      })
      // enemies
      const phase = performance.now()/180;
      const drawByType = (e:{x:number;y:number;type:EnemyType})=>{
        if(e.type==='red') return drawAlienRed(ctx, e.x, e.y, phase)
        if(e.type==='blue') return drawAlienBlue(ctx, e.x, e.y, phase)
        if(e.type==='tank') return drawAlienTank(ctx, e.x, e.y, phase)
        if(e.type==='fast') return drawAlienFast(ctx, e.x, e.y, phase)
        return drawAlien(ctx, e.x, e.y, phase)
      }
      enemies.current.forEach(e => drawByType(e))
      // boss
      if(boss.current.alive){
        ctx.save();
        ctx.translate(boss.current.x, boss.current.y)
        ctx.scale(1.8,1.8)
        ctx.beginPath();
        ctx.moveTo(-14,-12); ctx.quadraticCurveTo(-16,0,-14,12); ctx.quadraticCurveTo(0,18,14,12); ctx.quadraticCurveTo(16,0,14,-12); ctx.quadraticCurveTo(0,-20,-14,-12); ctx.closePath();
        ctx.fillStyle = '#9333ea'; ctx.shadowColor = '#7e22ce'; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur=0;
        // eyes
        ctx.beginPath(); ctx.arc(-6,-3,2.6,0,Math.PI*2); ctx.arc(6,-3,2.6,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();
        ctx.beginPath(); ctx.arc(-6,-3,1.3,0,Math.PI*2); ctx.arc(6,-3,1.3,0,Math.PI*2); ctx.fillStyle='#0b1220'; ctx.fill();
        // hp bar
        const pct = Math.max(0, boss.current.hp) / (24 + Math.floor(waveUI*3))
        ctx.restore();
        ctx.save();
        ctx.fillStyle = 'rgba(148,163,184,.35)'; ctx.fillRect(boss.current.x-40, boss.current.y-28, 80, 6)
        ctx.fillStyle = '#a78bfa'; ctx.fillRect(boss.current.x-40, boss.current.y-28, 80*pct, 6)
        ctx.restore();
      }
    }

    function nowMs(){ return Date.now() }

    let id = requestAnimationFrame(frame)
    return ()=>{ cancelAnimationFrame(id); stopAllSfx() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // ===== UI Actions =====
  function begin(){ if(!started) setStarted(true) }
  function restart(){ reset(); setStarted(true) }

  // Helper for difficulty mode button style
  function modeBtn(selected: boolean) {
    return selected
      ? { background: '#3b82f6', color: '#fff', fontWeight: 600, border: '1.5px solid #2563eb', boxShadow: '0 2px 12px #3b82f633' }
      : { background: '#f3f4f6', color: '#222', fontWeight: 400, border: '1px solid #e5e7eb' }
  }

  return (
    <div className="page-wrap" onClick={begin}>
      <div className="shell" style={{maxWidth: 980, margin:'0 auto'}}>
        <header className="page-header compact">
          <h1 className="title">🚀 太空射击</h1>
          <p className="subtitle">左右移动飞船，空格射击敌人；躲开敌人的子弹。</p>
          <div className="toolbar" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
            <div className="modes" style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button
                className={`mode-btn ${mode==='easy'?'on':''}`}
                style={modeBtn(mode==='easy')}
                aria-pressed={mode==='easy'}
                onClick={()=>setMode('easy')}
              >简单</button>
              <button
                className={`mode-btn ${mode==='normal'?'on':''}`}
                style={modeBtn(mode==='normal')}
                aria-pressed={mode==='normal'}
                onClick={()=>setMode('normal')}
              >标准</button>
              <button
                className={`mode-btn ${mode==='hard'?'on':''}`}
                style={modeBtn(mode==='hard')}
                aria-pressed={mode==='hard'}
                onClick={()=>setMode('hard')}
              >困难</button>
              <button className="mode-btn" onClick={()=>setPaused(p=>!p)}>{paused? '继续' : '暂停'}</button>
              <button className="mode-btn" onClick={restart}>重开</button>
              <button className="mode-btn" onClick={()=> setSoundOn(v=>!v)}>{soundOn? '音效开' : '音效关'}</button>
            </div>
            <div className="stats unified" style={{ display:'flex', gap:8 }}>
              <div className="chip"><div className="label">分数</div><div className="value">{score}</div></div>
              <div className="chip"><div className="label">最佳</div><div className="value">{best ?? '-'}</div></div>
              <div className="chip"><div className="label">生命</div><div className="value">{lives}</div></div>
              <div className="chip"><div className="label">连击</div><div className="value">{combo}</div></div>
              <div className="chip"><div className="label">倍率</div><div className="value">{mult}x</div></div>
              <div className="chip"><div className="label">波次</div><div className="value">{waveUI}</div></div>
            </div>
          </div>
        </header>

        <section className="board-shell" style={{ background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:22, padding:16, boxShadow:'0 12px 28px rgba(2,6,23,.08) inset, 0 18px 34px rgba(2,6,23,.06)' }}>
          <main className="board-card" style={{ display:'flex', justifyContent:'center', padding:16, width:'100%' }}>
            <div className="stage-wrap" style={{ position:'relative', width: WIDTH, height: HEIGHT, margin:'0 auto', borderRadius:14, overflow:'hidden', boxShadow:'0 1px 0 rgba(255,255,255,.06) inset, 0 8px 16px rgba(0,0,0,.20)' }}>
              <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} style={{ width:'100%', height:'100%', display:'block' }}/>

              {(bannerText && Date.now() < bannerUntil.current) && (
                <div className="overlay" style={{position:'absolute', inset:0, display:'flex', alignItems:'flex-start', justifyContent:'center', pointerEvents:'none'}}>
                  <div style={{ marginTop: 16, padding:'6px 12px', borderRadius:12, background:'rgba(15,23,42,.78)', color:'#fff', fontWeight:700, letterSpacing:1 }}>
                    {bannerText}
                  </div>
                </div>
              )}

              {/* Overlays */}
              {(!started && !over) && (
                <div
                  className="overlay"
                  style={{
                    position:'absolute',
                    inset:0,
                    display:'flex',
                    alignItems:'center',
                    justifyContent:'center',
                    pointerEvents:'auto'
                  }}>
                  <div className="panel" style={{ textAlign: 'center' }}>
                    <div className="result-title">点击开始</div>
                    <div className="result-sub">空格射击 · ←/→ 移动 · P 暂停</div>
                    <div className="overlay-actions" style={{ display:'flex', justifyContent:'center' }}>
                      <button className="btn primary" onClick={()=>{ setStarted(true) }}>开始游戏</button>
                    </div>
                  </div>
                </div>
              )}

              {over && (
                <div className="overlay" style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
                  <div className="panel">
                    <div className="result-title">游戏结束</div>
                    <div className="result-sub">最终得分 {score}</div>
                    <div className="overlay-actions">
                      <button className="btn primary" onClick={restart}>再来一局</button>
                      <a className="btn secondary" href="/">返回首页</a>
                    </div>
                  </div>
                </div>
              )}

              {paused && !over && started && (
                <div className="overlay" style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
                  <div className="panel">
                    <div className="result-title">已暂停</div>
                    <div className="result-sub">按 P 或 点击继续</div>
                    <div className="overlay-actions"><button className="btn primary" onClick={()=>setPaused(false)}>继续</button></div>
                  </div>
                </div>
              )}

            </div>
          </main>
        </section>

        <div className="bottom-bar">
          <div className="actions">
            <button className="btn primary" onClick={restart}>再来一局</button>
            <a className="btn secondary" href="/">返回首页</a>
          </div>
          <div className="hint">操作：←/→ 移动；空格射击；P 暂停。</div>
        </div>
      </div>
    </div>
  )
}
