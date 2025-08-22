import React, { useEffect, useMemo, useRef, useState } from 'react'
import '../styles.css'
import { pop } from '../sfx'

// --- Types ---
type HoleType = 'normal' | 'gold' | 'bomb' | 'freeze' | 'shield' | 'double' | 'boss'
interface Hole { id: number; type: HoleType; ttl: number }

type GameState = 'ready' | 'playing' | 'paused' | 'over'
type Difficulty = 'easy' | 'normal' | 'hard'

type Theme = 'zen' | 'forest' | 'ocean'

// --- Skin assets (public/skins/**) ---
// Put images under /public as below. Code falls back to flat style if assets are missing.
// forest: /skins/forest/{bg.jpg,hole.png,mole.png,mole_gold.png,mole_boss.png}
// ocean : /skins/ocean/{bg.jpg,hole.png,mole.png,mole_gold.png,mole_boss.png}
// zen   : /skins/zen/{bg.jpg,hole.png,mole.png,mole_gold.png,mole_boss.png}
// common: /skins/common/{bomb.png,freeze.png,shield.png,double.png}

type SkinMode = 'flat' | 'image'

const ASSETS: Record<Theme, { bg: string; hole: string; sprites: Record<'normal'|'gold'|'bomb'|'freeze'|'shield'|'double'|'boss', string> }> = {
  forest: {
    bg: 'images/skins/forest/bg.png',
    hole: 'images/skins/forest/hole.png',
    sprites: {
      normal: 'images/skins/forest/mole.png',
      gold: 'images/skins/forest/mole_gold.png',
      bomb: 'images/skins/common/bomb.png',
      freeze: 'images/skins/common/freeze.png',
      shield: 'images/skins/common/shield.png',
      double: 'images/skins/common/double.png',
      boss: 'images/skins/forest/mole_boss.png',
    },
  },
  ocean: {
    bg: '/skins/ocean/bg.jpg',
    hole: '/skins/ocean/hole.png',
    sprites: {
      normal: '/skins/ocean/mole.png',
      gold: '/skins/ocean/mole_gold.png',
      bomb: '/skins/common/bomb.png',
      freeze: '/skins/common/freeze.png',
      shield: '/skins/common/shield.png',
      double: '/skins/common/double.png',
      boss: '/skins/ocean/mole_boss.png',
    },
  },
  zen: {
    bg: '/skins/zen/bg.jpg',
    hole: '/skins/zen/hole.png',
    sprites: {
      normal: '/skins/zen/mole.png',
      gold: '/skins/zen/mole_gold.png',
      bomb: '/skins/common/bomb.png',
      freeze: '/skins/common/freeze.png',
      shield: '/skins/common/shield.png',
      double: '/skins/common/double.png',
      boss: '/skins/zen/mole_boss.png',
    },
  },
}

