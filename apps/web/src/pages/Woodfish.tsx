import React, { useEffect, useMemo, useRef, useState } from 'react'
import '../styles.css'

// --- Low-latency SFX (no external import) ---
function useSfx(muted:boolean){
  const ctxRef = useRef<AudioContext|null>(null)
  const ensure = () => {
    if(!ctxRef.current){
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
      if(Ctx) ctxRef.current = new Ctx({ latencyHint:'interactive' })
    }
    const c = ctxRef.current
    if(c && c.state==='suspended'){ try{ (c as any).resume?.() }catch{} }
    return c
  }

  // --- Optional online assets (can be swapped easily) ---
  const WOOD_HIT_WAV: string | null = null // e.g. set to a CC0 woodblock wav url
  const sampleRef = useRef<AudioBuffer|null>(null)
  useEffect(()=>{ (async()=>{ if(!WOOD_HIT_WAV) return; const c=ensure(); if(!c) return; try{ const res=await fetch(WOOD_HIT_WAV); const arr=await res.arrayBuffer(); sampleRef.current = await c.decodeAudioData(arr) }catch(e){ /* fallback to synth if fetch fails */ } })() }, [])

  // small woodblock + body click (very short)
  const woodHit = () => {
    if(muted) return
    const c = ensure(); if(!c) return
    const now = c.currentTime

    if(sampleRef.current){
      const src = c.createBufferSource(); src.buffer = sampleRef.current
      const g = c.createGain(); g.gain.setValueAtTime(0.9, now)
      src.connect(g).connect(c.destination)
      try{ src.start(now) }catch{}
      return
    }

    // fallback: synthesized wood click + body
    const noise = c.createBufferSource()
    const dur = 0.03
    const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate*dur)), c.sampleRate)
    const ch = buf.getChannelData(0)
    for(let i=0;i<ch.length;i++){ const t = i/ch.length; ch[i] = (Math.random()*2-1)*(1-t) }
    noise.buffer = buf
    const gn = c.createGain(); gn.gain.setValueAtTime(0.25, now); gn.gain.exponentialRampToValueAtTime(0.0001, now+dur)
    noise.connect(gn).connect(c.destination)
    noise.start(now)

    const o1 = c.createOscillator(); o1.type='sine'
    const g1 = c.createGain(); g1.gain.setValueAtTime(0.001, now); g1.gain.linearRampToValueAtTime(0.22, now+0.002); g1.gain.exponentialRampToValueAtTime(0.0001, now+0.12)
    o1.frequency.setValueAtTime(620, now); o1.frequency.exponentialRampToValueAtTime(540, now+0.08)
    o1.connect(g1).connect(c.destination); o1.start(now); o1.stop(now+0.14)

    const o2 = c.createOscillator(); o2.type='sine'
    const g2 = c.createGain(); g2.gain.setValueAtTime(0.001, now); g2.gain.linearRampToValueAtTime(0.18, now+0.002); g2.gain.exponentialRampToValueAtTime(0.0001, now+0.18)
    o2.frequency.setValueAtTime(340, now); o2.frequency.exponentialRampToValueAtTime(300, now+0.12)
    o2.connect(g2).connect(c.destination); o2.start(now); o2.stop(now+0.2)
  }

  const comboChime = () => {
    if(muted) return
    const c = ensure(); if(!c) return
    const now = c.currentTime
    const o = c.createOscillator(); o.type='triangle'
    const g = c.createGain(); g.gain.setValueAtTime(0.001, now); g.gain.linearRampToValueAtTime(0.22, now+0.003); g.gain.exponentialRampToValueAtTime(0.0001, now+0.35)
    o.frequency.setValueAtTime(880, now)
    o.frequency.exponentialRampToValueAtTime(1320, now+0.28)
    o.connect(g).connect(c.destination); o.start(now); o.stop(now+0.36)
  }

  return { woodHit, comboChime }
}

// ripple particle
type Ripple = { id:number, x:number, y:number, r:number, life:number }
type Confetti = { id:number, x:number, y:number, vx:number, vy:number, life:number, rot:number, color:string, r?: number }
type Mode = 'zen'|'classic'|'timed'

