import React, { useEffect, useMemo, useState } from 'react'
import '../styles.css'

type Cell = 0 | 1 | 2 // 0 empty, 1 black, 2 white
 type Board = Cell[][]
 type Pos = { r: number; c: number }
 type Move = Pos & { flips: Pos[] }

const SIZE = 8
const DIRS: Pos[] = [
  { r: -1, c: 0 },
  { r: 1, c: 0 },
  { r: 0, c: -1 },
  { r: 0, c: 1 },
  { r: -1, c: -1 },
  { r: -1, c: 1 },
  { r: 1, c: -1 },
  { r: 1, c: 1 },
]

function makeBoard(): Board {
  const b: Board = Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(0))
  b[3][3] = 2; b[3][4] = 1; b[4][3] = 1; b[4][4] = 2
  return b
}

const inBounds = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE

function clone(b: Board): Board { return b.map(row => row.slice() as Cell[]) as Board }

function opponent(p: Cell): Cell { return p === 1 ? 2 : 1 }

function collectFlips(b: Board, r: number, c: number, who: Cell): Pos[] {
  if (b[r][c] !== 0) return []
  const opp = opponent(who)
  const flips: Pos[] = []
  for (const d of DIRS) {
    let rr = r + d.r, cc = c + d.c
    const line: Pos[] = []
    while (inBounds(rr, cc) && b[rr][cc] === opp) { line.push({ r: rr, c: cc }); rr += d.r; cc += d.c }
    if (line.length && inBounds(rr, cc) && b[rr][cc] === who) flips.push(...line)
  }
  return flips
}

function legalMoves(b: Board, who: Cell): Move[] {
  const ms: Move[] = []
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const flips = collectFlips(b, r, c, who)
    if (flips.length) ms.push({ r, c, flips })
  }
  return ms
}

function applyMove(b: Board, m: Move, who: Cell): Board {
  const nb = clone(b)
  nb[m.r][m.c] = who
  for (const f of m.flips) nb[f.r][f.c] = who
  return nb
}

function scoreOf(b: Board) { let black = 0, white = 0; for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++){ if (b[r][c]===1) black++; else if (b[r][c]===2) white++; } return { black, white } }

function gameOver(b: Board): boolean { return legalMoves(b, 1).length === 0 && legalMoves(b, 2).length === 0 }

// ===== Heuristic & AI =====
const CORNERS: Pos[] = [{r:0,c:0},{r:0,c:7},{r:7,c:0},{r:7,c:7}]
const BAD_X: Pos[] = [{r:1,c:1},{r:1,c:6},{r:6,c:1},{r:6,c:6}] // 角旁“X位”

function isSame(a: Pos, b: Pos){ return a.r===b.r && a.c===b.c }

function evaluate(b: Board, me: Cell): number {
  const opp = opponent(me)
  const { black, white } = scoreOf(b)
  const diff = (me===1?black:white) - (me===1?white:black)
  const myMoves = legalMoves(b, me).length
  const oppMoves = legalMoves(b, opp).length
  let cornerScore = 0, badX = 0
  for (const p of CORNERS){ const v = b[p.r][p.c]; if (v===me) cornerScore += 25; else if (v===opp) cornerScore -= 25 }
  for (const p of BAD_X){ const v = b[p.r][p.c]; if (v===me) badX -= 12; else if (v===opp) badX += 12 }
  return diff * 1 + (myMoves - oppMoves) * 3 + cornerScore + badX
}

type AIMode = 'easy'|'normal'|'strong'

function pickMoveEasy(b: Board, me: Cell): Move | null {
  const moves = legalMoves(b, me)
  if (!moves.length) return null
  // 20% 故意不选最佳，随机；否则角>多翻子>随机
  if (Math.random()<0.2) return moves[Math.floor(Math.random()*moves.length)]
  const corner = moves.find(m => CORNERS.some(c => isSame(c, m)))
  if (corner) return corner
  moves.sort((a,b2)=> b2.flips.length - a.flips.length)
  return moves[0]
}

function pickMoveNormal(b: Board, me: Cell): Move | null {
  const moves = legalMoves(b, me)
  if (!moves.length) return null
  // 角优先 → 评估函数
  const corner = moves.find(m => CORNERS.some(c => isSame(c, m)))
  if (corner) return corner
  let best: Move | null = null, bestV = -Infinity
  for (const m of moves){ const v = evaluate(applyMove(b, m, me), me); if (v>bestV){ bestV=v; best=m } }
  return best
}