export default function Mole(){
  // core states
  const [state, setState] = useState<GameState>('ready')
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [time, setTime] = useState(45) // base seconds
  const [lives, setLives] = useState(3)
  const [streak, setStreak] = useState(0)
  const [mult, setMult] = useState(1)
  const [holes, setHoles] = useState<Hole[]>([])
  // theme
  const [theme, setTheme] = useState<Theme>('zen')

  // skin usage
  const [skinMode, setSkinMode] = useState<SkinMode>('flat')
  const [assetsReady, setAssetsReady] = useState(false)

  // difficulty
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')

  // preload assets for current theme when using image skin
  useEffect(()=>{
    if(skinMode !== 'image') { setAssetsReady(false); return }
    const a = ASSETS[theme]
    const urls = [a.bg, a.hole, ...Object.values(a.sprites)]
    let ok = 0; let failed = false
    urls.forEach(u=>{
      const im = new Image()
      im.onload = ()=>{ ok++; if(ok===urls.length && !failed) setAssetsReady(true) }
      im.onerror = ()=>{ failed = true; setAssetsReady(false) }
      im.src = u
    })
  }, [theme, skinMode])

  // UI & FX
  const [comboMsg, setComboMsg] = useState<string | null>(null)
  const comboTimer = useRef<number | undefined>(undefined)
  const [levelFlash, setLevelFlash] = useState(false)
  const [shake, setShake] = useState(false)

  // power-ups
  const [shield, setShield] = useState(0)           // blocks one bomb
  const [doubleUntil, setDoubleUntil] = useState<number>(0) // timestamp ms

  // responsive grid: 3x3 below Lv5, 4x4 at/after Lv5
  const GRID = level >= 5 ? 16 : 9
  const COLS = GRID === 16 ? 4 : 3

  // timing
  const tickId = useRef<number | null>(null)
  const spawnCooldown = useRef(0)

  // derived config per level and difficulty
  const cfg = useMemo(()=>{
    // base pacing with level
    const baseSpeed = Math.max(500, 1350 - level*90)   // ms between spawns
    const baseLife  = Math.max(800, 1550 - level*80)   // ms hole life

    // difficulty scaling
    const speed = baseSpeed * (difficulty==='easy' ? 1.25 : difficulty==='hard' ? 0.8 : 1)
    const life  = baseLife  * (difficulty==='easy' ? 1.20 : difficulty==='hard' ? 0.85: 1)

    // probabilities (bomb slightly rarer on easy, slightly higher on hard)
    const goldPBase   = Math.min(0.18, 0.06 + level*0.010)
    const bombPBase   = Math.min(0.22, 0.05 + level*0.012)
    const freezeP     = Math.min(0.14, 0.04 + level*0.008)
    const shieldP     = Math.min(0.10, 0.03 + level*0.006)
    const doubleP     = Math.min(0.10, 0.02 + level*0.006)
    const bossP       = Math.min(0.06,  0.0 + level*0.004)

    const bombP   = Math.max(0.02, Math.min(0.28, bombPBase * (difficulty==='easy'? 0.85 : difficulty==='hard'? 1.15 : 1)))
    const goldP   = goldPBase

    return {speed, life, goldP, bombP, freezeP, shieldP, doubleP, bossP}
  }, [level, difficulty])

  // helpers
  function resetAll(){
    setState('ready'); setScore(0); setLevel(1); setTime(45); setLives(3); setStreak(0); setMult(1); setHoles([])
    setShield(0); setDoubleUntil(0)
  }
  function start(){ setState('playing') }
  function pause(){ if(state==='playing') setState('paused') }
  function resume(){ if(state==='paused') setState('playing') }

  // keyboard shortcuts: Space to start/pause/resume, R to reset
  useEffect(()=>{
    const onKey = (e: KeyboardEvent)=>{
      if(e.key === ' '){
        e.preventDefault()
        setState(s => s==='ready' ? 'playing' : (s==='playing' ? 'paused' : (s==='paused' ? 'playing' : s)))
      }else if(e.key.toLowerCase()==='r'){
        resetAll()
      }
    }
    addEventListener('keydown', onKey)
    return ()=> removeEventListener('keydown', onKey)
  }, [])

  // main loop
  useEffect(()=>{
    if(state!=='playing') { if(tickId.current){ clearInterval(tickId.current); tickId.current=null }; return }
    const last = { t: performance.now() }
    tickId.current = window.setInterval(()=>{
      const now = performance.now(); const dt = now - last.t; last.t = now

      // time
      setTime(t => {
        const nt = Math.max(0, t - dt/1000)
        if(nt===0){ setState('over') }
        return nt
      })

      // update holes ttl
      setHoles(prev => prev
        .map(h => ({...h, ttl: h.ttl - dt}))
        .filter(h => h.ttl > 0)
      )

      // spawn control
      spawnCooldown.current -= dt
      if(spawnCooldown.current <= 0){
        spawnCooldown.current = cfg.speed
        setHoles(prev => {
          const occupied = new Set(prev.map(h=>h.id))
          const free: number[] = []
          for(let i=0;i<GRID;i++){ if(!occupied.has(i)) free.push(i) }
          if(free.length===0) return prev
          const addCount = Math.min(1 + Math.floor(Math.random()*2), free.length)
          const next = [...prev]
          for(let k=0;k<addCount;k++){
            const id = free.splice(Math.floor(Math.random()*free.length),1)[0]
            const r = Math.random()
            let type: HoleType = 'normal'
            const t1 = cfg.bombP
            const t2 = t1 + cfg.goldP
            const t3 = t2 + cfg.freezeP
            const t4 = t3 + cfg.shieldP
            const t5 = t4 + cfg.doubleP
            const t6 = t5 + cfg.bossP
            if(r < t1) type = 'bomb'
            else if(r < t2) type = 'gold'
            else if(r < t3) type = 'freeze'
            else if(r < t4) type = 'shield'
            else if(r < t5) type = 'double'
            else if(r < t6) type = 'boss'
            next.push({ id, type, ttl: cfg.life })
          }
          return next
        })
      }
    }, 50) as any

    return ()=>{ if(tickId.current){ clearInterval(tickId.current); tickId.current=null } }
  }, [state, cfg])

  // interactions
  function onHit(i:number){
    if(state!=='playing') return
    const idx = holes.findIndex(h=>h.id===i)
    if(idx===-1){ // miss on empty hole -> 忽略点击，避免因消失瞬间误伤体验
      return
    }

    const h = holes[idx]
    // remove it
    setHoles(prev => prev.filter((_,j)=> j!==idx))

    if(h.type==='bomb'){
      if(shield>0){
        setShield(s=>Math.max(0, s-1))
        setComboMsg('护盾抵挡！')
        if(comboTimer.current){ clearTimeout(comboTimer.current) }
        comboTimer.current = window.setTimeout(()=> setComboMsg(null), 700) as any
      }else{
        // bomb: lose a life, reset streak
        setLives(n=>{ const m=Math.max(0, n-1); if(m===0) setState('over'); return m })
        setStreak(0); setMult(1)
        setShake(true); window.setTimeout(()=> setShake(false), 220)
      }
    }else{
      pop()
      const nextStreak = streak + 1
      const nextMult = Math.min(5, 1 + Math.floor(nextStreak/5))
      const base = h.type==='gold' ? 3 : (h.type==='boss' ? 5 : 1)
      const dbl = Date.now() < doubleUntil ? 2 : 1
      const gain = base * nextMult * dbl
      const nextScore = score + gain

      setScore(nextScore);

      setStreak(nextStreak)
      if(nextMult !== mult){
        setMult(nextMult)
        setComboMsg(`连击 ×${nextMult}`)
        if(comboTimer.current){ clearTimeout(comboTimer.current) }
        comboTimer.current = window.setTimeout(()=> setComboMsg(null), 900) as any
      }

      if(h.type==='freeze' || h.type==='boss'){
        setTime(t => Math.min(99, t + 2))
      }
      if(h.type==='shield'){
        setShield(s => Math.min(9, s+1))
        setComboMsg('获得护盾')
        if(comboTimer.current){ clearTimeout(comboTimer.current) }
        comboTimer.current = window.setTimeout(()=> setComboMsg(null), 800) as any
      }
      if(h.type==='double'){
        setDoubleUntil(Date.now()+6000)
        setComboMsg('双倍得分！')
        if(comboTimer.current){ clearTimeout(comboTimer.current) }
        comboTimer.current = window.setTimeout(()=> setComboMsg(null), 900) as any
      }

      setLevel(l => {
        const target = 15 + l*20
        if(nextScore >= target){
          setLevelFlash(true)
          window.setTimeout(()=> setLevelFlash(false), 600)
          return l+1
        }
        return l
      })
    }
  }

  function onReset(){ resetAll() }

  // progress bar width
  const timePct = Math.max(0, Math.min(100, (time/45)*100))

  // image skin helpers
  const useImage = skinMode==='image'
  const THEME_ASSET = ASSETS[theme]

  const cardStyle = useMemo(()=>{
    if(useImage){
      return {
        padding:16,
        backgroundImage: `url(${THEME_ASSET.bg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        color: theme==='forest'?'#1e2a16': (theme==='ocean'?'#0f2f3a':'#2a2417'),
      } as React.CSSProperties
    }
    return {
      padding:16,
      ...(theme==='forest' ? {background:'linear-gradient(180deg,#dbe7c9,#a7c957)', color:'#2e3d1f'} : {}),
      ...(theme==='ocean'  ? {background:'linear-gradient(180deg,#e7f6f9,#cfe9ef)', color:'#12303a'} : {}),
      ...(theme==='zen'    ? {background:'linear-gradient(180deg,#f5f0e6,#e9dccb)', color:'#3b3324'} : {}),
    } as React.CSSProperties
  }, [useImage, THEME_ASSET, theme])

  function spriteFor(t?: HoleType){
    if(!t) return ''
    const m = THEME_ASSET.sprites
    return t==='normal' ? m.normal
      : t==='gold' ? m.gold
      : t==='bomb' ? m.bomb
      : t==='freeze' ? m.freeze
      : t==='shield' ? m.shield
      : t==='double' ? m.double
      : m.boss
  }

  // UI helpers
  function Badge({children}:{children: React.ReactNode}){ return <div className="badge">{children}</div> }
  function HeartRow(){
    return <div style={{display:'flex', gap:6}}>
      {Array.from({length:lives}).map((_,i)=>(<span key={i}>❤️</span>))}
      {Array.from({length:Math.max(0,3-lives)}).map((_,i)=>(<span key={'x'+i} style={{opacity:.25}}>❤️</span>))}
    </div>
  }

  useEffect(()=>()=>{ if(comboTimer.current){ clearTimeout(comboTimer.current); comboTimer.current=undefined } }, [])

  // theme-based cell style helper (inside component, can read `theme`)
  function styleForCell(h?: Hole){
    const t = h?.type
    if(theme==='forest'){
      // Forest theme: green and brown nature-inspired colors, earthy outlines, soft natural glow
      const base = 'linear-gradient(180deg,#dbe7c9,#a7c957)'
      const bg = !t
        ? base
        : t==='bomb'   ? 'linear-gradient(180deg,#776259,#a47149)' // earthy brown
        : t==='gold'   ? 'linear-gradient(180deg,#f6e27a,#d9b949)' // golden leaf
        : t==='freeze' ? 'linear-gradient(180deg,#b7e4ee,#8ecae6)' // misty blue
        : t==='shield' ? 'linear-gradient(180deg,#b7eeb7,#5fa45b)' // leafy green
        : t==='double' ? 'linear-gradient(180deg,#b6c867,#a7c957)' // mossy
        : t==='boss'   ? 'linear-gradient(180deg,#d9b949,#a47149)' // gold+earth
        : base
      const outline = !t
        ? '1px solid #96a97c'
        : t==='bomb'   ? '1.5px solid #7c5b3a'
        : t==='gold'   ? '1.5px solid #b89d2b'
        : t==='freeze' ? '1.5px solid #73b5c6'
        : t==='shield' ? '1.5px solid #4d7c2f'
        : t==='double' ? '1.5px solid #b4bf35'
        : t==='boss'   ? '1.5px solid #b89d2b'
        : '1px solid #96a97c'
      const shadow = !t
        ? '0 2px 8px rgba(93,124,74,0.10), 0 8px 18px rgba(61,51,31,0.08)'
        : t==='bomb'
          ? '0 0 12px 2px rgba(124,91,58,0.20), 0 8px 18px rgba(61,51,31,0.12)'
        : t==='gold'
          ? '0 0 14px 2px rgba(184,157,43,0.20), 0 8px 18px rgba(61,51,31,0.10)'
        : t==='freeze'
          ? '0 0 14px 2px rgba(115,181,198,0.15), 0 8px 18px rgba(61,51,31,0.07)'
        : t==='shield'
          ? '0 0 14px 2px rgba(77,124,47,0.20), 0 8px 18px rgba(61,51,31,0.09)'
        : t==='double'
          ? '0 0 14px 2px rgba(180,191,53,0.13), 0 8px 18px rgba(61,51,31,0.08)'
        : t==='boss'
          ? '0 0 18px 3px rgba(184,157,43,0.22), 0 8px 18px rgba(61,51,31,0.12)'
        : '0 2px 8px rgba(93,124,74,0.10), 0 8px 18px rgba(61,51,31,0.08)'
      return {bg, outline, shadow}
    }
    if(theme==='ocean'){
      // Ocean in forest-like style: soft blue/teal with natural outlines & glow
      const base = 'linear-gradient(180deg,#e7f6f9,#cfe9ef)'
      const bg = !t
        ? base
        : t==='bomb'   ? 'linear-gradient(180deg,#ffe4e6,#ffd1d6)'
        : t==='gold'   ? 'linear-gradient(180deg,#f6e27a,#d9b949)'
        : t==='freeze' ? 'linear-gradient(180deg,#cfe5ff,#aedaef)'
        : t==='shield' ? 'linear-gradient(180deg,#c9f5e3,#92e0c2)'
        : t==='double' ? 'linear-gradient(180deg,#cde7ed,#b9dde6)'
        : t==='boss'   ? 'linear-gradient(180deg,#eedd7a,#d4b24a)'
        : base
      const outline = !t
        ? '1px solid #9fb8b0'
        : t==='bomb'   ? '1.5px solid #d17a84'
        : t==='gold'   ? '1.5px solid #b89d2b'
        : t==='freeze' ? '1.5px solid #6aa9bd'
        : t==='shield' ? '1.5px solid #2f7c63'
        : t==='double' ? '1.5px solid #8aaeb7'
        : t==='boss'   ? '1.5px solid #b89d2b'
        : '1px solid #9fb8b0'
      const shadow = !t
        ? '0 2px 8px rgba(64,112,116,0.10), 0 8px 18px rgba(31,64,82,0.08)'
        : t==='bomb'
          ? '0 0 12px 2px rgba(209,122,132,0.20), 0 8px 18px rgba(31,64,82,0.12)'
        : t==='gold'
          ? '0 0 14px 2px rgba(184,157,43,0.20), 0 8px 18px rgba(31,64,82,0.10)'
        : t==='freeze'
          ? '0 0 14px 2px rgba(106,169,189,0.15), 0 8px 18px rgba(31,64,82,0.07)'
        : t==='shield'
          ? '0 0 14px 2px rgba(47,124,99,0.20), 0 8px 18px rgba(31,64,82,0.09)'
        : t==='double'
          ? '0 0 14px 2px rgba(138,174,183,0.13), 0 8px 18px rgba(31,64,82,0.08)'
        : t==='boss'
          ? '0 0 18px 3px rgba(184,157,43,0.22), 0 8px 18px rgba(31,64,82,0.12)'
        : '0 2px 8px rgba(64,112,116,0.10), 0 8px 18px rgba(31,64,82,0.08)'
      return {bg, outline, shadow}
    }
    // default: zen (paper-like, forest-like accents)
    const base = 'linear-gradient(180deg,#f5f0e6,#e9dccb)'
    const bg = !t
      ? base
      : t==='bomb'   ? 'linear-gradient(180deg,#f3d5ce,#e9bdb3)'
      : t==='gold'   ? 'linear-gradient(180deg,#f6e27a,#d9b949)'
      : t==='freeze' ? 'linear-gradient(180deg,#e9f1ff,#d6e6ff)'
      : t==='shield' ? 'linear-gradient(180deg,#e9f6e6,#cfeccf)'
      : t==='double' ? 'linear-gradient(180deg,#f1f4df,#e3ebc7)'
      : t==='boss'   ? 'linear-gradient(180deg,#efe0a6,#d5ba5d)'
      : 'linear-gradient(180deg,#f7f3ea,#ece3d4)'
    const outline = !t ? '1px solid #a8a081'
      : t==='bomb'   ? '1.5px solid #c58a74'
      : t==='gold'   ? '1.5px solid #b89d2b'
      : t==='freeze' ? '1.5px solid #8aa7c3'
      : t==='shield' ? '1.5px solid #6f8e5a'
      : t==='double' ? '1.5px solid #b1b87a'
      : t==='boss'   ? '1.5px solid #b89d2b'
      : '1px solid #a8a081'
    const shadow = (t==='gold')
      ? '0 0 14px 2px rgba(184,157,43,0.20), 0 8px 18px rgba(61,51,31,0.10)'
      : '0 2px 8px rgba(125,112,90,0.10), 0 8px 18px rgba(61,51,31,0.08)'
    return {bg, outline, shadow}
  }
  return (
    <div className="container" style={{maxWidth: 960, margin: '0 auto', paddingBottom: 16}}>
      <style>{`
        @keyframes levelFlash { 0%,100%{opacity:0} 10%,70%{opacity:1} }
        @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-4px)} 40%{transform:translateX(4px)} 60%{transform:translateX(-3px)} 80%{transform:translateX(3px)} }
        @keyframes molePop { 0%{ transform: translateY(12px) scale(.92); opacity:.0 } 100%{ transform: translateY(0) scale(1); opacity:1 } }
        @keyframes goldGlow { 0%,100%{ box-shadow:0 6px 12px rgba(0,0,0,.10) } 50%{ box-shadow:0 10px 20px rgba(250,204,21,.55) } }
        .mole-cell{ transition: transform .12s ease, box-shadow .12s ease, outline-color .12s ease }
        .mole-cell:hover{ transform: translateY(-2px) scale(1.01) }
      `}</style>
      <h1 style={{marginBottom: 6}}>🐹 打地鼠 · 升级版</h1>
      <p className="desc" style={{marginTop: 0}}>击中地鼠得分，炸弹减一命；金色地鼠×3分，雪花+2s。连击提升倍数，最高×5。达成分数里程碑自动升级，速度更快更刺激！</p>

      <div className="card" style={cardStyle}>
        {/* top status bar */}
        <div style={{display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:12, marginBottom:10, minHeight:42}}>
          <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
            <div className="badge">风格 {theme==='zen'?'禅意':(theme==='forest'?'森林':'海风')}</div>
            <div className="badge">难度 {difficulty==='easy'?'轻松':(difficulty==='hard'?'困难':'标准')}</div>
            <div className="badge">等级 {level}</div>
            <div className="badge">得分 {score}</div>
            <div className="badge">倍数 ×{mult}</div>
            <div className="badge"><div style={{display:'flex', gap:6}}>
              {Array.from({length:lives}).map((_,i)=>(<span key={i}>❤️</span>))}
              {Array.from({length:Math.max(0,3-lives)}).map((_,i)=>(<span key={'x'+i} style={{opacity:.25}}>❤️</span>))}
            </div></div>
            {/* 预留空间，避免徽章出现/消失挤动排版 */}
            <span className="badge" style={{visibility: levelFlash? 'visible':'hidden', background:'#22c55e', color:'#0b2312', animation: levelFlash? 'levelFlash .6s ease': 'none'}}>升级！</span>
            <span className="badge" style={{visibility: comboMsg? 'visible':'hidden', background:'#f59e0b', color:'#1f1300'}}>{comboMsg || '连击'}</span>
            <span className="badge" title="护盾可抵挡一次炸弹" style={{visibility: (shield>0)? 'visible':'hidden'}}>🛡️ ×{Math.max(shield,1)}</span>
            <span className="badge" title="双倍得分" style={{visibility: (Date.now()<doubleUntil)? 'visible':'hidden', background:'#6366f1', color:'#eef2ff'}}>
              ×2 {Math.max(1, Math.ceil(Math.max(0, doubleUntil-Date.now())/1000))}s
            </span>
          </div>
          <div style={{minWidth:200, width: 'min(42vw, 360px)'}}>
            <div style={{height:10, background:'rgba(0,0,0,.08)', borderRadius:99, overflow:'hidden'}}>
              <div style={{height:'100%', width:`${timePct}%`, transition:'width .2s linear', background:'linear-gradient(90deg,#22d3ee,#22c55e)'}}/>
            </div>
            <div style={{fontSize:12, opacity:.6, marginTop:4, textAlign:'right'}}>剩余 {Math.ceil(time)} 秒</div>
          </div>
        </div>

        {/* grid */}
        <div style={{display:'grid', gridTemplateColumns:`repeat(${COLS},1fr)`, gap:12}}>
          {Array.from({length: GRID},(_,i)=>{
            const h = holes.find(x=>x.id===i)
            const {bg, outline, shadow} = styleForCell(h)
            const emoji = !h ? '🕳️'
              : h.type==='bomb'   ? '💣'
              : h.type==='gold'   ? '🐹✨'
              : h.type==='freeze' ? '❄️'
              : h.type==='shield' ? '🛡️'
              : h.type==='double' ? '✨x2'
              : h.type==='boss'   ? '👑🐹'
              : '🐹'
            const sprite = (useImage && h) ? spriteFor(h.type) : ''
            return (
              <div key={i}
                   onClick={()=>onHit(i)}
                   style={{
                     aspectRatio:'1 / 1', minHeight:92, height:'clamp(92px, 12vw, 132px)',
                     borderRadius:18,
                     display:'grid', placeItems:'center', cursor:'pointer', userSelect:'none', boxSizing:'border-box', padding:'6px',
                     border: '1px solid rgba(2,6,23,.06)',
                     backgroundClip:'padding-box',
                     background: useImage ? undefined : bg,
                     backgroundImage: useImage ? `url(${THEME_ASSET.hole})` : undefined,
                     backgroundSize: useImage ? 'cover' : undefined,
                     backgroundPosition: useImage ? 'center' : undefined,
                     outline: outline,
                     boxShadow: shadow,
                     animation: h
                       ? (h.type==='gold'
                           ? 'molePop .18s ease-out, goldGlow 1.2s ease-in-out infinite'
                           : 'molePop .18s ease-out')
                       : undefined,
                   }}
                   className="mole-cell"
              >
                {useImage
                  ? (h ? <img src={sprite} alt="" style={{maxWidth:'70%', maxHeight:'70%', pointerEvents:'none'}}/> : null)
                  : <span style={{fontSize: GRID===16 ? 22 : 26}}>{emoji}</span>
                }
              </div>
            )
          })}
        </div>
      </div>

      {state==='paused' && (
        <div className="card" style={{marginTop:12, padding:16, textAlign:'center'}}>
          <strong>已暂停</strong>
          <div style={{fontSize:12, opacity:.7, marginTop:6}}>按 空格 键继续 · R 重来</div>
        </div>
      )}

      {/* controls */}
      <div style={{display:'flex', gap:12, marginTop:12, flexWrap:'wrap'}}>
        <span style={{opacity:.75, alignSelf:'center'}}>风格：</span>
        <button className={`btn ${theme==='zen'?'primary':'ghost'}`} onClick={()=>setTheme('zen')}>禅意</button>
        <button className={`btn ${theme==='forest'?'primary':'ghost'}`} onClick={()=>setTheme('forest')}>森林</button>
        <button className={`btn ${theme==='ocean'?'primary':'ghost'}`} onClick={()=>setTheme('ocean')}>海风</button>
        {/* 素材选择已隐藏，默认使用扁平皮肤 */}
        <span style={{width:1, height:28, background:'rgba(0,0,0,.08)'}}/>
        <span style={{opacity:.75, alignSelf:'center'}}>难度：</span>
        <button className={`btn ${difficulty==='easy'?'primary':'ghost'}`} disabled={state==='playing'} onClick={()=>setDifficulty('easy')}>轻松</button>
        <button className={`btn ${difficulty==='normal'?'primary':'ghost'}`} disabled={state==='playing'} onClick={()=>setDifficulty('normal')}>标准</button>
        <button className={`btn ${difficulty==='hard'?'primary':'ghost'}`} disabled={state==='playing'} onClick={()=>setDifficulty('hard')}>困难</button>
        <span style={{width:1, height:28, background:'rgba(0,0,0,.08)'}}/>
        {state==='ready' && <button className="btn primary" onClick={start}>开始</button>}
        {state==='playing' && <button className="btn ghost" onClick={pause}>暂停</button>}
        {state==='paused' && <button className="btn primary" onClick={resume}>继续</button>}
        {(state==='paused' || state==='over') && <button className="btn ghost" onClick={onReset}>重来</button>}
        <a className="btn ghost" href="/">返回首页</a>
      </div>

      {state==='over' && (
        <div className="card" style={{marginTop:12, padding:16}}>
          <h3 style={{margin:0}}>游戏结束</h3>
          <p style={{margin:'6px 0 12px'}}>最终得分 <strong>{score}</strong> · 达到等级 <strong>{level}</strong></p>
          <button className="btn primary" onClick={onReset}>再来一局</button>
        </div>
      )}
    </div>
  )
}
