
import React, { useState } from 'react'
import '../styles.css'
import { click } from '../sfx'

const ITEMS = ['😺','🐻','🐼','🐣','🦊','🐨','🧸','🌈','⭐️','🍀','🎈','🍭','🪄','💖','👑']

export default function BlindBox(){
  const [opened, setOpened] = useState(false)
  const [item, setItem] = useState('')

  const open = ()=>{
    click()
    setOpened(true)
    const it = ITEMS[Math.floor(Math.random()*ITEMS.length)]
    setItem(it)
    confetti()
  }

  function confetti(){
    const container = document.getElementById('confetti')!
    if(!container) return
    container.innerHTML = ''
    for(let i=0;i<60;i++){
      const s = document.createElement('div')
      s.textContent = ['✨','⭐️','🎉','💫'][Math.floor(Math.random()*4)]
      s.style.position='absolute'
      s.style.left = Math.random()*100 + '%'
      s.style.top = '-10%'
      s.style.fontSize = (16+Math.random()*16)+'px'
      s.style.animation = `fall ${3+Math.random()*2}s linear forwards`
      container.appendChild(s)
    }
  }

  const download = ()=>{
    const cvs = document.createElement('canvas')
    cvs.width = 800; cvs.height = 800
    const ctx = cvs.getContext('2d')!
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,800,800)
    ctx.font = '200px system-ui'
    ctx.textAlign='center'; ctx.textBaseline='middle'
    ctx.fillText(item || '🎁', 400, 360)
    ctx.fillStyle = '#111'; ctx.font = 'bold 36px system-ui'
    ctx.fillText('解压小网站 · 盲盒', 400, 680)
    const a = document.createElement('a'); a.href = cvs.toDataURL('image/png'); a.download='blindbox.png'; a.click()
  }

  const rarity = item==='👑' ? '传说' : (['💖','🪄','🌈','⭐️'].includes(item) ? '稀有' : '普通')

  return (
    <div className="container">
      <style>{`@keyframes fall{to{transform:translateY(110vh) rotate(360deg);opacity:.9}}`}</style>
      <h1>📦 拆盲盒</h1>
      <p className="desc">点击拆开，收下今天的好运贴纸（含稀有/传说）。</p>

      <div className="card fade-in" style={{position:'relative', overflow:'hidden'}}>
        <div id="confetti" style={{pointerEvents:'none',position:'absolute',inset:0}}/>
        {!opened ? (
          <div style={{display:'grid', placeItems:'center', height:260}}>
            <button className="btn primary" onClick={open}>✨ 点击拆盒</button>
          </div>
        ) : (
          <div style={{display:'grid', placeItems:'center', height:260, background:'linear-gradient(135deg,#a2d2ff,#ffafcc)', borderRadius:12}}>
            <div style={{display:'grid', gap:8, placeItems:'center'}}>
              <div style={{fontSize:96}}>{item}</div>
              <div className="badge">稀有度：{rarity}</div>
            </div>
          </div>
        )}
      </div>

      <div style={{display:'flex', gap:12, marginTop:12}}>
        <button className="btn primary" onClick={open}>再来一个</button>
        <button className="btn secondary" onClick={download}>下载贴纸</button>
        <a className="btn ghost" href="/">返回首页</a>
      </div>
    </div>
  )
}
