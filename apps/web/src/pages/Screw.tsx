import React, { useRef, useState, useEffect } from 'react'
import '../styles.css'

export default function Screw(){
  const [angle, setAngle] = useState(0)
  const [progress, setProgress] = useState(0)
  const dragging = useRef(false)
  const lastX = useRef(0)

  function down(e:React.PointerEvent<HTMLDivElement>){
    dragging.current = true
    lastX.current = e.clientX
  }
  function move(e:React.PointerEvent<HTMLDivElement>){
    if(!dragging.current) return
    const dx = e.clientX - lastX.current
    lastX.current = e.clientX
    setAngle(a => a + dx)
    setProgress(p => Math.min(100, p + Math.abs(dx)/5))
  }
  function up(){ dragging.current = false }
  useEffect(()=>{ window.addEventListener('pointerup', up); return ()=> window.removeEventListener('pointerup', up) },[])

  return (
    <div style={{padding:'40px',textAlign:'center'}}>
      <div
        onPointerDown={down}
        onPointerMove={move}
        style={{width:120,height:120,margin:'0 auto',touchAction:'none'}}
      >
        <div
          style={{
            width:'100%',height:'100%',border:'4px solid #555',borderRadius:'50%',
            background:'#ccc',position:'relative',
            transform:`rotate(${angle}deg)`,
            transition:'transform 0.05s linear'
          }}
        >
          <div style={{position:'absolute',top:'50%',left:'50%',width:10,height:60,background:'#555',transform:'translate(-50%,-50%)'}}></div>
          <div style={{position:'absolute',top:'50%',left:'50%',width:60,height:10,background:'#555',transform:'translate(-50%,-50%)'}}></div>
        </div>
      </div>
      <div style={{marginTop:'20px'}}>
        <div style={{width:200,height:10,background:'#eee',margin:'0 auto',borderRadius:5}}>
          <div style={{width:`${progress}%`,height:'100%',background:'#4caf50',borderRadius:5}}></div>
        </div>
        {progress>=100 && <p style={{marginTop:'10px'}}>螺丝已松动！</p>}
      </div>
    </div>
  )
}

