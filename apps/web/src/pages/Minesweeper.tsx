import React, {useEffect, useMemo, useRef, useState} from 'react'
import '../styles.css'

// 统一风格的扫雷（Minesweeper）
// - 尺寸预设：9x9(10雷) / 16x16(40雷) / 30x16(99雷)
// - 首次点安全、BFS 连开、右键/长按插旗、暂停/继续、胜负弹层
// - 自适应棋盘、与 Snake/2048 统一的标题/芯片/卡片/overlay 样式

type Cell = {
  mine: boolean
  adj: number
  revealed: boolean
  flagged: boolean
}

type Preset = { w:number, h:number, mines:number, label:string }

const PRESETS: Preset[] = [
  { w:9,  h:9,  mines:10, label:'9×9' },
  { w:16, h:16, mines:40, label:'16×16' },
  { w:30, h:16, mines:99, label:'30×16' },
]

function inBounds(x:number,y:number,w:number,h:number){ return x>=0 && y>=0 && x<w && y<h }
const dirs = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]

function buildEmpty(w:number,h:number): Cell[]{
  return Array.from({length: w*h}, ()=>({mine:false,adj:0,revealed:false,flagged:false}))
}
function idx(x:number,y:number,w:number){ return y*w + x }
function forEachNeighbor(x:number,y:number,w:number,h:number,fn:(nx:number,ny:number)=>void){
  for(const [dx,dy] of dirs){ const nx=x+dx, ny=y+dy; if(inBounds(nx,ny,w,h)) fn(nx,ny) }
}

