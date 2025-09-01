import React, { useEffect, useMemo, useRef, useState } from 'react'

/** 场景类型 */
type SceneId = 'rain'|'ocean'|'fireplace'|'white'|'pink'|'brown'|'wind'|'forest'|'stream'|'waterfall'

const SCENE_LABEL: Record<SceneId,string> = {
  rain: '🌧️ 下雨声',
  ocean: '🌊 海浪声',
  fireplace: '🔥 壁炉声',
  white: '🤍 白噪音',
  pink: '🩷 粉噪音',
  brown: '🟤 褐噪音',
  wind: '💨 风声',
  forest: '🌲 森林',
  stream: '⛲ 溪流',
  waterfall: '🏞️ 瀑布',
}

const LS = {
  scene: 'wn_scene',
  volume: 'wn_volume',
  tone: 'wn_tone',
}

function clamp(n:number,min=0,max=1){return Math.min(max,Math.max(min,n))}

/** 创建 / 管理音频上下文与主通道 */
function useAudio(){
  const ctxRef = useRef<AudioContext|null>(null)
  const masterRef = useRef<GainNode|null>(null)
  const toneRef = useRef<BiquadFilterNode|null>(null)

  const ensure = async ()=>{
    if(!ctxRef.current){
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
      const ctx = new Ctx() as AudioContext
      ctxRef.current = ctx
      const master = ctx.createGain()
      master.gain.value = 0.4
      const tone = ctx.createBiquadFilter()
      tone.type = 'lowpass'
      tone.frequency.value = 4000
      master.connect(tone)
      tone.connect(ctx.destination)
      masterRef.current = master
      toneRef.current = tone
    }
    if(ctxRef.current!.state === 'suspended') await ctxRef.current!.resume()
    return { ctx: ctxRef.current!, master: masterRef.current!, tone: toneRef.current! }
  }

  const suspend = async()=>{
    const ctx = ctxRef.current
    if(ctx && ctx.state === 'running') await ctx.suspend()
  }

  return { ensure, suspend, ctxRef, masterRef, toneRef }
}

function makeNoiseBuffer(ctx:AudioContext, seconds=2){
  const b = ctx.createBuffer(1, seconds*ctx.sampleRate, ctx.sampleRate)
  const d = b.getChannelData(0)
  for(let i=0;i<d.length;i++) d[i] = Math.random()*2-1
  return b
}

function createNoise(ctx:AudioContext, type:SceneId){
  const src = ctx.createBufferSource()
  src.buffer = makeNoiseBuffer(ctx, 4)
  src.loop = true

  let node: AudioNode = src
  const f = ctx.createBiquadFilter()
  let extras: OscillatorNode[] = []
  switch(type){
    case 'rain': f.type='bandpass';  f.frequency.value=1000; f.Q.value=0.8; break
    case 'ocean': f.type='lowpass';  f.frequency.value=600;  f.Q.value=0.0001; break
    case 'fireplace': f.type='highpass';f.frequency.value=1200; f.Q.value=0.7; break
    case 'pink': f.type='lowpass';   f.frequency.value=1800; f.Q.value=0.0001; break
    case 'brown': f.type='lowpass';  f.frequency.value=400;  f.Q.value=0.0001; break
    case 'wind': f.type='bandpass'; f.frequency.value=250;  f.Q.value=0.6;   break
    case 'forest': f.type='lowpass'; f.frequency.value=2500; f.Q.value=0.0001; break
    case 'stream': {
      f.type='bandpass'; f.frequency.value=1800; f.Q.value=0.8;
      // 轻微频率抖动（≈0.15Hz），模拟水流细碎变化
      const lfo = ctx.createOscillator(); lfo.type='sine'; lfo.frequency.value=0.15;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = 120; // ±120Hz
      lfo.connect(lfoGain); lfoGain.connect(f.frequency); lfo.start();
      extras.push(lfo);
    } break
    case 'waterfall': f.type='lowpass'; f.frequency.value=2000; f.Q.value=0.0001; break
    default: /* white */ break
  }
  if(type!=='white') node.connect(f), node = f

  const g = ctx.createGain()
  g.gain.value = 1
  node.connect(g)
  return { src, out: g, extras }
}

