import { useEffect, useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { FlyToInterpolator } from "@deck.gl/core";
import { Map } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Cell, Beat } from "../types";
import { impactColor, densityColor, blindspotColor, fmt, fmt1 } from "../lib/viz";

const CARTO_DARK =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const CARTO_LIGHT =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

const INITIAL = {
  longitude: 77.5946,
  latitude: 12.9716,
  zoom: 12,
  pitch: 45,
  bearing: -8,
};

interface Props {
  layer: "impact" | "density";
  theme: "dark" | "light";
  showBlind: boolean;
  cells: Cell[];
  blind: Cell[];
  beats: Beat[];
  selectedCell: string | null;
  onSelectCell: (cell: string) => void;
  flyTo: { lat: number; lon: number; key: number; zoom?: number } | null;
}

export default function MapView({
  layer,
  theme,
  showBlind,
  cells,
  blind,
  beats,
  selectedCell,
  onSelectCell,
  flyTo,
}: Props) {
  const isLight = theme === "light";
  const [viewState, setViewState] = useState<any>(INITIAL);

  useEffect(() => {
    if (!flyTo) return;
    setViewState((vs: any) => ({
      ...vs,
      longitude: flyTo.lon,
      latitude: flyTo.lat,
      zoom: flyTo.zoom ?? Math.max(vs.zoom, 14.5),
      pitch: 55,
      transitionDuration: 900,
      transitionInterpolator: new FlyToInterpolator({ speed: 1.4 }),
    }));
  }, [flyTo]);

  const maxImpact = useMemo(
    () => Math.max(95, ...cells.map((c) => c.value ?? c.impact_score)),
    [cells],
  );
  const maxVol = useMemo(
    () => Math.max(1, ...cells.map((c) => c.value ?? c.violations)),
    [cells],
  );

  const layers: any[] = useMemo(
    () =>
      [
        new H3HexagonLayer({
          id: "hexes",
          data: cells,
          pickable: true,
          extruded: true,
          wireframe: true,
          filled: true,
          elevationScale: layer === "density" ? 4 : 7,
          getHexagon: (d: any) => d.cell,
          getElevation: (d: any) =>
            layer === "density" ? d.value ?? d.violations : d.value ?? d.impact_score,
          getFillColor: (d: any) => {
            const base =
              layer === "density"
                ? densityColor(d.value ?? d.violations, maxVol)
                : impactColor(d.value ?? d.impact_score, maxImpact);
            return [base[0], base[1], base[2], d.cell === selectedCell ? 255 : 205];
          },
          getLineColor: (d: any) =>
            d.cell === selectedCell
              ? isLight
                ? [17, 24, 32, 255]
                : [232, 237, 242, 255]
              : isLight
                ? [255, 255, 255, 130]
                : [10, 12, 15, 110],
          updateTriggers: {
            getFillColor: [layer, maxImpact, maxVol, selectedCell],
            getElevation: [layer],
            getLineColor: [selectedCell, theme],
          },
          onClick: (info: any) => info?.object?.cell && onSelectCell(info.object.cell),
        }),
        showBlind &&
          new H3HexagonLayer({
            id: "blind",
            data: blind,
            pickable: true,
            extruded: false,
            stroked: true,
            filled: true,
            getHexagon: (d: any) => d.cell,
            getFillColor: () => {
              const c = blindspotColor();
              return [c[0], c[1], c[2], 60];
            },
            getLineColor: () => {
              const c = blindspotColor();
              return [c[0], c[1], c[2], 255];
            },
            lineWidthMinPixels: 1.5,
            onClick: (info: any) =>
              info?.object?.cell && onSelectCell(info.object.cell),
          }),
        beats.length > 0 &&
          new ScatterplotLayer({
            id: "beat-rings",
            data: beats,
            pickable: true,
            stroked: true,
            filled: true,
            getPosition: (d: any) => [d.lon, d.lat],
            getRadius: 90,
            radiusMinPixels: 13,
            radiusMaxPixels: 30,
            getFillColor: isLight ? [255, 255, 255, 235] : [14, 17, 22, 235],
            getLineColor: (d: any) =>
              d.blindspot ? [56, 189, 248, 255] : [242, 179, 61, 255],
            lineWidthMinPixels: 2.5,
            onClick: (info: any) =>
              info?.object?.cell && onSelectCell(info.object.cell),
          }),
        beats.length > 0 &&
          new TextLayer({
            id: "beat-num",
            data: beats,
            getPosition: (d: any) => [d.lon, d.lat],
            getText: (d: any) => String(d.priority),
            getSize: 15,
            getColor: (d: any) =>
              d.blindspot ? [56, 189, 248, 255] : [242, 179, 61, 255],
            getTextAnchor: "middle",
            getAlignmentBaseline: "center",
          }),
      ].filter(Boolean),
    [
      beats,
      blind,
      cells,
      isLight,
      layer,
      maxImpact,
      maxVol,
      onSelectCell,
      selectedCell,
      showBlind,
      theme,
    ],
  );

  const tipBg = isLight ? "#ffffff" : "#161B22";
  const tipBorder = isLight ? "#D5DDE6" : "#2A323D";
  const tipTitle = isLight ? "#111820" : "#E8EDF2";
  const tipMuted = isLight ? "#5A6675" : "#8B97A7";

  return (
    <div className="h-full w-full">
      <DeckGL
        viewState={viewState}
        onViewStateChange={(e: any) => setViewState(e.viewState)}
        controller={true}
        layers={layers}
        getTooltip={({ object }: any) =>
          object && object.cell
            ? {
                html: `<div style="font-family:Inter,system-ui,sans-serif;max-width:230px">
                  <div style="font-weight:600;color:${tipTitle}">${object.police_station ?? ""}</div>
                  <div style="color:${tipMuted};font-size:11px;margin-bottom:4px">${object.junction_name ?? ""}</div>
                  <div style="font-size:11px;color:#F2B33D">impact ${fmt1(object.impact_score)} - ${fmt(object.violations)} viols</div>
                  ${object.band_share != null && object.band_share < 1 ? `<div style="font-size:10px;color:#0EA5E9">${Math.round(object.band_share * 100)}% of activity in this shift</div>` : ""}
                  ${object.why ? `<div style="color:${tipMuted};font-size:10px;margin-top:4px">${object.why}</div>` : ""}
                </div>`,
                style: {
                  background: tipBg,
                  border: `1px solid ${tipBorder}`,
                  borderRadius: "8px",
                  padding: "8px 10px",
                },
              }
            : null
        }
      >
        <Map mapStyle={isLight ? CARTO_LIGHT : CARTO_DARK} reuseMaps />
      </DeckGL>
    </div>
  );
}
