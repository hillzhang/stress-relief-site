import React, { useEffect, useMemo, useRef, useState } from 'react'
import '../styles.css'

// ♣️♦️♥️♠️ 摆扑克（Relax Arrange Poker）
// 规则：将 52 张牌按花色各一行（黑桃/红心/梅花/方块），列按 A→K 排好。
// 操作：拖拽牌到空位；也可点击选中→点击空位放置。支持洗牌、重置、撤销。

type Suit = 'S'|'H'|'C'|'D'
type Rank = 1|2|3|4|5|6|7|8|9|10|11|12|13
type Card = { s: Suit; r: Rank; id: string }

type Pos = { row: number; col: number }

const SUITS: Suit[] = ['S','H','C','D'] // ♠ ♥ ♣ ♦
const RANKS: Rank[] = [1,2,3,4,5,6,7,8,9,10,11,12,13]
const SUIT_ICON: Record<Suit,string> = { S:'♠', H:'♥', C:'♣', D:'♦' }
const SUIT_NAME: Record<Suit,string> = { S:'黑桃', H:'红心', C:'梅花', D:'方块' }
const RANK_NAME: Record<Rank,string> = { 1:'A', 11:'J', 12:'Q', 13:'K', 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10' }
const suitOrder: Suit[] = ['S','H','C','D']

function buildDeck(): Card[]{
  const deck: Card[] = []
  for(const s of SUITS){ for(const r of RANKS){ deck.push({ s, r, id: `${s}${r}` }) } }
  return deck
}
function shuffle<T>(arr: T[]): T[]{
  const a = [...arr]
  for(let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]] = [a[j],a[i]] }
  return a
}

