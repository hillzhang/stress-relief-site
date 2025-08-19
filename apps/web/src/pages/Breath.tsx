
import React, { useEffect, useRef, useState } from 'react'
import '../styles.css'
type Pattern = { name:string, steps:{label:string, seconds:number}[] }
const PATTERNS: Pattern[] = [
  { name:'均衡 4-4-4-4', steps:[{label:'吸气',seconds:4},{label:'屏息',seconds:4},{label:'呼气',seconds:4},{label:'屏息',seconds:4}]},
  { name:'放松 4-7-8', steps:[{label:'吸气',seconds:4},{label:'屏息',seconds:7},{label:'呼气',seconds:8}]},
  { name:'方块 5-5-5-5', steps:[{label:'吸气',seconds:5},{label:'屏息',seconds:5},{label:'呼气',seconds:5},{label:'屏息',seconds:5}]},
]
export default function Breath(){
  const [idx, setIdx] = useState(0), [step, setStep] = useState(0), [remaining, setRemaining] = useState(PATTERNS[0].steps[0].seconds)
  const timerRef = useRef<number|undefined>(undefined), circleRef = useRef<HTMLDivElement|null>(null)
  function resetTo(i:number){ setIdx(i); setStep(0); setRemaining(PATTERNS[i].steps[0].seconds) }
  useEffect(()=>{ const run=()=>{ const cur=PATTERNS[idx].steps[step]; setRemaining(cur.seconds); const el=circleRef.current; if(el){ el.animate([{transform:'scale(.7)'},{transform:'scale(1.3)'}],{duration:cur.seconds*1000,fill:'forwards'}) } const started=Date.now(); timerRef.current=window.setInterval(()=>{ const left=Math.max(0, cur.seconds - Math.floor((Date.now()-started)/1000)); setRemaining(left); if(left<=0){ window.clearInterval(timerRef.current); setStep((step+1)%PATTERNS[idx].steps.length) } },200) }; run(); return ()=>{ if(timerRef.current) window.clearInterval(timerRef.current) } }, [idx, step])
  return (<div className="container" style={{minHeight:'80vh'}}><h1>😮‍💨 呼吸训练</h1><p className="desc">预设：均衡/4-7-8/方块，圈形节奏动画。</p><div style={{display:'flex', gap:12, flexWrap:'wrap', marginBottom:12}}>{PATTERNS.map((p,i)=>(<button key={p.name} className={`btn ${i===idx?'secondary':'ghost'}`} onClick={()=>resetTo(i)}>{p.name}</button>))}</div><div className="stage" style={{display:'grid', placeItems:'center', height:420, background:'linear-gradient(135deg,var(--blue),var(--pink))'}}><div ref={circleRef} style={{width:240, height:240, borderRadius:'50%', display:'grid', placeItems:'center', color:'#fff', fontWeight:800, fontSize:22, background:'rgba(255,255,255,.15)'}}>{PATTERNS[idx].steps[step].label} · {remaining}s</div></div><div style={{marginTop:12}}><a className="btn ghost" href="/">返回首页</a></div></div>) }
