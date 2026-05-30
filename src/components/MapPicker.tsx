import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMapEvents } from "react-leaflet";
import L from "leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const icon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

interface Props {
  lat: number;
  lng: number;
  radius: number;
  editable?: boolean;
  height?: number;
  status?: "inside" | "outside" | "neutral";
  attendeePoint?: { lat: number; lng: number } | null;
  onChange?: (next: { lat: number; lng: number }) => void;
}

function ClickHandler({ onChange }: { onChange?: (n: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(e) {
      onChange?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export function MapPicker({
  lat,
  lng,
  radius,
  editable = false,
  height = 320,
  status = "neutral",
  attendeePoint = null,
  onChange,
}: Props) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const color = useMemo(() => {
    if (status === "inside") return "var(--color-success)";
    if (status === "outside") return "var(--color-destructive)";
    return "var(--color-primary)";
  }, [status]);

  if (!ready) return <div style={{ height }} className="rounded-lg bg-muted animate-pulse" />;

  return (
    <div className="rounded-lg overflow-hidden border" style={{ height }}>
      <MapContainer
        center={[lat, lng]}
        zoom={16}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[lat, lng]} icon={icon} />
        <Circle center={[lat, lng]} radius={radius} pathOptions={{ color, fillOpacity: 0.15 }} />
        {attendeePoint && (
          <Marker position={[attendeePoint.lat, attendeePoint.lng]} icon={icon} />
        )}
        {editable && <ClickHandler onChange={onChange} />}
      </MapContainer>
    </div>
  );
}
