import React, { useEffect, useMemo, useState } from 'react'
import '../styles.css'

/** 中国象棋 / Xiangqi (PvP) — unified site style */

type Color = 'r'|'b'
// Piece types: K General, A Advisor, E Elephant, H Horse, R Rook, C Cannon, S Soldier
export type PieceType = 'K'|'A'|'E'|'H'|'R'|'C'|'S'
export type Piece = { c: Color; t: PieceType }
export type Cell = Piece | null
export type Board = Cell[][] // 10 rows x 9 cols

const ROWS = 10, COLS = 9

const RED: Color = 'r', BLACK: Color = 'b'

function clone(b: Board): Board { return b.map(row => row.slice()) }

function startBoard(): Board {
  // Red at bottom (rows 9..0)
  const e: Board = Array.from({length: ROWS}, () => Array<Cell>(COLS).fill(null))
  const place = (r:number, c:number, t:PieceType, clr:Color) => { e[r][c] = { c: clr, t } }
  // Black (top)
  place(0,0,'R',BLACK); place(0,8,'R',BLACK)
  place(0,1,'H',BLACK); place(0,7,'H',BLACK)
  place(0,2,'E',BLACK); place(0,6,'E',BLACK)
  place(0,3,'A',BLACK); place(0,5,'A',BLACK)
  place(0,4,'K',BLACK)
  place(2,1,'C',BLACK); place(2,7,'C',BLACK)
  place(3,0,'S',BLACK); place(3,2,'S',BLACK); place(3,4,'S',BLACK); place(3,6,'S',BLACK); place(3,8,'S',BLACK)
  // Red (bottom)
  place(9,0,'R',RED); place(9,8,'R',RED)
  place(9,1,'H',RED); place(9,7,'H',RED)
  place(9,2,'E',RED); place(9,6,'E',RED)
  place(9,3,'A',RED); place(9,5,'A',RED)
  place(9,4,'K',RED)
  place(7,1,'C',RED); place(7,7,'C',RED)
  place(6,0,'S',RED); place(6,2,'S',RED); place(6,4,'S',RED); place(6,6,'S',RED); place(6,8,'S',RED)
  return e
}

function inPalace(r:number, c:number, col:Color){
  if (col===RED) return r>=7 && r<=9 && c>=3 && c<=5
  return r>=0 && r<=2 && c>=3 && c<=5
}

const riverRowTop = 4 // between 4 and 5 (0-index)

function sameColor(a:Cell, b:Cell){ return !!a && !!b && a.c===b.c }

function lineClear(b:Board, r:number, c:number, rr:number, cc:number){
  const dr = Math.sign(rr-r), dc = Math.sign(cc-c)
  let i=r+dr, j=c+dc, cnt=0
  while (i!==rr || j!==cc){ if (b[i][j]) cnt++; i+=dr; j+=dc }
  return cnt
}

function generalFacing(b:Board): boolean {
  // true if generals face each other (illegal position)
  let rRed=-1, rBlk=-1
  for (let r=0;r<ROWS;r++){ if (b[r][4]?.t==='K'){ if (b[r][4]?.c===RED) rRed=r; else rBlk=r } }
  if (rRed<0 || rBlk<0) return false
  const min = Math.min(rRed, rBlk), max = Math.max(rRed, rBlk)
  for (let r=min+1;r<max;r++){ if (b[r][4]) return false }
  return true
}

function posEquals(a:[number,number], b:[number,number]){ return a[0]===b[0] && a[1]===b[1] }

function isOnBoard(r:number, c:number){ return r>=0 && r<ROWS && c>=0 && c<COLS }

function kingPos(b:Board, col:Color): [number,number] {
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) if (b[r][c]?.t==='K' && b[r][c]?.c===col) return [r,c]
  return [-1,-1]
}

