import type { Core } from 'cytoscape';

const DASH_CYCLE = 14;
const CYCLE_DURATION = 1000;

export function setupEdgeMotion(window: Window, document: Document, graph: Core, button: HTMLButtonElement) {
  let motionPreference: Partial<MediaQueryList> & Pick<MediaQueryList, 'matches'> = { matches: false };
  try {
    if (window.matchMedia) motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  } catch {
    // Media preferences are unavailable.
  }
  let manuallyPaused = false;
  let systemReducedMotion = motionPreference.matches;
  let dashOffset = 0;
  let lastTimestamp: number | null = null;
  let animationFrame: number | null = null;

  const shouldAnimate = () => !manuallyPaused && !systemReducedMotion && !document.hidden;

  function stop() {
    if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    animationFrame = null;
    lastTimestamp = null;
  }

  function tick(timestamp: number) {
    animationFrame = null;
    if (!shouldAnimate()) return;
    if (lastTimestamp !== null) {
      dashOffset -= ((timestamp - lastTimestamp) * DASH_CYCLE) / CYCLE_DURATION;
      while (dashOffset <= -DASH_CYCLE) dashOffset += DASH_CYCLE;
    }
    lastTimestamp = timestamp;
    graph.edges().not('.filtered-out').style('line-dash-offset', dashOffset);
    animationFrame = window.requestAnimationFrame(tick);
  }

  function start() {
    if (shouldAnimate() && animationFrame === null) {
      animationFrame = window.requestAnimationFrame(tick);
    }
  }

  function updateButton() {
    if (systemReducedMotion) {
      button.textContent = 'Motion disabled';
      button.setAttribute('aria-label', 'Edge animation disabled by reduced-motion preference');
      button.disabled = true;
    } else {
      button.disabled = false;
      button.textContent = manuallyPaused ? 'Resume' : 'Pause';
      button.setAttribute('aria-label', manuallyPaused ? 'Resume edge motion' : 'Pause edge motion');
    }
  }

  button.addEventListener('click', () => {
    manuallyPaused = !manuallyPaused;
    if (manuallyPaused) stop();
    updateButton();
    start();
  });
  const handleVisibility = () => {
    if (document.hidden) stop();
    else start();
  };
  document.addEventListener('visibilitychange', handleVisibility);
  const handleMotionPreference = (event: MediaQueryListEvent) => {
    systemReducedMotion = event.matches;
    if (systemReducedMotion) stop();
    updateButton();
    start();
  };
  if (motionPreference.addEventListener) motionPreference.addEventListener('change', handleMotionPreference);
  else if (motionPreference.addListener) motionPreference.addListener(handleMotionPreference);

  updateButton();
  start();
  return () => {
    stop();
    document.removeEventListener('visibilitychange', handleVisibility);
    if (motionPreference.removeEventListener) motionPreference.removeEventListener('change', handleMotionPreference);
    else if (motionPreference.removeListener) motionPreference.removeListener(handleMotionPreference);
  };
}
