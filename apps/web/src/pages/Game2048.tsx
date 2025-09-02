import React, { useEffect, useRef, useState } from 'react'

export default function Gomoku() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [turn, setTurn] = useState(1) // 1 黑 2 白
  const [moves, setMoves] = useState<{ x: number; y: number; c: number }[]>([])
  const [winner, setWinner] = useState(0)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null)

  // 棋盘大小和格子数
  const size = 15
  const cellSize = 36

  // 画棋盘
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = cellSize * (size - 1) + 40
    canvas.height = cellSize * (size - 1) + 40
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // 画网格
    ctx.strokeStyle = '#666'
    for (let i = 0; i < size; i++) {
      const pos = 20 + i * cellSize
      ctx.beginPath()
      ctx.moveTo(20, pos)
      ctx.lineTo(canvas.width - 20, pos)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(pos, 20)
      ctx.lineTo(pos, canvas.height - 20)
      ctx.stroke()
    }

    // 画星位
    const stars = [3, 7, 11]
    stars.forEach((r) => {
      stars.forEach((c) => {
        ctx.beginPath()
        ctx.arc(20 + c * cellSize, 20 + r * cellSize, 4, 0, Math.PI * 2)
        ctx.fillStyle = '#666'
        ctx.fill()
      })
    })

    // 画棋子
    moves.forEach(({ x, y, c }) => {
      const cx = 20 + x * cellSize
      const cy = 20 + y * cellSize
      const gradient = ctx.createRadialGradient(cx - 4, cy - 4, 1, cx, cy, 14)
      if (c === 1) {
        gradient.addColorStop(0, '#0a0a0a')
        gradient.addColorStop(1, '#636766')
      } else {
        gradient.addColorStop(0, '#d9d9d9')
        gradient.addColorStop(1, '#f1f1f1')
      }
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(cx, cy, 14, 0, Math.PI * 2)
      ctx.fill()
    })

    // 画悬浮棋子
    if (hoverPos && winner === 0) {
      const { x, y } = hoverPos
      if (!moves.some((m) => m.x === x && m.y === y)) {
        const cx = 20 + x * cellSize
        const cy = 20 + y * cellSize
        ctx.beginPath()
        ctx.arc(cx, cy, 14, 0, Math.PI * 2)
        ctx.fillStyle = turn === 1 ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.7)'
        ctx.fill()
      }
    }
  }, [moves, hoverPos, turn, winner])

  // 判断胜利
  function checkWin(x: number, y: number, c: number) {
    const directions = [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ]
    for (const [dx, dy] of directions) {
      let count = 1
      for (let dir = -1; dir <= 1; dir += 2) {
        let nx = x + dx * dir
        let ny = y + dy * dir
        while (
          nx >= 0 &&
          nx < size &&
          ny >= 0 &&
          ny < size &&
          moves.some((m) => m.x === nx && m.y === ny && m.c === c)
        ) {
          count++
          nx += dx * dir
          ny += dy * dir
        }
      }
      if (count >= 5) return true
    }
    return false
  }

  // 落子
  function onClick(e: React.MouseEvent) {
    if (winner !== 0) return
    if (!canvasRef.current || !wrapRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = Math.round((e.clientX - rect.left - 20) / cellSize)
    const y = Math.round((e.clientY - rect.top - 20) / cellSize)
    if (x < 0 || x >= size || y < 0 || y >= size) return
    if (moves.some((m) => m.x === x && m.y === y)) return
    const newMoves = [...moves, { x, y, c: turn }]
    setMoves(newMoves)
    if (checkWin(x, y, turn)) {
      setWinner(turn)
    } else {
      setTurn(turn === 1 ? 2 : 1)
    }
  }

  // 鼠标移动显示悬浮棋子
  function onMove(e: React.MouseEvent) {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = Math.round((e.clientX - rect.left - 20) / cellSize)
    const y = Math.round((e.clientY - rect.top - 20) / cellSize)
    if (x < 0 || x >= size || y < 0 || y >= size) {
      setHoverPos(null)
    } else {
      setHoverPos({ x, y })
    }
  }

  function onLeave() {
    setHoverPos(null)
  }

  // 悔棋
  function undo() {
    if (moves.length === 0 || winner !== 0) return
    const newMoves = moves.slice(0, -1)
    setMoves(newMoves)
    setTurn(turn === 1 ? 2 : 1)
  }

  // 重开
  function restart() {
    setMoves([])
    setTurn(1)
    setWinner(0)
  }

  return (
    <>
      <div className="page-wrap">
        <div className="shell">
          <div className="left">
            <header className="page-header compact">
              <h1 className="title">♟️ 五子棋 · Gomoku</h1>
              <p className="subtitle">统一 UI · 鼠标点击或轻触在交点落子，黑先，连成五子即胜；支持悔棋/重开。</p>

              <div className="stats unified">
                <div className="chip"><div className="label">回合</div><div className="value">{turn===1?'● 黑子':'○ 白子'}</div></div>
                <div className="chip"><div className="label">步数</div><div className="value">{moves.length}</div></div>
                {winner!==0 && (
                  <div className="chip danger"><div className="label">结局</div><div className="value">{winner===1?'黑子胜利':'白子胜利'}</div></div>
                )}
                <button className={`btn icon`} aria-label="悔棋" onClick={undo}>↩️ 悔棋</button>
                <button className={`btn icon`} aria-label="再来一局" onClick={restart}>🔄 重开</button>
              </div>
            </header>

            {/* 棋盘卡片 */}
            <div id="board-wrap" className="board-card">
              <div ref={wrapRef} className="w-full">
                <canvas
                  ref={canvasRef}
                  style={{ display:'block', margin:'0 auto', borderRadius:16, background:'#ffffff', boxShadow:'inset 0 0 0 1px #e5e7eb' }}
                  onMouseMove={onMove}
                  onMouseLeave={onLeave}
                  onClick={onClick}
                />
              </div>

              {winner!==0 && (
                <div className="overlay">
                  <div className="panel">
                    <div className="result-title">{winner===1? '🎉 黑子胜利':'🎉 白子胜利'}</div>
                    <div className="result-sub">五连珠达成 · 共落 {moves.length} 手</div>
                    <div className="overlay-actions">
                      <button className="btn primary" onClick={restart}>再来一局</button>
                      <a className="btn secondary" href="/">返回首页</a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 底部操作栏 */}
          <div className="bottom-bar">
            <div className="actions">
              <button className="btn primary" onClick={restart}>再来一局</button>
              <a className="btn secondary" href="/">返回首页</a>
            </div>
            <p className="help">提示：点击交点落子，Z/⌫ 悔棋；黑白轮流，先连成五子者胜。</p>
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

        .board-card{ background: linear-gradient(135deg,#ffffff,#f1f5f9); border-radius: 16px; box-shadow: 0 10px 24px rgba(2,6,23,.12); padding: clamp(14px, 2.6vw, 20px); position:relative; }

        .title{ margin:0 0 6px; font-size:28px; font-weight:800; color:#0f172a; }
        .subtitle{ margin:0 0 12px; color:#475569; font-size:14px; }
        .stats{ display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin:10px 0 14px; }
        .chip{ flex:0 0 auto; min-width:140px; background:#0f172a; color:#e2e8f0; border-radius:12px; padding:10px 12px; box-shadow: inset 0 -2px 0 rgba(255,255,255,.06); }
        .chip.danger{ background:#dc2626; }
        .chip .label{ font-size:12px; opacity:.8; }
        .chip .value{ font-size:20px; font-weight:800; line-height:1.1; }
        .btn.icon{ background:#6366f1; color:#fff; border:none; border-radius:12px; padding:10px 12px; font-weight:700; box-shadow: 0 6px 14px rgba(99,102,241,.25); }
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