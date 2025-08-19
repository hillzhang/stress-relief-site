
import React, { useMemo, useState } from 'react'
import '../styles.css'

const ICONS = ['😺','🐶','🐻','🐼','🐨','🦊','🐸','🐵']

export default function Memory(){
  const cards = useMemo(()=>{
    const arr = [...ICONS, ...ICONS].map((v,i)=>({id:i, v, open:false, done:false}))
    for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]] }
    return arr
  }, [])
  const [state, setState] = useState(cards)
  const [sel, setSel] = useState<number[]>([])
  const [steps, setSteps] = useState(0)

  function click(i:number){
    if(state[i].open || state[i].done) return
    const next = state.map((c,idx)=> idx===i? {...c, open:true}: c)
    setState(next); const s=[...sel, i]; setSel(s)
    if(s.length===2){
      setSteps(t=>t+1)
      const [a,b]=s
      if(next[a].v===next[b].v){
        setTimeout(()=>{ setState(st=> st.map((c,idx)=> (idx===a||idx===b)? {...c, done:true}: c)); setSel([]) }, 200)
      }else{
        setTimeout(()=>{ setState(st=> st.map((c,idx)=> (idx===a||idx===b)? {...c, open:false}: c)); setSel([]) }, 500)
      }
    }
  }
  const done = state.every(c=>c.done)

  return (<div className="container"><h1>🃏 记忆翻牌</h1><p className="desc">找出所有配对。步数越少越好。</p><div className="card" style={{padding:16}}><div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>{state.map((c,i)=>(<div onClick={()=>click(i)} key={c.id} style={{height:90, borderRadius:16, display:'grid', placeItems:'center', fontSize:28, cursor:'pointer', background: c.done? 'linear-gradient(135deg,#86efac,#a7f3d0)': (c.open? '#fff': '#e2e8f0'), boxShadow:'0 10px 20px rgba(2,6,23,.08)'}}>{(c.open||c.done)? c.v : '❓'}</div>))}</div></div><div style={{display:'flex', gap:12, marginTop:12}}><div className="badge">步数 {steps}</div>{done && <div className="badge">完成！</div>}<a className="btn ghost" href="/">返回首页</a></div></div>)
}
