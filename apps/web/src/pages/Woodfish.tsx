
import React, { useState } from 'react'
import '../styles.css'
import { dong } from '../sfx'

export default function Woodfish(){
  const [count, setCount] = useState(0)
  const [last, setLast] = useState<number|null>(null)
  const [bpm, setBpm] = useState(0)
  function hit(){
    const now = Date.now()
    if(last){ const dt=(now-last)/1000; setBpm(Math.max(1, Math.round(60/dt))) }
    setLast(now); setCount(c=>c+1); dong()
  }
  return (
    <div className="container">
      <h1>🔔 木鱼 · 禅</h1>
      <p className="desc">一敲一静心。配合柔和水波与竹影。</p>
      <div className="stage" style={{padding:24, background:'linear-gradient(135deg,#def,#fde7f3)'}}>
        <svg viewBox="0 0 400 220" width="100%" height="220">
          <defs>
            <linearGradient id="wood" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#d6b08a"/><stop offset="1" stopColor="#b68a5a"/>
            </linearGradient>
            <filter id="blur"><feGaussianBlur in="SourceGraphic" stdDeviation="2"/></filter>
          </defs>
          <rect x="0" y="0" width="400" height="220" fill="url(#g)" opacity="0"/>
          <g filter="url(#blur)">
            <ellipse cx="200" cy="160" rx="120" ry="20" fill="rgba(0,0,0,.08)"/>
          </g>
          <g transform="translate(200 110)">
            <path d="M-90,0 Q-60,-50 0,-60 Q60,-50 90,0 Q60,50 0,60 Q-60,50 -90,0 Z" fill="url(#wood)" stroke="#8b5e34" strokeWidth="3"/>
            <circle cx="-20" cy="-4" r="8" fill="#8b5e34"/>
            <circle cx="20" cy="-4" r="8" fill="#8b5e34"/>
          </g>
          <g>
            <circle cx="80" cy="40" r="2" fill="#94a3b8"><animate attributeName="r" values="2;5;2" dur="3s" repeatCount="indefinite"/></circle>
            <circle cx="320" cy="60" r="2" fill="#94a3b8"><animate attributeName="r" values="2;7;2" dur="4s" repeatCount="indefinite"/></circle>
          </g>
        </svg>
        <div style={{display:'grid', placeItems:'center', marginTop:-120}}>
          <button className="btn" onClick={hit} style={{width:180,height:180,borderRadius:999,background:'#fdf2e9',color:'#8b5e34',fontSize:28,boxShadow:'0 10px 30px rgba(139,94,52,.2)'}}>敲击</button>
        </div>
      </div>
      <div style={{display:'flex', gap:12, marginTop:12}}>
        <div className="badge">次数 {count}</div>
        <div className="badge">BPM {bpm}</div>
        <a className="btn ghost" href="/">返回首页</a>
      </div>
    </div>
  )
}
