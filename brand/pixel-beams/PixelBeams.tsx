// =============================================================================
// DimeBag-Bets — <PixelBeams />
// Drop-in halftone pixel-beam background. Zero dependencies (raw WebGL).
//
// A vivid color field screened through a grid of halftone dots whose size
// tracks an underlying brightness field, with broad soft beams + a corner glow
// sweeping through it. Inspired by Paper Design's "Pixel Beams".
//
// The fragment shader is the same source as pixel-beams.frag.glsl and the
// playground.html tuner — tune visually in the playground, then paste the
// emitted config object straight into this component's props.
//
//   import { PixelBeams, PIXEL_BEAM_PRESETS } from "@/brand/pixel-beams/PixelBeams";
//   <PixelBeams {...PIXEL_BEAM_PRESETS["Money Green"]} />
//   <PixelBeams background="#6e1322" color0="#ff3b5c" gradient={0.7} />
// =============================================================================

import { useEffect, useRef, type CSSProperties } from "react";

export interface PixelBeamsConfig {
  // animation
  speed: number;
  drift: number;
  flicker: number;
  flickerSpeed: number;
  colorMix: number;
  // brightness field
  ambient: number;
  gradient: number;
  beamCount: number;
  angle: number;
  beamWidthMin: number;
  beamWidthMax: number;
  beamStrength: number;
  spread: number;
  glow: number;
  glowX: number;
  glowY: number;
  // palette
  background: string;
  color0: string;
  color1: string;
  color2: string;
  color3: string;
  colorCount: number;
  // halftone
  pixelDensity: number;
  roundPixels: number; // 0 | 1
  dotMin: number;
  dotScale: number;
  dotMax: number;
  dotSoftness: number;
  // look
  intensity: number;
  contrast: number;
  gamma: number;
  bloom: number;
  grain: number;
  vignette: number;
  mix: number;
}

export const PIXEL_BEAMS_DEFAULTS: PixelBeamsConfig = {
  speed: 1, drift: 0.2, flicker: 6, flickerSpeed: 0.8, colorMix: 0,
  ambient: 0.1, gradient: 0.6, beamCount: 3, angle: -0.5,
  beamWidthMin: 0.12, beamWidthMax: 0.4, beamStrength: 0.45, spread: 0.5,
  glow: 0, glowX: 0.5, glowY: 0.5,
  background: "#0a2413", color0: "#39ff7a", color1: "#9dffc0", color2: "#0fbf6a",
  color3: "#066b3c", colorCount: 2,
  pixelDensity: 104, roundPixels: 1, dotMin: 0.04, dotScale: 0.62, dotMax: 0.58,
  dotSoftness: 0.1,
  intensity: 1.1, contrast: 1.25, gamma: 1.0, bloom: 0.3, grain: 0.03,
  vignette: 0.5, mix: 1,
};

