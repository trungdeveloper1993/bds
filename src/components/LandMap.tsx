/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { SyncedPoint, MapFocus } from '../types';
import { calculateCartesianDistance, convertGPSToVN2000 } from '../utils';
import { MapPin, Search, Navigation, Layers, RotateCcw, AlertCircle, Sparkles } from 'lucide-react';

// Declare Leaflet global object (loaded via CDN in index.html)
declare const L: any;

interface LandMapProps {
  points: SyncedPoint[];
  onChangePoints: (points: SyncedPoint[]) => void;
  onClear: () => void;
  area: number;
  mapFocus: MapFocus | null;
  centralMeridian: number;
}

export default function LandMap({ points, onChangePoints, onClear, area, mapFocus, centralMeridian }: LandMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polygonRef = useRef<any>(null);
  const polylinesRef = useRef<any[]>([]);
  const tooltipsRef = useRef<any[]>([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [mapType, setMapType] = useState<'street' | 'satellite'>('satellite');
  const [tileLayer, setTileLayer] = useState<any>(null);
  const [hasMapError, setMapError] = useState(false);

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    try {
      if (typeof L === 'undefined') {
        console.error('Leaflet is not loaded');
        setMapError(true);
        return;
      }

      // Hanoi coordinates default [21.0285, 105.8542]
      const defaultCenter = points.length > 0 
        ? [points[0].lat, points[0].lng] 
        : [21.0285, 105.8542];
      
      const zoomLevel = points.length > 0 ? 18 : 13;

      const map = L.map(mapRef.current, {
        center: defaultCenter,
        zoom: zoomLevel,
        zoomControl: false, // Custom zoom placement
      });

      // Add Zoom Control at bottom right
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Layers definition
      const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      });

      const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      });

      // Add default layer
      if (mapType === 'satellite') {
        satelliteLayer.addTo(map);
      } else {
        streetLayer.addTo(map);
      }

      mapInstance.current = map;

      // Handle map clicks to add points
      map.on('click', (e: any) => {
        const { lat, lng } = e.latlng;
        
        // Prevent click events when dragging
        if (mapInstance.current._draggedMarker) {
          mapInstance.current._draggedMarker = false;
          return;
        }

        const rawLat = parseFloat(lat.toFixed(6));
        const rawLng = parseFloat(lng.toFixed(6));
        const vn2000 = convertGPSToVN2000(rawLat, rawLng, centralMeridianRef.current);

        const newPoint: SyncedPoint = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          lat: rawLat,
          lng: rawLng,
          x: vn2000.x,
          y: vn2000.y,
          label: `Mốc ${pointsRef.current.length + 1}`
        };

        onChangePoints([...pointsRef.current, newPoint]);
      });

      // Recalculate size on init to avoid display bugs in tabs
      setTimeout(() => {
        map.invalidateSize();
      }, 300);

    } catch (err) {
      console.error('Error initializing map:', err);
      setMapError(true);
    }

    return () => {
      if (mapInstance.current) {
        mapInstance.current.off();
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // Sync state points with latest points list to avoid closures on map events
  const pointsRef = useRef(points);
  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  const centralMeridianRef = useRef(centralMeridian);
  useEffect(() => {
    centralMeridianRef.current = centralMeridian;
  }, [centralMeridian]);

  // Handle focusing map on single point or bounding box
  useEffect(() => {
    if (!mapFocus) return;
    const map = mapInstance.current;
    if (!map) return;

    if (mapFocus.type === 'point' && mapFocus.lat !== undefined && mapFocus.lng !== undefined) {
      map.setView([mapFocus.lat, mapFocus.lng], 19);
    } else if (mapFocus.type === 'bounds') {
      if (points.length > 0) {
        const latlngs = points.map(p => [p.lat, p.lng]);
        map.fitBounds(latlngs, { padding: [50, 50] });
      }
    }
  }, [mapFocus]);

  // Handle layer switching
  const handleMapTypeToggle = () => {
    const map = mapInstance.current;
    if (!map) return;

    // Remove all tile layers
    map.eachLayer((layer: any) => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });

    const nextType = mapType === 'satellite' ? 'street' : 'satellite';
    setMapType(nextType);

    if (nextType === 'satellite') {
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri'
      }).addTo(map);
    } else {
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);
    }
  };

  // Update Markers, Polygons, and Line Labels whenever points change
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // 1. Clear existing markers
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    // 2. Clear existing lines and labels
    polylinesRef.current.forEach(l => map.removeLayer(l));
    polylinesRef.current = [];
    tooltipsRef.current.forEach(t => map.removeLayer(t));
    tooltipsRef.current = [];

    // 3. Clear existing polygon
    if (polygonRef.current) {
      map.removeLayer(polygonRef.current);
      polygonRef.current = null;
    }

    if (points.length === 0) return;

    const latlngs = points.map(p => [p.lat, p.lng]);

    // 4. Draw Polygons
    if (points.length >= 3) {
      polygonRef.current = L.polygon(latlngs, {
        color: '#4f46e5', // Elegant Indigo real estate boundary
        fillColor: '#818cf8',
        fillOpacity: 0.25,
        weight: 3,
        dashArray: '2, 5' // Dash border looks like surveyor markings
      }).addTo(map);
    }

    // 5. Draw Vertex Markers
    points.forEach((point, index) => {
      // Create a custom styled DIV icon to show point labels cleanly
      const customIcon = L.divIcon({
        className: 'custom-map-marker-container',
        html: `
          <div class="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 border-2 border-white text-white font-black text-xs shadow-md">
            ${index + 1}
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([point.lat, point.lng], {
        icon: customIcon,
        draggable: true
      }).addTo(map);

      // Tooltip to show Lat, Lng
      marker.bindTooltip(`<b>${point.label}</b><br/>Vĩ độ: ${point.lat}<br/>Kinh độ: ${point.lng}`, {
        direction: 'top',
        offset: [0, -10]
      });

      // Set flag to prevent adding a new point upon drag release
      marker.on('dragstart', () => {
        if (mapInstance.current) {
          mapInstance.current._draggedMarker = true;
        }
      });

      // Handle marker drag for ULTRA-SMOOTH real-time drawing feedback without React lags
      marker.on('drag', (e: any) => {
        try {
          const { lat, lng } = e.target.getLatLng();
          
          // Update this marker's tooltip contents in real-time
          marker.getTooltip()?.setContent(`<b>${point.label}</b><br/>Vĩ độ: ${lat.toFixed(6)}<br/>Kinh độ: ${lng.toFixed(6)}`);

          // Update main polygon coords
          const currentLatLngs = markersRef.current.map(m => m.getLatLng());
          if (polygonRef.current) {
            polygonRef.current.setLatLngs(currentLatLngs);
          }

          // Update relative polylines and distance tooltips
          const n = currentLatLngs.length;
          if (n >= 2) {
            const totalLines = n >= 3 ? n : 1;
            
            const updateLine = (i: number) => {
              if (i < 0 || i >= totalLines) return;
              const p1 = currentLatLngs[i];
              const p2 = currentLatLngs[(i + 1) % n];
              
              const polyline = polylinesRef.current[i];
              if (polyline) {
                polyline.setLatLngs([p1, p2]);
              }
              
              const tooltip = tooltipsRef.current[i];
              if (tooltip) {
                const p1_vn = convertGPSToVN2000(p1.lat, p1.lng, centralMeridianRef.current);
                const p2_vn = convertGPSToVN2000(p2.lat, p2.lng, centralMeridianRef.current);
                const dist = calculateCartesianDistance(p1_vn, p2_vn);
                const midLat = (p1.lat + p2.lat) / 2;
                const midLng = (p1.lng + p2.lng) / 2;
                tooltip.setLatLng([midLat, midLng]);
                tooltip.setContent(`${dist.toFixed(1)}m`);
              }
            };

            // Update only the two lines connected to this dragged vertex marker
            if (n >= 3) {
              updateLine((index - 1 + n) % n);
              updateLine(index);
            } else {
              updateLine(0);
            }
          }
        } catch (err) {
          console.error("Error during real-time dragging updates:", err);
        }
      });

      // Synchronize with react state on drag end
      marker.on('dragend', (e: any) => {
        const { lat, lng } = e.target.getLatLng();
        const updatedPoints = [...pointsRef.current];
        const idx = updatedPoints.findIndex(p => p.id === point.id);
        if (idx !== -1) {
          const rawLat = parseFloat(lat.toFixed(6));
          const rawLng = parseFloat(lng.toFixed(6));
          const vn2000 = convertGPSToVN2000(rawLat, rawLng, centralMeridianRef.current);
          
          updatedPoints[idx] = {
            ...updatedPoints[idx],
            lat: rawLat,
            lng: rawLng,
            x: vn2000.x,
            y: vn2000.y
          };
          
          // Notify parent of updated points coordinate
          onChangePoints(updatedPoints);
        }
      });

      markersRef.current.push(marker);
    });

    // 6. Draw Boundary Lines and Lengths
    if (points.length >= 2) {
      const n = points.length;
      const totalLines = points.length >= 3 ? n : 1; // Only close loop if 3+ points

      for (let i = 0; i < totalLines; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % n];
        
        const dist = calculateCartesianDistance(p1, p2);
        const midLat = (p1.lat + p2.lat) / 2;
        const midLng = (p1.lng + p2.lng) / 2;

        // Draw dotted lines between vertices
        const line = L.polyline([[p1.lat, p1.lng], [p2.lat, p2.lng]], {
          color: '#ffffff',
          weight: 1.5,
          opacity: 0.8,
          dashArray: '3, 4'
        }).addTo(map);

        // Bind simple dynamic tooltip for distances
        const distanceTooltip = L.tooltip({
          permanent: true,
          direction: 'center',
          className: 'bg-slate-900/90 text-white border-none font-mono text-[10px] px-1.5 py-0.5 rounded shadow shadow-slate-950/40 font-medium'
        })
        .setContent(`${dist.toFixed(1)}m`)
        .setLatLng([midLat, midLng])
        .addTo(map);

        polylinesRef.current.push(line);
        tooltipsRef.current.push(distanceTooltip);
      }
    }
  }, [points]);

  // Adjust map view to fit drawn polygon boundaries automatically
  const fitBounds = () => {
    const map = mapInstance.current;
    if (!map || points.length === 0) return;
    
    const latlngs = points.map(p => [p.lat, p.lng]);
    map.fitBounds(latlngs, { padding: [50, 50] });
  };

  // Zoom to single point
  const zoomToPoint = (lat: number, lng: number) => {
    const map = mapInstance.current;
    if (!map) return;
    map.setView([lat, lng], 19);
  };

  // Handle nominating search
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchResults([]);
    try {
      // Append "Vietnam" to restrict searches to Vietnam geography
      const query = encodeURIComponent(`${searchQuery}, Việt Nam`);
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=5`);
      const data = await response.json();
      setSearchResults(data);
    } catch (err) {
      console.error('Error searching place:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Locate current position
  const handleLocateMe = () => {
    const map = mapInstance.current;
    if (!map) return;

    if (!navigator.geolocation) {
      alert("Trình duyệt không hỗ trợ định vị GPS.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        map.setView([latitude, longitude], 17);
        
        // Optionally add a temporary marker for current location
        const gpsMarker = L.circle([latitude, longitude], {
          color: '#3b82f6',
          fillColor: '#60a5fa',
          fillOpacity: 0.5,
          radius: 15
        }).addTo(map);
        
        gpsMarker.bindPopup("Vị trí của bạn").openPopup();
      },
      (error) => {
        console.error("Geolocation error:", error);
        alert("Không thể định vị GPS của bạn. Hãy bật quyền định vị trong cài đặt.");
      }
    );
  };

  const handleSelectSearchResult = (result: any) => {
    const map = mapInstance.current;
    if (!map) return;

    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    map.setView([lat, lon], 17);
    setSearchResults([]); // Clear search list
    setSearchQuery(result.display_name.split(',')[0]); // Abbreviate query
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-[24px] overflow-hidden border border-slate-200 shadow-sm relative">
      {/* Geocoding / Search Bar Overlay */}
      <div className="absolute top-4 left-4 right-4 z-50 max-w-md bg-white rounded-xl shadow-lg border border-slate-100 p-2 flex flex-col gap-1">
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <MapPin className="text-indigo-500 shrink-0 w-5 h-5 ml-2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm địa chỉ thửa đất (ví dụ: Hoàn Kiếm, Quận 1...)"
            className="w-full text-sm outline-none placeholder:text-slate-400 bg-transparent py-1.5"
          />
          <button
            type="submit"
            className="p-1.5 hover:bg-slate-50 text-slate-500 rounded-lg shrink-0 transition"
          >
            <Search className="w-4 h-4" />
          </button>
        </form>

        {/* Nominatim Search Result Dropdown */}
        {searchResults.length > 0 && (
          <div className="mt-1 border-t border-slate-100 max-h-60 overflow-y-auto pt-1">
            {searchResults.map((result, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectSearchResult(result)}
                className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-indigo-50 rounded-lg transition-colors flex flex-col gap-0.5 border-b border-slate-50 last:border-0"
              >
                <span className="font-semibold text-slate-800">
                  {result.display_name.split(',')[0]}
                </span>
                <span className="text-[10px] text-slate-400 truncate">
                  {result.display_name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Floating Action Buttons Left Side */}
      <div className="absolute top-20 right-4 z-50 flex flex-col gap-2">
        {/* Toggle layer */}
        <button
          onClick={handleMapTypeToggle}
          title={mapType === 'satellite' ? "Chuyển sang bản đồ đường phố" : "Chuyển sang bản đồ vệ tinh"}
          className="p-3 bg-white hover:bg-slate-50 text-slate-700 hover:text-indigo-600 rounded-xl shadow-md border border-slate-100 transition-all active:scale-95 flex items-center justify-center cursor-pointer"
        >
          <Layers className="w-5 h-5" />
          <span className="text-[10px] absolute right-14 bg-slate-900 text-white font-medium px-2 py-1 rounded shadow-md opacity-0 hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            {mapType === 'satellite' ? "Bản đồ đường" : "Bản đồ vệ tinh"}
          </span>
        </button>

        {/* GPS Locate me */}
        <button
          onClick={handleLocateMe}
          title="Định vị của tôi"
          className="p-3 bg-white hover:bg-slate-50 text-slate-700 hover:text-indigo-600 rounded-xl shadow-md border border-slate-100 transition-all active:scale-95 flex items-center justify-center cursor-pointer"
        >
          <Navigation className="w-5 h-5" />
        </button>

        {/* Fit Bounds */}
        {points.length > 0 && (
          <button
            onClick={fitBounds}
            title="Xem toàn bộ ranh đất"
            className="p-3 bg-white hover:bg-slate-50 text-slate-700 hover:text-indigo-600 rounded-xl shadow-md border border-slate-100 transition-all active:scale-95 flex items-center justify-center animate-pulse cursor-pointer"
          >
            <Sparkles className="w-5 h-5 text-indigo-500" />
          </button>
        )}

        {/* Reset / Clear Map points */}
        {points.length > 0 && (
          <button
            onClick={onClear}
            title="Xóa tất cả các điểm mốc"
            className="p-3 bg-white hover:bg-red-50 text-slate-700 hover:text-red-500 rounded-xl shadow-md border border-slate-100 transition-all active:scale-95 flex items-center justify-center cursor-pointer"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Actual Map Canvas Div */}
      {hasMapError ? (
        <div className="flex-1 bg-slate-100 flex flex-col items-center justify-center p-6 text-center text-slate-500">
          <AlertCircle className="w-12 h-12 text-slate-400 mb-3" />
          <p className="font-medium text-slate-700">Lỗi nạp thư viện bản đồ số hóa</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            Vui lòng kiểm tra kết nối mạng của bạn để nạp thư viện Leaflet từ CDN.
          </p>
        </div>
      ) : (
        <div ref={mapRef} className="flex-1 w-full h-full min-h-[350px] bg-slate-100 relative" />
      )}

      {/* Map Bottom Instruction Panel */}
      <div className="px-4 py-2 bg-slate-900 text-slate-200 text-xs flex justify-between items-center z-20 shadow-inner">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-ping shrink-0" />
          <span className="font-medium">
            {points.length === 0 
              ? "Click vào bất cứ điểm nào trên bản đồ để cắm điểm mốc ranh đất" 
              : points.length < 3 
                ? `Đã cắm ${points.length} mốc. Cần tối thiểu 3 mốc để khép thửa tạo hình đất.`
                : `Thửa đất gồm ${points.length} điểm mốc ranh giới.`
            }
          </span>
        </div>
        
        {points.length > 0 && (
          <div className="flex gap-3 text-[11px] font-mono shrink-0 text-slate-400">
            <span>DT: <strong className="text-emerald-400">{area.toFixed(1)} m²</strong></span>
          </div>
        )}
      </div>
    </div>
  );
}