function pickMoveStrong(b: Board, me: Cell): Move | null {
  const opp = opponent(me)
  const moves = legalMoves(b, me)
  if (!moves.length) return null
  // 角立即取
  const corner = moves.find(m => CORNERS.some(c => isSame(c, m)))
  if (corner) return corner
  // Negamax + alpha-beta, depth=3
  function negamax(board: Board, player: Cell, depth: number, alpha: number, beta: number): number {
    if (depth===0 || gameOver(board)) return evaluate(board, me)
    const ms = legalMoves(board, player)
    if (!ms.length){
      // 对手是否也无棋？若是，终局
      if (!legalMoves(board, opponent(player)).length) return evaluate(board, me)
      return -negamax(board, opponent(player), depth-1, -beta, -alpha)
    }
    // move ordering：角 > 评估高
    ms.sort((a,b2)=>{
      const ac = CORNERS.some(c=>isSame(c,a)) ? 1 : 0
      const bc = CORNERS.some(c=>isSame(c,b2)) ? 1 : 0
      if (ac!==bc) return bc-ac
      const va = evaluate(applyMove(board,a,player), me)
      const vb = evaluate(applyMove(board,b2,player), me)
      return vb - va
    })
    let best = -Infinity
    for (const m of ms){
      const nb = applyMove(board, m, player)
      const val = -negamax(nb, opponent(player), depth-1, -beta, -alpha)
      if (val>best) best=val
      if (best>alpha) alpha=best
      if (alpha>=beta) break // beta cut
    }
    return best
  }
  let best: Move | null = null, bestV = -Infinity
  for (const m of moves){
    const nb = applyMove(b, m, me)
    const v = -negamax(nb, opp, 3, -Infinity, Infinity)
    if (v>bestV){ bestV=v; best=m }
  }
  return best
}

function computeAIMove(b: Board, me: Cell, level: AIMode): Move | null {
  if (level==='easy') return pickMoveEasy(b, me)
  if (level==='normal') return pickMoveNormal(b, me)
  return pickMoveStrong(b, me)
}

