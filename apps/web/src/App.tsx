import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import WhiteNoise from './pages/WhiteNoise'
import Breath from './pages/Breath'
import Bubbles from './pages/Bubbles'
import FruitSlice from './pages/FruitSlice'
import Bottle from './pages/Bottle'
import BlindBox from './pages/BlindBox'
import DoodleBoard from './pages/DoodleBoard'
import Moyu from './pages/Moyu'
import PopWrap from './pages/PopWrap'
import BubbleWrap from './pages/BubbleWrap'
import Spinner from './pages/Spinner'
import Woodfish from './pages/Woodfish'
import Knives from './pages/Knives'
import Fireworks from './pages/Fireworks'
import Slime from './pages/Slime'
import Screw from './pages/Screw'
import TreeShake from './pages/TreeShake'
// new games
import Breakout from './pages/Breakout'
import Mole from './pages/Mole'
import Memory from './pages/Memory'
import Game2048 from './pages/Game2048'
import Snake from './pages/Snake'
import Tetris from './pages/Tetris'
import Stars from './pages/Stars'
import Minesweeper from './pages/Minesweeper'
import Pacman from './pages/Pacman'
import FlappyBird from './pages/FlappyBird'
import Space from './pages/Space'
import Incense from './pages/Incense'
// import Tank90 from './pages/Tank90'
import Gomoku from './pages/Gomoku'
import TicTacToe from './pages/TicTacToe'
import Blackjack from './pages/Blackjack'
import Reversi from './pages/Reversi'
import PokerArrange from './pages/PokerArrange'

// --- Board/Card games (placeholders) ---
function ComingSoon({ title }: { title: string }){
  return (
    <div className="page-wrap">
      <div className="shell">
        <header className="page-header compact">
          <h1 className="title">{title}</h1>
          <p className="subtitle">玩法正在开发中，欢迎先体验其它棋牌游戏～</p>
        </header>
        <div className="bottom-bar">
          <div className="actions">
            <a className="btn secondary" href="/">返回首页</a>
          </div>
          <p className="help">提示：你也可以在 GitHub Issue 提需求，我们会优先支持热门玩法。</p>
        </div>
      </div>
    </div>
  )
}
import ChineseChess from './pages/ChineseChess'
const Checkers = () => <ComingSoon title="⛀ 国际跳棋 · Checkers"/>;

import './styles.css'

