import { useState, useCallback } from "react";
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
import { RiCloseLine, RiCrosshair2Line, RiMapPinLine } from "react-icons/ri";
import { useLang } from "../context/LangContext";
import { useTheme } from "../context/ThemeContext";
import { t } from "../i18n/translations";
import {
  reverseGeocode as reverseGeocodeApi,
  getEnglishName,
} from "../api/geocode";

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

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (city: string) => void;
  center?: { lat: number; lon: number } | null;
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

function FlyTo({
  lat,
  lng,
  zoom,
}: {
  lat: number;
  lng: number;
  zoom: number;
}) {
  const map = useMap();
  map.flyTo([lat, lng], zoom, { duration: 1.2 });
  return null;
}

export function MapModal({ open, onClose, onSelect, center }: Props) {
  const { lang } = useLang();
  const { theme } = useTheme();
  const [marker, setMarker] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [localName, setLocalName] = useState<string | null>(null);
  const [englishName, setEnglishName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [flyTarget, setFlyTarget] = useState<{
    lat: number;
    lng: number;
    zoom: number;
  } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const defaultCenter: [number, number] = center
    ? [center.lat, center.lon]
    : [43.24, 76.95];

  const tileUrl =
    theme === "dark"
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

  const handleMapClick = useCallback(
    async (lat: number, lng: number) => {
      setMarker({ lat, lng });
      setLoading(true);
      setLocalName(null);
      setEnglishName(null);

      // Fetch both local and English names in parallel
      const [local, english] = await Promise.all([
        reverseGeocodeApi(lat, lng, lang),
        getEnglishName(lat, lng),
      ]);

      setLocalName(local);
      setEnglishName(english);
      setLoading(false);
    },
    [lang]
  );

  const handleGeo = useCallback(() => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("Geolocation not supported");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setMarker({ lat, lng });
        setFlyTarget({ lat, lng, zoom: 12 });
        handleMapClick(lat, lng);
      },
      () => setGeoError("Location access denied"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [handleMapClick]);

  const handleSelect = () => {
    // Send English name to backend
    if (englishName) {
      onSelect(englishName);
      onClose();
    }
  };

  return (
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
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
            style={{
              width: "100%",
              maxWidth: 800,
              height: "75vh",
              maxHeight: 600,
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 18px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--text-1)",
                }}
              >
                <RiMapPinLine style={{ color: "var(--accent)" }} />
                {t(lang, "selectLocation")}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={handleGeo}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "6px 12px",
                    borderRadius: 8,
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    fontSize: 12,
                    fontWeight: 500,
                    border: "1px solid var(--border)",
                  }}
                >
                  <RiCrosshair2Line style={{ fontSize: 14 }} />
                  {t(lang, "myLocation")}
                </button>
                <button
                  onClick={onClose}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: "var(--bg-input)",
                    color: "var(--text-2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid var(--border)",
                  }}
                >
                  <RiCloseLine style={{ fontSize: 16 }} />
                </button>
              </div>
            </div>

            {geoError && (
              <div
                style={{
                  padding: "6px 18px",
                  background: "rgba(239,68,68,0.08)",
                  color: "var(--red)",
                  fontSize: 12,
                }}
              >
                ⚠ {geoError}
              </div>
            )}

            {/* Map */}
            <div style={{ flex: 1 }}>
              <MapContainer
                center={defaultCenter}
                zoom={5}
                style={{ width: "100%", height: "100%" }}
              >
                <TileLayer url={tileUrl} attribution="&copy; CARTO" />
                <ClickHandler onSelect={handleMapClick} />
                {flyTarget && (
                  <FlyTo
                    lat={flyTarget.lat}
                    lng={flyTarget.lng}
                    zoom={flyTarget.zoom}
                  />
                )}
                {marker && (
                  <Marker position={[marker.lat, marker.lng]}>
                    <Popup>
                      {loading ? t(lang, "resolving") : localName ?? "..."}
                    </Popup>
                  </Marker>
                )}
              </MapContainer>
            </div>

            {/* Footer */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 18px",
                borderTop: "1px solid var(--border)",
              }}
            >
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                {marker
                  ? loading
                    ? t(lang, "resolving")
                    : `📍 ${localName ?? "..."}${
                        englishName && englishName !== localName
                          ? ` (${englishName})`
                          : ""
                      }`
                  : t(lang, "clickMap")}
              </span>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleSelect}
                disabled={!englishName || loading}
                style={{
                  padding: "8px 20px",
                  borderRadius: 8,
                  background:
                    englishName && !loading
                      ? "var(--accent)"
                      : "var(--bg-input)",
                  color:
                    englishName && !loading ? "#fff" : "var(--text-3)",
                  fontSize: 13,
                  fontWeight: 600,
                  opacity: englishName && !loading ? 1 : 0.5,
                }}
              >
                {t(lang, "getForecast")}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}