/** 主组件 */
export default function WhiteNoise(){
  const { ensure, suspend, masterRef, toneRef, ctxRef } = useAudio()

  // 初始值从本地恢复
  const [scene, setScene] = useState<SceneId>(()=> (localStorage.getItem(LS.scene) as SceneId) || 'rain')
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState<number>(()=> parseFloat(localStorage.getItem(LS.volume)||'0.5'))
  const [tone, setTone] = useState<number>(()=> parseFloat(localStorage.getItem(LS.tone)||'1')) // 0~1 => 800~8000Hz

  const srcRef = useRef<{ src: AudioBufferSourceNode; out: AudioNode; extras?: OscillatorNode[] }|null>(null)

  // 持久化
  useEffect(()=>{ localStorage.setItem(LS.scene, scene) },[scene])
  useEffect(()=>{ localStorage.setItem(LS.volume, String(clamp(volume))) },[volume])
  useEffect(()=>{ localStorage.setItem(LS.tone, String(clamp(tone))) },[tone])

  // 音量与色调联动
  useEffect(()=>{
    const ctx = ctxRef.current
    const m = masterRef.current
    if(!ctx || !m) return
    const now = ctx.currentTime
    m.gain.cancelScheduledValues(now)
    m.gain.linearRampToValueAtTime(clamp(volume), now + 0.08)
  },[volume])

  useEffect(()=>{
    const t = toneRef.current
    const v = clamp(tone)
    if(!t) return
    // 颜色控制：更亮 => 截止频率更高
    const min = 800, max = 8000
    t.frequency.value = min + (max-min)*v
  },[tone])

  // 播放 / 暂停与交叉淡入
  const start = async()=>{
    const { ctx, master } = await ensure()
    if(srcRef.current){
      const node = createNoise(ctx, scene)
      const gain = node.out as GainNode
      gain.gain.value = 0
      node.out.connect(master)
      node.src.start()
      const old = srcRef.current
      srcRef.current = node
      const now = ctx.currentTime
      gain.gain.linearRampToValueAtTime(clamp(volume), now + 0.5)
      ;(old.out as GainNode).gain.linearRampToValueAtTime(0, now + 0.5)
      setTimeout(()=>{
        try{ old.src.stop() }catch{}
        try{ old.extras?.forEach(n=>{ try{ n.stop() }catch{} }) }catch{}
      }, 520)
      setPlaying(true)
      return
    }
    const node = createNoise(ctx, scene)
    node.out.connect(master)
    node.src.start()
    srcRef.current = node
    setPlaying(true)
  }

  const pause = async()=>{
    if(srcRef.current){
      try{ srcRef.current.src.stop() }catch{}
      try{ srcRef.current.extras?.forEach(n=>{ try{ n.stop() }catch{} }) }catch{}
      srcRef.current = null
    }
    await suspend()
    setPlaying(false)
  }

  const changeScene = async (s:SceneId)=>{ setScene(s); if(playing) await start() }

  // 睡眠定时器
  const [remain, setRemain] = useState<number>(0)
  const timerRef = useRef<number|undefined>()
  const startTimer = async (mins:number)=>{
    if(mins<=0){ clearTimer(); return }
    await ensure()
    const total = Math.round(mins*60)
    setRemain(total)
    clearTimer()
    timerRef.current = window.setInterval(()=>{
      setRemain(prev=>{
        const n = prev-1
        if(n<=0){ clearTimer(); fadeOutAndStop(); return 0 }
        return n
      })
    }, 1000) as any
  }
  const clearTimer = ()=>{ if(timerRef.current){ clearInterval(timerRef.current); timerRef.current=undefined } }
  const fadeOutAndStop = ()=>{
    const ctx = ctxRef.current
    const m = masterRef.current
    if(!ctx || !m){ pause(); return }
    const now = ctx.currentTime
    m.gain.cancelScheduledValues(now)
    m.gain.linearRampToValueAtTime(0, now + 1.0)
    setTimeout(()=>{ pause(); m.gain.value = clamp(volume) }, 1100)
  }

  // 键盘快捷键
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(e.key===' '){ e.preventDefault(); (playing? pause:start)(); }
      if(e.key==='ArrowUp'){ setVolume(v=>clamp(v+0.05)) }
      if(e.key==='ArrowDown'){ setVolume(v=>clamp(v-0.05)) }
      const idx = parseInt(e.key,10)
      if(!Number.isNaN(idx)){
        const ids:SceneId[]=['rain','ocean','fireplace','white','pink','brown','wind','forest','stream','waterfall']
        const pos = (idx===0? 10 : idx)
        if(pos>=1 && pos<=ids.length) changeScene(ids[pos-1])
      }
    }
    window.addEventListener('keydown', onKey)
    return ()=>window.removeEventListener('keydown', onKey)
  },[playing])

  useEffect(()=>()=>{
    try{
      if(srcRef.current){
        try{ srcRef.current.src.stop() }catch{}
        try{ srcRef.current.extras?.forEach(n=>{ try{ n.stop() }catch{} }) }catch{}
        srcRef.current=null
      }
      const ctx = ctxRef.current
      if(ctx && ctx.state==='running') ctx.suspend()
    }catch{}
  },[])

  return (
    <div style={{ fontFamily:'system-ui, -apple-system, Segoe UI, sans-serif', padding:16, maxWidth:760, margin:'0 auto' }}>
      <h1>🎵 白噪音播放器</h1>
      <p style={{opacity:.8}}>雨/海浪/壁炉/白/粉/褐/风声/森林/溪流/瀑布。支持淡入淡出、定时停止、键盘快捷键（空格播放，↑↓音量，1–9，0 切换）。</p>

      {/* 场景选择 */}
      <div style={{display:'grid', gap:12, gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))'}}>
        {(['rain','ocean','fireplace','white','pink','brown','wind','forest','stream','waterfall'] as SceneId[]).map(id=> (
          <button key={id} onClick={()=>changeScene(id)}
            style={{padding:'10px 12px', border:'1px solid #e5e7eb', borderRadius:12, background: scene===id?'#eef2ff':'#fff', cursor:'pointer'}}>
            {SCENE_LABEL[id]}
          </button>
        ))}
      </div>

      {/* 控件 */}
      <div style={{marginTop:16, display:'flex', gap:12, alignItems:'center', flexWrap:'wrap'}}>
        <button onClick={playing? pause : start} className="btn">{playing? '暂停' : '播放'}</button>
        <label style={{display:'flex', alignItems:'center', gap:8}}>音量
          <input type="range" min={0} max={1} step={0.01} value={volume} onChange={e=>setVolume(parseFloat(e.target.value))}/>
        </label>
        <label style={{display:'flex', alignItems:'center', gap:8}}>色调
          <input title="更亮/更暗" type="range" min={0} max={1} step={0.01} value={tone} onChange={e=>setTone(parseFloat(e.target.value))}/>
        </label>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <span>定时</span>
          {[10,20,30,60].map(m=> (
            <button key={m} onClick={()=>startTimer(m)} style={{padding:'6px 10px', border:'1px solid #e5e7eb', borderRadius:10, background:'#fff'}}>{m}m</button>
          ))}
          <button onClick={()=>startTimer(0)} style={{padding:'6px 10px', border:'1px solid #e5e7eb', borderRadius:10, background:'#fff'}}>清除</button>
          {remain>0 && <span style={{opacity:.7}}>剩余 {Math.floor(remain/60)}:{String(remain%60).padStart(2,'0')}</span>}
        </div>
      </div>
    </div>
  )
}