export const PIXEL_BEAM_PRESETS: Record<string, PixelBeamsConfig> = {
  "Money Green": { ...PIXEL_BEAMS_DEFAULTS },
  "Ember Burst": {
    ...PIXEL_BEAMS_DEFAULTS,
    background: "#e22a17", color0: "#ffd23f", color1: "#fff1b8", color2: "#ff8a3f",
    colorCount: 2, ambient: 0, gradient: 0, beamCount: 0, glow: 1.4, glowX: 0.18,
    glowY: 0.82, dotMin: 0, dotScale: 0.85, dotMax: 0.62, dotSoftness: 0.14,
    pixelDensity: 64, intensity: 1.2, contrast: 1.1, bloom: 0.4, vignette: 0,
  },
  "Teal Noir": {
    ...PIXEL_BEAMS_DEFAULTS,
    background: "#06201e", color0: "#2fd0c0", color1: "#1b8a86", color2: "#7df0e4",
    colorCount: 2, ambient: 0.05, gradient: 0.35, beamCount: 4, angle: 0.7,
    beamWidthMin: 0.06, beamWidthMax: 0.18, beamStrength: 0.45, spread: 0.6,
    pixelDensity: 120, dotScale: 0.5, dotMax: 0.6, intensity: 0.95, contrast: 1.5,
    bloom: 0.3, vignette: 0.7, grain: 0.05,
  },
  "Magenta Flux": {
    ...PIXEL_BEAMS_DEFAULTS,
    background: "#7d0f6e", color0: "#ff4fd8", color1: "#b06bff", color2: "#ffd0f4",
    colorCount: 3, ambient: 0.25, gradient: 0.7, beamCount: 2, angle: 0.9,
    beamWidthMin: 0.2, beamWidthMax: 0.5, beamStrength: 0.5, spread: 0.4,
    pixelDensity: 130, dotScale: 0.55, dotMax: 0.72, intensity: 1.2, contrast: 1.1,
    bloom: 0.7, vignette: 0.3, colorMix: 0.02,
  },
  "Indigo": {
    ...PIXEL_BEAMS_DEFAULTS,
    background: "#160d5e", color0: "#6a3cff", color1: "#b07bff", color2: "#3fa0ff",
    colorCount: 3, ambient: 0.18, gradient: 0.6, beamCount: 2, angle: 0.4,
    beamWidthMin: 0.18, beamWidthMax: 0.5, beamStrength: 0.45, spread: 0.5,
    glow: 0.7, glowX: 0.25, glowY: 0.2, pixelDensity: 110, dotScale: 0.55,
    dotMax: 0.72, intensity: 1.15, contrast: 1.15, bloom: 0.7, vignette: 0.4,
  },
  "Crimson": {
    ...PIXEL_BEAMS_DEFAULTS,
    background: "#6e1322", color0: "#ff3b5c", color1: "#ff8aa0", color2: "#ffd23f",
    colorCount: 2, ambient: 0.2, gradient: 0.7, beamCount: 2, angle: -0.8,
    beamWidthMin: 0.2, beamWidthMax: 0.5, beamStrength: 0.4, spread: 0.5,
    glow: 0.4, glowX: 0.8, glowY: 0.2, pixelDensity: 120, dotScale: 0.55,
    dotMax: 0.72, intensity: 1.15, contrast: 1.15, bloom: 0.6, vignette: 0.5,
  },
};