export default function Reversi(){
  const [board, setBoard] = useState<Board>(()=> makeBoard())
  const [turn, setTurn] = useState<Cell>(1) // 黑先
  const [moves, setMoves] = useState<{board:Board; turn:Cell; last?:Pos}[]>([])
  const [last, setLast] = useState<Pos | undefined>(undefined)
  const [vsAI, setVsAI] = useState(false)
  const [aiColor, setAiColor] = useState<Cell>(2) // 默认电脑执白
  const [aiLevel, setAiLevel] = useState<AIMode>('normal')
  const [showHints, setShowHints] = useState(true)
  const [theme, setTheme] = useState<'light'|'warm'|'mint'|'grape'|'deep'>('light')

  const valid = useMemo(()=>{
    const list = legalMoves(board, turn)
    const map = new Map<string, Move>()
    for (const m of list){ map.set(`${m.r}-${m.c}`, m) }
    return map
  }, [board, turn])

  const score = useMemo(()=> scoreOf(board), [board])
  const over = useMemo(()=> gameOver(board), [board])

  const place = (r:number, c:number) => {
    if (over) return
    const key = `${r}-${c}`
    const mv = valid.get(key)
    if (!mv) return
    setMoves(m=>[...m, { board: clone(board), turn, last: {r,c} }])
    const nb = applyMove(board, mv, turn)
    const nextTurn = opponent(turn)
    const theirMoves = legalMoves(nb, nextTurn)
    if (theirMoves.length===0 && legalMoves(nb, turn).length===0){ // 无子双方 -> 直接结束
      setBoard(nb); setLast({r,c}); setTurn(nextTurn)
      return
    }
    if (theirMoves.length===0){ // 对手无棋，跳过
      setBoard(nb); setLast({r,c}); setTurn(turn)
      return
    }
    setBoard(nb); setLast({r,c}); setTurn(nextTurn)
  }

  const undo = () => {
    if (!moves.length) return
    const prev = moves[moves.length-1]
    setBoard(prev.board); setTurn(prev.turn); setLast(prev.last)
    setMoves(m=> m.slice(0, -1))
  }

  const restart = () => { setBoard(makeBoard()); setTurn(1); setMoves([]); setLast(undefined) }

  // AI 回合
  useEffect(()=>{
    if (!vsAI) return
    if (over) return
    if (turn !== aiColor) return
    const id = setTimeout(()=>{
      const mv = computeAIMove(board, aiColor, aiLevel)
      if (mv) place(mv.r, mv.c)
      else {
        // AI 无棋可下，自动跳过
        const next = opponent(turn)
        setTurn(next)
      }
    }, 160)
    return ()=> clearTimeout(id)
  }, [board, turn, vsAI, aiColor, aiLevel, over])

  // 若 AI 执先，开局自动落子
  useEffect(()=>{
    if (!vsAI) return
    const empty = score.black + score.white === 4 // 初始
    if (empty && aiColor===1 && turn===1) {
      const mv = computeAIMove(board, aiColor, aiLevel)
      if (mv) place(mv.r, mv.c)
    }
  }, [vsAI, aiColor])

  useEffect(()=>{
    const onKey = (e: KeyboardEvent)=>{
      const k = e.key.toLowerCase()
      if (k==='r'){ e.preventDefault(); restart(); return }
      if (k==='z' || e.key==='Backspace'){ e.preventDefault(); undo(); return }
      if (k==='h'){ e.preventDefault(); setShowHints(s=>!s); return }
      if (k==='a'){ e.preventDefault(); setVsAI(v=>!v); return }
      if (k==='1'){ setAiLevel('easy'); return }
      if (k==='2'){ setAiLevel('normal'); return }
      if (k==='3'){ setAiLevel('strong'); return }
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  }, [])

  const cellSize = 'clamp(56px, 11.5vw, 92px)'

  return (
    <>
      <div className="page-wrap">
        <div className="shell">
          <div className="left">
            <header className="page-header compact">
              <h1 className="title">⚪⚫ 黑白棋 · Reversi</h1>
              <p className="subtitle">黑先；可悔棋/重开；支持人机对战（可选简单/普通/加强）。</p>

              <div className="stats unified">
                <div className="chip"><div className="label">回合</div><div className="value">{turn===1? '● 黑子':'○ 白子'}</div></div>
                <div className="chip"><div className="label">黑子</div><div className="value">{score.black}</div></div>
                <div className="chip"><div className="label">白子</div><div className="value">{score.white}</div></div>
                <button className="btn icon" onClick={undo}>↩️ 悔棋</button>
                <button className="btn icon" onClick={restart}>🔄 重开</button>
                <button className="btn secondary" onClick={()=> setVsAI(v=>!v)}>{vsAI ? '🤖 人机：开' : '🤖 人机：关'}</button>
                <button className="btn secondary" onClick={()=> setAiColor(c=> c===1?2:1)} disabled={moves.length>0}>电脑执{aiColor===1?'黑':'白'}</button>
                <button className="btn secondary" onClick={()=> setAiLevel(l=> l==='easy' ? 'normal' : l==='normal' ? 'strong' : 'easy')}>思考强度：{aiLevel==='easy'?'简单': aiLevel==='normal'?'普通':'加强'}</button>
                <button className="btn secondary" onClick={()=> setShowHints(s=>!s)}>{showHints?'隐藏提示':'显示提示'}</button>
                <div className="skin-picker" aria-label="主题皮肤">
                  <button className={`swatch ${theme==='light'?'on':''}`} title="清爽" onClick={()=>setTheme('light')}><span/></button>
                  <button className={`swatch ${theme==='warm'?'on':''}`} title="暖阳" onClick={()=>setTheme('warm')}><span/></button>
                  <button className={`swatch ${theme==='mint'?'on':''}`} title="薄荷" onClick={()=>setTheme('mint')}><span/></button>
                  <button className={`swatch ${theme==='grape'?'on':''}`} title="葡萄" onClick={()=>setTheme('grape')}><span/></button>
                  <button className={`swatch ${theme==='deep'?'on':''}`} title="深色" onClick={()=>setTheme('deep')}><span/></button>
                </div>
              </div>
            </header>

            <div id="board-wrap" className={`board-card center theme-${theme}`}>
              <div
                className="rev-grid"
                style={{
                  display:'grid',
                  gridTemplateColumns: `repeat(${SIZE}, ${cellSize})`,
                  gridTemplateRows: `repeat(${SIZE}, ${cellSize})`,
                  gap: 'clamp(8px, 2vw, 14px)',
                  justifyContent: 'center',
                  margin: '0 auto'
                }}
              >
                {Array.from({length: SIZE*SIZE}).map((_, idx)=>{
                  const r = Math.floor(idx / SIZE), c = idx % SIZE
                  const v = board[r][c]
                  const k = `${r}-${c}`
                  const mv = valid.get(k)
                  const isLast = last && last.r===r && last.c===c
                  return (
                    <button key={k} className={`rev-cell ${v===1?'black': v===2?'white':'empty'}`} onClick={()=> place(r,c)} aria-label={`cell-${k}`}>
                      {/* 提示点 */}
                      {showHints && !v && mv && <span className="hint"/>}
                      {/* 棋子 */}
                      {v!==0 && (
                        <span className={`disc ${v===1?'disc-black':'disc-white'} ${isLast?'last':''}`}/>
                      )}
                    </button>
                  )
                })}
              </div>

              {over && (
                <div className="overlay">
                  <div className="panel">
                    <div className="result-title">
                      {score.black===score.white ? '🤝 平局' : score.black>score.white ? '🎉 黑子胜' : '🎉 白子胜'}
                    </div>
                    <div className="result-sub">黑 {score.black} · 白 {score.white}</div>
                    <div className="overlay-actions">
                      <button className="btn primary" onClick={restart}>再来一局</button>
                      <a className="btn secondary" href="/">返回首页</a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bottom-bar">
            <div className="actions">
              <button className="btn primary" onClick={restart}>再来一局</button>
              <a className="btn secondary" href="/">返回首页</a>
            </div>
            <p className="help">操作：点击格子落子；↩ 悔棋；R 重开；人机可切先手与强度；可显示/隐藏落子提示。</p>
          </div>
        </div>
      </div>

      <style>{`
        /* --- Unified fallback styles to keep page consistent even without global CSS --- */
        .board-card.center{ margin: 0 auto; }
        .btn{ appearance:none; border:none; border-radius:10px; padding:10px 14px; font-weight:700; cursor:pointer; }
        .btn.primary{ background:#10b981; color:#053a2b; box-shadow: 0 6px 14px rgba(16,185,129,.28); }
        .btn.primary:hover{ filter:brightness(1.06); }
        .btn.secondary{ background:#ffffff; color:#0f172a; border:1px solid #e2e8f0; border-radius:10px; padding:10px 14px; font-weight:700; }
        .btn.secondary:hover{ background:#f8fafc; }
        .bottom-bar{ background: linear-gradient(135deg,#ffffff,#f8fafc); border:1px solid #e2e8f0; border-radius: 14px; padding: 12px 14px; display:flex; align-items:center; justify-content:space-between; box-shadow: 0 10px 24px rgba(2,6,23,.08); margin-top: 14px; }
        @media (max-width: 640px){ .bottom-bar{ flex-direction:column; gap:8px; align-items:stretch; text-align:center; } .bottom-bar .actions{ justify-content:center; } }

        /* Center the whole page content on Reversi page */
        .page-wrap{ display:flex; align-items:flex-start; justify-content:center; padding:16px 24px; }
        .page-wrap .shell{ width:min(100%, 980px); margin:0 auto; }

        /* Unified header/typography like other games */
        .page-header{ width:min(100%,980px); margin:0 auto 14px; text-align:left; }
        .page-header.compact{ width:100%; margin:0 0 10px; }
        .page-header .title{ font-size:clamp(22px,3.2vw,32px); margin:0; font-weight:800; color:#0f172a; }
        .page-header .subtitle{ font-size:14px; color:#475569; margin:6px 0 10px; }

        /* Board card visual unify */
        .board-card{ --cell: clamp(62px, 12vw, 88px); --gap: clamp(8px, 2vw, 12px);
          /* default (light) theme variables only affect the game area */
          --card-bg:#fbfcfe; --card-border:#e6ecf2; --cell-bg:#f7f9fc; --cell-border:#dbe2ea; --accent:#0ea5e9;
          background: var(--card-bg); border-radius: 16px; box-shadow: 0 8px 20px rgba(2,6,23,.08); padding: clamp(18px, 3vw, 28px); position:relative; border:1px solid var(--card-border); }
        .board-card.theme-warm{ --card-bg:#fffaf2; --card-border:#f5d7a6; --cell-bg:#fff3e0; --cell-border:#f0cea1; --accent:#f59e0b; }
        .board-card.theme-mint{ --card-bg:#f2fdff; --card-border:#bfeaf0; --cell-bg:#ebfbff; --cell-border:#b7e5ec; --accent:#06b6d4; }
        .board-card.theme-grape{ --card-bg:#fbf7ff; --card-border:#e6d7f5; --cell-bg:#f6efff; --cell-border:#e0d7f7; --accent:#8b5cf6; }
        .board-card.theme-light{ /* explicit light class if ever needed */ --card-bg:#fbfcfe; --card-border:#e6ecf2; --cell-bg:#f7f9fc; --cell-border:#dbe2ea; --accent:#0ea5e9; }
        .board-card.theme-deep{ --card-bg:#0b2d3b; --card-border:#134254; --cell-bg:#0e3647; --cell-border:#1c4b5f; --accent:#22d3ee; }

        /* Buttons inside stats row spacing */
        .stats.unified{ gap:12px; }
        .stats.unified .btn{ margin-left:0; }

        /* Responsive chip shrink on small screens */
        @media (max-width: 640px){
          .chip{ min-width:120px; }
        }

        /* Help text */
        .help{ color:#64748b; font-size:12px; margin-top:6px; text-align:center; }

        #board-wrap.board-card.center{ display:flex; align-items:center; justify-content:center; padding: clamp(16px, 2.6vw, 24px); }
        .rev-grid{ margin: 0 auto; }
        .stats.unified{ display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
        .chip{ flex:0 0 auto; min-width:140px; background:#0f172a; color:#e2e8f0; border-radius:12px; padding:10px 12px; box-shadow: inset 0 -2px 0 rgba(255,255,255,.06); }
        .chip .label{ font-size:12px; opacity:.8; }
        .chip .value{ font-size:20px; font-weight:800; line-height:1.1; }
        .btn.icon{ background:#6366f1; color:#fff; border:none; border-radius:12px; padding:10px 12px; font-weight:700; box-shadow: 0 6px 14px rgba(99,102,241,.25); }
        /* 棋盘格与棋子视觉，统一站点风格 */
        .rev-cell{ position:relative; padding:0; box-sizing:border-box; aspect-ratio:1/1; border-radius:12px; background:var(--cell-bg); border:1px solid var(--cell-border); box-shadow: 0 6px 14px rgba(2,6,23,.06), inset 0 -2px 4px rgba(2,6,23,.03); display:flex; align-items:center; justify-content:center; cursor:pointer; }
        .rev-cell.empty:hover{ background:#f2f6fb; }
        .disc{ width:74%; aspect-ratio:1/1; height:auto; border-radius:50%; display:block; box-shadow: inset 0 1px 3px rgba(0,0,0,.18), inset 0 -2px 3px rgba(255,255,255,.22); }
        .disc-black{ background:radial-gradient(circle at 42% 38%, #222c3a, #0b1220 62%); border:1px solid #0e1826; }
        .disc-white{ background:radial-gradient(circle at 45% 35%, #ffffff 0%, #f2f5fa 58%, #d6dee9 90%); border:1px solid #b7c2d0; box-shadow: 0 0 0 1px #a6b3c2 inset, inset 0 1px 2px rgba(0,0,0,.12), inset 0 -2px 2px rgba(255,255,255,.26); }
        .disc.last{ outline:3px solid var(--accent); outline-offset:3px; box-shadow:none; }
        .hint{ position:absolute; width:16%; height:16%; border-radius:50%; background:var(--accent); opacity:.18; box-shadow:none; }
        .skin-picker{ display:flex; gap:8px; align-items:center; margin-left:6px; }
        .skin-picker .swatch{ width:34px; height:34px; border-radius:10px; border:1px solid rgba(15,23,42,.08); background:#fff; padding:0; display:flex; align-items:center; justify-content:center; cursor:pointer; }
        .skin-picker .swatch span{ width:22px; height:22px; border-radius:6px; display:block; }
        .theme-light .skin-picker .swatch[title='清爽'] span{ background:linear-gradient(135deg,#f8fafc,#eef2f7); }
        .theme-warm .skin-picker .swatch[title='暖阳'] span, .skin-picker .swatch[title='暖阳'] span{ background:linear-gradient(135deg,#fff7ed,#fde68a); }
        .theme-mint .skin-picker .swatch[title='薄荷'] span, .skin-picker .swatch[title='薄荷'] span{ background:linear-gradient(135deg,#ecfeff,#cffafe); }
        .theme-grape .skin-picker .swatch[title='葡萄'] span, .skin-picker .swatch[title='葡萄'] span{ background:linear-gradient(135deg,#ede9fe,#ddd6fe); }
        .theme-deep .skin-picker .swatch[title='深色'] span, .skin-picker .swatch[title='深色'] span{ background:linear-gradient(135deg,#0b2d3b,#0e3647); }
        .skin-picker .swatch.on{ box-shadow: 0 0 0 2px #0ea5e9 inset; }
      `}</style>
    </>
  )
}

