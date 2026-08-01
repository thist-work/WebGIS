import { useEffect, useRef, useState } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import * as turf from "@turf/turf";

/**
 * 地圖量測圖層（不渲染任何 DOM，僅操作 Leaflet 圖層）
 * mode: null | 'distance' | 'area'
 * onResult(text|null): 回傳目前量測結果文字
 * resetSignal: 數字，每次遞增時清除目前量測
 */
export default function MeasureLayer({ mode, onResult, resetSignal }) {
  const map = useMap();
  const [points, setPoints] = useState([]);
  const layerGroupRef = useRef(null);

  // 量測模式啟用時停用雙擊縮放，避免快速點擊誤觸地圖縮放
  useEffect(() => {
    if (mode) {
      map.doubleClickZoom.disable();
    } else {
      map.doubleClickZoom.enable();
    }
  }, [mode, map]);

  // 切換模式或按下清除時，重置量測
  useEffect(() => {
    setPoints([]);
    if (layerGroupRef.current) {
      map.removeLayer(layerGroupRef.current);
      layerGroupRef.current = null;
    }
    onResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, resetSignal]);

  useMapEvents({
    click(e) {
      if (!mode) return;
      setPoints((prev) => [...prev, [e.latlng.lng, e.latlng.lat]]);
    },
  });

  useEffect(() => {
    if (!mode) return;

    if (layerGroupRef.current) {
      map.removeLayer(layerGroupRef.current);
      layerGroupRef.current = null;
    }
    if (points.length === 0) {
      onResult(null);
      return;
    }

    const group = L.layerGroup();
    const latlngs = points.map(([lng, lat]) => [lat, lng]);

    if (mode === "distance") {
      L.polyline(latlngs, { color: "#c0392b", weight: 3, dashArray: "6 4" }).addTo(group);
      points.forEach((p) =>
        L.circleMarker([p[1], p[0]], { radius: 4, color: "#c0392b", fillOpacity: 1 }).addTo(group)
      );
      if (points.length >= 2) {
        const km = turf.length(turf.lineString(points), { units: "kilometers" });
        onResult(km < 1 ? `距離：${(km * 1000).toFixed(1)} 公尺` : `距離：${km.toFixed(3)} 公里`);
      } else {
        onResult("請在地圖上再點擊一個點以計算距離");
      }
    } else if (mode === "area") {
      points.forEach((p) =>
        L.circleMarker([p[1], p[0]], { radius: 4, color: "#2f6fed", fillOpacity: 1 }).addTo(group)
      );
      if (points.length < 3) {
        L.polyline(latlngs, { color: "#2f6fed", weight: 3 }).addTo(group);
        onResult("請在地圖上再點擊至少 3 個點以計算面積");
      } else {
        const ring = [...points, points[0]];
        const sqm = turf.area(turf.polygon([ring]));
        L.polygon(latlngs, { color: "#2f6fed", weight: 2, fillOpacity: 0.15 }).addTo(group);
        const label = sqm >= 10000 ? `面積：${(sqm / 10000).toFixed(3)} 公頃` : `面積：${sqm.toFixed(1)} 平方公尺`;
        onResult(label);
      }
    }

    group.addTo(map);
    layerGroupRef.current = group;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, mode, map]);

  return null;
}