export default function PokerArrange(){
  const [grid, setGrid] = useState<(Card|null)[][]>(()=> Array.from({length:4},()=>Array(13).fill(null)))
  const [stock, setStock] = useState<Card[]>(()=> shuffle(buildDeck()))
  const [selected, setSelected] = useState<Card|null>(null)
  const [moves, setMoves] = useState<{grid:(Card|null)[][]; stock:Card[]}[]>([])
  const [dragCard, setDragCard] = useState<Card|null>(null)
  const dragFrom = useRef<{ type:'grid'|'stock'; row?:number; col?:number }|null>(null)

  const placedCount = useMemo(()=> grid.flat().filter(Boolean).length, [grid])
  const progress = useMemo(()=> Math.round(placedCount/52*100), [placedCount])

  const isWin = useMemo(()=>{
    for(let r=0;r<4;r++){
      const suit = suitOrder[r]
      for(let c=0;c<13;c++){
        const card = grid[r][c]
        if(!card) return false
        if(card.s!==suit || card.r!== (c+1)) return false
      }
    }
    return true
  }, [grid])

  function saveHistory(){ setMoves(m=>[...m, { grid: grid.map(row=>row.slice()), stock:[...stock] }]) }
  function undo(){ if(!moves.length) return; const last = moves[moves.length-1]; setGrid(last.grid.map(r=>r.slice())); setStock([...last.stock]); setMoves(m=>m.slice(0,-1)); setSelected(null) }
  function reset(){ setGrid(Array.from({length:4},()=>Array(13).fill(null))); setStock(shuffle(buildDeck())); setMoves([]); setSelected(null) }

  function takeFromStock(){ if(!stock.length) return null; const [c, ...rest] = stock; setStock(rest); return c }

  // Auto place helper: place a card to its canonical position (row by suit, col by rank-1)
  function autoPlaceCard(card: Card){
    saveHistory()
    const targetRow = suitOrder.indexOf(card.s)
    const targetCol = card.r - 1
    setGrid(g=>{
      const ng = g.map(r=>r.slice())
      const currentPos = findCardPosition(card, ng)
      if(currentPos){
        // card is on grid
        if(ng[targetRow][targetCol] === null){
          // move to empty cell
          ng[targetRow][targetCol] = card
          ng[currentPos.row][currentPos.col] = null
        } else if(ng[targetRow][targetCol]?.id !== card.id){
          // swap cards
          const temp = ng[targetRow][targetCol]
          ng[targetRow][targetCol] = card
          ng[currentPos.row][currentPos.col] = temp
        }
        // else already in correct position, do nothing
      } else {
        // card is in stock
        if(ng[targetRow][targetCol] === null){
          ng[targetRow][targetCol] = card
          setStock(s => s.filter(c => c.id !== card.id))
        } else {
          // swap with card in grid, put swapped card back to stock
          const swappedCard = ng[targetRow][targetCol]
          ng[targetRow][targetCol] = card
          setStock(s => {
            const filtered = s.filter(c => c.id !== card.id)
            return swappedCard ? [swappedCard, ...filtered] : filtered
          })
        }
      }
      return ng
    })
    setSelected(null)
  }

  // helper to find card position on grid
  function findCardPosition(card: Card, gridData: (Card|null)[][]): Pos | null {
    for(let r=0; r<4; r++){
      for(let c=0; c<13; c++){
        const cell = gridData[r][c]
        if(cell && cell.id === card.id) return { row: r, col: c }
      }
    }
    return null
  }

  // click to place: select from stock first, then click empty grid
  function onCellClick(row:number, col:number){
    const cell = grid[row][col]
    if(cell){ // 拾起已有牌
      saveHistory();
      // 放回牌库顶部
      setStock(s=>[cell!, ...s])
      setGrid(g=>{ const ng = g.map(r=>r.slice()); ng[row][col]=null; return ng })
      return
    }
    // 空位
    if(selected){
      saveHistory();
      setGrid(g=>{ const ng = g.map(r=>r.slice()); ng[row][col]=selected; return ng })
      setStock(s => s.filter(c => c.id !== selected.id))
      setSelected(null)
      return
    }
    // 无选择则自动从牌库发一张
    const card = takeFromStock(); if(!card) return; saveHistory();
    setGrid(g=>{ const ng = g.map(r=>r.slice()); ng[row][col]=card; return ng })
  }

  // drag & drop
  function onDragStart(e: React.DragEvent, card: Card, from:'grid'|'stock', row?:number, col?:number){
    setDragCard(card); dragFrom.current = { type: from, row, col }
    e.dataTransfer.setData('text/plain', card.id)
    e.dataTransfer.effectAllowed = 'move'
  }
  function onDropCell(e: React.DragEvent, row:number, col:number){
    e.preventDefault()
    const from = dragFrom.current; const card = dragCard; if(!from || !card) return
    saveHistory()
    if(from.type==='stock'){
      // from stock -> grid
      setGrid(g=>{ const ng=g.map(r=>r.slice()); if(!ng[row][col]) ng[row][col]=card; return ng })
      setStock(s=> s.filter(x=>x.id!==card.id))
    }else{
      // grid -> grid (swap or move)
      setGrid(g=>{ const ng=g.map(r=>r.slice()); const src = ng[from.row!][from.col!]; const dst = ng[row][col]; ng[row][col]=src!; ng[from.row!][from.col!]=dst; return ng })
    }
    setDragCard(null); dragFrom.current=null
  }

  function onDragOver(e: React.DragEvent){ e.preventDefault(); e.dataTransfer.dropEffect='move' }

  // deck click: if no selection, auto-place top card
  function onDeckClick(){
    if(selected) return
    if(stock.length === 0) return
    autoPlaceCard(stock[0])
  }

  // double click on stock card: auto-place it
  function onStockCardDoubleClick(card: Card){
    autoPlaceCard(card)
  }

  // double click on grid card: auto-place it
  function onGridCardDoubleClick(card: Card){
    autoPlaceCard(card)
  }

  // helpers
  const cellSize = 'clamp(46px, 6.6vw, 70px)'

  return (
    <>
      <div className="page-wrap">
        <div className="shell">
          <div className="left">
              <div className="center-stack">
                  <header className="page-header compact">
                      <h1 className="title">🃏 摆扑克 · Arrange Poker</h1>
                      <p className="subtitle">把 52 张牌按花色和点数摆齐：每行一种花色，列从 A →
                          K。支持拖拽/点击、洗牌、撤销。</p>

                      <div className="stats unified">
                          <div className="chip">
                              <div className="label">已放</div>
                              <div className="value">{placedCount}/52</div>
                          </div>
                          <div className="chip">
                              <div className="label">完成度</div>
                              <div className="value">{progress}%</div>
                          </div>
                          <button className="btn icon" onClick={reset}>🔀 洗牌重开</button>
                          <button className="btn icon" onClick={undo}>↩️ 撤销</button>
                      </div>
                  </header>

                  <div id="board-wrap" className="board-card center">
                      <div className="board-inner">
                          <div className="board-table">
                              <div
                                  className="poker-grid"
                                  style={{
                                      ['--cell' as any]: cellSize,
                                      ['--gap' as any]: 'clamp(6px, 1.2vw, 10px)'
                                  } as React.CSSProperties}
                              >
                                  {/* Row labels (first column) */}
                                  {suitOrder.map((s, r) => (
                                      <div
                                          className={`suit-tag s-${s}`}
                                          key={`tag-${s}`}
                                          style={{gridColumn: 1, gridRow: r + 1}}
                                      >
                                          {SUIT_NAME[s]} {SUIT_ICON[s]}
                                      </div>
                                  ))}

                                  {/* 13 columns × 4 rows cells, explicitly positioned so they start from column 2 */}
                                  {Array.from({length: 4}).map((_, r) =>
                                      Array.from({length: 13}).map((__, c) => {
                                          const card = grid[r][c]
                                          return (
                                              <button
                                                  key={`c-${r}-${c}`}
                                                  className={`cell ${card ? 'filled' : 'empty'}`}
                                                  onClick={() => onCellClick(r, c)}
                                                  onDrop={(e) => onDropCell(e, r, c)}
                                                  onDragOver={onDragOver}
                                                  style={{gridColumn: c + 2, gridRow: r + 1}}
                                              >
                                                  {card && (
                                                      <div
                                                          className={`card ${(card.s === 'H' || card.s === 'D') ? 'red' : ''}`}
                                                          draggable
                                                          onDragStart={(e) => onDragStart(e, card, 'grid', r, c)}
                                                          onDoubleClick={() => onGridCardDoubleClick(card)}
                                                      >
                                                          <div className="rank">{RANK_NAME[card.r]}</div>
                                                          <div className="suit">{SUIT_ICON[card.s]}</div>
                                                      </div>
                                                  )}
                                              </button>
                                          )
                                      })
                                  )}
                              </div>
                              <div className="stock-col">
                                  <div className="deck" onClick={onDeckClick}>
                                      {stock.length > 0 ? (
                                          <div
                                              className={`card back${selected?.id === stock[0].id ? ' selected' : ''}`}
                                              key="deck-top"
                                              draggable
                                              onDragStart={(e) => onDragStart(e, stock[0], 'stock')}
                                              onClick={() => setSelected(stock[0])}
                                              onDoubleClick={() => onStockCardDoubleClick(stock[0])}
                                          />
                                      ) : (
                                          <div
                                              className="card back empty"
                                              key="deck-empty"
                                              draggable={false}
                                          />
                                      )}
                                      <div className="deck-label">牌库 {stock.length}</div>
                                  </div>
                              </div>
                          </div>
                      </div>

                      {isWin && (
                          <div className="overlay">
                              <div className="panel">
                                  <div className="result-title">🎉 排列完成！</div>
                                  <div className="result-sub">恭喜你把 52 张牌全部摆好～</div>
                                  <div className="overlay-actions">
                                      <button className="btn primary" onClick={reset}>再来一局</button>
                                      <a className="btn secondary" href="/">返回首页</a>
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>

                  <div className="bottom-card">
                      <div className="actions">
                          <a className="btn secondary" href="/">返回首页</a>
                      </div>
                      <p className="help">提示：拖拽或点击发牌到空位；再次点击已放的牌可取回到牌库顶部。目标：每行一种花色（黑桃/红心/梅花/方块），列从
                          A 到 K。</p>
                  </div>
              </div>
          </div>
        </div>
      </div>

        <style>{`
        /* —— Unified page shell —— */
        .page-wrap{ min-height:100vh; display:flex; justify-content:center; align-items:flex-start; padding:16px 24px 28px; }
        .shell{ width:min(100%, 1100px); display:flex; flex-direction:column; gap:12px; }
        .left{ width:100%; }
        .center-stack{ width:100%; display:flex; flex-direction:column; gap:12px; }

        /* —— Board card —— */
        #board-wrap.board-card.center{ margin:0 auto; background:linear-gradient(135deg,#ffffff,#f8fafc); border:1px solid #e2e8f0; border-radius:16px; box-shadow:0 10px 24px rgba(2,6,23,.08); padding: clamp(12px,2vw,16px); }
        .board-inner{ display:flex; flex-direction:column; align-items:center; gap: clamp(12px, 2vw, 20px); margin:0 auto; width:100%; overflow:auto; }

        /* —— Board table layout —— */
        .board-table {
          display: flex;
          flex-direction: row;
          align-items: flex-start;
          justify-content: center;
          gap: clamp(24px, 4vw, 36px);
          width: 100%;
          margin: 0 auto;
        }
        .stock-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          min-width: 64px;
          margin-top: 8px;
        }

        /* —— Grid —— */
        .poker-grid{ position:relative; width:max-content; display:grid; grid-template-columns:96px repeat(13, var(--cell)); grid-template-rows:repeat(4, var(--cell)); gap:var(--gap); align-items:center; justify-self:center; margin:0 auto; }
        .suit-tag{ height:var(--cell); display:flex; align-items:center; justify-content:flex-end; padding-right:12px; font-weight:800; color:#334155; white-space:nowrap; font-size:clamp(13px,1.5vw,14px); }
        .s-S{ color:#0f172a; } .s-H{ color:#dc2626; } .s-C{ color:#0f172a; } .s-D{ color:#dc2626; }

        .cell{ width:var(--cell); height:var(--cell); border-radius:12px; border:1px dashed #cbd5e1; background:#f8fafc; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow: inset 0 -2px 4px rgba(2,6,23,.03); padding:0; appearance:none; outline:none; box-sizing:border-box; }
        .cell.filled{ border-style:solid; background:#ffffff; }
        .cell.empty:hover{ background:#f1f5f9; }

        .card{ width:calc(var(--cell) - 10px); height:calc(var(--cell) - 10px); border-radius:10px; background:#fff; border:1px solid #e2e8f0; display:flex; flex-direction:column; align-items:center; justify-content:center; font-weight:900; box-shadow:0 6px 14px rgba(2,6,23,.08); user-select:none; }
        .card .rank{ font-size:clamp(14px, 2.2vw, 18px); line-height:1; }
        .card .suit{ font-size:clamp(18px, 3vw, 22px); margin-top:4px; }
        .card.red{ color:#b91c1c; }

        /* —— Deck —— */
        .card.back{ background: linear-gradient(135deg,#ffffff,#f1f5f9); border-style:dashed; border-color:#cbd5e1; width:44px; height:60px; border-radius:8px; cursor:pointer; }
        .card.back.selected{ outline:2px solid #2563eb; outline-offset:2px; }
        .card.back.empty{ opacity:.35; cursor:default; }
        .deck{ position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; min-height:66px; }
        .deck .card.back:not(.empty):hover{ transform: translateY(-2px); transition: transform .15s ease; }
        .deck-label{ font-size:12px; color:#64748b; cursor:pointer; margin-top:4px; }

        /* —— Bottom card —— */
        .bottom-card{
          width:min(100%, 980px);
          margin:12px auto 0;
          background: linear-gradient(135deg,#ffffff,#f8fafc);
          border:1px solid #e2e8f0;
          border-radius:14px;
          padding: 12px 14px;
          display:flex;
          align-items:center;
          justify-content:flex-start; /* 左对齐 */
          gap:12px;                 /* 与帮助文案留间距 */
          box-shadow: 0 10px 24px rgba(2,6,23,.08);
        }
        .bottom-card .actions{ display:flex; gap:12px; }
        .help{ color:#64748b; font-size:12px; }

        /* —— Responsive —— */
        @media (max-width:1100px){ .poker-grid{ grid-template-columns:84px repeat(13, var(--cell)); } }
        @media (max-width:900px){
          .poker-grid{ grid-template-columns:72px repeat(13, var(--cell)); }
          .card.back{ width:40px; height:54px; }
        }
        @media (max-width:720px){ #board-wrap.board-card.center{ padding:12px; } .board-inner{ align-items:flex-start; } }
      `}</style>
    </>
  )
}