const WILLOW_CSS = `
@keyframes willowSway { 0%,100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg);} }
.willow-layer{ position:fixed; inset:-10px 0 0 0; pointer-events:none; z-index:0; }
.willow-branch{ transform-origin: 50px 0px; animation: willowSway var(--dur,9s) ease-in-out infinite; opacity: var(--op,.24); }
.willow-branch path{ fill:none; stroke: rgba(0,0,0,.12); stroke-width:1.2; stroke-linecap:round; }
.willow-leaf{ fill: rgba(50,150,80,.12); }
@media (prefers-color-scheme: dark){
  .willow-branch path{ stroke: rgba(255,255,255,.12); }
  .willow-leaf{ fill: rgba(180,255,200,.10); }
}`

const BG_PRESETS: { id:string; label:string; css:string }[] = [
  // 沧海：深浅蓝 + 轻微波纹
  { id:'ocean', label:'沧海', css:
        'radial-gradient(120% 90% at 50% 20%, #a7d8ff 0%, #5fb0f5 45%, #2166b2 100%),' +
        'repeating-radial-gradient(circle at 50% 40%, rgba(255,255,255,.15) 0 2px, rgba(255,255,255,0) 6px 22px)'
  },
  // 流沙：金驼色 + 斜向沙丘纹
  { id:'desert', label:'流沙', css:
        'radial-gradient(120% 90% at 50% 20%, #ffe6b0 0%, #f2bf77 55%, #d5964a 100%),' +
        'repeating-linear-gradient(30deg, rgba(0,0,0,.05) 0 1px, rgba(0,0,0,0) 12px 24px)'
  },
  // 森岚：墨绿雾感 + 林间散光
  { id:'forest', label:'森岚', css:
        'radial-gradient(120% 90% at 50% 20%, #d7f2e1 0%, #6ebc8f 55%, #2b6a55 100%),' +
        'radial-gradient(40% 40% at 20% 25%, rgba(255,255,255,.25), transparent 60%),' +
        'radial-gradient(35% 35% at 80% 15%, rgba(255,255,255,.18), transparent 60%)'
  },
  // 晚霞：橙粉暮色
  { id:'sunset', label:'晚霞', css:
        'radial-gradient(120% 90% at 50% 15%, #ffe1b1 0%, #ffb7a6 45%, #ff7a9e 70%, #8b78d6 100%)'
  },
  // 霁雪：冷白蓝 + 微小雪雾点
  { id:'snow', label:'霁雪', css:
        'radial-gradient(120% 90% at 50% 20%, #ffffff 0%, #eaf4ff 55%, #cfe5ff 100%),' +
        'repeating-radial-gradient(circle at 60% 30%, rgba(255,255,255,.6) 0 1px, rgba(255,255,255,0) 2px 12px)'
  },
  // 禅砂纹：更沙色的禅意沙纹
  { id:'zen', label:'禅砂纹', css:
    'radial-gradient(120% 90% at 50% 20%, #fdf7ef 0%, #f1e2c9 60%, #e8d4b2 100%), ' +
    'repeating-radial-gradient(circle at 50% 45%, rgba(0,0,0,0.05) 0 1px, rgba(0,0,0,0) 3px 14px)'
  },
  // 清晨/晚霞：柔和晨曦到暖霞（兼顾两种观感）
  { id:'dawn', label:'晨/霞', css:
    'radial-gradient(120% 90% at 50% 15%, #fff7e6 0%, #ffe9cf 35%, #ffd2cf 60%, #cfe6ff 100%)'
  },
  // 抹茶雾感：低饱和绿色雾面
  { id:'matcha', label:'抹茶', css:
    'radial-gradient(120% 90% at 50% 20%, #f4fbf4 0%, #e6f3e6 55%, #d7ead7 100%)'
  },
  // 夜墨蓝：深邃夜色
  { id:'ink', label:'夜墨', css:
    'radial-gradient(120% 90% at 50% 20%, #243047 0%, #1f2a3f 55%, #182235 100%)'
  },
]

const FONT_PRESETS: { id:string; label:string; stack:string }[] = [
  { id:'sans', label:'无衬线', stack: 'system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", Segoe UI, Roboto, Helvetica, Arial, "Noto Sans CJK SC", "WenQuanYi Micro Hei", sans-serif' },
  { id:'rounded', label:'圆体', stack: '"SF Pro Rounded", "MiSans", "HarmonyOS Sans", "PingFang SC", "Microsoft YaHei", Roboto, Helvetica, Arial, sans-serif' },
  { id:'serif', label:'衬线', stack: '"Noto Serif SC", "Songti SC", STSong, "SimSun", Georgia, serif' },
  { id:'kaiti', label:'楷体', stack: '"Kaiti SC", STKaiti, KaiTi, "Times New Roman", serif' }
]