function Home() {
  const [quote, setQuote] = useState('')
  useEffect(() => {
    fetch('http://localhost:8080/api/quote')
      .then(r => r.json()).then(d => setQuote(d.quote))
      .catch(() => setQuote('慢慢来，心会跟上。'))
  }, [])

  return (
    <div>
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <div className="logo-badge">😀</div>
            解压小网站
          </div>
          <nav className="nav">
            <a href="#games">小游戏</a>
            <a href="#board">棋牌</a>
            <a href="#tools">工具</a>
            <Link to="/noise">白噪音</Link>
            <a href="#fun">互动</a>
            <a href="#about">关于</a>
          </nav>
        </div>
      </header>

      <section className="banner">
        <div className="inner">
          <h1>点一点，放松一整天</h1>
          <p>一句治愈：{quote}</p>
          <div className="cta">
            <Link className="btn primary pop" to="/bubbles">🎮 开始解压</Link>
            <Link className="btn secondary pop" to="/noise">🎵 听白噪音</Link>
          </div>
        </div>
      </section>

      <main className="container">
        {/*<div className="ad"><strong>广告位</strong>（示意）横幅不打扰体验</div>*/}

        <section className="section" id="games">
          <h2>🎮 小游戏</h2>
          <div className="grid">
            <Link className="card pop" to="/bubbles"><div className="title">🫧 戳泡泡</div><div className="desc">即时解压 + 连击</div></Link>
            <Link className="card pop" to="/fruit"><div className="title">🍉 切水果</div><div className="desc">刀光轨迹 + 飞溅</div></Link>
            <Link className="card pop" to="/moyu"><div className="title">🐟 摸鱼模拟器</div><div className="desc">投喂/群游/昼夜</div></Link>
            <Link className="card pop" to="/popwrap"><div className="title">🫧 泡泡纸</div><div className="desc">真实POP音</div></Link>
            <Link className="card pop" to="/bubblewrap">
              <div className="title">🫧 泡泡纸 2</div>
              <div className="desc">多玩法进阶版</div>
            </Link>
            <Link className="card pop" to="/spinner"><div className="title">🌀 指尖陀螺</div><div className="desc">RPM 显示</div></Link>
            <Link className="card pop" to="/woodfish"><div className="title">🔔 木鱼</div><div className="desc">禅风 UI</div></Link>
            <Link className="card pop" to="/knives"><div className="title">🎯 飞刀靶</div><div className="desc">木靶 + 钢刀</div></Link>
            <Link className="card pop" to="/fireworks"><div className="title">🎆 放烟花</div><div className="desc">环形/爱心/菊花</div></Link>
            <Link className="card pop" to="/breakout"><div className="title">🧱 打砖块</div><div className="desc">经典复刻</div></Link>
            <Link className="card pop" to="/mole"><div className="title">🐹 打地鼠</div><div className="desc">限时反应</div></Link>
            <Link className="card pop" to="/memory"><div className="title">🃏 记忆翻牌</div><div className="desc">配对放松</div></Link>
            <Link className="card pop" to="/2048"><div className="title">🔢 2048</div><div className="desc">合成数字</div></Link>
            <Link className="card pop" to="/snake"><div className="title">🐍 贪吃蛇</div><div className="desc">经典玩法</div></Link>
            <Link className="card pop" to="/tetris"><div className="title">🧊 俄罗斯方块</div><div className="desc">方块消除</div></Link>
            <Link className="card pop" to="/stars"><div className="title">⭐ 点点星星</div><div className="desc">点击得分</div></Link>
            <Link className="card pop" to="/minesweeper"><div className="title">💣 扫雷</div><div className="desc">逻辑推理</div></Link>
            <Link className="card pop" to="/pacman"><div className="title">👻 吃豆人</div><div className="desc">吃豆躲鬼</div></Link>
            <Link className="card pop" to="/flappy"><div className="title">🐤 跳跃鸟</div><div className="desc">穿越水管</div></Link>
            <Link className="card pop" to="/space"><div className="title">🚀 太空射击</div><div className="desc">击退入侵</div></Link>
            {/*<Link className="card pop" to="/tank90"><div className="title">🛡️ 坦克大战</div><div className="desc">经典坦90</div></Link>*/}
          </div>
        </section>

        <section className="section" id="board">
          <h2>🀄 棋牌类</h2>
          <div className="grid">
            <Link className="card pop" to="/gomoku"><div className="title">⚫ 五子棋</div><div className="desc">五连珠胜负</div></Link>
            <Link className="card pop" to="/tictactoe"><div className="title">❌ 井字棋</div><div className="desc">三子连线</div></Link>
            <Link className="card pop" to="/blackjack"><div className="title">🃏 21点</div><div className="desc">比大小</div></Link>
            <Link className="card pop" to="/poker-arrange"><div className="title">🃏 摆扑克</div><div className="desc">按花色点数摆齐</div></Link>
            <Link className="card pop" to="/reversi"><div className="title">⚪⚫ 黑白棋</div><div className="desc">翻转占领</div></Link>
            {/*<Link className="card pop" to="/chesscn"><div className="title">♟️ 中国象棋</div><div className="desc">楚河汉界</div></Link>*/}
            {/*<Link className="card pop" to="/checkers"><div className="title">⛀ 国际跳棋</div><div className="desc">吃子过河</div></Link>*/}
          </div>
        </section>

        <section className="section" id="tools">
          <h2>🧰 解压工具</h2>
          <div className="grid">
            <Link className="card pop" to="/breath"><div className="title">😮‍💨 呼吸训练</div><div className="desc">4-4-4-4 / 4-7-8</div></Link>
            <Link className="card pop" to="/doodle"><div className="title">🎨 涂鸦板</div><div className="desc">形状/贴纸/撤销</div></Link>
            <Link className="card pop" to="/noise"><div className="title">🎵 白噪音</div><div className="desc">淡入淡出</div></Link>
            {/*<Link className="card pop" to="/slime"><div className="title">🟢 挤压史莱姆</div><div className="desc">黏糊弹性</div></Link>*/}
            {/*<Link className="card pop" to="/screw"><div className="title">🔩 旋转螺丝</div><div className="desc">拧松进度</div></Link>*/}
            {/*<Link className="card pop" to="/tree"><div className="title">🌳 摇树掉果子</div><div className="desc">摇一摇</div></Link>*/}
          </div>
        </section>

        <section className="section" id="fun">
          <h2>🎁 趣味互动</h2>
          <div className="grid">
            <Link className="card pop" to="/bottle"><div className="title">🥤 解压瓶</div><div className="desc">装瓶→砸碎</div></Link>
            <Link className="card pop" to="/blindbox"><div className="title">📦 拆盲盒</div><div className="desc">贴纸稀有度</div></Link>
            <Link className="card pop" to="/incense"><div className="title">🪷 上香祈愿</div><div className="desc">烟雾+祈愿</div></Link>
          </div>
        </section>

        <footer id="about">©2025 解压小网站 · 轻松一下，继续摸鱼</footer>
      </main>
    </div>
  )
}

