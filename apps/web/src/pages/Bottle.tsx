import React, { useState } from 'react'
import '../styles.css'

export default function Bottle(){
  const [text, setText] = useState('')
  const [stage, setStage] = useState<'edit'|'fill'|'smash'|'break'>('edit')
  // 音效 & 砸瓶互动
  const [sfxOn, setSfxOn] = useState(true)
  const [smash, setSmash] = useState(0)
  const smashGoal = 6
  const cheers = ['已经轻松一些啦 ✨','呼~ 放下了','气球飘走、烦恼也走 🎈','今天也要加油呀','你已经做得很好了 💪']
  const smashingRef = React.useRef(false)
  const confettiTimerRef = React.useRef<number|null>(null)

  const acRef = React.useRef<AudioContext|any>(null)
  const masterRef = React.useRef<GainNode|null>(null)
  function ensureAC(){
    if(!acRef.current){
      const AC:any = (window as any).AudioContext || (window as any).webkitAudioContext
      if(!AC) return null
      const ac = new AC(); acRef.current = ac
      const g = ac.createGain(); g.gain.value = 0.35; g.connect(ac.destination); masterRef.current = g
    }
    return acRef.current
  }
  async function sfxResume(){ try{ const ac = ensureAC(); if(ac && ac.state==='suspended'){ await ac.resume() } }catch{}}
  function tone(freq:number, dur:number, type:OscillatorType='sine', vol=1){
    if(!sfxOn) return; const ac=ensureAC(); if(!ac||!masterRef.current) return
    const t0 = ac.currentTime; const o=ac.createOscillator(); const g=ac.createGain(); o.type=type
    o.frequency.setValueAtTime(freq,t0); g.gain.setValueAtTime(0.0001,t0); g.gain.exponentialRampToValueAtTime(0.7*vol,t0+0.01); g.gain.exponentialRampToValueAtTime(0.0001,t0+dur)
    o.connect(g); g.connect(masterRef.current as GainNode); o.start(t0); o.stop(t0+dur)
  }
  const sfxPour = ()=>{ tone(620,.08,'sine',.6); setTimeout(()=>tone(520,.08,'sine',.6),70) }
  const sfxCrack = ()=>{ tone(1200,.06,'triangle',.5); setTimeout(()=>tone(900,.08,'triangle',.45),40) }
  const sfxBreak = ()=>{ tone(300,.12,'sawtooth',.4); setTimeout(()=>tone(700,.10,'sine',.6),80) }

  const startFill = ()=>{
    if(!text.trim()) return alert('先把烦恼写进来吧～')
    setStage('fill'); setSmash(0); sfxResume(); sfxPour()
    setTimeout(()=> setStage('smash'), 1500)
  }

  const saveImage = ()=>{
    const cvs = document.createElement('canvas')
    cvs.width = 900; cvs.height = 1200
    const ctx = cvs.getContext('2d')!
    const g = ctx.createLinearGradient(0,0,900,1200)
    g.addColorStop(0,'#a2d2ff'); g.addColorStop(1,'#ffafcc')
    ctx.fillStyle = g; ctx.fillRect(0,0,900,1200)
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect(60,120,780,960)
    ctx.fillStyle = '#111'; ctx.font='bold 40px system-ui'; ctx.fillText('今天的烦恼已释放 ✅', 100, 200)
    ctx.font='24px system-ui'
    const words = wrapText(ctx, text, 680)
    let y=260; for(const line of words){ ctx.fillText(line, 100, y); y+=36 }
    ctx.fillStyle = '#334155'; ctx.fillText(new Date().toLocaleString(), 100, 960)
    ctx.fillStyle = '#16a34a'; ctx.font='bold 28px system-ui'; ctx.fillText(cheers[Math.floor(Math.random()*cheers.length)], 100, 910)
    const url = cvs.toDataURL('image/png')
    const a = document.createElement('a'); a.href = url; a.download = 'stress-bottle.png'; a.click()
  }

  function wrapText(ctx:CanvasRenderingContext2D, txt:string, max:number){
    const out:string[]=[]; let line=''
    for(const ch of txt){ const w = ctx.measureText(line+ch).width; if(w>max){ out.push(line); line=ch } else { line+=ch } }
    if(line) out.push(line); return out
  }

  function confetti(){
    const box = document.getElementById('confetti')!
    if(!box) return
    box.innerHTML = ''
    const N = 48
    for(let i=0;i<N;i++){
      const el = document.createElement('div')
      el.textContent = ['✨','⭐️','🎉','💫'][Math.floor(Math.random()*4)]
      const dx = (Math.random()*320-160).toFixed(1)  // 左右位移 -160..160 px
      const dy = (Math.random()*-80-120).toFixed(1)  // 向上位移 -120..-200 px
      Object.assign(el.style, {
        position:'absolute',
        left:'50%', top:'52%',                     // 瓶口附近
        transform:'translate(-50%,-50%)',
        fontSize:(16+Math.random()*10)+'px',
        animation:'confettiFly 1.2s ease-out forwards',
        pointerEvents:'none'
      } as CSSStyleDeclaration)
      el.style.setProperty('--dx', dx+'px')
      el.style.setProperty('--dy', dy+'px')
      box.appendChild(el)
    }
  }

  function hitBottle(){
    if(stage!=='smash' || smashingRef.current) return
    sfxResume(); sfxCrack()
    setSmash(v=>{
      const nv = v+1
      if(nv>=smashGoal){
        smashingRef.current = true
        setStage('break')
        if(confettiTimerRef.current){ clearTimeout(confettiTimerRef.current) }
        confettiTimerRef.current = window.setTimeout(()=>{ confetti(); confettiTimerRef.current=null }, 50)
        sfxBreak()
        window.setTimeout(()=>{ smashingRef.current=false }, 500)
      }
      return nv
    })
  }

  return (
      <div className="container">
        <style>{`
            @keyframes fall{to{transform:translateY(110%) rotate(360deg);opacity:.9}}
            @keyframes confettiFly{
              0%{transform:translate(0,0) rotate(0deg) scale(0.8); opacity:0}
              10%{opacity:1}
              100%{transform:translate(var(--dx), var(--dy)) rotate(540deg) scale(1); opacity:0}
            }
            @keyframes bottleShake{
              0%{transform:translateX(0) rotate(0deg)}
              15%{transform:translateX(-2.2px) rotate(-1.2deg)}
              35%{transform:translateX(2.2px) rotate(1.2deg)}
              55%{transform:translateX(-1.6px) rotate(-0.8deg)}
              75%{transform:translateX(1.6px) rotate(0.8deg)}
              100%{transform:translateX(0) rotate(0deg)}
            }
          `}</style>
        <h1>🥤 解压瓶</h1>
        <p className="desc">把烦恼写进瓶子里，然后砸碎它（附赠彩带）。</p>

        {stage === 'edit' && (
            <div className="card" style={{padding: 16}}>
          <textarea value={text} onChange={e => setText(e.target.value)}
                    placeholder="写下你的烦恼..."
                    style={{width: '100%', height: 120, padding: 12, border: '1px solid #e5e7eb', borderRadius: 12}}/>
              <div style={{display: 'flex', gap: 12, marginTop: 12}}>
                <button className="btn primary" onClick={startFill}>装进瓶子</button>
                <a className="btn ghost" href="/">返回首页</a>
                <button className="btn" onClick={() => {
                  setSfxOn(v => !v);
                  sfxResume()
                }}>音效：{sfxOn ? '开' : '关'}</button>
              </div>
            </div>
        )}

        {stage !== 'edit' && (
            <div className="card" style={{
              position: 'relative',
              overflow: 'hidden',
              height: 360,
              background: 'linear-gradient(135deg,var(--blue),var(--pink))'
            }}>
              <div id="confetti" style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}/>
              {stage === 'smash' && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none'
                  }}>
                    <div style={{
                      background: 'rgba(255,255,255,.85)',
                      padding: 10,
                      borderRadius: 12,
                      boxShadow: '0 12px 32px rgba(2,6,23,.2)',
                      textAlign: 'center'
                    }}>
                      <div style={{fontWeight: 700, color: '#111', marginBottom: 6}}>连续点点点把它砸碎！</div>
                      <div style={{
                        width: 220,
                        height: 8,
                        background: '#e5e7eb',
                        borderRadius: 9999,
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${Math.min(100, Math.round((smash / smashGoal) * 100))}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg,#60a5fa,#22c55e)',
                          transition: 'width .15s'
                        }}/>
                      </div>
                      <div style={{fontSize: 12, color: '#475569', marginTop: 6}}>{smash}/{smashGoal}</div>
                    </div>
                  </div>
              )}
              <BottleSVG fill={stage === 'fill'} broken={stage === 'break'} text={text}
                         onHit={stage === 'smash' ? hitBottle : undefined}
                         shaking={stage === 'smash' && smash > 0 && smash < smashGoal}
                         pulseKey={stage === 'smash' ? smash : undefined}/>
            </div>
        )}

        {stage === 'break' && (
            <div style={{display: 'flex', gap: 12, marginTop: 12, alignItems: 'center'}}>
              <button className="btn secondary" onClick={saveImage}>保存图片</button>
              <button className="btn" onClick={() => {
                setText('');
                setStage('edit')
              }}>再来一次
              </button>
              <a className="btn ghost" href="/">返回首页</a>
              <button className="btn" onClick={() => {
                setSfxOn(v => !v);
                sfxResume()
              }}>音效：{sfxOn ? '开' : '关'}</button>
              <span style={{color: '#16a34a', fontSize: 12}}>{cheers[Math.floor(Math.random() * cheers.length)]}</span>
            </div>
        )}
      </div>
  )
}