const FRAG = `precision highp float;
uniform vec2 uResolution; uniform float uTime, uSpeed;
uniform vec3 uBackground, uColor0, uColor1, uColor2, uColor3;
uniform int uColorCount, uBeamCount;
uniform float uAmbient, uGradient, uAngle, uBeamWidthMin, uBeamWidthMax, uBeamStrength, uSpread, uDrift;
uniform float uFlicker, uFlickerSpeed, uGlow, uGlowX, uGlowY, uColorMix;
uniform float uPixelDensity, uRoundPixels, uDotMin, uDotScale, uDotMax, uDotSoftness;
uniform float uIntensity, uContrast, uGamma, uBloom, uGrain, uVignette, uMix;
float hash11(float p){ p=fract(p*0.1031); p*=p+33.33; p*=p+p; return fract(p); }
float hash21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
mat2 rot(float a){ float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }
vec3 pal(int i){ if(i<=0)return uColor0; if(i==1)return uColor1; if(i==2)return uColor2; return uColor3; }
vec3 palMix(float s){ float fc=max(float(uColorCount),1.0); if(fc<1.5) return uColor0;
  float x=clamp(s,0.0,1.0)*(fc-1.0); int idx=int(floor(x)); float fr=fract(x);
  return mix(pal(idx),pal(idx+1),fr); }
void main(){
  vec2 frag=gl_FragCoord.xy; vec2 uv=frag/uResolution; float aspect=uResolution.x/uResolution.y;
  vec2 c=uv-0.5; c.x*=aspect; vec2 pr=rot(uAngle)*c; float t=uTime*uSpeed;
  float field=uAmbient;
  field+=uGradient*clamp(pr.y*0.7+0.5,0.0,1.0);
  float beamField=0.0; const int MAX_BEAMS=12;
  for(int i=0;i<MAX_BEAMS;i++){
    if(i>=uBeamCount) break; float fi=float(i);
    float r0=hash11(fi+1.0), r1=hash11(fi+7.0), r2=hash11(fi+13.0);
    float speed=0.25+r0*0.9; float width=mix(uBeamWidthMin,uBeamWidthMax,r1); float phase=r2*6.2831853;
    float pos=sin(t*speed*uDrift+phase)*uSpread+(r1-0.5)*uSpread;
    float dd=(pr.x-pos)/max(width,1e-3); float band=exp(-dd*dd);
    band*=0.7+0.3*sin(pr.y*uFlicker+t*uFlickerSpeed*speed+phase);
    beamField+=band;
  }
  field+=beamField*uBeamStrength;
  if(uGlow>0.0){ vec2 gp=vec2(uGlowX,uGlowY)-0.5; gp.x*=aspect; float gd=length(c-gp); field+=uGlow*exp(-gd*gd*3.0); }
  field=pow(clamp(field,0.0,4.0),uContrast);
  float sel=fract(pr.y*0.35+pr.x*0.25+t*uColorMix);
  vec3 beamCol=palMix(sel)*uIntensity;
  vec2 grid=vec2(uPixelDensity*aspect, uPixelDensity);
  vec2 cellF=fract(uv*grid)-0.5;
  float distC=(uRoundPixels>0.5)? length(cellF) : max(abs(cellF.x),abs(cellF.y));
  float radius=clamp(uDotMin+field*uDotScale,0.0,uDotMax);
  float cov=smoothstep(radius,radius-uDotSoftness,distC);
  vec3 col=mix(uBackground, beamCol, cov);
  col=mix(col, beamCol, clamp(field-1.0,0.0,1.0)*uBloom);
  if(uVignette>0.0){ vec2 vq=uv-0.5; float v=1.0-dot(vq,vq)*uVignette*2.5; col*=clamp(v,0.0,1.0); }
  if(uGrain>0.0){ float n=hash21(frag+fract(uTime)*113.0)-0.5; col+=n*uGrain; }
  col=pow(max(col,vec3(0.0)),vec3(1.0/max(uGamma,0.01)));
  col=mix(uBackground,col,clamp(uMix,0.0,1.0));
  gl_FragColor=vec4(col,1.0);
}`;

const VERT = "attribute vec2 a; void main(){ gl_Position = vec4(a,0.0,1.0); }";

