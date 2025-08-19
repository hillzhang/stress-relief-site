
import React, { useEffect, useRef, useState } from 'react'
import '../styles.css'

export default function Spinner(){
  const ref = useRef<HTMLCanvasElement|null>(null)
  const [rpm, setRpm] = useState(0)
  const dragging = useRef(false)
  const ang = useRef(0)
  const vel = useRef(0)
  const raf = useRef(0)

  useEffect(()=>{
    const cvs = ref.current!, ctx = cvs.getContext('2d')!
    let rect = cvs.getBoundingClientRect(), DPR = devicePixelRatio||1
    function fit(){ rect=cvs.getBoundingClientRect(); cvs.width=rect.width*DPR; cvs.height=360*DPR; ctx.scale(DPR,DPR) }
    fit(); addEventListener('resize', fit)

    let last = performance.now()
    function draw(now:number){
      const dt = Math.min(0.033, (now-last)/1000); last=now
      ctx.clearRect(0,0,rect.width,360)
      // background
      const g = ctx.createLinearGradient(0,0,rect.width,360); g.addColorStop(0,'#a2d2ff'); g.addColorStop(1,'#ffafcc'); ctx.fillStyle=g; ctx.fillRect(0,0,rect.width,360)
      // physics
      ang.current += vel.current * dt
      vel.current *= 0.985
      setRpm(Math.abs(vel.current) * 60 / (2*Math.PI))

      // draw spinner
      const cx = rect.width/2, cy = 180, r = 80
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(ang.current)
      for(let i=0;i<6;i++){
        ctx.rotate(Math.PI/3)
        ctx.fillStyle='rgba(255,255,255,.9)'
        ctx.beginPath(); ctx.roundRect?.(r*0.2, -16, r, 32, 14); ctx.fill()
      }
      ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.fillStyle='#111'; ctx.fill()
      ctx.restore()

      raf.current = requestAnimationFrame(draw)
    }
    raf.current = requestAnimationFrame(draw)

    function down(e:MouseEvent){ dragging.current = true }
    function move(e:MouseEvent){
      if(!dragging.current) return
      const cx = rect.width/2, cy = 180
      const dx = e.offsetX - cx, dy = e.offsetY - cy
      const r = Math.hypot(dx,dy)
      if(r<140) vel.current += (dx*dy>0? 1 : -1) * 4 // 简单加速
    }
    function up(){ dragging.current = false }

    cvs.addEventListener('mousedown', down); cvs.addEventListener('mousemove', move); addEventListener('mouseup', up)
    return ()=>{ cancelAnimationFrame(raf.current); cvs.removeEventListener('mousedown', down); cvs.removeEventListener('mousemove', move); removeEventListener('mouseup', up); removeEventListener('resize', fit) }
  }, [])

  return (
    <div className="container">
      <h1>🌀 指尖陀螺</h1>
      <p className="desc">按住并拖动以加速，松手后缓慢减速。实时显示 RPM。</p>
      <div className="stage" style={{height:360}}>
        <canvas ref={ref} style={{width:'100%', height:'100%'}}/>
      </div>
      <div style={{display:'flex', gap:12, marginTop:12, alignItems:'center'}}>
        <div className="badge">RPM {rpm.toFixed(0)}</div>
        <a className="btn ghost" href="/">返回首页</a>
      </div>
    </div>
  )
}