function attacks(b:Board, fromR:number, fromC:number, toR:number, toC:number): boolean {
  const p = b[fromR][fromC]; if (!p) return false
  const dr = toR-fromR, dc = toC-fromC
  const adR = Math.abs(dr), adC = Math.abs(dc)
  switch(p.t){
    case 'K':
      if (!inPalace(toR,toC,p.c)) return false
      return (adR+adC===1)
    case 'A':
      if (!inPalace(toR,toC,p.c)) return false
      return (adR===1 && adC===1)
    case 'E': {
      // elephant cannot cross river
      if (p.c===RED && toR<5) return false
      if (p.c===BLACK && toR>4) return false
      if (!(adR===2 && adC===2)) return false
      const eyeR = fromR + dr/2, eyeC = fromC + dc/2
      return !b[eyeR][eyeC]
    }
    case 'H': {
      if (!((adR===2 && adC===1) || (adR===1 && adC===2))) return false
      // horse leg
      const blockR = fromR + (dr===0 ? 0 : (dr>0?1:-1)) * (adR===2?1:0)
      const blockC = fromC + (dc===0 ? 0 : (dc>0?1:-1)) * (adC===2?1:0)
      const leg = adR===2 ? [fromR + (dr>0?1:-1), fromC] : [fromR, fromC + (dc>0?1:-1)]
      return !b[leg[0]][leg[1]]
    }
    case 'R': {
      if (!(dr===0 || dc===0)) return false
      return lineClear(b, fromR, fromC, toR, toC)===0
    }
    case 'C': {
      if (!(dr===0 || dc===0)) return false
      const cnt = lineClear(b, fromR, fromC, toR, toC)
      if (b[toR][toC]) return cnt===1 // capture requires exactly one screen
      return cnt===0 // quiet move needs 0
    }
    case 'S': {
      const forward = (p.c===RED? -1 : 1) // board index 0 at top, so RED moves up (-1)
      if (dc===0 && dr===forward) return true
      // after crossing river can move sideways
      const crossed = (p.c===RED ? fromR<=riverRowTop : fromR>=riverRowTop+1)
      if (crossed && adR===0 && adC===1) return true
      return false
    }
  }
}

function isLegalMove(b:Board, from:[number,number], to:[number,number], col:Color): boolean {
  const [fr,fc]=from, [tr,tc]=to
  if (!isOnBoard(tr,tc)) return false
  const p = b[fr][fc]; if (!p || p.c!==col) return false
  const dst = b[tr][tc]; if (dst && dst.c===col) return false
  // piece rule
  if (!attacks(b, fr, fc, tr, tc)) return false
  // simulate and check for checks & facing generals
  const nb = clone(b); nb[tr][tc]=p; nb[fr][fc]=null
  if (generalFacing(nb)) return false
  // cannot leave own king in check
  const [kr,kc] = kingPos(nb, col)
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++){
    const q = nb[r][c]
    if (q && q.c!==col){ if (attacks(nb, r, c, kr, kc)) return false }
  }
  return true
}

function hasAnyLegal(b:Board, col:Color): boolean {
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) if (b[r][c]?.c===col){
    for (let rr=0;rr<ROWS;rr++) for (let cc=0;cc<COLS;cc++) if (isLegalMove(b,[r,c],[rr,cc],col)) return true
  }
  return false
}

function glyph(p:Piece): string {
  if (p.c===RED){
    switch(p.t){
      case 'K': return '帥'; case 'A': return '仕'; case 'E': return '相';
      case 'H': return '馬'; case 'R': return '車'; case 'C': return '炮'; case 'S': return '兵'
    }
  } else {
    switch(p.t){
      case 'K': return '將'; case 'A': return '士'; case 'E': return '象';
      case 'H': return '馬'; case 'R': return '車'; case 'C': return '砲'; case 'S': return '卒'
    }
  }
}

