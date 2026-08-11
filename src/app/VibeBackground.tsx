import { useEffect, useRef } from 'react'
import { useVibe } from './vibe'

// Fullscreen WebGL backdrop. One fragment shader draws a domain-warped noise field
// in the current vibe's colors — organic, depth-y motion that reads as 3D without
// any 3D library. Ambient (time-based), so it works for every track.
//
// Performance: single GPU fragment shader on a downscaled buffer, throttled to
// ~30fps, paused when the window is hidden, static under prefers-reduced-motion,
// and the render loop does not run at all when the vibe is "off" (the default) —
// so it costs nothing unless the user opts in.

function hexToRGB(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const VERT = `attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uSpeed;
uniform float uMode;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform vec3 uColorD;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0,0.0)), c = hash(i + vec2(0.0,1.0)), d = hash(i + vec2(1.0,1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<5;i++){ v += a*noise(p); p *= 2.0; a *= 0.5; }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes.xy;
  vec2 p = (gl_FragCoord.xy - 0.5*uRes.xy) / uRes.y; // aspect-correct, centered
  float t = uTime * uSpeed;

  // Domain warp (noise of noise) for a sense of depth/flow.
  vec2 q = vec2(fbm(p*1.5 + vec2(0.0, t*0.15)), fbm(p*1.5 + vec2(5.2, 1.3 - t*0.12)));
  vec2 r = vec2(fbm(p*1.5 + 3.0*q + vec2(1.7, 9.2 + t*0.1)), fbm(p*1.5 + 3.0*q + vec2(8.3, 2.8 - t*0.1)));
  float f = fbm(p*1.5 + 3.5*r);

  float pattern = f;
  if(uMode < 0.5){
    pattern = f + 0.25*sin(p.x*3.0 + t + r.x*4.0);           // aurora bands
  } else if(uMode < 1.5){
    float ang = atan(p.y, p.x);
    pattern = f + 0.20*sin(ang*3.0 + length(p)*4.0 - t);     // nebula swirl
  } else {
    pattern = f + 0.30*sin(p.y*4.0 - t*1.2 + q.x*3.0);       // depth waves
  }

  vec3 col = mix(uColorA, uColorB, clamp(pattern, 0.0, 1.0));
  col = mix(col, uColorC, clamp(r.x*r.y*1.6, 0.0, 1.0));
  // Accent rides the FIRST warp (q) rather than the second (r) that placed the
  // highlight, so the two pool in different regions instead of stacking into one
  // wash. Squared + offset so it stays a rarer bloom, not a fourth flat layer.
  col = mix(col, uColorD, clamp((q.y*q.y - 0.12) * 2.2, 0.0, 0.85));

  // Vignette keeps edges darker so UI stays readable; gentle global breathing.
  float vig = smoothstep(1.3, 0.2, length(uv - 0.5) * 1.4);
  col *= 0.5 + 0.65*vig;
  col *= 0.92 + 0.12*sin(t*0.5);

  gl_FragColor = vec4(col, 1.0);
}
`

interface GLCtx {
  gl: WebGLRenderingContext
  U: Record<string, WebGLUniformLocation | null>
  resize: () => void
  ro: ResizeObserver
  cleanup: () => void
}

export default function VibeBackground() {
  const { vibe } = useVibe()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glRef = useRef<GLCtx | null>(null)

  // --- one-time WebGL setup ------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
    })
    if (!gl) return // no WebGL → the CSS .wallpaper gradient shows through

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)
      if (!s) return null
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('[vibe] shader compile failed:', gl.getShaderInfoLog(s))
        return null
      }
      return s
    }
    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    const prog = gl.createProgram()
    if (!vs || !fs || !prog) return
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[vibe] program link failed:', gl.getProgramInfoLog(prog))
      return
    }
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const U = {
      time: gl.getUniformLocation(prog, 'uTime'),
      res: gl.getUniformLocation(prog, 'uRes'),
      speed: gl.getUniformLocation(prog, 'uSpeed'),
      mode: gl.getUniformLocation(prog, 'uMode'),
      a: gl.getUniformLocation(prog, 'uColorA'),
      b: gl.getUniformLocation(prog, 'uColorB'),
      c: gl.getUniformLocation(prog, 'uColorC'),
      d: gl.getUniformLocation(prog, 'uColorD'),
    }

    // Downscale the render buffer — the background is soft, so ~0.6× DPR is
    // invisible but much cheaper on the GPU.
    const scale = Math.min(window.devicePixelRatio || 1, 2) * 0.6
    const resize = () => {
      const w = Math.max(1, Math.floor(canvas.clientWidth * scale))
      const h = Math.max(1, Math.floor(canvas.clientHeight * scale))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, w, h)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    glRef.current = {
      gl,
      U,
      resize,
      ro,
      cleanup: () => {
        ro.disconnect()
        gl.deleteBuffer(buf)
        gl.deleteProgram(prog)
        gl.deleteShader(vs)
        gl.deleteShader(fs)
      },
    }

    return () => {
      glRef.current?.cleanup()
      glRef.current = null
    }
  }, [])

  // --- render loop, restarted per vibe (idle when off) ---------------------
  useEffect(() => {
    const ctx = glRef.current
    if (!ctx) return
    const { gl, U } = ctx

    if (vibe.key === 'off') {
      // Clear to transparent once so the CSS wallpaper shows — no loop, no cost.
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      return
    }

    const [ca, cb, cc, cd] = vibe.colors.map(hexToRGB)
    const reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const start = performance.now()
    let raf = 0
    let last = 0

    const draw = (elapsedMs: number) => {
      const c = gl.canvas as HTMLCanvasElement
      gl.uniform2f(U.res, c.width, c.height)
      gl.uniform1f(U.time, elapsedMs / 1000)
      gl.uniform1f(U.speed, vibe.speed)
      gl.uniform1f(U.mode, vibe.mode)
      gl.uniform3fv(U.a, ca)
      gl.uniform3fv(U.b, cb)
      gl.uniform3fv(U.c, cc)
      gl.uniform3fv(U.d, cd)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const interval = reduce ? 500 : 33 // ~30fps normally; static & slow under reduce
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (document.hidden) return // pause when minimized / tab hidden
      if (now - last < interval) return
      last = now
      draw(reduce ? 0 : now - start)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [vibe])

  return <canvas ref={canvasRef} className="vibe-canvas" aria-hidden="true" />
}