function BottleSVG({fill, broken, text, onHit, shaking, pulseKey}: {
  fill: boolean,
  broken: boolean,
  text: string,
  onHit?: () => void,
  shaking?: boolean,
  pulseKey?: number
}) {
  return (
      <svg viewBox="0 0 300 300" width="100%" height="100%" onClick={onHit}
           key={`shake-${pulseKey ?? 0}`}
           style={{
             cursor: onHit ? 'pointer' : 'default',
             animation: (typeof pulseKey !== 'undefined') ? 'bottleShake 280ms ease-out' : undefined
           }}>
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a2d2ff"/><stop offset="1" stopColor="#ffafcc"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="300" height="300" fill="url(#g)" opacity="0.15"/>
      <g>
        <path d="M150 20 c-10 0 -18 8 -18 18 v12 c0 6 -3 10 -8 14 c-15 10 -24 27 -24 45 v110 c0 28 22 50 50 50 s50 -22 50 -50 v-110 c0 -18 -9 -35 -24 -45 c-5 -4 -8 -8 -8 -14 v-12 c0 -10 -8 -18 -18 -18z"
          fill="#ffffff" stroke="#dbeafe" strokeWidth="4">
          {broken && (<animate attributeName="opacity" from="1" to="0" dur="0.22s" fill="freeze"/>) }
        </path>
      </g>
      <g>
        <clipPath id="clip">
          <path d="M150 20 c-10 0 -18 8 -18 18 v12 c0 6 -3 10 -8 14 c-15 10 -24 27 -24 45 v110 c0 28 22 50 50 50 s50 -22 50 -50 v-110 c0 -18 -9 -35 -24 -45 c-5 -4 -8 -8 -8 -14 v-12 c0 -10 -8 -18 -18 -18z"/>
        </clipPath>
        <g clipPath="url(#clip)">
          {!broken && (
              <rect x="60" y={fill? 160: 300} width="180" height="200" fill="url(#g)">
                <animate attributeName="y" from="300" to="160" dur="1.4s" fill="freeze" begin="0s"/>
              </rect>
          )}
          {/* smash ripples (retrigger on pulseKey change) */}
          {(!broken && typeof pulseKey !== 'undefined') && (
            <g key={'ripple-'+pulseKey} style={{pointerEvents:'none'}}>
              {[0, 0.12, 0.24].map((delay,i)=> (
                <circle key={i} cx={150} cy={160} r={2} fill="none" stroke="#93c5fd" strokeWidth="2" opacity="0.65">
                  <animate attributeName="r" from="2" to="60" dur="0.7s" begin={`${delay}s`} fill="freeze"/>
                  <animate attributeName="opacity" from="0.65" to="0" dur="0.7s" begin={`${delay}s`} fill="freeze"/>
                  <animate attributeName="stroke-width" from="2" to="0.6" dur="0.7s" begin={`${delay}s`} fill="freeze"/>
                </circle>
              ))}
            </g>
          )}
          {/* break ripple (one-time big ring) */}
          {broken && (
            <g key={'ripple-break'} style={{pointerEvents:'none'}}>
              <circle cx={150} cy={160} r={4} fill="none" stroke="#60a5fa" strokeWidth="3" opacity="0.9">
                <animate attributeName="r" from="4" to="110" dur="0.8s" begin="0s" fill="freeze"/>
                <animate attributeName="opacity" from="0.9" to="0" dur="0.8s" begin="0s" fill="freeze"/>
                <animate attributeName="stroke-width" from="3" to="0.6" dur="0.8s" begin="0s" fill="freeze"/>
              </circle>
            </g>
          )}
          {/* smash droplets (small upward then fall, retrigger per pulseKey) */}
          {(!broken && typeof pulseKey !== 'undefined') && (
            <g key={'drops-'+pulseKey} style={{pointerEvents:'none'}}>
              {[...Array(6)].map((_,i)=>{
                const dx = (-24 + Math.random()*48).toFixed(1)
                const up = (16 + Math.random()*10).toFixed(1)
                const r = (2 + Math.random()*1.8).toFixed(1)
                const delay = (0.02*i).toFixed(2)
                return (
                  <circle key={i} cx={150} cy={160} r={r} fill="#e0f2fe" opacity="0.85">
                    <animateTransform attributeName="transform" type="translate" from={`0 0`} to={`${dx} -${up}`} dur="0.28s" begin={`${delay}s`} fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".2 .8 .2 1"/>
                    <animateTransform attributeName="transform" additive="sum" type="translate" from={`0 0`} to={`${dx} ${(+up+18).toFixed(1)}`} dur="0.38s" begin={`${(0.28+Number(delay)).toFixed(2)}s`} fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".4 0 .6 1"/>
                    {(() => { const sDown=(0.88+Math.random()*0.06).toFixed(2); return (
                      <animateTransform attributeName="transform" additive="sum" type="scale" from={`1 1`} to={`${sDown} ${sDown}`} dur="0.28s" begin={`${delay}s`} fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".2 .8 .2 1"/>
                    )})()}
                    {(() => { const sUp=(1.00+Math.random()*0.04).toFixed(2); return (
                      <animateTransform attributeName="transform" additive="sum" type="scale" from={`${(0.9).toFixed(2)} ${(0.9).toFixed(2)}`} to={`${sUp} ${sUp}`} dur="0.38s" begin={`${(0.28+Number(delay)).toFixed(2)}s`} fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".4 0 .6 1"/>
                    )})()}
                    <animate attributeName="opacity" from="0.85" to="0" dur="0.66s" begin={`${delay}s`} fill="freeze"/>
                  </circle>
                )
              })}
            </g>
          )}
          {/* break droplets (bigger splash once) */}
          {broken && (
            <g key={'drops-break'} style={{pointerEvents:'none'}}>
              {[...Array(12)].map((_,i)=>{
                const ang = (i/12)*Math.PI*2
                const dx = Math.cos(ang)* (20+Math.random()*14)
                const dy = Math.sin(ang)* (14+Math.random()*10) * -1 // initial upward burst
                const fall = 36+Math.random()*18
                const r = (2.2 + Math.random()*2.2).toFixed(1)
                return (
                  <circle key={i} cx={150} cy={160} r={r} fill="#bae6fd" opacity="0.9">
                    <animateTransform attributeName="transform" type="translate" from={`0 0`} to={`${dx.toFixed(1)} ${dy.toFixed(1)}`} dur="0.28s" begin="0s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".2 .8 .2 1"/>
                    <animateTransform attributeName="transform" additive="sum" type="translate" from={`0 0`} to={`${dx.toFixed(1)} ${fall.toFixed(1)}`} dur="0.42s" begin="0.28s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".4 0 .6 1"/>
                    {(() => { const sDown=(0.92+Math.random()*0.05).toFixed(2); return (
                      <animateTransform attributeName="transform" additive="sum" type="scale" from={`1 1`} to={`${sDown} ${sDown}`} dur="0.28s" begin={`0s`} fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".2 .8 .2 1"/>
                    )})()}
                    {(() => { const sUp=(1.00+Math.random()*0.05).toFixed(2); return (
                      <animateTransform attributeName="transform" additive="sum" type="scale" from={`${(0.95).toFixed(2)} ${(0.95).toFixed(2)}`} to={`${sUp} ${sUp}`} dur="0.42s" begin={`0.28s`} fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".4 0 .6 1"/>
                    )})()}
                    <animate attributeName="opacity" from="0.9" to="0" dur="0.70s" begin="0s" fill="freeze"/>
                  </circle>
                )
              })}
            </g>
          )}
        </g>
      </g>
      {!broken && (
        <text x="150" y="150" textAnchor="middle" fontSize="12" fill="#334155">
          {text.slice(0,40)}
        </text>
      )}
      {broken && (
        <g>
          {/* flash */}
          <rect x="0" y="0" width="300" height="300" fill="#fff" opacity="0">
            <animate attributeName="opacity" from="0.8" to="0" dur="0.18s" fill="freeze"/>
          </rect>
          {/* burst lines */}
          {[...Array(12)].map((_,i)=>{
            const ang = (i/12)*Math.PI*2
            const x2 = 150 + Math.cos(ang)*70
            const y2 = 160 + Math.sin(ang)*70
            return (
              <line key={'burst'+i} x1="150" y1="160" x2={x2} y2={y2} stroke="#facc15" strokeWidth="2" opacity="0.9">
                <animate attributeName="opacity" from="0.9" to="0" dur="0.35s" fill="freeze"/>
              </line>
            )
          })}
          {[...Array(28)].map((_,i)=>{
            const ang = (Math.random()*Math.PI) - Math.PI/2 // upward hemisphere
            const speed = 46 + Math.random()*26
            const dx1 = Math.cos(ang) * speed
            const dy1 = Math.sin(ang) * speed * -1 // first stage: go up/out
            const fall = 60 + Math.random()*36     // second stage: gravity fall amount
            const rot = (Math.random()*180-90)
            const w = (6+Math.random()*8).toFixed(1)
            const h = (6+Math.random()*8).toFixed(1)
            const hue = 210 + Math.round(Math.random()*40) // blue-cyan range
            const fill = `hsl(${hue} 90% 60%)`
            return (
              <rect key={i} x="144" y="164" width={w} height={h} fill={fill} opacity="0.95">
                {/* stage 1: burst out with ease-out */}
                <animateTransform attributeName="transform" type="translate" from="0 0" to={`${dx1.toFixed(1)} ${dy1.toFixed(1)}`} dur="0.35s" begin="0s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".2 .8 .2 1"/>
                {/* stage 2: gravity fall with ease-in */}
                <animateTransform attributeName="transform" additive="sum" type="translate" from="0 0" to={`${dx1.toFixed(1)} ${fall.toFixed(1)}`} dur="0.8s" begin="0.35s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".4 0 .6 1"/>
                <animateTransform attributeName="transform" additive="sum" type="rotate" from="0 144 164" to={`${rot} 144 164`} dur="1.05s" begin="0s" fill="freeze"/>
                <animate attributeName="opacity" from="0.95" to="0" dur="1.05s" begin="0s" fill="freeze"/>
              </rect>
            )
          })}
          <g>
            <rect x="112" y="136" rx="8" ry="8" width="76" height="26" fill="rgba(255,255,255,.92)" stroke="#e2e8f0"/>
            <text x="150" y="154" textAnchor="middle" fontSize="14" fill="#111" fontWeight="bold">释放了！</text>
            {/* float up & fade */}
            <animateTransform attributeName="transform" type="translate" from="0 0" to="0 -22" dur="0.6s" begin="0s" fill="freeze"/>
            <animate attributeName="opacity" from="1" to="0" dur="0.6s" begin="0s" fill="freeze"/>
          </g>
        </g>
      )}
    </svg>
  )
}
