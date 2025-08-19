
import React, { useEffect, useRef, useState } from 'react'
import '../styles.css'

export default function Breakout(){
  const ref = useRef<HTMLCanvasElement|null>(null)
  const [score, setScore] = useState(0)
  const [over, setOver] = useState(false)

  useEffect(()=>{
    const cvs = ref.current!, ctx = cvs.getContext('2d')!
    let rect = cvs.getBoundingClientRect(), DPR=devicePixelRatio||1
    function fit(){ rect=cvs.getBoundingClientRect(); cvs.width=rect.width*DPR; cvs.height=420*DPR; ctx.scale(DPR,DPR) }
    fit(); addEventListener('resize', fit)
    const W=rect.width, H=420
    const paddle = {x:W/2-40,y:H-24,w:80,h:12}
    const ball = {x:W/2, y:H-40, vx:140, vy:-160, r:8}
    const bricks: {x:number,y:number,w:number,h:number,alive:boolean}[] = []
    const rows=5, cols=10, bw=(W-40)/cols, bh=16
    for(let r=0;r<rows;r++){ for(let c=0;c<cols;c++){ bricks.push({x:20+c*bw, y:40+r*(bh+10), w:bw-6, h:bh, alive:true}) } }

    let left=false,right=false
    function key(e:KeyboardEvent){ if(e.key==='ArrowLeft') left=e.type==='keydown'; if(e.key==='ArrowRight') right=e.type==='keydown' }
    addEventListener('keydown', key); addEventListener('keyup', key)

    let last=performance.now(), raf=0
    function step(now:number){
      const dt=Math.min(0.033,(now-last)/1000); last=now
      ctx.clearRect(0,0,W,H)
      const bg=ctx.createLinearGradient(0,0,W,H); bg.addColorStop(0,'#a2d2ff'); bg.addColorStop(1,'#cdb4db'); ctx.fillStyle=bg; ctx.fillRect(0,0,W,H)

      // paddle
      if(left) paddle.x-=260*dt; if(right) paddle.x+=260*dt
      paddle.x=Math.max(10, Math.min(W-paddle.w-10, paddle.x))
      ctx.fillStyle='#fff'; ctx.fillRect(paddle.x,paddle.y,paddle.w,paddle.h)

      // ball
      ball.x+=ball.vx*dt; ball.y+=ball.vy*dt
      if(ball.x<10||ball.x>W-10) ball.vx*=-1
      if(ball.y<10) ball.vy*=-1
      if(ball.y>H){ setOver(true); cancelAnimationFrame(raf); return }
      // paddle collide
      if(ball.x>paddle.x && ball.x<paddle.x+paddle.w && ball.y>paddle.y-ball.r && ball.y<paddle.y+paddle.h){
        ball.vy=-Math.abs(ball.vy)
        const ratio=(ball.x-(paddle.x+paddle.w/2))/(paddle.w/2)
        ball.vx= ratio*220
      }

      // bricks
      bricks.forEach(b=>{
        if(!b.alive) return
        if(ball.x>b.x && ball.x<b.x+b.w && ball.y>b.y && ball.y<b.y+b.h){
          b.alive=false; ball.vy*=-1; setScore(s=>s+1)
        }
      })

      // draw bricks
      bricks.forEach(b=>{ if(!b.alive) return; ctx.fillStyle='rgba(255,255,255,.95)'; ctx.fillRect(b.x,b.y,b.w,b.h) })

      // draw ball
      ctx.beginPath(); ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2); ctx.fillStyle='#111'; ctx.fill()

      raf=requestAnimationFrame(step)
    }
    raf=requestAnimationFrame(step)
    return ()=>{ cancelAnimationFrame(raf); removeEventListener('keydown', key); removeEventListener('keyup', key); removeEventListener('resize', fit) }
  }, [])

  return (<div className="container"><h1>🧱 打砖块</h1><p className="desc">方向键左右移动挡板，别让球掉下去。</p><div className="stage" style={{height:420}}><canvas ref={ref} style={{width:'100%', height:'100%'}}/></div><div style={{display:'flex', gap:12, marginTop:12}}><div className="badge">得分 {score}</div><a className="btn ghost" href="/">返回首页</a></div></div>)
}
