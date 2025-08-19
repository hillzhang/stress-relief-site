
import React, { useMemo } from 'react'
import '../styles.css'
import { pop } from '../sfx'
export default function PopWrap(){
  const rows = 10, cols = 16
  const cells = useMemo(()=> Array.from({length:rows*cols}, (_,i)=> i), [])
  function toggle(el:HTMLDivElement){
    if(el.dataset.popped==='1') return
    el.dataset.popped='1'
    el.style.transform='translateY(1px) scale(.98)'
    el.style.boxShadow='inset 0 3px 12px rgba(2,6,23,.25)'
    el.style.background='#e2e8f0'
    pop()
  }
  return (<div className="container"><h1>🫧 泡泡纸</h1><p className="desc">10×16 网格，真实 POP 音 + 轻压凹陷。</p><div className="card" style={{padding:16}}><div style={{display:'grid', gridTemplateColumns:`repeat(${cols}, 1fr)`, gap:10}}>{cells.map(i=>(<div key={i} className="bubble" onClick={(e)=>toggle(e.currentTarget)} style={{width:32, height:32, borderRadius:999, background:'#fff', boxShadow:'0 6px 18px rgba(2,6,23,.12)', cursor:'pointer'}}/>))}</div></div><div style={{marginTop:12}}><a className="btn ghost" href="/">返回首页</a></div></div>) }
