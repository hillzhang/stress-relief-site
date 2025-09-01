import React, { useEffect, useMemo, useState } from 'react'
import '../styles.css'
import { click } from '../sfx'

// ===== Pool & Rarity =====
const POOL = {
  legend: ['👑','🐉','🦄','🪬','💎','🌌'],
  rare:   ['💖','🪄','🌈','⭐️','🎁','🍀','👻','🪽'],
  common: ['😺','🐻','🐼','🐣','🦊','🐨','🧸','🌸','🍩','🍭','🎈','🪅','🪐','🎮','📀','🔮']
}

const TIERS: Record<string,{color:string,label:string,weight:number}> = {
  legend: { color: '#f59e0b', label: '传说', weight: 2 },   // 2%
  rare:   { color: '#8b5cf6', label: '稀有', weight: 18 },  // 18%
  common: { color: '#0ea5e9', label: '普通', weight: 80 },  // 80%
}

const PITY_EVERY = 10 // 最多 9 次不出稀有，第10 次保底稀有

export default function BlindBox(){
  const [opened, setOpened] = useState(false)
  const [item, setItem] = useState('')
  const [tier, setTier] = useState<'legend'|'rare'|'common'|'none'>('none')
  const [count, setCount] = useState(0)
  const [pity, setPity] = useState(0) // 距离保底还差几次
  const [history, setHistory] = useState<{i:string; t:'legend'|'rare'|'common'}[]>([])

  const [sfxOn, setSfxOn] = useState(true)
  const [showRates, setShowRates] = useState(false)

  // --- soft bell SFX (pleasant) ---
  const acRef = React.useRef<AudioContext|null>(null)
  const masterRef = React.useRef<GainNode|null>(null)
  function ensureAC(){
    if(!acRef.current){
      const AC:any = (window as any).AudioContext || (window as any).webkitAudioContext
      if(!AC) return null
      const ac = new AC(); acRef.current = ac
      const g = ac.createGain(); g.gain.value = 0.18; g.connect(ac.destination); masterRef.current = g
    }
    return acRef.current
  }
  async function resumeAC(){ try{ const ac = ensureAC(); if(ac && ac.state==='suspended'){ await ac.resume() } }catch{} }

  function chime(t: 'legend'|'rare'|'common'){
    if(!sfxOn) return
    const ac = ensureAC(); if(!ac || !masterRef.current) return
    const now = ac.currentTime

    // intensity & ranges by tier
    const intensity = t==='legend' ? 1.0 : t==='rare' ? 0.8 : 0.6
    const startF = t==='legend'? 520 : t==='rare'? 440 : 360
    const endF   = t==='legend'? 1900: t==='rare'? 1500: 1200
    const dur = 0.55

    // master env
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(0.6*intensity, now+0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, now+dur)
    g.connect(masterRef.current as GainNode)

    // 1) whistle (ascending sine)
    const o = ac.createOscillator(); o.type = 'sine'
    o.frequency.setValueAtTime(startF, now)
    o.frequency.exponentialRampToValueAtTime(endF, now+0.35)
    o.connect(g)
    o.start(now); o.stop(now+dur)

    // 2) pop noise (short bandpassed burst)
    const noise = ac.createBuffer(1, Math.floor(ac.sampleRate*0.25), ac.sampleRate)
    const data = noise.getChannelData(0)
    for(let i=0;i<data.length;i++){ data[i] = (Math.random()*2-1) * (1 - i/data.length) }
    const ns = ac.createBufferSource(); ns.buffer = noise
    const bp = ac.createBiquadFilter(); bp.type='bandpass';
    bp.frequency.value = t==='legend'? 2200 : t==='rare'? 1800 : 1500; bp.Q.value = 0.8
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.0001, now+0.28)
    ng.gain.exponentialRampToValueAtTime(0.7*intensity, now+0.32)
    ng.gain.exponentialRampToValueAtTime(0.0001, now+0.55)
    ns.connect(bp); bp.connect(ng); ng.connect(masterRef.current as GainNode)
    ns.start(now+0.28); ns.stop(now+0.56)
  }

  function rollOnce(pityIn:number){
    if(pityIn >= PITY_EVERY-1){
      const pool = [...POOL.legend, ...POOL.rare]
      const pick = pool[Math.floor(Math.random()*pool.length)]
      return { item: pick, tier: (POOL.legend.includes(pick)? 'legend':'rare') as 'legend'|'rare', pityOut: 0 }
    }
    const r = Math.random()*100
    let t: 'legend'|'rare'|'common' = 'common'
    if(r < TIERS.legend.weight) t='legend'
    else if(r < TIERS.legend.weight + TIERS.rare.weight) t='rare'
    const pick = POOL[t][Math.floor(Math.random()*POOL[t].length)]
    const pityOut = (t==='rare'||t==='legend') ? 0 : Math.min(PITY_EVERY-1, pityIn+1)
    return { item: pick, tier: t, pityOut }
  }

  const rarity = useMemo(()=> tier==='legend'? '传说' : tier==='rare'? '稀有' : tier==='common'? '普通' : '', [tier])

  const open = ()=>{
    click()
    setOpened(true)

    const res = rollOnce(pity)
    setItem(res.item)
    setTier(res.tier)

    setCount(v=>v+1)
    setPity(res.pityOut)
    setHistory(h=> [{i:res.item, t:res.tier}, ...h].slice(0,18))

    resumeAC(); chime(res.tier)
    confetti(res.tier==='legend' ? 84 : res.tier==='rare' ? 64 : 48)
  }

  function confetti(N:number=48){
    const container = document.getElementById('confetti')!
    if(!container) return
    container.innerHTML = ''
    for(let i=0;i<N;i++){
      const s = document.createElement('div')
      s.textContent = ['✨','⭐️','🎉','💫'][Math.floor(Math.random()*4)]
      Object.assign(s.style, {
        position:'absolute', left:'50%', top:'52%', transform:'translate(-50%,-50%)',
        fontSize: (16+Math.random()*10)+'px',
        animation: 'confettiFly 1.1s ease-out forwards',
        pointerEvents: 'none'
      } as CSSStyleDeclaration)
      const dx = (Math.random()*320-160).toFixed(1)
      const dy = (Math.random()*-80-120).toFixed(1)
      ;(s.style as any).setProperty('--dx', dx+'px')
      ;(s.style as any).setProperty('--dy', dy+'px')
      container.appendChild(s)
    }
  }

  const saveSticker = ()=>{
    click()
    const el = document.createElement('canvas')
    el.width = 128; el.height = 128
    const ctx = el.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0,0,el.width,el.height)
    ctx.font = '96px serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(item, el.width/2, el.height/2)
    const a = document.createElement('a')
    a.download = 'sticker.png'
    a.href = el.toDataURL('image/png')
    a.click()
  }

  function open10(){
    click(); setOpened(true)
    let pityCur = pity
    const results: {item:string; tier:'legend'|'rare'|'common'}[] = []
    for(let i=0;i<10;i++){
      const r = rollOnce(pityCur)
      results.push({item:r.item, tier:r.tier})
      pityCur = r.pityOut
    }
    const last = results[results.length-1]
    setItem(last.item); setTier(last.tier)
    setCount(v=>v+10)
    setPity(pityCur)
    setHistory(h=> [...results.map(r=>({i:r.item,t:r.tier})), ...h].slice(0,18))
    resumeAC(); chime(last.tier)
    confetti(last.tier==='legend' ? 96 : last.tier==='rare' ? 76 : 56)
  }

  const pityLeft = PITY_EVERY - pity

  return (
    <div className="container">
      <style>{`
        @keyframes fall{to{transform:translateY(110vh) rotate(360deg);opacity:.9}}
        @keyframes confettiFly{
          0%{transform:translate(0,0) rotate(0deg) scale(.8); opacity:0}
          10%{opacity:1}
          100%{transform:translate(var(--dx), var(--dy)) rotate(540deg) scale(1); opacity:0}
        }
        .rare-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:9999px;font-weight:700;color:#fff}
        .legend{background:linear-gradient(90deg,#fbbf24,#f59e0b)}
        .rare{background:linear-gradient(90deg,#a78bfa,#7c3aed)}
        .common{background:linear-gradient(90deg,#38bdf8,#0ea5e9)}
        .box-closed{display:grid;place-items:center;height:260}
        .box-open{display:grid;place-items:center;height:260;background:linear-gradient(135deg,#a2d2ff,#ffafcc);border-radius:12}
        .history{display:grid;grid-template-columns:repeat(9,1fr);gap:8;margin-top:10px}
        @media (max-width:680px){.history{grid-template-columns:repeat(6,1fr)}}
        .pity{display:flex;align-items:center;gap:8px;margin-top:6px}
        .pity .bar{flex:1;height:8px;background:#e5e7eb;border-radius:9999px;overflow:hidden}
        .pity .bar>span{display:block;height:100%;background:linear-gradient(90deg,#38bdf8,#8b5cf6);width:0}
        .modal{position:fixed;inset:0;background:rgba(2,6,23,.45);display:flex;align-items:center;justify-content:center;padding:16px;z-index:30}
        .modal .panel{background:#fff;border-radius:12px;padding:16px;max-width:520px;box-shadow:0 24px 64px rgba(2,6,23,.35)}
        .btn.primary{background:linear-gradient(90deg,#34d399,#059669);color:#fff;box-shadow:0 2px 6px rgba(0,0,0,.15)}
        .btn.primary:hover{background:linear-gradient(90deg,#059669,#34d399)}
        .btn.secondary{background:#f1f5f9;color:#111}
        .btn.secondary:hover{background:#e2e8f0}
        .btn.ghost{background:transparent;border:1px solid #cbd5e1;color:#334155}
        .btn.ghost:hover{background:#f8fafc}
        h1{font-size:24px;font-weight:800;background:linear-gradient(90deg,#6366f1,#ec4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
        .desc{font-size:14px;color:#475569;margin-bottom:12px}
        .card{padding:16px;border-radius:12px;background:#fff;box-shadow:0 6px 16px rgba(0,0,0,.08);transition:transform .2s}
        .card:hover{transform:translateY(-2px)}
        .fade-in{animation:fadeIn .4s ease-out}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
      `}</style>

      <h1>📦 拆盲盒</h1>
      <p className="desc">点击拆开，收下今天的好运贴纸（含稀有/传说）。有<span style={{fontWeight:700}}>保底机制</span>，最多 {PITY_EVERY} 次必出稀有～</p>

      <div className="card fade-in" style={{position:'relative', overflow:'hidden'}}>
        <div id="confetti" style={{pointerEvents:'none',position:'absolute',inset:0}}/>
        {!opened ? (
          <div className="box-closed">
            <button className="btn primary" onClick={open}>✨ 点击拆盒</button>
          </div>
        ) : (
          <div className="box-open">
            <div style={{display:'grid', gap:10, placeItems:'center'}}>
              <div style={{fontSize:96}}>{item}</div>
              {tier!=='none' && (
                <div className={`rare-badge ${tier}`}>稀有度：{TIERS[tier].label}</div>
              )}
              <div style={{fontSize:12,color:'#334155'}}>已拆 {count} 次 · 保底倒计时：{pityLeft} 次</div>
              <div className="pity">
                <div className="bar"><span style={{width: `${((PITY_EVERY-pityLeft)/PITY_EVERY*100).toFixed(0)}%`}}/></div>
                <span style={{fontSize:12,color:'#64748b'}}>{((PITY_EVERY-pityLeft)/PITY_EVERY*100).toFixed(0)}%</span>
              </div>
              <div style={{display:'flex',gap:10,marginTop:6,fontSize:12,color:'#475569'}}>
                <span>传说：{history.filter(h=>h.t==='legend').length}</span>
                <span>稀有：{history.filter(h=>h.t==='rare').length}</span>
                <span>普通：{history.filter(h=>h.t==='common').length}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* History */}
      {history.length>0 && (
        <div className="card" style={{marginTop:12}}>
          <div style={{fontWeight:700,marginBottom:6}}>最近战利品</div>
          <div className="history">
            {history.map((h,idx)=> (
              <div key={idx} style={{position:'relative',display:'grid',placeItems:'center',height:40,borderRadius:8,background:'rgba(255,255,255,.6)',boxShadow:'inset 0 0 0 1px rgba(148,163,184,.25)'}}>
                <span title={h.t} style={{fontSize:22}}>{h.i}</span>
                <span style={{position:'absolute',right:6,bottom:6,width:6,height:6,borderRadius:9999,background: h.t==='legend'? '#f59e0b' : h.t==='rare'? '#8b5cf6' : '#0ea5e9'}}/>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{display:'flex', gap:12, marginTop:12, flexWrap:'wrap'}}>
        <button className="btn primary" onClick={open}>再来一个</button>
        <button className="btn secondary" onClick={saveSticker}>下载贴纸</button>
        <a className="btn ghost" href="/">返回首页</a>
        <button className="btn" onClick={open10}>十连开</button>
        <button className="btn secondary" onClick={()=>setSfxOn(v=>!v)}>音效：{sfxOn? '开':'关'}</button>
        <button className="btn ghost" onClick={()=>setShowRates(true)}>概率说明</button>
      </div>

      {showRates && (
        <div className="modal" onClick={()=>setShowRates(false)}>
          <div className="panel" onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,marginBottom:8}}>概率说明 & 保底机制</div>
            <div style={{fontSize:14,color:'#334155',lineHeight:1.7}}>
              <div>传说：{TIERS.legend.weight}% · 稀有：{TIERS.rare.weight}% · 普通：{TIERS.common.weight}%</div>
              <div>保底：连续 {PITY_EVERY-1} 次未出稀有，第 {PITY_EVERY} 次至少稀有（含传说）。</div>
              <div>十连开：按当前保底进度逐次结算。</div>
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}>
              <button className="btn" onClick={()=>setShowRates(false)}>好的</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
