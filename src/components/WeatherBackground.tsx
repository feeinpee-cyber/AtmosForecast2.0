import { memo, useEffect, useMemo, useState } from 'react';

type Props = { tone: string; isDay: boolean };

function WeatherBackground({ tone, isDay }: Props) {
  const [isVisible, setIsVisible] = useState(() => typeof document === 'undefined' || !document.hidden);

  useEffect(() => {
    const updateVisibility = () => setIsVisible(!document.hidden);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);
  const rain = useMemo(() => Array.from({ length: 9 }, (_, i) => ({
    left: `${(i * 37 + 9) % 100}%`, delay: `${(i * 0.19) % 3.8}s`, duration: `${0.72 + ((i * 11) % 7) * 0.12}s`, opacity: 0.18 + ((i * 13) % 5) * 0.07,
  })), []);
  const snow = useMemo(() => Array.from({ length: 7 }, (_, i) => ({
    left: `${(i * 53 + 11) % 100}%`, delay: `${(i * 0.53) % 8}s`, duration: `${7 + ((i * 7) % 8)}s`, size: `${3 + ((i * 3) % 5)}px`, opacity: 0.34 + ((i * 5) % 5) * 0.1,
  })), []);
  const stars = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    left: `${(i * 47 + 5) % 100}%`, top: `${(i * 29 + 8) % 62}%`, delay: `${(i * 0.31) % 5}s`, size: `${1 + (i % 3)}px`,
  })), []);

  return (
    <div className={`weather-atmosphere atmosphere-${tone} ${isVisible ? '' : 'is-paused'}`} aria-hidden="true">
      <div className="atmosphere-glow" />
      {isDay && tone !== 'rain' && tone !== 'storm' && tone !== 'snow' && <div className="sun-halo"><div className="sun-core" /></div>}
      {tone === 'night' && <div className="star-field">{stars.map((star, i) => <i key={i} style={{ left: star.left, top: star.top, animationDelay: star.delay, width: star.size, height: star.size }} />)}</div>}
      {(tone === 'partly' || tone === 'overcast' || tone === 'clear' || tone === 'fog') && (
        <div className="cloud-field">
          <div className="cloud cloud-one" /><div className="cloud cloud-two" /><div className="cloud cloud-three" />
        </div>
      )}
      {(tone === 'rain' || tone === 'storm') && <div className="rain-field">{rain.map((drop, i) => <i key={i} style={{ left: drop.left, animationDelay: drop.delay, animationDuration: drop.duration, opacity: drop.opacity }} />)}</div>}
      {tone === 'snow' && <div className="snow-field">{snow.map((flake, i) => <i key={i} style={{ left: flake.left, animationDelay: flake.delay, animationDuration: flake.duration, width: flake.size, height: flake.size, opacity: flake.opacity }} />)}</div>}
      {tone === 'fog' && <div className="fog-field"><i /><i /><i /></div>}
      {tone === 'storm' && <div className="lightning-flash" />}
      <div className="atmosphere-vignette" />
    </div>
  );
}

export default memo(WeatherBackground);
