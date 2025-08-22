import React, { useEffect, useMemo, useRef, useState } from 'react'
import '../styles.css'

// 更丰富的素材（会按棋盘大小自动截取）
const ICONS = ['😺','🐶','🐻','🐼','🐨','🦊','🐸','🐵','🦁','🦄','🐯','🐹','🐷','🐔','🐙','🦉','🐞','🦋','🌸','🌼','🍀','🍎','🍊','🍉','⚽️','🎲','🎵','🎈','🚗','✈️','⭐️','💎']

type Mode = 'classic' | 'timed' | 'zen' | 'extreme' | 'peek'

type Card = { id:number; v:string; open:boolean; done:boolean }

export default function Memory(){
  // =============== 配置 ===============
  const [size, setSize] = useState<4|5|6>(4)          // 棋盘宽（4=4x4, 5=4x5, 6=6x6）
  const [mode, setMode] = useState<Mode>('classic')   // 玩法模式
  const [skin, setSkin] = useState<'classic'|'emoji'|'pattern'>('classic')
  const pairCount = useMemo(()=>{
    const total = size===4? 16 : size===5? 20 : 36
    return total/2
  },[size])

  // =============== 构造卡组 ===============
  const seedRef = useRef(0)
  const makeCards = useMemo(()=>{
    // 根据棋盘需要的对数从 ICONS 中截取 + 打散
    const pick = [...ICONS].slice(0, pairCount)
    const arr: Card[] = [...pick, ...pick].map((v,i)=>({id:i+seedRef.current*1000, v, open:false, done:false}))
    for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]] }
    return arr
  },[pairCount, seedRef.current])

  const [state, setState] = useState<Card[]>(makeCards)
  useEffect(()=>{ setState(makeCards) }, [makeCards])

  // =============== 进度 & 统计 ===============
  const [sel, setSel] = useState<number[]>([])
  const [steps, setSteps] = useState(0)
  const [locked, setLocked] = useState(false) // 动画中锁定点击

  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const comboTimerRef = useRef<number | undefined>(undefined)
  const COMBO_WINDOW = 2000 // 连击窗口：2s 内连续命中叠加

  // For 连线记忆 (peek) visual link
  const gridRef = useRef<HTMLDivElement|null>(null)
  const cardRefs = useRef<HTMLDivElement[]>([])
  const [link, setLink] = useState<{x:number,y:number,w:number,angle:number}|null>(null)

  // 计时：经典=正计时；计时=倒计时；禅=无计时
  const [time, setTime] = useState(0)
  const [left, setLeft] = useState(60) // 计时模式默认60s
  useEffect(()=>{ setTime(0); setLeft(60) }, [mode, size, seedRef.current])
  useEffect(()=>{
    let t:number|undefined
    if(mode==='classic'){
      t = window.setInterval(()=> setTime(s=>s+1), 1000)
    }else if(mode==='timed'){
      t = window.setInterval(()=> setLeft(s=> Math.max(0, s-1)), 1000)
    }
    return ()=> t && clearInterval(t)
  },[mode])

  // 连线记忆：开局 1200ms 全亮后盖回
  useEffect(()=>{
    if(mode!=='peek') return
    setState(st=> st.map(c=> ({...c, open:true})))
    const t = setTimeout(()=> setState(st=> st.map(c=> c.done ? c : ({...c, open:false}))), 1200)
    return ()=> clearTimeout(t)
  }, [mode, size, seedRef.current])

  useEffect(()=>{
    if(mode!=='extreme') return
    const t = setInterval(()=>{
      setState(st=>{
        const closedIdx = st.map((c,idx)=>({c,idx})).filter(x=>!x.c.open && !x.c.done).map(x=>x.idx)
        if(closedIdx.length < 2) return st
        const vals = closedIdx.map(i=> st[i])
        for(let i=vals.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [vals[i],vals[j]]=[vals[j],vals[i]] }
        const arr = st.slice()
        closedIdx.forEach((ii,k)=>{ arr[ii] = vals[k] })
        return arr
      })
    }, 12000)
    return ()=> clearInterval(t)
  }, [mode])

  // 记录最佳（不同尺寸+模式各自一份）
  const bestKey = `mem_best_${mode}_${size}`
  const best = Number(localStorage.getItem(bestKey) || 0)
  const setBest = (v:number)=> localStorage.setItem(bestKey, String(v))

  // =============== 点击逻辑 ===============
  function click(i:number){
    if(locked) return
    if(state[i].open || state[i].done) return
    const next = state.map((c,idx)=> idx===i? {...c, open:true}: c)
    setState(next); const s=[...sel, i]; setSel(s)
    if(s.length===2){
      setLocked(true)
      setSteps(t=>t+1)
      const [a,b]=s
      if(next[a].v===next[b].v){
        const nextCombo = Math.min(5, combo + 1)
        setCombo(nextCombo)
        setScore(s => s + 10 * nextCombo)
        if (comboTimerRef.current) clearTimeout(comboTimerRef.current)
        comboTimerRef.current = window.setTimeout(() => setCombo(0), COMBO_WINDOW)
        // 连线记忆：命中时画一条连接线
        if(mode==='peek'){
          requestAnimationFrame(()=>{
            const ga = cardRefs.current[a]?.getBoundingClientRect()
            const gb = cardRefs.current[b]?.getBoundingClientRect()
            const g = gridRef.current?.getBoundingClientRect()
            if(ga && gb && g){
              const ax = ga.left + ga.width/2 - g.left
              const ay = ga.top + ga.height/2 - g.top
              const bx = gb.left + gb.width/2 - g.left
              const by = gb.top + gb.height/2 - g.top
              const dx = bx-ax, dy = by-ay
              const w = Math.hypot(dx,dy)
              const angle = Math.atan2(dy,dx) * 180/Math.PI
              setLink({x:ax, y:ay, w, angle})
              setTimeout(()=> setLink(null), 700)
            }
          })
        }
        setTimeout(()=>{
          setState(st=> st.map((c,idx)=> (idx===a||idx===b)? {...c, done:true}: c))
          setSel([]); setLocked(false)
        }, 260)
      }else{
        if(mode==='extreme'){
          setScore(s=> Math.max(0, s-8))
        }
        // 极限：为未完成且未翻开的卡做一次概率洗牌
        if(mode==='extreme' && Math.random() < 0.15){
          setState(st=>{
            const closedIdx = st.map((c,idx)=>({c,idx})).filter(x=>!x.c.open && !x.c.done).map(x=>x.idx)
            if(closedIdx.length < 2) return st
            const vals = closedIdx.map(i=> st[i])
            for(let i=vals.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [vals[i],vals[j]]=[vals[j],vals[i]] }
            const arr = st.slice()
            closedIdx.forEach((ii,k)=>{ arr[ii] = vals[k] })
            return arr
          })
        }
        // 极限：错误卡轻微抖动
        if(mode==='extreme'){
          const aEl = cardRefs.current[a]; const bEl = cardRefs.current[b]
          aEl?.classList.add('shake'); bEl?.classList.add('shake')
          setTimeout(()=>{ aEl?.classList.remove('shake'); bEl?.classList.remove('shake') }, 300)
        }
        setTimeout(()=>{
          setState(st=> st.map((c,idx)=> (idx===a||idx===b)? {...c, open:false}: c))
          setSel([]); setLocked(false)
        }, 620)
      }
    }
  }

  const done = state.every(c=>c.done)
  useEffect(()=>{
    if(done){
      if(mode==='classic'){
        if(!best || steps<best) setBest(steps)
      }else if(mode==='timed'){
        const score = left // 余时越多越好
        if(!best || score>best) setBest(score)
      }
    }
  },[done])

  // =============== 辅助功能 ===============
  function restart(){
    seedRef.current++;
    setSel([]);
    setSteps(0);
    setScore(0);
    setCombo(0);
  }
  function hint(){
    if(locked) return
    // 在未完成的牌中，找出一对相同的并短暂翻开
    const closed = state.map((c,idx)=>({c,idx})).filter(x=>!x.c.open && !x.c.done)
    if(closed.length < 2) return
    const map = new Map<string, number[]>()
    closed.forEach(x=>{ const arr = map.get(x.c.v) || []; arr.push(x.idx); map.set(x.c.v, arr) })
    const pair = Array.from(map.values()).find(arr=>arr.length >= 2)
    if(!pair) return
    const [a,b] = pair.slice(0,2)
    setState(st=> st.map((c,idx)=> (idx===a||idx===b)? {...c, open:true}: c))
    setLocked(true)
    setTimeout(()=>{ setState(st=> st.map((c,idx)=> (idx===a||idx===b)? {...c, open:false}: c)); setLocked(false) }, 800)
  }

  // =============== 样式（局部） ===============
  const columns = size===6? 'repeat(6,1fr)' : size===5? 'repeat(5,1fr)' : 'repeat(4,1fr)'
  const cardH = size===6? 78 : size===5? 90 : 98

  useEffect(()=>()=>{ if(comboTimerRef.current) clearTimeout(comboTimerRef.current) },[])

  return (
    <div className="container">
      {/* 局部样式 */}
      <style>{`
        .mem-grid{display:grid;gap:12px}
        .mem-card{height:${cardH}px;border-radius:16px;position:relative;cursor:pointer;perspective:600px}
        .mem-face{position:absolute;inset:0;border-radius:16px;display:flex;justify-content:center;align-items:center;font-size:40px;backface-visibility:hidden;transition:transform .28s ease, background .28s ease, box-shadow .28s ease}
        .mem-front{background:linear-gradient(180deg,#f8fafc,#e2e8f0);box-shadow:0 10px 20px rgba(2,6,23,.08)}
        .mem-back{background:linear-gradient(180deg,#fff,#f7fee7);transform:rotateY(180deg);box-shadow:0 10px 20px rgba(2,6,23,.08)}
        .mem-card.open .mem-front{transform:rotateY(180deg)}
        .mem-card.open .mem-back{transform:rotateY(360deg)}
        .mem-card.done .mem-back{background:linear-gradient(135deg,#86efac,#a7f3d0);box-shadow:0 12px 24px rgba(16,185,129,.25)}
        .mem-card:hover .mem-front{transform:translateY(-2px)}
        .badge.mild{background:#f1f5f9;color:#0f172a}

        .toolbar{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:14px;align-items:center}
        .toolbar .group{display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:rgba(15,23,42,.04);padding:8px 10px;border-radius:12px}
        .toolbar .actions{display:flex;gap:10px;justify-content:flex-end;align-items:center}
        .btn.sm{padding:6px 10px;font-size:14px;border-radius:10px}
        @media (max-width: 980px){
          .toolbar{grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}
        }
        @media (max-width: 640px){
          .toolbar{grid-template-columns:1fr;gap:10px}
          .toolbar .actions{justify-content:stretch}
        }
        .mem-link{position:absolute;height:4px;background:linear-gradient(90deg,#60a5fa,#34d399);border-radius:999px;box-shadow:0 0 12px rgba(56,189,248,.6);transform-origin:left center;pointer-events:none;opacity:.95}
        .mem-card.done .mem-back{outline:2px solid rgba(16,185,129,.5)}
        .shake{animation:shake .28s ease}
        @keyframes shake{10%{transform:translateX(-2px)}30%{transform:translateX(2px)}50%{transform:translateX(-2px)}70%{transform:translateX(2px)}100%{transform:translateX(0)}}
      `}</style>

      <h1>🃏 记忆翻牌 · 升级版</h1>
      <p className="desc">找出配对。支持 <b>尺寸/模式</b>（含 极限/连线记忆）、<b>提示</b>、<b>最佳记录</b>、<b>连击得分</b>。</p>

      <div className="card" style={{padding:16}}>
        {/* 顶部状态条 */}
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:12}}>
          <div className="badge">尺寸 {size} × {size===4?4:(size===5?5:6)}</div>
          <div className="badge">步数 {steps}</div>
          <div className="badge">得分 {score}</div>
          {combo > 0 && <div className="badge" style={{background:'#dbeafe',color:'#1e3a8a'}}>连击 x{combo}</div>}
          {mode!=='zen' && (
            mode==='classic' ? <div className="badge">用时 {time}s</div> : <div className="badge">倒计时 {left}s</div>
          )}
          {done && <div className="badge" style={{background:'#22c55e',color:'#052e16'}}>完成！</div>}
          <div className="badge mild">最佳 {best || '-'}{mode==='classic'?'步':'秒'}</div>
        </div>

        {/* 网格 + 连线层（相对定位容器） */}
        <div style={{position:'relative'}}>
          <div ref={gridRef} className="mem-grid" style={{gridTemplateColumns:columns}}>
            {state.map((c,i)=>{
              const open = c.open || c.done
              return (
                <div ref={el=>{ if(el) cardRefs.current[i]=el }} key={c.id} className={`mem-card ${open?'open':''} ${c.done?'done':''}`} onClick={()=>click(i)}>
                  <div className="mem-face mem-front">
                    {skin==='classic' && '❓'}
                    {skin==='emoji' && '🎴'}
                    {skin==='pattern' && <span style={{fontSize:20,opacity:.6}}>✦✦</span>}
                  </div>
                  <div className="mem-face mem-back">{c.v}</div>
                </div>
              )
            })}
          </div>
          {link && (
            <div className="mem-link" style={{position:'absolute', left:link.x, top:link.y, width:link.w, transform:`rotate(${link.angle}deg)`}}/>
          )}
        </div>

        {/* 控件 */}
        <div className="toolbar">
          <div className="group">
            <span style={{opacity:.75}}>尺寸：</span>
            <button className={`btn sm ${size===4?'primary':'ghost'}`} onClick={()=>setSize(4)} disabled={locked}>4×4</button>
            <button className={`btn sm ${size===5?'primary':'ghost'}`} onClick={()=>setSize(5)} disabled={locked}>4×5</button>
            <button className={`btn sm ${size===6?'primary':'ghost'}`} onClick={()=>setSize(6)} disabled={locked}>6×6</button>
          </div>

          <div className="group">
            <span style={{opacity:.75}}>模式：</span>
            <button className={`btn sm ${mode==='classic'?'primary':'ghost'}`} onClick={()=>setMode('classic')} disabled={locked}>经典</button>
            <button className={`btn sm ${mode==='timed'?'primary':'ghost'}`} onClick={()=>setMode('timed')} disabled={locked}>计时</button>
            <button className={`btn sm ${mode==='zen'?'primary':'ghost'}`} onClick={()=>setMode('zen')} disabled={locked}>禅</button>
            <button className={`btn sm ${mode==='extreme'?'primary':'ghost'}`} onClick={()=>setMode('extreme')} disabled={locked}>极限</button>
            <button className={`btn sm ${mode==='peek'?'primary':'ghost'}`} onClick={()=>setMode('peek')} disabled={locked}>连线记忆</button>
          </div>

          <div className="group">
            <span style={{opacity:.75}}>皮肤：</span>
            <button className={`btn sm ${skin==='classic'?'primary':'ghost'}`} onClick={()=>setSkin('classic')}>问号</button>
            <button className={`btn sm ${skin==='emoji'?'primary':'ghost'}`} onClick={()=>setSkin('emoji')}>纸牌</button>
            <button className={`btn sm ${skin==='pattern'?'primary':'ghost'}`} onClick={()=>setSkin('pattern')}>符号</button>
          </div>

          <div className="actions">
            <button className="btn sm" onClick={hint} disabled={locked}>提示</button>
            <button className="btn sm" onClick={restart}>重开</button>
            <a className="btn sm ghost" href="/">返回首页</a>
          </div>
        </div>
      </div>
    </div>
  )
}
