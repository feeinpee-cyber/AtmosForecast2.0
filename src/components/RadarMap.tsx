import { useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import type { Place, WeatherBundle } from '../lib/weather';

type RadarFrame = { time: number; path: string };
type RadarMeta = { host: string; radar?: { past?: RadarFrame[] } };
type LayerMode = 'radar' | 'temperature' | 'wind' | 'air';

type Props = { place: Place; weather: WeatherBundle | null; layer: LayerMode; frameIndex: number; onFrames: (frames: RadarFrame[]) => void; onFrameIndex: (index: number) => void };

function Recenter({ place }: { place: Place }) {
  const map = useMap();
  useEffect(() => { map.flyTo([place.latitude, place.longitude], Math.max(map.getZoom(), 5), { duration: 0.8 }); }, [map, place.latitude, place.longitude]);
  return null;
}

export default function RadarMap({ place, weather, layer, frameIndex, onFrames, onFrameIndex }: Props) {
  const [host, setHost] = useState('');
  const [frames, setFrames] = useState<RadarFrame[]>([]);
  const [radarError, setRadarError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('https://api.rainviewer.com/public/weather-maps.json', { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('Radar unavailable'); return response.json() as Promise<RadarMeta>; })
      .then((data) => {
        const available = data.radar?.past ?? [];
        setHost(data.host ?? '');
        setFrames(available);
        onFrames(available);
        onFrameIndex(Math.max(0, available.length - 1));
        setRadarError(available.length === 0);
      })
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === 'AbortError')) setRadarError(true); });
    return () => controller.abort();
  }, [onFrames, onFrameIndex]);

  const selectedFrame = frames[frameIndex];
  const radarUrl = host && selectedFrame ? `${host}${selectedFrame.path}/256/{z}/{x}/{y}/2/1_0.png` : '';
  const metric = layer === 'temperature' ? (weather ? `${Math.round(weather.current.temperature)}°` : '—') :
    layer === 'wind' ? (weather ? `${Math.round(weather.current.windSpeed)} km/h` : '—') :
      layer === 'air' ? `${weather?.air?.usAqi ?? '—'} AQI` : '';
  const metricTitle = layer === 'temperature' ? 'Temperature at selected location' : layer === 'wind' ? 'Wind at selected location' : 'Air quality model at selected location';

  return (
    <div className="map-canvas">
      <MapContainer center={[place.latitude, place.longitude]} zoom={6} scrollWheelZoom className="leaflet-map" zoomControl={false}>
        <Recenter place={place} />
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {layer === 'radar' && radarUrl && <TileLayer key={radarUrl} url={radarUrl} opacity={0.66} maxNativeZoom={7} maxZoom={18} attribution='Radar: <a href="https://www.rainviewer.com/">RainViewer</a>' />}
        <CircleMarker center={[place.latitude, place.longitude]} radius={9} pathOptions={{ color: '#fff', weight: 2, fillColor: '#9ce8dc', fillOpacity: 1 }}>
          <Popup><strong>{place.name}</strong><br />{weather ? `${Math.round(weather.current.temperature)}° · ${weather.current.windSpeed.toFixed(0)} km/h wind` : 'Selected location'}</Popup>
        </CircleMarker>
      </MapContainer>
      {layer !== 'radar' && (
        <div className="map-metric-float"><span>{metricTitle}</span><strong>{metric}</strong><small>Point forecast · not a gridded map layer</small></div>
      )}
      {layer === 'radar' && radarError && <div className="map-empty-note">Radar tiles are temporarily unavailable. The base map is still usable.</div>}
      <div className="map-source-note">Map © OpenStreetMap · {layer === 'radar' ? 'Radar observations by RainViewer' : 'Weather values by Open‑Meteo'}</div>
      {layer === 'radar' && frames.length > 0 && selectedFrame && (
        <div className="radar-frame-label">Past radar · {new Date(selectedFrame.time * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
      )}
      {layer === 'radar' && frames.length > 1 && (
        <div className="radar-timeline">
          <div className="radar-timeline-head"><span>PAST 2 HOURS</span><span>{frames.length} observations</span></div>
          <input aria-label="Radar observation time" type="range" min={0} max={frames.length - 1} value={Math.min(frameIndex, frames.length - 1)} onChange={(event) => onFrameIndex(Number(event.target.value))} />
          <div className="radar-time-labels"><span>{new Date(frames[0].time * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><span>Most recent</span></div>
        </div>
      )}
    </div>
  );
}