export default function ChineseChess(){
  const [board, setBoard] = useState<Board>(()=> startBoard())
  const [turn, setTurn] = useState<Color>(RED) // 红先
  const [sel, setSel] = useState<[number,number] | null>(null)
  const [legalTargets, setLegalTargets] = useState<string[]>([])
  const [moves, setMoves] = useState<{board:Board; turn:Color}[]>([])
  const [flip, setFlip] = useState(false)
  const [aiOn, setAiOn] = useState(false)
  const [aiColor, setAiColor] = useState<Color>(BLACK) // which side the AI plays
  type AILvl = 'easy'|'normal'|'hard'
  const [aiLevel, setAiLevel] = useState<AILvl>('normal')

  // recompute legals when selection changes
  useEffect(()=>{
    if (!sel){ setLegalTargets([]); return }
    const [r,c]=sel
    const p = board[r][c]; if (!p || p.c!==turn){ setLegalTargets([]); return }
    const ls: string[] = []
    for (let rr=0;rr<ROWS;rr++) for (let cc=0;cc<COLS;cc++) if (isLegalMove(board,[r,c],[rr,cc],turn)) ls.push(`${rr}-${cc}`)
    setLegalTargets(ls)
  }, [sel, board, turn])

  const overInfo = useMemo(()=>{
    // check if current side has any legal move; if no -> they are checkmated/stalemate
    if (hasAnyLegal(board, turn)) return null
    // side to move has no legal moves, determine check
    const [kr,kc]=kingPos(board, turn)
    let inCheck=false
    for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++){
      const q = board[r][c]
      if (q && q.c!==turn){ if (attacks(board, r, c, kr, kc)) inCheck=true }
    }
    return { winner: (turn===RED?BLACK:RED), check: inCheck }
  }, [board, turn])

  const selectOrMove = (r:number, c:number)=>{
    if (aiOn && turn === aiColor) return
    const rcKey = `${r}-${c}`
    if (sel && legalTargets.includes(rcKey)){
      // move
      const [sr,sc] = sel
      const p = board[sr][sc]!
      const nb = clone(board); nb[r][c]=p; nb[sr][sc]=null
      setMoves(m=>[...m, { board: clone(board), turn }])
      setBoard(nb); setTurn(turn===RED?BLACK:RED); setSel(null); setLegalTargets([])
      return
    }
    // select if own piece, else clear
    if (board[r][c] && board[r][c]!.c===turn){ setSel([r,c]) }
    else { setSel(null); setLegalTargets([]) }
  }

  const undo = ()=>{ if (!moves.length) return; const last = moves[moves.length-1]; setBoard(last.board); setTurn(last.turn); setSel(null); setLegalTargets([]); setMoves(m=>m.slice(0,-1)) }
  const restart = ()=>{ setBoard(startBoard()); setTurn(RED); setSel(null); setLegalTargets([]); setMoves([]) }

  const renderOrder = (r:number, c:number)=>{ return flip ? [ROWS-1-r, COLS-1-c] : [r,c] }

  // AI move effect
  useEffect(()=>{
    if (!aiOn || turn !== aiColor || overInfo) return
    setSel(null); setLegalTargets([])
    const id = setTimeout(()=>{
      const mv = pickAIMove(board, aiColor, aiLevel)
      if (!mv) return
      const nb = applyMove(board, mv)
      setMoves(m=>[...m, { board: clone(board), turn }])
      setBoard(nb); setTurn(turn===RED?BLACK:RED)
    }, 380)
    return ()=> clearTimeout(id)
  }, [board, turn, aiOn, aiColor, aiLevel, overInfo])

  const cellSize = 'clamp(54px, 7.2vw, 74px)'

  return (
    <>
      <div className="page-wrap">
        <div className="shell center-layout">
          <div className="left">
            <header className="page-header compact">
              <h1 className="title">♟️ 中国象棋 · Chinese Chess</h1>
              <p className="subtitle">红先；支持悔棋/重开/翻转；内置行棋规则、宫/河限制、将军与“照面”判定。</p>

              <div className="stats unified">
                <div className="chip"><div className="label">回合</div><div className="value">{turn===RED ? '红方' : '黑方'}</div></div>
                <button className="btn secondary" onClick={()=> setAiOn(v=>!v)}>{aiOn? '电脑：开' : '电脑：关'}</button>
                <button className="btn secondary" onClick={()=> setAiColor(c=> c===RED?BLACK:RED)}>电脑执子：{aiColor===RED? '红' : '黑'}</button>
                <button className="btn secondary" onClick={()=> setAiLevel(l=> l==='easy'?'normal':(l==='normal'?'hard':'easy'))}>思考强度：{aiLevel==='easy'?'简单':aiLevel==='normal'?'普通':'加强'}</button>
                <button className="btn icon" onClick={undo}>↩️ 悔棋</button>
                <button className="btn icon" onClick={restart}>🔄 重开</button>
                <button className="btn secondary" onClick={()=> setFlip(f=>!f)}>{flip?'🔄 视角：黑方在下':'🔄 视角：红方在下'}</button>
              </div>
            </header>

            <div id="board-wrap" className="board-card center">
              {(() => {
                const gap = 'clamp(6px, 1.3vw, 10px)';
                return (
                  <div
                    className="xiangqi-grid"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${COLS}, var(--cell))`,
                      gridTemplateRows: `repeat(${ROWS}, var(--cell))`,
                      gap: 'var(--g)',
                      justifyContent: 'center',
                      alignContent: 'center',
                      maxWidth: '100%',
                      margin: '0 auto',
                      position: 'relative',
                      ['--g' as any]: gap,
                      ['--cell' as any]: cellSize,
                    }}
                  >
                    <div className="river-band" />
                    {Array.from({ length: ROWS * COLS }).map((_, idx) => {
                      const rr0 = Math.floor(idx / COLS), cc0 = idx % COLS
                      const [r, c] = renderOrder(rr0, cc0)
                      const p = board[r][c]
                      const key = `${r}-${c}`
                      const legal = legalTargets.includes(`${r}-${c}`)
                      const selected = sel && sel[0] === r && sel[1] === c
                      const isRiverRow = rr0 === riverRowTop || rr0 === riverRowTop + 1;
                      return (
                        <button
                          key={key}
                          className={`xq-cell${isRiverRow ? ' river' : ''}${selected ? ' sel' : ''}${p ? ' occupied' : ' empty'}${legal ? ' legal' : ''}`}
                          onClick={() => selectOrMove(r, c)}
                        >
                          {p && (
                            <span className={`stone ${p.c === 'r' ? 'red' : 'black'} t-${p.t}`}>{glyph(p)}</span>
                          )}
                          {!p && legal && <span className="hint" />}
                        </button>
                      )
                    })}
                  </div>
                )
              })()}

              {overInfo && (
                <div className="overlay">
                  <div className="panel">
                    <div className="result-title">{overInfo.check ? '将死' : '无子可走'}</div>
                    <div className="result-sub">{overInfo.winner===RED? '红方胜 🟥' : '黑方胜 ⬛️'}</div>
                    <div className="overlay-actions">
                      <button className="btn primary" onClick={restart}>再来一局</button>
                      <a className="btn secondary" href="/">返回首页</a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bottom-card">
            <div className="actions">
              <button className="btn primary" onClick={restart}>再来一局</button>
              <a className="btn secondary" href="/">返回首页</a>
            </div>
            <p className="help">操作：点击棋子→目标格；红先。悔棋 ↩；翻转视角按钮可切换红/黑在下； 电脑可切换先手/强度。</p>
          </div>
        </div>
      </div>

      <style>{`
        /* board & helpers (fallbacks in-page to ensure unified look) */
        #board-wrap.board-card.center {
          display:flex; 
          align-items:center; 
          justify-content:center; 
          padding: clamp(16px, 2.6vw, 24px);
          max-width: 100%;
          margin: 0 auto;
          width: min(100%, 980px);
          background: linear-gradient(135deg,#ffffff,#f8fafc);
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          box-shadow: 0 10px 24px rgba(2,6,23,.12);
        }
        .stats.unified{ display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
        .chip{ flex:0 0 auto; min-width:140px; background:#0f172a; color:#e2e8f0; border-radius:12px; padding:10px 12px; box-shadow: inset 0 -2px 0 rgba(255,255,255,.06); }
        .chip .label{ font-size:12px; opacity:.8; }
        .chip .value{ font-size:20px; font-weight:800; line-height:1.1; }
        .btn.icon{ background:#6366f1; color:#fff; border:none; border-radius:12px; padding:10px 12px; font-weight:700; box-shadow: 0 6px 14px rgba(99,102,241,.25); }

        .xiangqi-grid{
          position: relative;
          display: grid;
          justify-content: center;
          align-content: center;
          gap: var(--g);
          grid-template-columns: repeat(${COLS}, var(--cell));
          grid-template-rows: repeat(${ROWS}, var(--cell));
          max-width: 100%;
          margin: 0 auto;
        }
        .xq-cell{ position:relative; border-radius:12px; background:var(--cell-bg, #f7f9fc); border:1px solid var(--cell-border, #dbe2ea); box-shadow: 0 6px 14px rgba(2,6,23,.06), inset 0 -2px 4px rgba(2,6,23,.03); display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:1; }
        .xq-cell.sel{ outline:3px solid #0ea5e9; outline-offset:2px; }
        .xq-cell.legal.empty:hover{ background:#f2f6fb; }
        .hint{ position:absolute; width:18%; height:18%; border-radius:50%; background:#0ea5e9; opacity:.18; box-shadow:none; }

        /* Hide cell background and border on river rows, keep clickable */
        .xq-cell.river{
          background: transparent !important;
          border-color: transparent !important;
          box-shadow: none !important;
        }
        .xq-cell.river.empty:hover{ background: transparent !important; }


        /* Continuous river band for Chinese Chess */
        .river-band {
          position: absolute;
          left: 0;
          /* The river is between rows 4 and 5, i.e. covers rows 4 and 5 (0-indexed) = 2 rows */
          top: calc((var(--cell) + var(--g)) * 4);
          width: 100%;
          height: calc(var(--cell) * 2 + var(--g));
          z-index: 0;
          pointer-events: none;
          border-radius: 0 0 0 0;
          background:
            linear-gradient(180deg, #e0f3ff 60%, #c6e6fa 100%);
          /* overlay subtle stripes and border */
          box-shadow:
            0 -2px 0 0 #8ecae6 inset,
            0 2px 0 0 #8ecae6 inset;
        }
        .river-band::after {
          content: "";
          position: absolute;
          left: 0; top: 0; width: 100%; height: 100%;
          pointer-events: none;
          background: repeating-linear-gradient(
            120deg,
            rgba(30,144,255,0.09) 0px,
            rgba(30,144,255,0.09) 8px,
            rgba(255,255,255,0.05) 12px,
            rgba(255,255,255,0.05) 20px
          );
          opacity: 0.43;
          border-radius: 0;
          z-index: 0;
        }

        .stone{ width:76%; aspect-ratio:1/1; height:auto; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:clamp(16px, 3.4vw, 24px); box-shadow: inset 0 1px 3px rgba(0,0,0,.18), inset 0 -2px 3px rgba(255,255,255,.22); border:1px solid #cfd6e0; }
        .stone.red{ color:#b91c1c; background:#fff; }
        .stone.black{ color:#1f2937; background:#fff; }

        .shell.center-layout { display:flex; flex-direction:column; align-items:center; }
        .shell.center-layout .left { width:100%; display:flex; flex-direction:column; align-items:center; }
        .shell.center-layout .page-header { 
          width:min(100%, 980px); 
          margin-bottom: clamp(8px, 1.6vw, 18px);
        }
        .shell.center-layout #board-wrap.board-card.center { width:min(100%, 980px); margin:0 auto; }
    
        .bottom-card {
          width: min(100%, 980px);
          margin: 12px auto 0;
          background: linear-gradient(135deg,#ffffff,#f8fafc);
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          box-shadow: 0 10px 24px rgba(2,6,23,.12);
          padding: clamp(16px, 2.6vw, 24px);
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 12px;
        }
        .bottom-card .actions {
          display: flex;
          gap: 12px;
          flex-wrap: wr
          justify-content: flex-start;
          width: 100%;
        }
        .bottom-card .help {
          font-size: 14px;
          color: #64748b;
          max-width: 980px;
          text-align: left;
          margin: 0;
        }
      `}</style>
    </>
  )
}

// --- AI helpers ---
// Base piece values (roughly balanced for Xiangqi)
function pieceValue(p: Piece){
  switch(p.t){
    case 'K': return 10000;         // huge so we never trade it
    case 'R': return 500;
    case 'C': return 450;
    case 'H': return 300;
    case 'E': return 120;
    case 'A': return 120;
    case 'S': return 100;
  }
}

// Piece-square tables (simple centralisation bonuses).
// Values are for RED (bottom). BLACK uses mirrored rows.
const PST: Record<PieceType, number[][]> = {
  K: [
    [  0,  0,  0,  2,  4,  2,  0,  0,  0],
    [  0,  0,  0,  2,  6,  2,  0,  0,  0],
    [  0,  0,  0,  2,  4,  2,  0,  0,  0],
  ].concat(Array(7).fill(Array(9).fill(0))), // only palace area matters a bit
  A: Array.from({length: ROWS}, (_,r)=>
      [0,0,0, 6, 8, 6, 0,0,0].map(v => r>=7||r<=2 ? v : 0)),
  E: Array.from({length: ROWS}, (_,r)=> [2,6,10, 2, 0, 2,10,6,2]),
  H: Array.from({length: ROWS}, ()=> [4,6,10,12,14,12,10,6,4]),
  R: Array.from({length: ROWS}, ()=> [8,10,12,14,16,14,12,10,8]),
  C: Array.from({length: ROWS}, ()=> [6,8,10,12,12,12,10,8,6]),
  S: Array.from({length: ROWS}, (__,r)=> r<=riverRowTop
       ? [0,2,6,10,12,10,6,2,0]    // after crossing river: encourage advance & center
       : [0,0,2,6, 8, 6,2,0,0]),
};

function pstBonus(t: PieceType, r:number, c:number, col: Color){
  // mirror rows for BLACK so that PST is side-relative
  const rr = (col===RED) ? r : (ROWS-1-r);
  const table = PST[t];
  const row = table[Math.min(table.length-1, rr)];
  return row[c] || 0;
}

// Small penalty if generals are facing (illegal in our engine states, but good as eval term)
function generalsFacingEval(b: Board){
  return generalFacing(b) ? -200 : 0;
}

// Mobility bonus: count pseudo-legal destinations (cheap approximation)
function mobility(b: Board, col: Color){
  let m = 0;
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const p=b[r][c]; if(!p||p.c!==col) continue;
    for(let rr=0;rr<ROWS;rr++) for(let cc=0;cc<COLS;cc++){
      if(attacks(b,r,c,rr,cc)){ // pseudo move only
        const dst=b[rr][cc]; if(dst && dst.c===col) continue;
        m += 1;
      }
    }
  }
  return m;
}

// Final evaluation from RED perspective (positive = good for RED)
function evaluate(b: Board){
  let s=0;
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const q=b[r][c]; if(!q) continue;
    const pv = pieceValue(q) + pstBonus(q.t,r,c,q.c);
    s += (q.c===RED ? pv : -pv);
  }
  // mobility (very small to avoid slow eval)
  s += (mobility(b, RED) - mobility(b, BLACK)) * 2;
  // generals facing penalty (prefer blocking files)
  s += generalsFacingEval(b);
  return s;
}

// Move utilities
type Move = { from:[number,number]; to:[number,number] }

function listMoves(b:Board, col:Color): Move[]{
  const ms: Move[]=[];
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(b[r][c]?.c===col){
    for(let rr=0;rr<ROWS;rr++) for(let cc=0;cc<COLS;cc++) if(isLegalMove(b,[r,c],[rr,cc],col))
      ms.push({from:[r,c], to:[rr,cc]});
  }
  return ms;
}

function applyMove(b:Board, mv:Move): Board{
  const nb = clone(b);
  const p = nb[mv.from[0]][mv.from[1]];
  nb[mv.to[0]][mv.to[1]] = p!;
  nb[mv.from[0]][mv.from[1]] = null;
  return nb;
}

function isCapture(b:Board, mv:Move){
  return !!b[mv.to[0]][mv.to[1]];
}

function moveScore(b:Board, mv:Move){
  const tgt = b[mv.to[0]][mv.to[1]];
  const src = b[mv.from[0]][mv.from[1]]!;
  return (tgt ? pieceValue(tgt) * 10 : 0) - pieceValue(src); // MVV-LVA-ish
}

function orderMoves(b:Board, ms:Move[]){
  return ms.slice().sort((a,bm)=> moveScore(b,bm) - moveScore(b,a));
}

// Alpha-beta with quiescence search
const MATE = 1e7;

function qsearch(b:Board, alpha:number, beta:number): number{
  // stand-pat
  let stand = evaluate(b);
  if(stand >= beta) return beta;
  if(stand > alpha) alpha = stand;

  // try only captures
  const side = stand>=0 ? RED : BLACK; // quick guess of side to improve ordering
  let ms = orderMoves(b, listMoves(b, side)).filter(m=> isCapture(b,m));
  for(const m of ms){
    const nb = applyMove(b,m);
    const score = -qsearch(nb, -beta, -alpha);
    if(score >= beta) return beta;
    if(score > alpha) alpha = score;
  }
  return alpha;
}

function search(b:Board, depth:number, alpha:number, beta:number, side:Color, nodes:{n:number}, maxNodes:number): [number, Move|undefined]{
  // node limit safeguard
  if(nodes.n++ > maxNodes) return [evaluate(b), undefined];

  // terminal / depth 0
  const legal = listMoves(b, side);
  if(legal.length===0){
    // checkmate or stalemate
    const [kr,kc]=kingPos(b, side);
    let inCheck=false;
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      const q=b[r][c];
      if(q && q.c!==' ' && q.c!==side){
        if(attacks(b,r,c,kr,kc)) inCheck=true;
      }
    }
    const score = inCheck ? -MATE + nodes.n : 0;
    return [score, undefined];
  }
  if(depth===0){
    return [qsearch(b, alpha, beta), undefined];
  }

  let best: Move|undefined;
  const ordered = orderMoves(b, legal);
  for(const m of ordered){
    const nb = applyMove(b, m);
    const [sc] = search(nb, depth-1, -beta, -alpha, side===RED?BLACK:RED, nodes, maxNodes);
    const val = -sc;
    if(val > alpha){
      alpha = val; best = m;
      if(alpha >= beta) break; // beta cut
    }
  }
  return [alpha, best];
}

function pickAIMove(b:Board, col:Color, lvl:'easy'|'normal'|'hard'): Move|undefined{
  const ms = listMoves(b, col);
  if(ms.length===0) return undefined;
  if(lvl==='easy') return ms[Math.floor(Math.random()*ms.length)];

  const depth = (lvl==='normal') ? 2 : 4;
  const maxNodes = (lvl==='normal') ? 4000 : 20000; // keep UX responsive
  const nodes = { n:0 };
  const [_, best] = search(b, depth, -MATE, MATE, col, nodes, maxNodes);
  return best || orderMoves(b, ms)[0];
}