export default function Woodfish(){
  const [count, setCount] = useState(0)
  const [last, setLast] = useState<number|null>(null)
  const [bpm, setBpm] = useState(0)
  const [smoothBpm, setSmoothBpm] = useState(0)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [mode, setMode] = useState<Mode>('classic')
  const [timeLeft, setTimeLeft] = useState(60)
  const [muted, setMuted] = useState(false)
  const sfx = useSfx(muted)

  // 愿望系统
  const [wish, setWish] = useState<string>(() => localStorage.getItem('woodfish:wish') || '')
  const [wishTarget, setWishTarget] = useState<number>(() => Number(localStorage.getItem('woodfish:wishTarget')) || 108)
  const [wishActive, setWishActive] = useState(false)
  const [wishCount, setWishCount] = useState(0)
  const [wishBanner, setWishBanner] = useState<string|null>(null)
  const wishBannerUntil = useRef(0)
  useEffect(()=>{ localStorage.setItem('woodfish:wish', wish) }, [wish])
  useEffect(()=>{ localStorage.setItem('woodfish:wishTarget', String(wishTarget)) }, [wishTarget])

  const [bgId, setBgId] = useState<string>(() => localStorage.getItem('woodfish:bg') || BG_PRESETS[0].id)
  const stageBg = useMemo(() => BG_PRESETS.find(b=>b.id===bgId)?.css || BG_PRESETS[0].css, [bgId])
  useEffect(()=>{ localStorage.setItem('woodfish:bg', bgId) }, [bgId])

  const [fontId, setFontId] = useState<string>(() => localStorage.getItem('woodfish:font') || 'sans')
  const stageFont = useMemo(() => FONT_PRESETS.find(f=>f.id===fontId)?.stack || FONT_PRESETS[0].stack, [fontId])
  useEffect(()=>{ localStorage.setItem('woodfish:font', fontId) }, [fontId])

  const [cursorPos, setCursorPos] = useState<{x:number,y:number}>({x:0,y:0})
  const [cursorVisible, setCursorVisible] = useState(false)
  const [pressing, setPressing] = useState(false)
  const stickSrc = `${((import.meta as any)?.env?.BASE_URL ?? '/').replace(/\/$/, '')}/images/gunzi.png`

  useEffect(()=>{
    const img = new Image()
    img.onload = () => { /* ok */ }
    img.onerror = () => { console.warn('Cursor image not found:', stickSrc) }
    img.src = stickSrc
  }, [stickSrc])

  // --- Optional online assets (can be swapped easily) ---
  const MOKUGYO_IMG = "/images/muyu.png"
  // Canvas logical size (used for exact centering)
  const CANVAS_W = 400
  const CANVAS_H = 480
  const centerX = CANVAS_W/2
  const centerY = CANVAS_H/2
  // Forehead position (for confetti burst)
  const foreheadX = centerX
  const foreheadY = centerY - 78

  const [ripples, setRipples] = useState<Ripple[]>([])
  const ridRef = useRef(1)
  const pulseRef = useRef(0) // fish squish animation progress [0..1]
  const [confetti, setConfetti] = useState<Confetti[]>([])
  const cidRef = useRef(1)
  // timer for timed mode
  useEffect(()=>{
    if(mode!=='timed') return
    if(timeLeft<=0) return
    const t = setTimeout(()=> setTimeLeft(tl=>tl-1), 1000)
    return ()=> clearTimeout(t)
  }, [mode, timeLeft])

  // keyboard hit
  useEffect(()=>{
    const onKey = (e:KeyboardEvent)=>{ if(e.key===' '||e.key==='Enter'){ e.preventDefault(); hit(undefined) } }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  }, [])

  // ripple animation decay
  useEffect(()=>{
    let af=0
    const loop = ()=>{
      pulseRef.current = Math.max(0, pulseRef.current - 0.06)
      setRipples(rs => rs.filter(r=> r.life>0).map(r=> ({...r, r:r.r+2, life:r.life-0.06})))
      setConfetti(cs => cs
        .filter(c => c.life > 0)
        .map(c => ({
          ...c,
          x: c.x + c.vx,
          y: c.y + c.vy,
          vy: c.vy + 0.38, // lighter gravity to float longer
          rot: c.rot + 18,  // faster spin
          life: c.life - 0.03 // slower fade
        }))
      )
      af=requestAnimationFrame(loop)
    }
    af=requestAnimationFrame(loop)
    return ()=> cancelAnimationFrame(af)
  }, [])

  function resetAll(){
    setCount(0); setLast(null); setBpm(0); setSmoothBpm(0); setCombo(0); setMaxCombo(0)
    if(mode==='timed'){ setTimeLeft(60) }
    setRipples([]); pulseRef.current = 0
    setConfetti([])
    setWishBanner(null); wishBannerUntil.current = 0
  }

  function hit(e?: React.MouseEvent<HTMLButtonElement>){
    if(mode==='timed' && timeLeft<=0) return
    const now = Date.now()
    if(last){
      const dt=(now-last)/1000
      const curBpm = Math.max(1, Math.round(60/dt))
      setBpm(curBpm)
      // exponential smoothing to make it stable
      setSmoothBpm(prev => prev? Math.round(prev*0.7 + curBpm*0.3) : curBpm)
      // combo if within 500ms window
      if(dt<0.5){ setCombo(c=>{ const nc=c+1; setMaxCombo(m=>Math.max(m,nc)); if(nc%10===0) sfx.comboChime(); return nc }) }
      else { setCombo(1) }
    } else {
      setCombo(1)
    }
    setLast(now)
    setCount(c=>c+1)
    sfx.woodHit()
    pulseRef.current = 1
    // add a ripple at center (SVG logical center)
    setRipples(rs=>[...rs, { id:ridRef.current++, x:centerX, y:centerY-30, r:14, life:1 }])
    // 愿望计数与达成
    if(wishActive){
      setWishCount(n=>{
        const m = n + 1
        if(m >= wishTarget){
          setWishActive(false)
          setWishBanner('🎉 愿望达成')
          wishBannerUntil.current = performance.now() + 1400
          // 庆祝涟漪
          setRipples(rs=>[...rs, { id:ridRef.current++, x:centerX, y:centerY-30, r:22, life:1 }])
          setRipples(rs=>[...rs, { id:ridRef.current++, x:centerX, y:centerY-30, r:34, life:1 }])
          // 礼花彩纸
          const palette = ['#f97316','#f43f5e','#a78bfa','#22d3ee','#34d399','#fde047']
          setConfetti(cs => ([
            ...cs,
            ...Array.from({length:140}).map((_,i)=>{
              const a = Math.random()*Math.PI*2
              const sp = 100 + Math.random()*120 // faster burst
              const size = 3 + Math.random()*3   // 3~6 px
              return {
                id: cidRef.current++,
                x: foreheadX,
                y: foreheadY,
                vx: Math.cos(a) * (sp/30),
                vy: Math.sin(a) * (sp/30) - 2.2,
                life: 1.3,
                rot: Math.random()*360,
                color: palette[i % palette.length],
                r: size
              } as Confetti
            })
          ]))
        }
        return m
      })
    }
  }

  const pulse = pulseRef.current
  const uiScale = 1.8
  const fishScale = uiScale * (1 - 0.04*pulse)
  const fishDy = 2*pulse

  const badge = (txt:string)=> <div className="badge">{txt}</div>

  return (
    <>
      <style>{WILLOW_CSS}</style>
      <div className="willow-layer">
        <svg width="100%" height="100%" viewBox="0 0 1200 800" preserveAspectRatio="none">
          {/* Left cluster */}
          <g className="willow-branch" style={{transformOrigin:'60px 0px', ['--dur' as any]:'10s', ['--op' as any]:.22 as any}} transform="translate(80,0)">
            <path d="M60 0 C55 140, 70 260, 60 380 C50 500, 70 620, 60 760" />
            <ellipse className="willow-leaf" cx="58" cy="210" rx="10" ry="4" />
            <ellipse className="willow-leaf" cx="66" cy="300" rx="12" ry="5" />
            <ellipse className="willow-leaf" cx="54" cy="430" rx="11" ry="4" />
            <ellipse className="willow-leaf" cx="68" cy="560" rx="12" ry="5" />
          </g>
          <g className="willow-branch" style={{transformOrigin:'60px 0px', ['--dur' as any]:'8.5s', ['--op' as any]:.18 as any}} transform="translate(180,0)">
            <path d="M60 0 C70 160, 55 280, 65 400 C75 520, 55 640, 65 780" />
            <ellipse className="willow-leaf" cx="64" cy="230" rx="11" ry="4" />
            <ellipse className="willow-leaf" cx="56" cy="330" rx="12" ry="5" />
            <ellipse className="willow-leaf" cx="70" cy="470" rx="11" ry="4" />
            <ellipse className="willow-leaf" cx="58" cy="610" rx="12" ry="5" />
          </g>
          {/* Right cluster */}
          <g className="willow-branch" style={{transformOrigin:'60px 0px', ['--dur' as any]:'9.5s', ['--op' as any]:.2 as any}} transform="translate(980,0)">
            <path d="M60 0 C50 150, 70 270, 60 390 C50 510, 70 630, 60 770" />
            <ellipse className="willow-leaf" cx="58" cy="220" rx="10" ry="4" />
            <ellipse className="willow-leaf" cx="66" cy="320" rx="12" ry="5" />
            <ellipse className="willow-leaf" cx="54" cy="460" rx="11" ry="4" />
            <ellipse className="willow-leaf" cx="68" cy="600" rx="12" ry="5" />
          </g>
          <g className="willow-branch" style={{transformOrigin:'60px 0px', ['--dur' as any]:'7.8s', ['--op' as any]:.16 as any}} transform="translate(1080,0)">
            <path d="M60 0 C70 140, 55 260, 65 380 C75 500, 55 620, 65 760" />
            <ellipse className="willow-leaf" cx="64" cy="210" rx="11" ry="4" />
            <ellipse className="willow-leaf" cx="56" cy="300" rx="12" ry="5" />
            <ellipse className="willow-leaf" cx="70" cy="430" rx="11" ry="4" />
            <ellipse className="willow-leaf" cx="58" cy="560" rx="12" ry="5" />
          </g>
        </svg>
      </div>
      <div className="container" style={{ fontFamily: stageFont, position:'relative', zIndex:1 }}>
      <h1 style={{fontSize: 28, margin: '8px 0 6px', letterSpacing: '0.5px'}}>🔔 木鱼 · 禅</h1>
      <p className="desc" style={{fontSize: 14, opacity:.8, margin:'0 0 8px'}}>一敲一静心 · 经典 / 禅 / 60s 模式 · 细腻木质音效与涟漪动画</p>

      <div style={{display:'flex', flexDirection:'column', gap:10, marginBottom:8}}>
      {/* 愿望系统 */}
      <div style={{display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', marginBottom:8}}>
        <span style={{opacity:.75}}>愿望：</span>
        <input
          value={wish}
          onChange={e=> setWish(e.target.value)}
          placeholder="输入你的愿望..."
          style={{ padding:'6px 10px', borderRadius:8, border:'1px solid rgba(0,0,0,.12)', minWidth: 200 }}
        />
        <span style={{opacity:.75}}>目标次数(越多越虔诚)：</span>
        <input
          type="number"
          min={18}
          max={1080}
          value={wishTarget}
          onChange={e=> setWishTarget(Math.max(18, Math.min(1080, Number(e.target.value)||108)))}
          style={{ width:90, padding:'6px 8px', borderRadius:8, border:'1px solid rgba(0,0,0,.12)' }}
        />
        {!wishActive ? (
          <button className="btn primary" onClick={()=>{ setWishCount(0); setWishActive(true); setWishBanner(null); }}>开始许愿</button>
        ) : (
          <button className="btn secondary" onClick={()=> setWishActive(false)}>暂停</button>
        )}
        <button className="btn ghost" onClick={()=>{ setWish(''); setWishCount(0); setWishActive(false) }}>清空</button>
        {wish && <div className="badge">{wishActive? '进行中' : '未开始'} · {wishCount}/{wishTarget}</div>}
      </div>
      {wish && (
        <div style={{marginTop:6, marginBottom:8}}>
          <div style={{height:8, borderRadius:999, background:'rgba(0,0,0,.08)', overflow:'hidden'}}>
            <div style={{height:'100%', width:`${Math.min(100, Math.round(wishCount*100/Math.max(1,wishTarget)))}%`, background:'#60a5fa', borderRadius:999, transition:'width 200ms ease'}} />
          </div>
          <div style={{fontSize:12, opacity:.7, marginTop:4}}>{wish || '未填写愿望'}</div>
        </div>
      )}
        <div style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center'}}>
          <button className={`btn ${mode==='zen'?'primary':'secondary'}`} onClick={()=>{ setMode('zen'); resetAll() }}>禅模式</button>
          <button className={`btn ${mode==='classic'?'primary':'secondary'}`} onClick={()=>{ setMode('classic'); resetAll() }}>经典</button>
          <button className={`btn ${mode==='timed'?'primary':'secondary'}`} onClick={()=>{ setMode('timed'); setTimeLeft(60); resetAll() }}>计时60s</button>
          <button className="btn ghost" onClick={()=>setMuted(m=>!m)}>音效：{muted?'关':'开'}</button>
          {mode==='timed' && badge(`倒计时 ${timeLeft}s`)}
          {mode!=='zen' && badge(`次数 ${count}`)}
          {mode!=='zen' && badge(`BPM ${smoothBpm||bpm}`)}
          {mode!=='zen' && badge(`连击 ${combo}（最高 ${maxCombo}）`)}
        </div>
        <div style={{display:'flex', gap:16, flexWrap:'wrap', alignItems:'center'}}>
          <div style={{display:'inline-flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
            <span style={{opacity:.75}}>背景：</span>
            <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
              {BG_PRESETS.map(p => (
                <button key={p.id}
                  className={`btn ${bgId===p.id?'primary':'secondary'}`}
                  onClick={()=> setBgId(p.id)}
                  style={{
                    display:'inline-flex',
                    alignItems:'center',
                    justifyContent:'center',
                    height: 28,
                    padding:'0 10px',
                    borderRadius:8,
                    whiteSpace:'nowrap',
                    background: p.css,
                    color: bgId===p.id ? '#fff' : '#222',
                    border: '1px solid rgba(0,0,0,.08)',
                    boxShadow: 'inset 0 0 0 9999px rgba(255,255,255,0.25)'
                  }}
                  title={p.label}
                >{p.label}</button>
              ))}
            </div>
          </div>
          <div style={{display:'inline-flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
            <span style={{opacity:.75}}>字体：</span>
            <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
              {FONT_PRESETS.map(f => (
                <button key={f.id}
                  className={`btn ${fontId===f.id?'primary':'secondary'}`}
                  onClick={()=> setFontId(f.id)}
                  style={{
                    padding:'4px 8px', borderRadius:6,
                    fontFamily: f.stack,
                    border: '1px solid rgba(0,0,0,.08)'
                  }}
                  title={f.label}
                >{f.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {(wishBanner && performance.now() < wishBannerUntil.current) && (
        <div style={{position:'absolute', left:0, right:0, top:0, display:'flex', justifyContent:'center', zIndex:2, paddingTop:8, pointerEvents:'none'}}>
          <div style={{ background:'rgba(15,23,42,.78)', color:'#fff', padding:'4px 10px', borderRadius:12, fontWeight:700 }}>
            {wishBanner} {wish ? `· ${wish}` : ''}
          </div>
        </div>
      )}
      <div
        className="stage"
        style={{
          padding: 24,
          background: stageBg,
          transition: 'background 200ms ease',
          borderRadius: 16,
          userSelect: 'none',
          position: 'relative',
        }}
      >
        <div
          style={{
            position:'absolute', inset:0, pointerEvents:'none',
            background: 'radial-gradient(120% 100% at 50% 30%, rgba(0,0,0,0.16) 0%, rgba(0,0,0,0.10) 40%, rgba(0,0,0,0.06) 60%, rgba(0,0,0,0.02) 78%, rgba(0,0,0,0) 100%)',
            mixBlendMode: 'multiply'
          }}
        />
        <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} width="100%" height="600" style={{cursor: 'none'}}
             onPointerDown={(e)=>{ setPressing(true); hit(e as any); setTimeout(()=> setPressing(false), 110) }}
             onPointerUp={()=> setPressing(false)}
             onMouseMove={(e)=>{ setCursorPos({x:e.clientX, y:e.clientY}); setCursorVisible(true) }}
             onMouseLeave={()=> { setCursorVisible(false); setPressing(false) }}>
          <defs>
            <linearGradient id="wood" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#f0cfaa"/>
              <stop offset="1" stopColor="#bd8e5b"/>
            </linearGradient>
            <linearGradient id="woodDark" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#a06a3c"/>
              <stop offset="1" stopColor="#7a4f2e"/>
            </linearGradient>
            <radialGradient id="glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(255,255,255,.7)"/>
              <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
            </radialGradient>
            <filter id="blur"><feGaussianBlur in="SourceGraphic" stdDeviation="2"/></filter>
            <filter id="confettiGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="0.8" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id="haloGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(255,208,120,.55)" />
              <stop offset="60%" stopColor="rgba(255,208,120,.15)" />
              <stop offset="100%" stopColor="rgba(255,208,120,0)" />
            </radialGradient>
          </defs>

          {/* floor shadow */}
          <g filter="url(#blur)">
            <ellipse cx={centerX} cy={centerY+72} rx={124*uiScale} ry={24*uiScale} fill="rgba(0,0,0,.10)"/>
          </g>

          {/* ripples */}
          {ripples.map(r=> (
            <circle key={r.id} cx={r.x} cy={r.y} r={r.r} fill="url(#glow)" opacity={Math.max(0, r.life*0.6)} />
          ))}

          {/* golden halo behind the fish */}
          <g transform={`translate(${centerX} ${centerY+fishDy}) scale(${uiScale})`}>
            <circle cx="0" cy="-4" r="86" fill="url(#haloGrad)" opacity=".65" />
          </g>

          {/* woodfish body with external image skin + vector fallback */}
          <defs>
            <clipPath id="fishClip">
              <path d="M-96,0 Q-62,-56 0,-66 Q62,-56 96,0 Q62,56 0,66 Q-62,56 -96,0 Z" />
            </clipPath>
          </defs>
          <g transform={`translate(${centerX} ${centerY+fishDy}) scale(${fishScale})`}>
            {/* image skin */}
            <image
              href={MOKUGYO_IMG}
              x="-160"
              y="-128"
              width="320"
              height="256"
              preserveAspectRatio="xMidYMid meet"
            />
            {/* vector outline on top for definition */}
            {/* <path d="M-96,0 Q-62,-56 0,-66 Q62,-56 96,0 Q62,56 0,66 Q-62,56 -96,0 Z" fill="none" stroke="#8b5e34" strokeWidth="3"/> */}
          </g>
          {/* confetti (above fish) */}
          {confetti.map(c => (
            <g key={`c_${c.id}`} transform={`translate(${c.x} ${c.y}) rotate(${c.rot})`} opacity={Math.max(0, Math.min(1, c.life))}>
              <rect
                x={-(c.r||4)/2}
                y={-(c.r||4)/2}
                width={c.r||4}
                height={c.r||4}
                rx={(c.r||4)*0.25}
                fill={c.color}
                stroke="rgba(255,255,255,.6)"
                strokeWidth={0.6}
                filter="url(#confettiGlow)"
                style={{mixBlendMode:'screen'}}
              />
            </g>
          ))}

        </svg>
        {cursorVisible && (
          <img
            src={stickSrc}
            alt="stick"
            style={{
              position: 'fixed',
              left: cursorPos.x - 60,
              top: cursorPos.y - 60,
              width: 120,
              height: 120,
              pointerEvents: 'none',
              zIndex: 1000,
              transform: pressing ? 'translateY(10px) rotate(-8deg)' : 'translateY(0) rotate(0)',
              transition: 'transform 90ms ease-out'
            }}
          />
        )}
      </div>

      <div style={{display:'flex', gap:12, marginTop:12, flexWrap:'wrap'}}>
        {wish && <div className="badge">愿望进度 {wishCount}/{wishTarget}</div>}
        {mode!=='zen' && <div className="badge">次数 {count}</div>}
        {mode!=='zen' && <div className="badge">BPM {smoothBpm||bpm}</div>}
        {mode!=='zen' && <div className="badge">连击 {combo} / 最高 {maxCombo}</div>}
        <a className="btn ghost" href="/">返回首页</a>
      </div>
    </div>
    </>
    )
  }
