import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { LOGO_IMG } from './assets';
import TeaserScene, { taglineEl, taglineTopEl } from './TeaserScene';

// Wide layout from 4:5 up (matches PORTRAIT_ASPECT in TeaserScene).
const MAX_DPR = 1.75;

/**
 * Standalone "Something Brewing" teaser page. Single fixed camera view:
 * the Coffee Science bottle photo in the centre, its gold cap
 * unscrews and coffee pours into it, while 3D beans float around on the
 * same forest-green backdrop as the home page hero.
 */
export default function Teaser() {
  // Sharp on capable screens; drops resolution if the frame rate sags.
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio || 1, MAX_DPR));

  return (
    <main className="relative h-[100svh] w-full overflow-hidden bg-forest-950">
      {/* Same backdrop as the home page hero */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 38%, #0d2818 0%, #071a10 45%, #030a06 78%, #020504 100%)',
        }}
      />
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute left-1/2 top-[22%] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-gold-500/[0.07] blur-[130px]" />
        <div className="absolute -right-24 bottom-[8%] h-[420px] w-[420px] rounded-full bg-forest-500/20 blur-[120px]" />
        <div className="absolute -left-24 top-[10%] h-[380px] w-[380px] rounded-full bg-forest-500/10 blur-[120px]" />
      </div>

      <div className="absolute inset-0 z-[1]">
        <Canvas
          dpr={dpr}
          camera={{ position: [0, 0, 8], fov: 32, near: 0.1, far: 50 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        >
          <PerformanceMonitor
            onDecline={() => setDpr(1)}
            onIncline={() => setDpr(Math.min(window.devicePixelRatio || 1, MAX_DPR))}
          />
          <Suspense fallback={null}>
            <TeaserScene />
          </Suspense>
        </Canvas>
      </div>

      <div className="grain absolute inset-0 z-[2] pointer-events-none" />

      {/*
        Title sits above the 3D layer so it always stays readable; the beans
        are laid out to keep clear of it (see titleBand in TeaserScene).
        Split either side of the bottle on wide screens, stacked under it on
        portrait ones.
      */}
      <div className="pointer-events-none absolute inset-0 z-[3]">
        <div className="absolute inset-x-0 bottom-[13vh] flex flex-col items-center gap-2 text-center animate-fade-up [@media(min-aspect-ratio:4/5)]:hidden">
          <h1 className="whitespace-nowrap pb-1 font-title text-[clamp(2rem,9.5vw,4rem)] font-medium leading-none text-transparent bg-clip-text bg-gradient-to-r from-gold-200 via-gold-400 to-gold-300">
            Coffee Science
          </h1>
        </div>

        <div className="absolute inset-y-0 left-0 hidden w-1/2 items-center justify-end pr-[clamp(6rem,11vw,12rem)] [@media(min-aspect-ratio:4/5)]:flex">
          <div className="flex flex-col items-end animate-fade-up" style={{ animationDelay: '0.3s' }}>
            <h1 className="pb-[0.12em] font-title text-[clamp(3.5rem,min(8.2vw,17vh),9rem)] font-medium leading-[0.9] text-transparent bg-clip-text bg-gradient-to-r from-gold-200 via-gold-400 to-gold-300 drop-shadow-[0_6px_30px_rgba(0,0,0,0.7)]">
              Coffee
            </h1>
          </div>
        </div>
        <div className="absolute inset-y-0 right-0 hidden w-1/2 items-center justify-start pl-[clamp(6rem,11vw,12rem)] [@media(min-aspect-ratio:4/5)]:flex">
          <div className="flex flex-col items-start animate-fade-up" style={{ animationDelay: '0.5s' }}>
            <p
              aria-hidden
              className="pb-[0.12em] font-title text-[clamp(3.5rem,min(8.2vw,17vh),9rem)] font-medium leading-[0.9] text-transparent bg-clip-text bg-gradient-to-r from-gold-200 via-gold-400 to-gold-300 drop-shadow-[0_6px_30px_rgba(0,0,0,0.7)]"
            >
              Science
            </p>
          </div>
        </div>
      </div>


      {/* Logo, top-left (beans keep clear of it: see logoCorner in TeaserScene) */}
      <div className="absolute left-5 top-5 z-10 sm:left-8 sm:top-7 animate-fade-up">
        <span className="relative block h-20 w-20 overflow-hidden rounded-full ring-1 ring-gold-400/50 shadow-[0_0_40px_rgba(201,160,78,0.25)] sm:h-[104px] sm:w-[104px]">
          <img src={LOGO_IMG} alt="Coffee Science" className="h-full w-full object-cover" />
        </span>
      </div>

      {/* Tagline again, above the bottle, once the cap is back on (below the logo on phones). */}
      <div
        ref={(el) => {
          taglineTopEl.current = el;
        }}
        className="pointer-events-none absolute inset-x-0 top-[15vh] z-10 flex flex-col items-center gap-2 opacity-0 sm:top-[9vh]"
      >
        <p className="tagline-shine whitespace-nowrap pl-[0.25em] font-title text-[clamp(0.85rem,min(1.75vw,3.2vh),1.6rem)] font-semibold uppercase tracking-[0.25em] sm:pl-[0.4em] sm:tracking-[0.4em]">
          Coffee Without Compromise
        </p>
        <div className="h-px w-24 bg-gradient-to-r from-transparent via-gold-400/80 to-transparent" />
      </div>

      {/*
        Tagline: rises onto the front of the stone while the coffee pours.
        Its position and fade are driven from the 3D loop (see TaglineSync in
        TeaserScene), so it stays on the stone at every screen size.
      */}
      <div
        ref={(el) => {
          taglineEl.current = el;
        }}
        className="pointer-events-none absolute inset-x-0 top-[88%] z-10 flex flex-col items-center gap-2 opacity-0"
      >
        <p className="tagline-shine whitespace-nowrap pl-[0.25em] font-title text-[clamp(0.85rem,min(1.75vw,3.2vh),1.6rem)] font-semibold uppercase tracking-[0.25em] sm:pl-[0.4em] sm:tracking-[0.4em]">
          Coffee Without Compromise
        </p>
        <div className="h-px w-24 bg-gradient-to-r from-transparent via-gold-400/80 to-transparent" />
      </div>
    </main>
  );
}