export default function Minesweeper(){
  const [presetIndex, setPresetIndex] = useState(0)
  const {w,h,mines} = PRESETS[presetIndex]
  const [board, setBoard] = useState<Cell[]>(()=>buildEmpty(w,h))
  const [started, setStarted] = useState(false)
  const [paused, setPaused] = useState(false)
  const [over, setOver] = useState(false)
  const [won, setWon] = useState(false)
  const [flags, setFlags] = useState(0)
  const [time, setTime] = useState(0)
  const timerRef = useRef<number| null>(null)
  const bumpRef = useRef(false)
  // 闯关模式（Campaign）
  const [campaignOn, setCampaignOn] = useState(false)
  const [level, setLevel] = useState(1) // 1-based
  const LEVELS_TOTAL = 10
// 不同尺寸一组固定关卡种子（示例占位）
  const CAMPAIGN_SEEDS: Record<string,string[]> = {
    '9x9-10': ['9A1','9A2','9A3','9A4','9A5','9A6','9A7','9A8','9A9','9A10'],
    '16x16-40': ['16B1','16B2','16B3','16B4','16B5','16B6','16B7','16B8','16B9','16B10'],
    '30x16-99': ['30C1','30C2','30C3','30C4','30C5','30C6','30C7','30C8','30C9','30C10'],
  }
  function keyForPreset(){ return `${w}x${h}-${mines}` }
  function currentCampaignSeed(){
    const arr = CAMPAIGN_SEEDS[keyForPreset()] || []
    return arr[(Math.max(1, Math.min(level, LEVELS_TOTAL)) - 1)] || `${w}x${h}-${mines}-L${level}`
  }

  // === SFX (soft, non-harsh) ===
  const [sfxOn, setSfxOn] = useState(true)
  const acRef = useRef<any>(null)
  const masterRef = useRef<GainNode | null>(null)
  function ensureAC(){
    if(!acRef.current){
      const AC:any = (window as any).AudioContext || (window as any).webkitAudioContext
      if(!AC) return null
      const ac = new AC()
      acRef.current = ac
      const g = ac.createGain()
      g.gain.value = 0.22
      g.connect(ac.destination)
      masterRef.current = g
    }
    return acRef.current
  }
  async function sfxResume(){ try{ const ac = ensureAC(); if(ac && ac.state==='suspended'){ await ac.resume() } }catch{} }
  function tone(freq:number, dur:number, type:OscillatorType='sine', vol=1, startAt?:number){
    if(!sfxOn) return; const ac = ensureAC(); if(!ac || !masterRef.current) return; const t0 = startAt ?? ac.currentTime; const o = ac.createOscillator(); const g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t0); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.6*vol, t0+0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0+dur); o.connect(g); g.connect(masterRef.current as GainNode); o.start(t0); o.stop(t0+dur) }
  function sfxOpen(adj:number){ // open cell
    if(adj<=0) tone(520, .10, 'sine', .9); else tone(440+adj*30, .06, 'sine', .7)
  }
  function sfxFlag(add:boolean){ tone(add?760:360, .07, 'triangle', .6) }
  function sfxBoom(){ tone(200, .12, 'sawtooth', .5); tone(90, .18, 'sine', .4) }
  function sfxWin(){ const ac = ensureAC(); if(!ac) return; const t = ac.currentTime; tone(660,.10,'sine',.8,t); tone(880,.12,'sine',.8,t+.11); tone(990,.16,'sine',.8,t+.24) }

  // 新玩法开关
  const [chordOn, setChordOn] = useState(true)          // 快开（Chord）
  const [limitFlagsOn, setLimitFlagsOn] = useState(false) // 限旗模式
  const [dailyOn, setDailyOn] = useState(false)          // 每日挑战（seed）
  const [seed, setSeed] = useState('')

  // 限旗上限（例如比雷数少 2）
  const maxFlags = useMemo(()=> limitFlagsOn ? Math.max(1, mines - 2) : Number.POSITIVE_INFINITY, [limitFlagsOn, mines])

  // 基于种子的随机数（每日挑战）
  const rngRef = useRef<(()=>number) | null>(null)
  function hashString(s:string){
    let h = 2166136261 >>> 0
    for(let i=0;i<s.length;i++){
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return h >>> 0
  }
  function mulberry32(a:number){
    return function(){
      let t = a += 0x6D2B79F5
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  // 当每日挑战开关或尺寸变化，重置 seed 与 RNG
// 当每日挑战/闯关或尺寸变化，重置 seed 与 RNG
  useEffect(()=>{
    if(dailyOn){
      const s = new Date().toISOString().slice(0,10) // YYYY-MM-DD
      setSeed(s)
      const a = hashString(`${s}|${w}x${h}|${mines}`)
      rngRef.current = mulberry32(a)
    } else if (campaignOn) {
      const s = currentCampaignSeed()
      setSeed(s)
      const a = hashString(`${s}|${w}x${h}|${mines}`)
      rngRef.current = mulberry32(a)
    } else {
      setSeed('')
      rngRef.current = null
    }
  }, [dailyOn, campaignOn, level, w, h, mines])

  useEffect(()=>{ // 切换尺寸时重置
    setLevel(1)
    reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetIndex])

  useEffect(()=>{ // 计时器
    if (!started || paused || over) return
    timerRef.current = window.setInterval(()=> setTime(t=>t+1), 1000)
    return ()=>{ if(timerRef.current) clearInterval(timerRef.current) }
  }, [started, paused, over])

  function reset(){
    if(timerRef.current) clearInterval(timerRef.current)
    setBoard(buildEmpty(w,h))
    setStarted(false); setPaused(false); setOver(false); setWon(false)
    setFlags(0); setTime(0)
  }

  function generateMines(safeX:number, safeY:number){
    const cells = buildEmpty(w,h)
    const rnd = rngRef.current ? rngRef.current : Math.random
    let m = mines
    while(m>0){
      const x = Math.floor(rnd()*w)
      const y = Math.floor(rnd()*h)
      if ((x===safeX && y===safeY) || cells[idx(x,y,w)].mine) continue
      cells[idx(x,y,w)].mine = true
      m--
    }
    // 计算 adj
    for(let yy=0;yy<h;yy++) for(let xx=0;xx<w;xx++){
      const c = cells[idx(xx,yy,w)]; if(c.mine){ c.adj = -1; continue }
      let a=0; forEachNeighbor(xx,yy,w,h,(nx,ny)=>{ if(cells[idx(nx,ny,w)].mine) a++ }); c.adj=a
    }
    return cells
  }

  function revealWith(cells: Cell[], x:number, y:number){
    const c = cells[idx(x,y,w)]
    if(c.revealed || c.flagged) return { cells, hitMine:false }
    c.revealed = true
    if(c.mine){ return { cells, hitMine:true } }
    if(c.adj===0){
      const q:[[number,number]] = [[x,y]] as any
      while(q.length){
        const [cx,cy] = q.shift()!
        forEachNeighbor(cx,cy,w,h,(nx,ny)=>{
          const n = cells[idx(nx,ny,w)]
          if(!n.revealed && !n.flagged && !n.mine){
            n.revealed = true
            if(n.adj===0) q.push([nx,ny] as any)
          }
        })
      }
    }
    return { cells, hitMine:false }
  }

  function onCellClick(x:number,y:number){
    if (over || paused) return
    sfxResume()

    // 快开（Chord）：点击已翻开数字，若周围旗子数等于该数字，则自动开邻格
    if (chordOn && started) {
      const center = board[idx(x,y,w)]
      if (center && center.revealed && center.adj > 0) {
        let f = 0
        forEachNeighbor(x,y,w,h,(nx,ny)=>{ if(board[idx(nx,ny,w)].flagged) f++ })
        if (f === center.adj) {
          const cells = board.slice()
          let chordHit = false
          forEachNeighbor(x,y,w,h,(nx,ny)=>{
            const n = cells[idx(nx,ny,w)]
            if (!n.flagged && !n.revealed) {
              const { hitMine } = revealWith(cells, nx, ny)
              if (hitMine) chordHit = true
            }
          })
          if (chordHit) {
            sfxBoom()
            // 显示所有雷 & 标注错旗
            for (let i = 0; i < cells.length; i++) {
              if (cells[i].mine) cells[i].revealed = true
              if (cells[i].flagged && !cells[i].mine) {
                cells[i].revealed = true
                ;(cells[i] as any).wrongFlag = true
              }
            }
            setBoard(cells)
            setOver(true)
            return
          }
          sfxOpen(center.adj)
          setBoard(cells)
          // 结算检查
          const totalSafe = w*h - mines
          const opened = cells.filter(c=>c.revealed && !c.mine).length
          if (opened >= totalSafe) {
            sfxWin()
            setWon(true); setOver(true);
            if (campaignOn) {
              const prev = localStorage.getItem(bestKey)
              if (!prev || time < Number(prev)) {
                localStorage.setItem(bestKey, String(time))
                setBestTime(time)
              }
            }
          }
          return
        }
      }
    }

    if(!started){
      const cells = generateMines(x,y)
      const {cells: after, hitMine} = revealWith(cells, x, y)
      setBoard(after)
      setStarted(true)
      sfxOpen(after[idx(x,y,w)].adj)
      // 胜利判定
      const totalSafe = w*h - mines
      const opened = after.filter(c=>c.revealed && !c.mine).length
      if(opened>=totalSafe){
        sfxWin()
        setWon(true); setOver(true)
        if (campaignOn) {
          const prev = localStorage.getItem(bestKey)
          if (!prev || time < Number(prev)) {
            localStorage.setItem(bestKey, String(time))
            setBestTime(time)
          }
        }
      }
      return
    }
    const snapshot = board.slice()
    const {cells: after, hitMine} = revealWith(snapshot, x, y)
    setBoard(after)
    if (!hitMine) {
      sfxOpen(after[idx(x,y,w)].adj)
    }
    if (hitMine) {
      sfxBoom()
      const cells = after.slice()
      // 显示所有雷 & 标注错旗
      for (let i = 0; i < cells.length; i++) {
        if (cells[i].mine) cells[i].revealed = true
        if (cells[i].flagged && !cells[i].mine) {
          cells[i].revealed = true
          ;(cells[i] as any).wrongFlag = true
        }
      }
      setBoard(cells)
      setOver(true)
      return
    }
    const totalSafe = w*h - mines
    const opened = after.filter(c=>c.revealed && !c.mine).length
    if(opened>=totalSafe){
      sfxWin()
      setWon(true); setOver(true)
      if (campaignOn) {
        const prev = localStorage.getItem(bestKey)
        if (!prev || time < Number(prev)) {
          localStorage.setItem(bestKey, String(time))
          setBestTime(time)
        }
      }
    }
  }

  function toggleFlag(x:number,y:number){
    if (over || paused) return
    if(!started){ // 首次也允许插旗，不生成雷
      setStarted(true)
    }
    const cells = board.slice()
    const c = cells[idx(x,y,w)]
    if(c.revealed) return
    // 限旗：达到上限则不再允许新增旗子
    if (!c.flagged && flags >= maxFlags) {
      return
    }
    sfxResume()
    c.flagged = !c.flagged
    sfxFlag(c.flagged)
    setBoard(cells)
    setFlags(f=> f + (c.flagged? 1 : -1))
  }

  // 触摸长按插旗
  const touchTimer = useRef<number|null>(null)
  function onTouchStart(x:number,y:number){
    if (over || paused) return
    sfxResume()
    touchTimer.current = window.setTimeout(()=>{
      toggleFlag(x,y)
      touchTimer.current = null
    }, 350)
  }
  function onTouchEnd(x:number,y:number){
    if (over || paused) return
    if (touchTimer.current){ // 视为点击
      clearTimeout(touchTimer.current); touchTimer.current = null
      onCellClick(x,y)
    }
  }

  const remaining = useMemo(()=> (w*h - mines) - board.filter(c=>c.revealed && !c.mine).length, [board,w,h,mines])
// 评分阈值与勋章
  function thresholds(){
    if (w===9 && h===9) return {S:35, A:60, B:120}
    if (w===16 && h===16) return {S:120, A:180, B:300}
    return {S:300, A:480, B:900}
  }
  function medalFor(t:number){
    const th = thresholds()
    if (t<=th.S) return 'S'
    if (t<=th.A) return 'A'
    if (t<=th.B) return 'B'
    return 'C'
  }
  const bestKey = useMemo(()=> `ms_best_${w}x${h}_${mines}_L${level}`,[w,h,mines,level])
  const [bestTime, setBestTime] = useState<number | null>(null)
  useEffect(()=>{ const v = localStorage.getItem(bestKey); setBestTime(v? Number(v): null) }, [bestKey])
  // 统一：棋盘像素大小（根据容器自适应）
  const maxPx = useMemo(()=>{
    if (typeof window !== 'undefined' && window.innerWidth < 480) return 360
    // 根据格子数量自适应最大宽度
    if (w <= 9) return 360
    if (w <= 16) return 640
    return 940
  },[w])

  return (
      <div className="page-wrap">
        <div className="shell">
          <header className="page-header compact">
            <h1 className="title">💣 扫雷 · 升级版</h1>
            <p className="subtitle">统一 UI · 首点安全 · 右键/长按插旗 · BFS 连开 · 暂停/继续。</p>

            <div className="modes">
              <span className="sec-title" style={{marginRight: 6}}>难度</span>
              {PRESETS.map((p, i) => (
                  <button key={i} className={`mode-btn ${i === presetIndex ? 'on' : ''}`}
                          onClick={() => setPresetIndex(i)}>{p.label}</button>
              ))}
              <button className="mode-btn" onClick={() => setPaused(p => !p)}>{paused ? '继续' : '暂停'}</button>
              <button className="mode-btn" onClick={reset}>重开</button>
              <button className={`mode-btn ${chordOn ? 'on' : ''}`} onClick={() => setChordOn(v => !v)}>快开</button>
              <button className={`mode-btn ${limitFlagsOn ? 'on' : ''}`} onClick={() => setLimitFlagsOn(v => !v)}>限旗
              </button>
              <button className={`mode-btn ${dailyOn ? 'on' : ''}`} onClick={() => {
                setDailyOn(v => !v);
                setCampaignOn(false);
              }}>每日挑战
              </button>
              <button className={`mode-btn ${campaignOn ? 'on' : ''}`} onClick={() => {
                setCampaignOn(v => !v);
                setDailyOn(false);
              }}>闯关
              </button>
              <button className={`mode-btn ${sfxOn ? 'on' : ''}`} onClick={()=>{ setSfxOn(v=>!v); sfxResume() }}>音效：{sfxOn? '开':'关'}</button>
            </div>

            <div className="stats unified">
              <div className="chip"><div className="label">用时</div><div className="value">{time}s</div></div>
              <div className="chip"><div className="label">总雷</div><div className="value">{mines}</div></div>
              <div className="chip"><div className="label">已插旗</div><div className="value">{flags}</div></div>
              <div className="chip"><div className="label">剩余安全格</div><div className="value">{remaining}</div></div>
              {limitFlagsOn && (<div className="chip"><div className="label">旗子上限</div><div className="value">{Number.isFinite(maxFlags)? maxFlags: '∞'}</div></div>)}
              {dailyOn && (<div className="chip"><div className="label">挑战种子</div><div className="value">{seed || '-'}</div></div>)}
              {campaignOn && (<>
                <div className="chip"><div className="label">关卡</div><div className="value">{level}/{LEVELS_TOTAL}</div></div>
                <div className="chip"><div className="label">种子</div><div className="value">{seed}</div></div>
              </>)}
            </div>
            {campaignOn && (
                <div className="modes">
                  <span className="sec-title" style={{marginRight:6}}>闯关</span>
                  <button className="mode-btn" onClick={()=>{ setLevel(l=> Math.max(1, l-1)); reset(); }}>上一关</button>
                  <button className="mode-btn" onClick={()=>{ setLevel(l=> Math.min(LEVELS_TOTAL, l+1)); reset(); }}>下一关</button>
                  <button className="mode-btn" onClick={()=>{ reset(); }}>重置当前关</button>
                </div>
            )}
          </header>

          <div className={`board-card ${bumpRef.current? 'bump':''}`} style={{maxWidth:'100%', width:'100%', margin:'0 auto'}}>
            <div
                className="ms-grid"
                style={{
                  gridTemplateColumns: `repeat(${w},1fr)`,
                  width: '100%',
                  maxWidth: `${maxPx}px`,
                  aspectRatio: `${w}/${h}`,
                  margin: '0 auto',
                }}
            >
              {board.map((c, i) => {
                const x = i % w, y = Math.floor(i / w)
                const key = i
                let cls = 'cell'
                if (c.revealed) cls += ' open'
                if (c.revealed && !c.mine && c.adj > 0) cls += ` n${c.adj}`
                if (c.flagged) cls += ' flag'
                let label = ''
                if (c.flagged && !c.revealed) {
                  label = '🚩'
                } else if (c.revealed) {
                  if ((c as any).wrongFlag) label = '❌'
                  else if (c.mine) label = '💣'
                  else if (c.adj > 0) label = String(c.adj)
                }
                return (
                    <button
                        key={key}
                        className={cls}
                        onClick={() => onCellClick(x, y)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          toggleFlag(x, y)
                        }}
                        onTouchStart={() => onTouchStart(x, y)}
                        onTouchEnd={() => onTouchEnd(x, y)}
                    >{label}</button>
                )
              })}
            </div>

            {paused && !over && (
                <div className="overlay">
                  <div className="panel">
                    <div className="result-title">⏸ 暂停中</div>
                    <div className="result-sub">点击继续或按空格继续游戏</div>
                    <div className="overlay-actions">
                      <button className="btn primary" onClick={()=> setPaused(false)}>继续</button>
                      <a className="btn secondary" href="/">返回首页</a>
                    </div>
                  </div>
                </div>
            )}

            {over && (
                <div className="overlay"><div className="panel">
                  <div className="result-title">{won? '🎉 通关！':'💥 游戏结束'}</div>
                  <div className="result-sub">用时 {time}s · 总雷 {mines} · 已插旗 {flags}</div>
                  {won && campaignOn && (
                      <div style={{margin:'6px 0 10px', fontWeight:800}}>
                        评分：<span>{medalFor(time)}</span>{bestTime!=null && (<span style={{marginLeft:8}}>最佳：{bestTime}s</span>)}
                      </div>
                  )}
                  <div className="overlay-actions">
                    {won && campaignOn && <button className="btn secondary" onClick={()=>{ setLevel(l=> Math.min(LEVELS_TOTAL, l+1)); reset(); }}>下一关 ▶</button>}
                    <button className="btn primary" onClick={reset}>再来一局</button>
                    <a className="btn secondary" href="/">返回首页</a>
                  </div>
                </div></div>
            )}
          </div>

          <div className="bottom-bar">
            <div className="actions">
              <button className="btn primary" onClick={reset}>再来一局</button>
              <a className="btn secondary" href="/">返回首页</a>
              <button className="btn secondary" onClick={()=>{ setSfxOn(v=>!v); sfxResume() }}>音效：{sfxOn? '开':'关'}</button>
            </div>
            <p className="help">操作：左键开格 / 右键插旗（移动端长按）；空格暂停。</p>
          </div>
        </div>

        <style>{`
        .page-wrap{ min-height:100vh; display:flex; align-items:flex-start; justify-content:center; padding:16px 24px 24px; background:radial-gradient(1000px 600px at 20% 0%,#eef2f7,#e2e8f0); }
        .shell{ width:min(100%,980px); display:grid; grid-template-columns: 1fr; gap:16px; }
        .page-header.compact{ width:100%; margin:0 0 10px; }
        .page-header .title{ font-size:clamp(24px,3.2vw,34px); margin:0; letter-spacing:.2px; }
        .page-header .subtitle{ font-size:14px; color:#475569; margin:6px 0 10px; }
        .modes{ display:flex; gap:8px; margin:6px 0 8px; flex-wrap:wrap; }
        .mode-btn{ appearance:none; border:1px solid #e2e8f0; background:#fff; border-radius:10px; padding:8px 10px; font-weight:700; cursor:pointer; }
        .mode-btn.on{ background:#0ea5e9; color:#062a37; border-color:#0ea5e9; box-shadow: 0 6px 14px rgba(14,165,233,.25); }
        .mode-btn:hover{ background:#f8fafc; }
        .mode-btn:active{ transform:translateY(1px); }
        .sec-title{ font-size:12px; font-weight:800; color:#0f172a; }

        .board-card{ background: linear-gradient(135deg,#e2e8f0,#cbd5e1); border-radius: 18px; box-shadow: 0 14px 28px rgba(2,6,23,.12); padding: 16px; position:relative; overflow:hidden; width:100%; }
        .board-card::before{ content:""; position:absolute; inset:10px; border-radius:14px; box-shadow: inset 0 0 0 1px #d1d9e6, inset 0 -30px 60px rgba(2,6,23,.05); pointer-events:none; }

        .ms-grid{ display:grid; gap:6px; background:linear-gradient(135deg,#e7ecf3,#d9e1ea); border-radius:14px; padding:12px; box-shadow: inset 0 0 0 1px #b6c3d1; }
        .cell{ appearance:none; border:none; display:flex; align-items:center; justify-content:center; border-radius:6px; font-weight:800; font-size:clamp(14px, 1.6vw, 20px); min-width:22px; min-height:22px; background:#94a3b8; color:#f8fafc; box-shadow: inset 0 0 0 1px rgba(0,0,0,.08); cursor:pointer; }
        .cell.open{ background:#ffffff; color:#0f172a; box-shadow: inset 0 0 0 1px #cbd5e1; }
        .cell.flag{ background:#0ea5e9; color:#062a37; }
        .cell.open:empty{ background:#f3f6fb; }
        .cell.open{ transition: transform .08s ease; }
        .cell.open:active{ transform: translateY(1px); }
        .cell:hover{ filter:brightness(1.05); }
        .cell:focus-visible{ outline:2px solid #10b981; outline-offset:2px; }

        .stats{ display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin:10px 0 14px; }
        .chip{ flex:0 0 auto; min-width:140px; background:#b6c3d1; color:#0b1220; border-radius:12px; padding:10px 12px; box-shadow: inset 0 -2px 0 rgba(255,255,255,.04); }
        .chip .label{ font-size:12px; opacity:.8; }
        .chip .value{ font-size:20px; font-weight:800; line-height:1.1; }

        .actions{ display:flex; gap:12px; margin:8px 0 10px; }
        .btn{ appearance:none; border:none; border-radius:10px; padding:10px 14px; font-weight:700; cursor:pointer; }
        .btn.primary{ background:#10b981; color:#053a2b; box-shadow: 0 6px 14px rgba(16,185,129,.28); }
        .btn.secondary{ background:#ffffff; color:#0f172a; border:1px solid #e2e8f0; }

        .help{ color:#64748b; font-size:12px; margin-top:6px; text-align:center; }
        .bottom-bar{ background: linear-gradient(135deg,#ffffff,#f8fafc); border:1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; display:flex; align-items:center; justify-content:space-between; box-shadow: 0 12px 26px rgba(2,6,23,.10); }
        @media (max-width: 640px){ .bottom-bar{ flex-direction:column; gap:8px; align-items:stretch; text-align:center; } .bottom-bar .actions{ justify-content:center; } }

        .overlay{
          position:absolute; inset:0;
          /* 降低遮罩不透明度，便于看清背后的盘面 */
          background:rgba(15,23,42,.22);
          display:flex; align-items:center; justify-content:center;
          border-radius:16px;
          backdrop-filter:saturate(120%) blur(1.2px);
          /* 让遮罩本身不吃点击，只有面板可点击 */
          pointer-events:none;
        }
        .panel{
          background:linear-gradient(135deg, rgba(255,255,255,.92), rgba(248,250,252,.90));
          border:1px solid rgba(226,232,240,.9);
          border-radius:14px; padding:16px;
          width:min(92%, 360px); text-align:center;
          box-shadow:0 20px 40px rgba(2,6,23,.25);
          /* 面板可正常点击 */
          pointer-events:auto;
        }
        .result-title{ font-size:20px; font-weight:800; color:#0f172a; margin-bottom:6px; }
        .result-sub{ color:#475569; font-size:13px; margin-bottom:12px; }
        .overlay-actions{ display:flex; gap:10px; justify-content:center; }
      `}</style>
      </div>
  )
}
