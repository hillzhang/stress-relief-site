
import React, { useEffect, useRef, useState } from 'react'
import '../styles.css'
import { pop } from '../sfx'
type Bubble = { id:number, el: HTMLDivElement, born: number, dur: number, kind:'normal'|'gold'|'bomb' }
export default function Bubbles(){
  const areaRef = useRef<HTMLDivElement|null>(null)
  const listRef = useRef<Bubble[]>([])
  const idRef = useRef(1)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const comboTimerRef = useRef<number|null>(null)
  useEffect(()=>{
    const area = areaRef.current!
    let mounted = true
    function mk(kind:'normal'|'gold'|'bomb'='normal'){
      const b = document.createElement('div')
      const size = kind==='gold'? 46 : 30 + Math.random()*46
      Object.assign(b.style, { position:'absolute', borderRadius:'50%', background: kind==='bomb' ? 'rgba(239,68,68,.9)' : (kind==='gold' ? 'rgba(250,204,21,.9)' : 'rgba(162,210,255,.85)'), width: size+'px', height: size+'px', left: Math.random()*(area.clientWidth-size)+'px', top: (area.clientHeight)+'px', boxShadow:'0 6px 18px rgba(2,6,23,.12)', transition:'transform .18s ease, opacity .18s ease' } as CSSStyleDeclaration)
      const id = idRef.current++; const life = 5500 + Math.random()*2500
      const item: Bubble = { id, el:b, born: performance.now(), dur: life, kind }
      listRef.current.push(item)
      b.onclick = ()=>{ const gain = kind==='gold'? 5 : (kind==='bomb'? -3 : 1); setScore(s => Math.max(0, s + gain * Math.max(1, combo))); setCombo(c => c+1); if(comboTimerRef.current) window.clearTimeout(comboTimerRef.current); comboTimerRef.current = window.setTimeout(()=> setCombo(0), 900); pop(); b.style.transform = 'scale(1.6)'; b.style.opacity = '0'; setTimeout(()=> b.remove(), 160); listRef.current = listRef.current.filter(x=>x.id!==id) }
      area.appendChild(b); setTimeout(()=>{ if(area.contains(b)) { b.remove(); listRef.current = listRef.current.filter(x=>x.id!==id) } }, life+600)
    }
    const spawnTimer = window.setInterval(()=>{ const r=Math.random(); if(r<0.08) mk('bomb'); else if(r<0.18) mk('gold'); else mk() }, 520)
    function raf(){ if(!mounted) return; const now=performance.now(), H=area.clientHeight; listRef.current.forEach(it=>{ const t=Math.min(1,(now-it.born)/it.dur), y=(1-t)*(H+60)-20, drift=Math.sin((it.id*13+now*0.0015)+t*6)*20; it.el.style.transform=`translate(${drift}px, ${-y}px)` }); requestAnimationFrame(raf) }
    requestAnimationFrame(raf)
    return ()=>{ mounted=false; window.clearInterval(spawnTimer); listRef.current.forEach(it=> it.el.remove()); listRef.current=[]; if(comboTimerRef.current) window.clearTimeout(comboTimerRef.current) }
  }, [])
  return (<div className="container"><h1>🫧 戳泡泡</h1><p className="desc">普通/金色/炸弹泡泡，带连击。</p><div ref={areaRef} className="stage" style={{height:460, background:'linear-gradient(135deg,var(--blue),var(--pink))'}}/><div style={{display:'flex', gap:12, marginTop:10, alignItems:'center'}}><div className="badge">得分 {score}</div>{combo>0 && <div className="badge">连击 x{Math.max(1, combo)}</div>}<a className="btn ghost" href="/">返回首页</a></div></div>) }
