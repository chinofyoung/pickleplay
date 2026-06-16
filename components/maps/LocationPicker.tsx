"use client";
// Usage: import dynamically in a parent client or server component:
// const LocationPicker = dynamic(() => import("@/components/maps/LocationPicker"), { ssr: false });

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { useState } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";

import { Button } from "@/components/ui/button";

// Fix default icon broken under bundlers
// Next.js static image imports return StaticImageData ({ src, height, width });
// direct string imports return a string. Handle both.
type LeafletIconSrc = { src: string } | string;
function resolveIconUrl(img: LeafletIconSrc): string {
  return typeof img === "string" ? img : img.src;
}

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: resolveIconUrl(markerIcon as LeafletIconSrc),
  iconRetinaUrl: resolveIconUrl(markerIcon2x as LeafletIconSrc),
  shadowUrl: resolveIconUrl(markerShadow as LeafletIconSrc),
});

interface LocationPickerProps {
  defaultCenter?: [number, number];
  defaultZoom?: number;
}

function MapClickHandler({
  onMapClick,
}: {
  onMapClick: (latlng: { lat: number; lng: number }) => void;
}) {
  useMapEvents({
    click(e) {
      onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export default function LocationPicker({
  defaultCenter = [14.5547, 121.0244],
  defaultZoom = 12,
}: LocationPickerProps) {
  // Note: defaultCenter and defaultZoom are initial values only.
  // react-leaflet does not re-center the map when these props change after mount.
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);

  return (
    <div>
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        aria-label="Location picker map"
        className="h-64 w-full rounded-lg overflow-hidden border border-white/10"
        // Explicit style required: Leaflet reads offsetHeight at init before Tailwind's h-64 applies
        style={{ height: "16rem" }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={20}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        <MapClickHandler onMapClick={setPosition} />
        {position !== null && (
          <Marker
            position={position}
            draggable={true}
            eventHandlers={{
              dragend(e) {
                const latlng = e.target.getLatLng();
                setPosition({ lat: latlng.lat, lng: latlng.lng });
              },
            }}
          />
        )}
      </MapContainer>

      {position !== null && (
        <>
          <input type="hidden" name="lat" value={position.lat} />
          <input type="hidden" name="lng" value={position.lng} />
          <p className="text-sm text-muted-foreground mt-1">
            Lat: {position.lat.toFixed(6)}, Lng: {position.lng.toFixed(6)}
          </p>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => setPosition(null)}
            className="mt-2"
          >
            Clear pin
          </Button>
        </>
      )}
    </div>
  );
}