function hex2rgb(h: string): [number, number, number] {
  const n = parseInt(h.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export interface PixelBeamsProps extends Partial<PixelBeamsConfig> {
  className?: string;
  style?: CSSProperties;
  /** Cap device pixel ratio for perf. Default 2. */
  maxDpr?: number;
  /** Pause animation (e.g. prefers-reduced-motion). Default false. */
  paused?: boolean;
}

export function PixelBeams(props: PixelBeamsProps) {
  const { className, style, maxDpr = 2, paused = false, ...overrides } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // keep latest config in a ref so the GL loop reads fresh values without restart
  const cfgRef = useRef<PixelBeamsConfig>({ ...PIXEL_BEAMS_DEFAULTS, ...overrides });
  cfgRef.current = { ...PIXEL_BEAMS_DEFAULTS, ...overrides };
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        gl.deleteShader(s);
        throw new Error(log || "shader compile error");
      }
      return s;
    };

    // Build the program defensively: a shader compile/link failure must degrade to a
    // blank canvas, never throw out of the effect and take the whole page down.
    const prog = gl.createProgram()!;
    try {
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(prog) || "program link error");
    } catch (err) {
      console.error("[PixelBeams] shader init failed:", err);
      gl.deleteProgram(prog);
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aLoc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(aLoc);
    gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

    const u = (n: string) => gl.getUniformLocation(prog, n);
    const U = {
      res: u("uResolution"), time: u("uTime"), speed: u("uSpeed"),
      bg: u("uBackground"), c0: u("uColor0"), c1: u("uColor1"), c2: u("uColor2"), c3: u("uColor3"),
      colorCount: u("uColorCount"), beamCount: u("uBeamCount"),
      ambient: u("uAmbient"), gradient: u("uGradient"), angle: u("uAngle"),
      wMin: u("uBeamWidthMin"), wMax: u("uBeamWidthMax"), beamStrength: u("uBeamStrength"),
      spread: u("uSpread"), drift: u("uDrift"), flicker: u("uFlicker"),
      flickerSpeed: u("uFlickerSpeed"), glow: u("uGlow"), glowX: u("uGlowX"), glowY: u("uGlowY"),
      colorMix: u("uColorMix"), density: u("uPixelDensity"), round: u("uRoundPixels"),
      dotMin: u("uDotMin"), dotScale: u("uDotScale"), dotMax: u("uDotMax"),
      dotSoftness: u("uDotSoftness"), intensity: u("uIntensity"), contrast: u("uContrast"),
      gamma: u("uGamma"), bloom: u("uBloom"), grain: u("uGrain"),
      vignette: u("uVignette"), mix: u("uMix"),
    };

    let raf = 0;
    let tAccum = 0;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    const draw = (now: number) => {
      const c = cfgRef.current;
      if (!pausedRef.current) tAccum += (now - last) / 1000;
      last = now;
      resize();
      gl.uniform2f(U.res, canvas.width, canvas.height);
      gl.uniform1f(U.time, tAccum);
      gl.uniform1f(U.speed, c.speed);
      gl.uniform3fv(U.bg, hex2rgb(c.background));
      gl.uniform3fv(U.c0, hex2rgb(c.color0));
      gl.uniform3fv(U.c1, hex2rgb(c.color1));
      gl.uniform3fv(U.c2, hex2rgb(c.color2));
      gl.uniform3fv(U.c3, hex2rgb(c.color3));
      gl.uniform1i(U.colorCount, c.colorCount | 0);
      gl.uniform1i(U.beamCount, c.beamCount | 0);
      gl.uniform1f(U.ambient, c.ambient);
      gl.uniform1f(U.gradient, c.gradient);
      gl.uniform1f(U.angle, c.angle);
      gl.uniform1f(U.wMin, c.beamWidthMin);
      gl.uniform1f(U.wMax, c.beamWidthMax);
      gl.uniform1f(U.beamStrength, c.beamStrength);
      gl.uniform1f(U.spread, c.spread);
      gl.uniform1f(U.drift, c.drift);
      gl.uniform1f(U.flicker, c.flicker);
      gl.uniform1f(U.flickerSpeed, c.flickerSpeed);
      gl.uniform1f(U.glow, c.glow);
      gl.uniform1f(U.glowX, c.glowX);
      gl.uniform1f(U.glowY, c.glowY);
      gl.uniform1f(U.colorMix, c.colorMix);
      gl.uniform1f(U.density, c.pixelDensity);
      gl.uniform1f(U.round, c.roundPixels);
      gl.uniform1f(U.dotMin, c.dotMin);
      gl.uniform1f(U.dotScale, c.dotScale);
      gl.uniform1f(U.dotMax, c.dotMax);
      gl.uniform1f(U.dotSoftness, c.dotSoftness);
      gl.uniform1f(U.intensity, c.intensity);
      gl.uniform1f(U.contrast, c.contrast);
      gl.uniform1f(U.gamma, c.gamma);
      gl.uniform1f(U.bloom, c.bloom);
      gl.uniform1f(U.grain, c.grain);
      gl.uniform1f(U.vignette, c.vignette);
      gl.uniform1f(U.mix, c.mix);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, [maxDpr]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: "block", width: "100%", height: "100%", ...style }}
    />
  );
}

export default PixelBeams;
