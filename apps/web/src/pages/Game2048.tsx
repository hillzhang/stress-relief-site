import React, { useEffect, useMemo, useState } from 'react'
import '../styles.css'

type Board = number[][]

type Mode = 'classic' | 'timed' | 'hard' | 'size5' | 'step'

function emptyBoard(n: number): Board {
  return Array.from({ length: n }, () => Array(n).fill(0))
}

function addRandomTile(board: Board, hard: boolean): Board {
  const empties: [number, number][] = []
  const n = board.length
  board.forEach((row, r) => row.forEach((v, c) => { if (v === 0) empties.push([r, c]) }))
  if (empties.length === 0) return board
  const [r, c] = empties[Math.floor(Math.random() * empties.length)]
  // hard 模式：降低 2 的概率，提高 4/8 的概率
  const roll = Math.random()
  let val = 2
  if (hard) {
    if (roll < 0.5) val = 4
    else if (roll < 0.6) val = 8
    else val = 2
  } else {
    val = roll < 0.9 ? 2 : 4
  }
  board[r][c] = val
  return board
}

function initBoard(n: number, hard: boolean): Board {
  let b = emptyBoard(n)
  b = addRandomTile(b, hard)
  b = addRandomTile(b, hard)
  return b
}

function slide(row: number[], n: number): [number[], boolean, number] {
  const vals = row.filter(v => v)
  const res: number[] = []
  let moved = false
  let gained = 0
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] === vals[i + 1]) {
      const merged = vals[i] * 2
      res.push(merged)
      gained += merged
      i++
      moved = true
    } else {
      res.push(vals[i])
    }
  }
  while (res.length < n) res.push(0)
  if (!moved) moved = res.some((v, i) => v !== row[i])
  return [res, moved, gained]
}

function moveLeft(board: Board): [Board, boolean, number] {
  const n = board.length
  let moved = false
  let gained = 0
  const nb = board.map(row => {
    const [r, m, g] = slide(row, n)
    if (m) moved = true
    gained += g
    return r
  })
  return [nb, moved, gained]
}

function moveRight(board: Board): [Board, boolean, number] {
  const n = board.length
  let moved = false
  let gained = 0
  const nb = board.map(row => {
    const [r, m, g] = slide([...row].reverse(), n)
    if (m) moved = true
    gained += g
    return r.reverse()
  })
  return [nb, moved, gained]
}

function transpose(b: Board): Board {
  return b[0].map((_, c) => b.map(row => row[c]))
}

function moveUp(board: Board): [Board, boolean, number] {
  const [nb, moved, gained] = moveLeft(transpose(board))
  return [transpose(nb), moved, gained]
}

function moveDown(board: Board): [Board, boolean, number] {
  const [nb, moved, gained] = moveRight(transpose(board))
  return [transpose(nb), moved, gained]
}

function hasMoves(b: Board): boolean {
  const n = b.length
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (b[r][c] === 0) return true
      if (c < n - 1 && b[r][c] === b[r][c + 1]) return true
      if (r < n - 1 && b[r][c] === b[r + 1][c]) return true
    }
  }
  return false
}

