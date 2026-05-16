import { useEffect, useRef } from "react";
import L from "leaflet";

interface Props {
  lat: number;
  lon: number;
  city: string;
  anomalyData?: number;
}

export default function MapView({ lat, lon, city }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // prevent re-init
    if (mapRef.current) {
      mapRef.current.remove();
    }

    const map = L.map(containerRef.current).setView([lat, lon], 6);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
    }).addTo(map);

    const marker = L.marker([lat, lon]).addTo(map);

    marker.bindPopup(`
      <b>${city}</b><br/>
      Target sector active
    `);

    mapRef.current = map;

    return () => {
      map.remove();
    };
  }, [lat, lon, city]);

  return <div ref={containerRef} className="w-full h-full" />;
}