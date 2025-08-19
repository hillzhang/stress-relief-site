
import React, { useEffect, useRef, useState } from 'react'
import '../styles.css'
import { pop } from '../sfx'

export default function Mole(){
  const [score, setScore] = useState(0)
  const [time, setTime] = useState(30)
  const [holes, setHoles] = useState<number[]>([])
  const timerRef = useRef(0)
  useEffect(()=>{
    const ids = setInterval(()=>{
      setHoles(()=>{
        const arr:number[]=[]; const count= Math.floor(3+Math.random()*3)
        while(arr.length<count){ const id=Math.floor(Math.random()*9); if(!arr.includes(id)) arr.push(id) }
        return arr
      })
    }, 800)
    const t = setInterval(()=> setTime(s=> Math.max(0,s-1)), 1000)
    return ()=>{ clearInterval(ids); clearInterval(t) }
  }, [])
  function hit(i:number){
    if(!holes.includes(i) || time<=0) return
    setScore(s=>s+1); setHoles(h=> h.filter(x=>x!==i)); pop()
  }
  function reset(){ setScore(0); setTime(30); }
  return (<div className="container"><h1>🐹 打地鼠</h1><p className="desc">30 秒限时，尽可能多地敲到地鼠！</p><div className="card" style={{padding:16}}><div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>{Array.from({length:9},(_,i)=>(<div key={i} onClick={()=>hit(i)} style={{height:100, borderRadius:16, background: holes.includes(i)? 'linear-gradient(135deg,#fef08a,#86efac)' : '#e2e8f0', display:'grid', placeItems:'center', cursor:'pointer', userSelect:'none'}}>{holes.includes(i)? '🐹' : '🕳️'}</div>))}</div></div><div style={{display:'flex', gap:12, marginTop:12}}><div className="badge">得分 {score}</div><div className="badge">剩余 {time}s</div><button className="btn ghost" onClick={reset}>重来</button><a className="btn ghost" href="/">返回首页</a></div></div>)
}