export default function Game2048(){
  const [mode, setMode] = useState<Mode>('classic')
  const boardSize = mode === 'size5' ? 5 : 4
  const hard = mode === 'hard'
  const timed = mode === 'timed'
  const stepLimited = mode === 'step'
  const STEP_LIMIT = 100

  const [board, setBoard] = useState<Board>(() => initBoard(boardSize, hard))
  const [score, setScore] = useState(0)
  const [best, setBest] = useState<number>(() => Number(localStorage.getItem('best2048')||0))
  const [steps, setSteps] = useState(0)
  const [soundOn, setSoundOn] = useState(true)
  const [timeLeft, setTimeLeft] = useState<number>(timed ? 150 : 0)

  // 当模式改变时，重置棋盘
  useEffect(() => {
    setBoard(initBoard(boardSize, hard))
    setScore(0)
    setSteps(0)
    setTimeLeft(timed ? 150 : 0)
  }, [mode])

  useEffect(()=>{ if(score > best){ setBest(score); localStorage.setItem('best2048', String(score)) } }, [score, best])

  // 键盘控制（计时结束时禁用）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return
      if (timed && timeLeft <= 0) return
      if (stepLimited && steps >= STEP_LIMIT) return
      e.preventDefault()
      setBoard(prev => {
        let nb: Board = prev
        let moved = false
        let gained = 0
        if (e.key === 'ArrowLeft') [nb, moved, gained] = moveLeft(prev)
        if (e.key === 'ArrowRight') [nb, moved, gained] = moveRight(prev)
        if (e.key === 'ArrowUp') [nb, moved, gained] = moveUp(prev)
        if (e.key === 'ArrowDown') [nb, moved, gained] = moveDown(prev)
        if (moved) {
          setScore(s=> s + gained)
          setSteps(s=> s + 1)
          nb = addRandomTile(nb, hard)
        }
        return nb.map(row => [...row])
      })
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [hard, timed, timeLeft, stepLimited, steps])

  // 计时器
  useEffect(() => {
    if (!timed) return
    if (timeLeft <= 0) return
    const id = window.setInterval(() => setTimeLeft(t => t - 1), 1000)
    return () => window.clearInterval(id)
  }, [timed, timeLeft])

  const resetGame = () => {
    setBoard(initBoard(boardSize, hard))
    setScore(0)
    setSteps(0)
    setTimeLeft(timed ? 150 : 0)
  }

  const over = useMemo(() => !hasMoves(board), [board])
  const mmss = (s: number) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`

  return (
    <>
      <div className="page-wrap">
        <div className="shell">
          <div className="left">
            <header className="page-header compact">
              <h1 className="title">🔢 2048 · 升级版</h1>
              <p className="subtitle">统一 UI / 支持多种玩法：经典、限时、困难、限步、5×5。</p>

              {/* 模式切换 */}
              <div className="modes">
                <button className={`mode-btn ${mode==='classic'?'on':''}`} onClick={()=>setMode('classic')}>经典</button>
                <button className={`mode-btn ${mode==='timed'?'on':''}`} onClick={()=>setMode('timed')}>限时150s</button>
                <button className={`mode-btn ${mode==='hard'?'on':''}`} onClick={()=>setMode('hard')}>困难</button>
                <button className={`mode-btn ${mode==='step'?'on':''}`} onClick={()=>setMode('step')}>限步100</button>
                <button className={`mode-btn ${mode==='size5'?'on':''}`} onClick={()=>setMode('size5')}>5×5</button>
              </div>

              <div className="stats unified">
                <div className="chip"><div className="label">分数</div><div className="value">{score}</div></div>
                <div className="chip"><div className="label">最高分</div><div className="value">{best}</div></div>
                <div className="chip"><div className="label">步数</div><div className="value">{steps}</div></div>
                {timed && (
                  <div className={`chip ${timeLeft<=0?'danger':''}`}>
                    <div className="label">倒计时</div><div className="value">{mmss(Math.max(0,timeLeft))}</div>
                  </div>
                )}
                {stepLimited && (
                  <div className={`chip ${steps>=STEP_LIMIT?'danger':''}`}>
                    <div className="label">剩余步数</div><div className="value">{Math.max(0, STEP_LIMIT - steps)}</div>
                  </div>
                )}
                <button className={`btn icon`} aria-label="切换音效" onClick={()=>setSoundOn(s=>!s)}>
                  {soundOn ? '🔊 音效开' : '🔈 音效关'}
                </button>
              </div>
            </header>

            <div id="board-wrap" className="board-card">
              <div className="grid" style={{
                gridTemplateColumns: `repeat(${boardSize}, var(--cell))`,
                gridTemplateRows: `repeat(${boardSize}, var(--cell))`,
              }}>
                {board.map((row, r) => row.map((v, c) => (
                  <div key={`${r}-${c}`} className={`tile n${v}`}>{v || ''}</div>
                )))}
              </div>
              {(timed && timeLeft<=0) && (
                <div className="overlay">
                  <div className="panel">
                    <div className="result-title">⏱ 时间到！</div>
                    <div className="result-sub">本局分数 {score} · 步数 {steps}</div>
                    <div className="overlay-actions">
                      <button className="btn primary" onClick={resetGame}>再来一局</button>
                    </div>
                  </div>
                </div>
              )}
              {(stepLimited && steps >= STEP_LIMIT) && (
                <div className="overlay">
                  <div className="panel">
                    <div className="result-title">🏁 步数用尽！</div>
                    <div className="result-sub">本局分数 {score} · 总步数 {steps}</div>
                    <div className="overlay-actions">
                      <button className="btn primary" onClick={resetGame}>再来一局</button>
                    </div>
                  </div>
                </div>
              )}
              {(!timed && over) && (
                <div className="overlay">
                  <div className="panel">
                    <div className="result-title">😵 已无可移动步数</div>
                    <div className="result-sub">本局分数 {score} · 步数 {steps}</div>
                    <div className="overlay-actions">
                      <button className="btn primary" onClick={resetGame}>再来一局</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bottom-bar">
            <div className="actions">
              <button className="btn primary" onClick={resetGame}>再来一局</button>
              <a className="btn secondary" href="/">返回首页</a>
            </div>
            <p className="help">操作：← → 上下移动 · 合并相同数字 · 每步后生成一个新方块。</p>
          </div>
        </div>
      </div>

      <style>{`
        .page-wrap{ min-height:100vh; display:flex; align-items:flex-start; justify-content:center; padding:16px 24px 24px; background:radial-gradient(1000px 600px at 20% 0%,#f8fafc,#eef2f7); }
        .page-header{ width:min(100%,980px); margin:0 auto 14px; text-align:left; }
        .page-header.compact{ width:100%; margin:0 0 10px; }
        .page-header .title{ font-size:clamp(22px,3.2vw,32px); margin:0; }
        .page-header .subtitle{ font-size:14px; color:#475569; margin:6px 0 10px; }
        .shell{ width: min(100%, 980px); display:grid; grid-template-columns: 1fr; gap: 16px; align-items:start; }

        .modes{ display:flex; gap:8px; margin:6px 0 8px; flex-wrap:wrap; }
        .mode-btn{ appearance:none; border:1px solid #e2e8f0; background:#fff; border-radius:10px; padding:8px 10px; font-weight:700; cursor:pointer; }
        .mode-btn.on{ background:#0ea5e9; color:#062a37; border-color:#0ea5e9; box-shadow: 0 6px 14px rgba(14,165,233,.25); }

        .board-card{ --cell: clamp(62px, 12vw, 88px); --gap: clamp(8px, 2vw, 12px); background: linear-gradient(135deg,#ffffff,#f1f5f9); border-radius: 16px; box-shadow: 0 10px 24px rgba(2,6,23,.12); padding: clamp(14px, 2.6vw, 20px); position:relative; }
        .grid{ display:grid; gap: var(--gap); justify-content:center; }
        .tile{ background:#e5e7eb; border-radius:10px; font-weight:800; font-size:clamp(1.2rem, 2.8vw, 1.6rem); display:flex; align-items:center; justify-content:center; color:#334155; user-select:none; transition: transform .09s ease, background-color .25s ease, color .25s ease; }
        .tile:not(.n0){ box-shadow: inset 0 1px 0 rgba(255,255,255,.6), inset 0 -4px 12px rgba(0,0,0,.08); }
        .tile.n0{ background:#e2e8f0; color:transparent; }
        .tile.n2{ background:#f1f5f9; color:#334155; }
        .tile.n4{ background:#e2e8f0; color:#334155; }
        .tile.n8{ background:#f6cf8d; color:#1f2937; }
        .tile.n16{ background:#f4b78a; color:#1f2937; }
        .tile.n32{ background:#f39a87; color:#1f2937; }
        .tile.n64{ background:#ef7d67; color:#fff; }
        .tile.n128{ background:#eac65c; color:#fff; font-size:1.3rem; }
        .tile.n256{ background:#e6b94f; color:#fff; font-size:1.3rem; }
        .tile.n512{ background:#e1ab43; color:#fff; font-size:1.3rem; }
        .tile.n1024{ background:#dda536; color:#fff; font-size:1.1rem; }
        .tile.n2048{ background:#d49a2a; color:#fff; font-size:1.1rem; }

        .title{ margin:0 0 6px; font-size:28px; font-weight:800; color:#0f172a; }
        .subtitle{ margin:0 0 12px; color:#475569; font-size:14px; }
        .stats{ display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin:10px 0 14px; }
        .chip{ flex:0 0 auto; min-width:160px; background:#0f172a; color:#e2e8f0; border-radius:12px; padding:10px 12px; box-shadow: inset 0 -2px 0 rgba(255,255,255,.06); }
        .chip.danger{ background:#dc2626; }
        .chip .label{ font-size:12px; opacity:.8; }
        .chip .value{ font-size:20px; font-weight:800; line-height:1.1; }
        .btn.icon{ background:#6366f1; color:#fff; border:none; border-radius:12px; padding:10px 12px; font-weight:700; box-shadow: 0 6px 14px rgba(99,102,241,.25); }
        .btn.icon.off{ opacity:.85 }
        .actions{ display:flex; gap:12px; margin:8px 0 10px; }
        .btn{ appearance:none; border:none; border-radius:10px; padding:10px 14px; font-weight:700; cursor:pointer; }
        .btn.primary{ background:#10b981; color:#053a2b; box-shadow: 0 6px 14px rgba(16,185,129,.28); }
        .btn.primary:hover{ filter:brightness(1.06); }
        .btn.secondary{ background:#ffffff; color:#0f172a; border:1px solid #e2e8f0; }
        .btn.secondary:hover{ background:#f8fafc; }
        .help{ color:#64748b; font-size:12px; margin-top:6px; text-align:center; }
        .bottom-bar{ background: linear-gradient(135deg,#ffffff,#f8fafc); border:1px solid #e2e8f0; border-radius: 14px; padding: 12px 14px; display:flex; align-items:center; justify-content:space-between; box-shadow: 0 10px 24px rgba(2,6,23,.08); }
        @media (max-width: 640px){ .bottom-bar{ flex-direction:column; gap:8px; align-items:stretch; text-align:center; } .bottom-bar .actions{ justify-content:center; } }

        .overlay{ position:absolute; inset:0; background:rgba(15,23,42,.55); display:flex; align-items:center; justify-content:center; border-radius:16px; backdrop-filter:saturate(140%) blur(2px); }
        .panel{ background:linear-gradient(135deg,#ffffff,#f8fafc); border:1px solid #e2e8f0; border-radius:14px; padding:16px; width:min(92%, 360px); text-align:center; box-shadow:0 20px 40px rgba(2,6,23,.25); }
        .result-title{ font-size:20px; font-weight:800; color:#0f172a; margin-bottom:6px; }
        .result-sub{ color:#475569; font-size:13px; margin-bottom:12px; }
        .overlay-actions{ display:flex; gap:10px; justify-content:center; }
      `}</style>
    </>
  )
}