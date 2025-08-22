import React, { useEffect, useState } from 'react'
import '../styles.css'

const SIZE = 4

type Board = number[][]

function emptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0))
}

function addRandomTile(board: Board): Board {
  const empties: [number, number][] = []
  board.forEach((row, r) => row.forEach((v, c) => { if (v === 0) empties.push([r, c]) }))
  if (empties.length === 0) return board
  const [r, c] = empties[Math.floor(Math.random() * empties.length)]
  board[r][c] = Math.random() < 0.9 ? 2 : 4
  return board
}

function initBoard(): Board {
  let b = emptyBoard()
  b = addRandomTile(b)
  b = addRandomTile(b)
  return b
}

function slide(row: number[]): [number[], boolean] {
  const vals = row.filter(v => v)
  const res: number[] = []
  let moved = false
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] === vals[i + 1]) {
      res.push(vals[i] * 2)
      i++
      moved = true
    } else {
      res.push(vals[i])
    }
  }
  while (res.length < SIZE) res.push(0)
  if (!moved) moved = res.some((v, i) => v !== row[i])
  return [res, moved]
}

function moveLeft(board: Board): [Board, boolean] {
  let moved = false
  const nb = board.map(row => {
    const [r, m] = slide(row)
    if (m) moved = true
    return r
  })
  return [nb, moved]
}

function moveRight(board: Board): [Board, boolean] {
  let moved = false
  const nb = board.map(row => {
    const [r, m] = slide([...row].reverse())
    if (m) moved = true
    return r.reverse()
  })
  return [nb, moved]
}

function transpose(b: Board): Board {
  return b[0].map((_, c) => b.map(row => row[c]))
}

function moveUp(board: Board): [Board, boolean] {
  const [nb, moved] = moveLeft(transpose(board))
  return [transpose(nb), moved]
}

function moveDown(board: Board): [Board, boolean] {
  const [nb, moved] = moveRight(transpose(board))
  return [transpose(nb), moved]
}

export default function Game2048(){
  const [board, setBoard] = useState<Board>(() => initBoard())

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return
      e.preventDefault()
      setBoard(prev => {
        let nb: Board = prev
        let moved = false
        if (e.key === 'ArrowLeft') [nb, moved] = moveLeft(prev)
        if (e.key === 'ArrowRight') [nb, moved] = moveRight(prev)
        if (e.key === 'ArrowUp') [nb, moved] = moveUp(prev)
        if (e.key === 'ArrowDown') [nb, moved] = moveDown(prev)
        if (moved) nb = addRandomTile(nb)
        return nb.map(row => [...row])
      })
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div style={{padding:'20px'}}>
      <div className="stage" style={{display:'inline-block', padding:'16px'}}>
        <div className="g2048-grid">
          {board.map((row, r) => row.map((v, c) => (
            <div key={`${r}-${c}`} className={`g2048-cell n${v}`}>{v || ''}</div>
          )))}
        </div>
      </div>
      <p style={{color:'var(--muted)', marginTop:'10px'}}>使用方向键移动方块</p>
    </div>
  )
}

