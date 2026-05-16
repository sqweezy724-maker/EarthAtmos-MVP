import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { RiMapPinLine, RiCloseLine, RiFocusLine, RiCrosshair2Line } from "react-icons/ri";

// Fix leaflet marker icons
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface MapPickerProps {
  onCitySelect: (city: string) => void;
  currentLocation?: { lat: number; lon: number } | null;
}

function ClickHandler({
  onSelect,
}: {
  onSelect: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyToLocation({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], zoom, { duration: 1.5 });
  }, [lat, lng, zoom, map]);
  return null;
}

function MapController({ center, zoom }: { center: [number, number] | null; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, zoom, { duration: 1.2 });
    }
  }, [center, zoom, map]);
  return null;
}

export function MapPicker({ onCitySelect, currentLocation }: MapPickerProps) {
  const [open, setOpen] = useState(false);
  const [marker, setMarker] = useState<{ lat: number; lng: number } | null>(null);
  const [cityName, setCityName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ center: [number, number]; zoom: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const defaultCenter: [number, number] = currentLocation
    ? [currentLocation.lat, currentLocation.lon]
    : [43.24, 76.95]; // Almaty default

  // Reverse geocode: coordinates -> city name
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    setCityName(null);
    setGeoError(null);

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`,
        {
          headers: { "User-Agent": "EarthAtmos/2.0" },
          signal: AbortSignal.timeout(8000),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const addr = data.address;
        const name =
          addr?.city ??
          addr?.town ??
          addr?.village ??
          addr?.county ??
          addr?.state ??
          data.display_name?.split(",")[0] ??
          `${lat.toFixed(2)}, ${lng.toFixed(2)}`;

        setCityName(name);
      } else {
        setCityName(`${lat.toFixed(2)}, ${lng.toFixed(2)}`);
      }
    } catch {
      setCityName(`${lat.toFixed(2)}, ${lng.toFixed(2)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      setMarker({ lat, lng });
      reverseGeocode(lat, lng);
    },
    [reverseGeocode]
  );

  const handleSelectCity = useCallback(() => {
    if (cityName) {
      onCitySelect(cityName);
      setOpen(false);
    }
  }, [cityName, onCitySelect]);

  const handleGeolocate = useCallback(() => {
    setGeoError(null);

    if (!navigator.geolocation) {
      setGeoError("Geolocation not supported");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation([lat, lng]);
        setMarker({ lat, lng });
        setFlyTarget({ center: [lat, lng], zoom: 12 });
        reverseGeocode(lat, lng);
      },
      (err) => {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setGeoError("Location permission denied");
            break;
          case err.POSITION_UNAVAILABLE:
            setGeoError("Location unavailable");
            break;
          case err.TIMEOUT:
            setGeoError("Location request timed out");
            break;
          default:
            setGeoError("Failed to get location");
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [reverseGeocode]);

  return (
    <>
      {/* Map toggle button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "10px 18px",
          borderRadius: 12,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "#94a3b8",
          fontSize: 13,
          fontWeight: 500,
          fontFamily: "Inter, sans-serif",
          transition: "all 0.2s",
        }}
      >
        <RiMapPinLine style={{ fontSize: 16 }} />
        Pick on Map
      </motion.button>

      {/* Map Modal */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(8px)",
              padding: 20,
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              style={{
                width: "100%",
                maxWidth: 900,
                height: "80vh",
                maxHeight: 650,
                background: "rgba(17, 24, 39, 0.98)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 20,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Map Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 20px",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <RiMapPinLine style={{ color: "#3b82f6", fontSize: 20 }} />
                  <h3
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: "#f1f5f9",
                    }}
                  >
                    Select Location
                  </h3>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {/* Geolocate button */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleGeolocate}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 14px",
                      borderRadius: 10,
                      background: "rgba(16, 185, 129, 0.15)",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                      color: "#10b981",
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: "Inter, sans-serif",
                    }}
                  >
                    <RiCrosshair2Line style={{ fontSize: 16 }} />
                    My Location
                  </motion.button>

                  {/* Close button */}
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: "rgba(255,255,255,0.05)",
                      color: "#94a3b8",
                      fontSize: 18,
                    }}
                  >
                    <RiCloseLine />
                  </motion.button>
                </div>
              </div>

              {/* Geolocation error */}
              {geoError && (
                <div
                  style={{
                    padding: "8px 20px",
                    background: "rgba(239,68,68,0.1)",
                    color: "#fca5a5",
                    fontSize: 12,
                  }}
                >
                  ⚠ {geoError}
                </div>
              )}

              {/* Map */}
              <div style={{ flex: 1, position: "relative" }}>
                <MapContainer
                  center={defaultCenter}
                  zoom={6}
                  style={{ width: "100%", height: "100%" }}
                  zoomControl={true}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  />
                  <ClickHandler onSelect={handleMapClick} />

                  {flyTarget && (
                    <MapController
                      center={flyTarget.center}
                      zoom={flyTarget.zoom}
                    />
                  )}

                  {marker && (
                    <Marker position={[marker.lat, marker.lng]}>
                      <Popup>
                        <div style={{ textAlign: "center", minWidth: 120 }}>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              marginBottom: 4,
                            }}
                          >
                            {loading ? "Loading..." : cityName ?? "Unknown"}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "#94a3b8",
                            }}
                          >
                            {marker.lat.toFixed(4)}°,{" "}
                            {marker.lng.toFixed(4)}°
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  )}

                  {userLocation && (
                    <Marker
                      position={userLocation}
                      icon={L.divIcon({
                        html: `<div style="
                          width: 16px; height: 16px;
                          background: #3b82f6;
                          border: 3px solid white;
                          border-radius: 50%;
                          box-shadow: 0 0 10px rgba(59,130,246,0.6);
                        "></div>`,
                        className: "",
                        iconSize: [16, 16],
                        iconAnchor: [8, 8],
                      })}
                    >
                      <Popup>Your location</Popup>
                    </Marker>
                  )}
                </MapContainer>

                {/* Crosshair */}
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    pointerEvents: "none",
                    zIndex: 500,
                    opacity: 0.3,
                  }}
                >
                  <RiFocusLine style={{ fontSize: 32, color: "#3b82f6" }} />
                </div>
              </div>

              {/* Footer */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 20px",
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  {marker
                    ? loading
                      ? "Resolving location..."
                      : `📍 ${cityName ?? "Unknown"} (${marker.lat.toFixed(3)}°, ${marker.lng.toFixed(3)}°)`
                    : "Click on the map to select a location"}
                </div>

                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSelectCity}
                  disabled={!cityName || loading}
                  style={{
                    padding: "10px 24px",
                    borderRadius: 12,
                    background:
                      cityName && !loading
                        ? "linear-gradient(135deg, #3b82f6, #06b6d4)"
                        : "rgba(59,130,246,0.2)",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: "Inter, sans-serif",
                    cursor: cityName && !loading ? "pointer" : "not-allowed",
                    opacity: cityName && !loading ? 1 : 0.5,
                  }}
                >
                  Get Forecast
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}