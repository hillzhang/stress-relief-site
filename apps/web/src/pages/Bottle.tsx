
import React, { useState } from 'react'
import '../styles.css'

export default function Bottle(){
  const [text, setText] = useState('')
  const [stage, setStage] = useState<'edit'|'fill'|'break'>('edit')

  const startFill = ()=>{
    if(!text.trim()) return alert('先把烦恼写进来吧～')
    setStage('fill')
    setTimeout(()=> setStage('break'), 1500)
    setTimeout(confetti, 1600)
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
    box.innerHTML=''
    for(let i=0;i<50;i++){
      const el = document.createElement('div')
      el.textContent = ['✨','⭐️','🎉','💫'][Math.floor(Math.random()*4)]
      Object.assign(el.style, {position:'absolute', left: (Math.random()*100)+'%', top:'-10%', fontSize:(16+Math.random()*16)+'px', animation:'fall 3s linear forwards'}) as any
      box.appendChild(el)
    }
  }

  return (
    <div className="container">
      <style>{`@keyframes fall{to{transform:translateY(110%) rotate(360deg);opacity:.9}}`}</style>
      <h1>🥤 解压瓶</h1>
      <p className="desc">把烦恼写进瓶子里，然后砸碎它（附赠彩带）。</p>

      {stage==='edit' && (
        <div className="card" style={{padding:16}}>
          <textarea value={text} onChange={e=>setText(e.target.value)}
            placeholder="写下你的烦恼..." style={{width:'100%', height:120, padding:12, border:'1px solid #e5e7eb', borderRadius:12}}/>
          <div style={{display:'flex', gap:12, marginTop:12}}>
            <button className="btn primary" onClick={startFill}>装进瓶子</button>
            <a className="btn ghost" href="/">返回首页</a>
          </div>
        </div>
      )}

      {stage!=='edit' && (
        <div className="card" style={{position:'relative', overflow:'hidden', height:360, background:'linear-gradient(135deg,var(--blue),var(--pink))'}}>
          <div id="confetti" style={{position:'absolute', inset:0, pointerEvents:'none'}}/>
          <BottleSVG fill={stage==='fill'} broken={stage==='break'} text={text}/>
        </div>
      )}

      {stage==='break' && (
        <div style={{display:'flex', gap:12, marginTop:12}}>
          <button className="btn secondary" onClick={saveImage}>保存图片</button>
          <button className="btn" onClick={()=>{ setText(''); setStage('edit') }}>再来一次</button>
        </div>
      )}
    </div>
  )
}

function BottleSVG({fill, broken, text}:{fill:boolean, broken:boolean, text:string}){
  return (
    <svg viewBox="0 0 300 300" width="100%" height="100%">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a2d2ff"/><stop offset="1" stopColor="#ffafcc"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="300" height="300" fill="url(#g)" opacity="0.15"/>
      <path d="M150 20 c-10 0 -18 8 -18 18 v12 c0 6 -3 10 -8 14 c-15 10 -24 27 -24 45 v110 c0 28 22 50 50 50 s50 -22 50 -50 v-110 c0 -18 -9 -35 -24 -45 c-5 -4 -8 -8 -8 -14 v-12 c0 -10 -8 -18 -18 -18z"
        fill="#ffffff" stroke="#dbeafe" strokeWidth="4"/>
      <g>
        <clipPath id="clip">
          <path d="M150 20 c-10 0 -18 8 -18 18 v12 c0 6 -3 10 -8 14 c-15 10 -24 27 -24 45 v110 c0 28 22 50 50 50 s50 -22 50 -50 v-110 c0 -18 -9 -35 -24 -45 c-5 -4 -8 -8 -8 -14 v-12 c0 -10 -8 -18 -18 -18z"/>
        </clipPath>
        <g clipPath="url(#clip)">
          <rect x="60" y={fill? 160: 300} width="180" height="200" fill="url(#g)">
            <animate attributeName="y" from="300" to="160" dur="1.4s" fill="freeze" begin="0s"/>
          </rect>
        </g>
      </g>
      {!broken && (
        <text x="150" y="150" textAnchor="middle" fontSize="12" fill="#334155">
          {text.slice(0,40)}
        </text>
      )}
      {broken && (
        <g>
          {[...Array(10)].map((_,i)=>{
            const dx = (Math.random()*2-1)*80
            const dy = (Math.random()*-1)*80
            const rot = (Math.random()*120-60)
            return <rect key={i} x="140" y="160" width="8" height="8" fill="#60a5fa">
              <animateTransform attributeName="transform" type="translate" from="0 0" to={`${dx} ${dy}`} dur="0.5s" fill="freeze"/>
              <animateTransform attributeName="transform" additive="sum" type="rotate" from="0 144 164" to={`${rot} 144 164`} dur="0.5s" fill="freeze"/>
            </rect>
          })}
          <text x="150" y="200" textAnchor="middle" fontSize="16" fill="#111" fontWeight="bold">释放了！</text>
        </g>
      )}
    </svg>
  )
}
