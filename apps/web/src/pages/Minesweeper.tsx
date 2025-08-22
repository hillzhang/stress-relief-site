import React, { useState } from 'react'
import '../styles.css'

const SIZE = 10
const MINES = 15

interface Cell {
  mine: boolean
  revealed: boolean
  count: number
}

function createBoard(): Cell[][] {
  const board: Cell[][] = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => ({ mine: false, revealed: false, count: 0 }))
  )
  let m = MINES
  while (m > 0) {
    const r = Math.floor(Math.random() * SIZE)
    const c = Math.floor(Math.random() * SIZE)
    if (!board[r][c].mine) {
      board[r][c].mine = true
      m--
    }
  }
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c].mine) continue
      let count = 0
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue
          const nr = r + dr, nc = c + dc
          if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr][nc].mine) count++
        }
      }
      board[r][c].count = count
    }
  }
  return board
}

export default function Minesweeper() {
  const [board, setBoard] = useState<Cell[][]>(() => createBoard())

  function reveal(r: number, c: number, b = board.map(row => row.map(cell => ({ ...cell })))) {
    const cell = b[r][c]
    if (cell.revealed) return
    cell.revealed = true
    if (cell.mine) {
      alert('💥 游戏结束')
      setBoard(createBoard())
      return
    }
    if (cell.count === 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue
          const nr = r + dr, nc = c + dc
          if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && !b[nr][nc].revealed) reveal(nr, nc, b)
        }
      }
    }
    setBoard(b)
  }

  return (
    <div className="container">
      <h1>💣 扫雷</h1>
      <p className="desc">点击格子，避开地雷。</p>
      <div className="stage" style={{ display: 'inline-block', margin: '0 auto', padding: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${SIZE},30px)`, gap: '2px' }}>
          {board.map((row, r) =>
            row.map((cell, c) => (
              <button
                key={r + '-' + c}
                onClick={() => reveal(r, c)}
                style={{
                  width: 30,
                  height: 30,
                  border: '1px solid #888',
                  background: cell.revealed ? '#ddd' : '#bbb',
                  color: ['','blue','green','red','purple','maroon','turquoise','black','gray'][cell.count]
                }}
              >
                {cell.revealed ? (cell.mine ? '💣' : cell.count || '') : ''}
              </button>
            ))
          )}
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <a className="btn ghost" href="/">返回首页</a>
      </div>
    </div>
  )
}

