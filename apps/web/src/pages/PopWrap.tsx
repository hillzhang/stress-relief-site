import React, { useEffect, useMemo, useRef, useState } from 'react'
import '../styles.css'

export default function PopWrap(){
  // grid (switchable)
  const [grid, setGrid] = useState<{rows:number, cols:number}>({rows:10, cols:16})
  const cells = useMemo(()=> Array.from({length:grid.rows*grid.cols}, (_,i)=> i), [grid])

  // audio & haptics
  const audioCtxRef = useRef<AudioContext|null>(null)
  const [muted, setMuted] = useState(false)
  const noiseBufRef = useRef<AudioBuffer|null>(null)

  const [colored, setColored] = useState(false)
  const [score, setScore] = useState(0)
  const comboRef = useRef(0)
  const lastPopAtRef = useRef(0)

  function ensureCtx(){
    if(!audioCtxRef.current){
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
      if(Ctx){
        audioCtxRef.current = new Ctx({latencyHint:'interactive'})
        // pre-generate white-noise buffer (~0.12s at 44.1kHz)
        try{
          const buf = audioCtxRef.current.createBuffer(1, 5300, 44100)
          const data = buf.getChannelData(0)
          for(let i=0;i<data.length;i++) data[i] = (Math.random()*2-1)
          noiseBufRef.current = buf
        }catch{}
      }
    }
    return audioCtxRef.current
  }

  function resumeAudio(){
    const ctx = ensureCtx()
    if(ctx && ctx.state !== 'running'){
      try{ ctx.resume() }catch{}
    }
  }

  function playPop(panHint:number){
    if(muted) return
    const ctx = ensureCtx(); if(!ctx) return
    const now = ctx.currentTime

    // white noise burst -> bandpass -> gain env
    const noise = noiseBufRef.current || (()=>{
      const b = ctx.createBuffer(1, 5300, 44100)
      const d = b.getChannelData(0)
      for(let i=0;i<d.length;i++) d[i] = (Math.random()*2-1)
      noiseBufRef.current = b
      return b
    })()
    const src = ctx.createBufferSource(); src.buffer = noise
    src.playbackRate.value = 0.9 + Math.random()*0.25

    const band = ctx.createBiquadFilter(); band.type='bandpass'
    band.frequency.value = 1000 + Math.random()*800
    band.Q.value = 1.2

    const click = ctx.createOscillator();
    click.type='triangle'
    click.frequency.setValueAtTime(120 + Math.random()*120, now)

    const gainN = ctx.createGain(); const gainC = ctx.createGain()
    const a = 0.004 + Math.random()*0.006, d = 0.07 + Math.random()*0.06
    gainN.gain.setValueAtTime(0, now); gainN.gain.linearRampToValueAtTime(0.9, now+a); gainN.gain.exponentialRampToValueAtTime(0.0001, now+d)
    gainC.gain.setValueAtTime(0, now); gainC.gain.linearRampToValueAtTime(0.6, now+a*0.6); gainC.gain.exponentialRampToValueAtTime(0.0001, now+d)

    const panner = (ctx as any).createStereoPanner ? (ctx as any).createStereoPanner() : null
    if(panner){
      const pan = Math.max(-1, Math.min(1, panHint))
      ;(panner as StereoPannerNode).pan.setValueAtTime(pan, now)
    }

    src.connect(band).connect(gainN)
    click.connect(gainC)

    if(panner){
      gainN.connect(panner as any); gainC.connect(panner as any); (panner as any).connect(ctx.destination)
    }else{
      gainN.connect(ctx.destination); gainC.connect(ctx.destination)
    }

    src.start(now); src.stop(now + 0.12)
    click.start(now); click.stop(now + 0.09)
  }

  // drag-to-pop
  const draggingRef = useRef(false)
  useEffect(()=>{
    function up(){ draggingRef.current=false }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return ()=>{ window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
  },[])

  // stats & helpers
  const poppedCountRef = useRef(0)
  const [poppedCount, setPoppedCount] = useState(0)

  function toggle(el:HTMLDivElement){
    if(el.dataset.popped==='1') return
    el.dataset.popped='1'
    // depressed look + tiny spring animation
    el.style.transform='translateY(1px) scale(.96)'
    el.style.boxShadow='inset 0 4px 14px rgba(2,6,23,.28)'
    el.style.background='linear-gradient(180deg, #e5e9f2 0%, #d8dee9 60%, #cbd5e1 100%)'
    try{
      (el as any).animate?.(
        [
          { transform:'translateY(0) scale(1)' },
          { transform:'translateY(1px) scale(.96)' }
        ],
        { duration:120, easing:'cubic-bezier(.2,.8,.2,1)' }
      )
    }catch{}

    // combo scoring
    const nowMs = performance.now()
    if(nowMs - lastPopAtRef.current <= 380){ comboRef.current += 1 } else { comboRef.current = 1 }
    lastPopAtRef.current = nowMs
    setScore(s => s + 10 * comboRef.current)

    // sound + haptics
    const rect = el.getBoundingClientRect()
    const panHint = ((rect.left + rect.width/2) / window.innerWidth) * 2 - 1
    playPop(panHint)
    if('vibrate' in navigator){ try{ navigator.vibrate?.(8) }catch{} }

    poppedCountRef.current += 1
    setPoppedCount(poppedCountRef.current)
  }

  function resetAll(){
    const nodes = document.querySelectorAll<HTMLDivElement>('.bubble')
    nodes.forEach(n=>{
      n.dataset.popped='0'
      n.style.transform=''
      n.style.boxShadow='0 8px 22px rgba(2,6,23,.16), inset 0 -2px 8px rgba(255,255,255,.85)'
      n.style.background='radial-gradient(circle at 30% 30%, rgba(255,255,255,0.98), rgba(255,255,255,0.86) 38%, rgba(203,213,225,0.42) 68%, rgba(148,163,184,0.28) 100%)'
    })
    poppedCountRef.current = 0
    setPoppedCount(0)
    comboRef.current = 0
    setScore(0)
  }

  function handlePointerDown(e:React.PointerEvent<HTMLDivElement>){ resumeAudio(); draggingRef.current=true; toggle(e.currentTarget) }
  function handlePointerEnter(e:React.PointerEvent<HTMLDivElement>){ if(draggingRef.current){ resumeAudio(); toggle(e.currentTarget) } }
  function handleKeyDown(e:React.KeyboardEvent<HTMLDivElement>){ if(e.key===' '||e.key==='Enter'){ e.preventDefault(); resumeAudio(); toggle(e.currentTarget) } }

  function bubbleStyleFor(i:number): React.CSSProperties {
    const base: React.CSSProperties = {
      width:34, height:34, borderRadius:999,
      background:'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.98), rgba(255,255,255,0.86) 38%, rgba(203,213,225,0.42) 68%, rgba(148,163,184,0.28) 100%)',
      border:'1px solid rgba(2,6,23,.06)',
      boxShadow:'0 8px 22px rgba(2,6,23,.16), inset 0 -2px 8px rgba(255,255,255,.85)',
      cursor:'pointer',
      transition:'transform 120ms ease, box-shadow 120ms ease, background 120ms ease',
      touchAction:'none',
    }
    if(colored){
      const h = (i*17) % 360
      base.background = `radial-gradient(circle at 30% 30%, hsla(${h},100%,98%,0.98), hsla(${h},100%,90%,0.86) 38%, hsla(${h},30%,70%,0.42) 68%, hsla(${h},20%,60%,0.28) 100%)`
    }
    return base
  }

  return (
    <div className="container">
      <h1>🫧 泡泡纸</h1>
      <p className="desc">{grid.rows}×{grid.cols} 网格 · 拖动连戳 · 立体高光 + 多层音效 · 已戳：{poppedCount} · 分数：{score}</p>

      <div className="card" style={{padding:16}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:12}}>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <div className="btn ghost" onClick={resetAll}>新一张</div>
            <div className="btn ghost" onClick={()=>setColored(v=>!v)}>{colored?'彩色膜：开':'彩色膜：关'}</div>
          </div>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <div className="btn ghost" onClick={()=>setGrid({rows:12, cols:20})}>小</div>
            <div className="btn ghost" onClick={()=>setGrid({rows:10, cols:16})}>中</div>
            <div className="btn ghost" onClick={()=>setGrid({rows:8, cols:12})}>大</div>
            <div className="btn ghost" onClick={()=>setMuted(v=>!v)}>{muted?'已静音':'有音效'}</div>
          </div>
        </div>
        <div style={{display:'grid', gridTemplateColumns:`repeat(${grid.cols}, 1fr)`, gap:10}}>
          {cells.map(i=> (
            <div
              key={i}
              className="bubble"
              role="button"
              tabIndex={0}
              aria-label={`泡泡 ${i+1}`}
              data-popped="0"
              onPointerDown={handlePointerDown}
              onPointerEnter={handlePointerEnter}
              onKeyDown={handleKeyDown}
              style={bubbleStyleFor(i)}
            />
          ))}
        </div>
      </div>

      <div style={{marginTop:12}}>
        <a className="btn ghost" href="/">返回首页</a>
      </div>
    </div>
  )
}