export default function App(){
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home/>} />
        <Route path="/noise" element={<WhiteNoise/>} />
        <Route path="/breath" element={<Breath/>} />
        <Route path="/bubbles" element={<Bubbles/>} />
        <Route path="/fruit" element={<FruitSlice/>} />
        <Route path="/bottle" element={<Bottle/>} />
        <Route path="/blindbox" element={<BlindBox/>} />
        <Route path="/doodle" element={<DoodleBoard/>} />
        <Route path="/moyu" element={<Moyu/>} />
        <Route path="/popwrap" element={<PopWrap/>} />
        <Route path="/bubblewrap" element={<BubbleWrap/>} />
        <Route path="/spinner" element={<Spinner/>} />
        <Route path="/woodfish" element={<Woodfish/>} />
        <Route path="/knives" element={<Knives/>} />
        <Route path="/fireworks" element={<Fireworks/>} />
        <Route path="/breakout" element={<Breakout/>} />
        <Route path="/mole" element={<Mole/>} />
        <Route path="/memory" element={<Memory/>} />
        <Route path="/poker-arrange" element={<PokerArrange/>} />
        <Route path="/2048" element={<Game2048/>} />
        <Route path="/snake" element={<Snake/>} />
        <Route path="/tetris" element={<Tetris/>} />
        <Route path="/stars" element={<Stars/>} />
        <Route path="/minesweeper" element={<Minesweeper/>} />
        <Route path="/pacman" element={<Pacman/>} />
        <Route path="/flappy" element={<FlappyBird/>} />
        <Route path="/space" element={<Space/>} />
        <Route path="/incense" element={<Incense/>} />
        <Route path="/gomoku" element={<Gomoku/>} />
        <Route path="/tictactoe" element={<TicTacToe/>} />
        <Route path="/blackjack" element={<Blackjack/>} />
        <Route path="/reversi" element={<Reversi/>} />
        <Route path="/chesscn" element={<ChineseChess/>} />
        <Route path="/checkers" element={<Checkers/>} />
        {/*<Route path="/tank90" element={<Tank90/>} />*/}
        {/*<Route path="/slime" element={<Slime/>} />*/}
        {/*<Route path="/screw" element={<Screw/>} />*/}
        {/*<Route path="/tree" element={<TreeShake/>} />*/}
      </Routes>
    </BrowserRouter>
  )
}
