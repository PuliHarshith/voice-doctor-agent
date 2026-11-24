import { useEffect, useRef } from 'react'

const GAP = 16 // px between dots: the gutter width, so every gutter shows a row of dots
const REACH = 170 // px around the pointer that light up

/**
 * A faint dot grid fixed behind the board; it shows in the gutters between panels. Dots near the pointer grow
 * and take the green ink. It redraws only while the pointer moves or the glow fades, and stays still under
 * reduced motion.
 */
export function DotGrid() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    let px = 0
    let py = 0
    let glow = 0 // 0..1, eases toward target so the light fades in and out
    let target = 0
    let raf = 0

    function draw() {
      if (!ctx) return
      const css = getComputedStyle(document.documentElement)
      const base = css.getPropertyValue('--dot').trim()
      const hot = css.getPropertyValue('--green-ink').trim()
      const w = innerWidth
      const h = innerHeight
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = base
      ctx.beginPath()
      for (let y = GAP / 2; y < h; y += GAP) for (let x = GAP / 2; x < w; x += GAP) ctx.rect(x - 1, y - 1, 2, 2)
      ctx.fill()
      if (glow < 0.01) return
      ctx.fillStyle = hot
      for (let y = GAP / 2; y < h; y += GAP) {
        if (Math.abs(y - py) > REACH) continue
        for (let x = GAP / 2; x < w; x += GAP) {
          const t = glow * (1 - Math.hypot(x - px, y - py) / REACH)
          if (t <= 0) continue
          ctx.globalAlpha = Math.min(1, t * 1.2)
          ctx.beginPath()
          ctx.arc(x, y, 1 + t * 1.8, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
    }

    function frame() {
      glow += (target - glow) * 0.2
      draw()
      raf = Math.abs(target - glow) > 0.01 ? requestAnimationFrame(frame) : 0
    }
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame)
    }

    function resize() {
      const dpr = devicePixelRatio || 1
      canvas!.width = innerWidth * dpr
      canvas!.height = innerHeight * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw()
    }

    const move = (e: PointerEvent) => {
      px = e.clientX
      py = e.clientY
      target = e.pointerType === 'mouse' ? 1 : 0 // a finger on a phone doesn't hover
      if (glow > 0.01 && target === 1) draw()
      kick()
    }
    const leave = () => {
      target = 0
      kick()
    }

    resize()
    const theme = new MutationObserver(draw) // Paper | Ink switch
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    addEventListener('resize', resize)
    if (!still) {
      addEventListener('pointermove', move)
      document.documentElement.addEventListener('pointerleave', leave)
    }
    return () => {
      cancelAnimationFrame(raf)
      theme.disconnect()
      removeEventListener('resize', resize)
      removeEventListener('pointermove', move)
      document.documentElement.removeEventListener('pointerleave', leave)
    }
  }, [])

  return <canvas ref={ref} className="dot-grid" aria-hidden="true" />
}
