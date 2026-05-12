import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Save } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/components/auth/AuthProvider';
import { handleFirestoreError, OperationType } from '@/src/lib/firebase-error';

// Helper for distance calc
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const customIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

function MapEvents({ onAddPoint }: { onAddPoint: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onAddPoint(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function RouteCreatorModal({ isOpen, onClose }: Props) {
  const { user } = useAuth();
  const [points, setPoints] = useState<[number, number][]>([]);
  const [routeName, setRouteName] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleAddPoint = (lat: number, lng: number) => {
    setPoints(prev => [...prev, [lat, lng]]);
  };

  const calculateDistance = () => {
    let d = 0;
    for (let i = 1; i < points.length; i++) {
        d += getDistance(points[i-1][0], points[i-1][1], points[i][0], points[i][1]);
    }
    return d;
  };

  const handleSave = async () => {
    if (!user || points.length < 2 || !routeName.trim()) return;
    setSaving(true);
    try {
       await addDoc(collection(db, "activities"), {
          userId: user.uid,
          activityType: 'run',
          distance: calculateDistance(),
          timeSeconds: 0,
          pace: 0,
          path: points.map(p => ({ lat: p[0], lng: p[1] })),
          createdAt: serverTimestamp(),
          likes: 0,
          isRoute: true, // Custom flag to indicate it's a route
          routeName: routeName
       });
       setPoints([]);
       setRouteName('');
       onClose();
    } catch(e) {
       handleFirestoreError(e, OperationType.CREATE, "activities");
    } finally {
       setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
        <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-[#111] border border-[#222] rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col h-[80vh]">
          <div className="p-4 border-b border-[#222] flex items-center justify-between">
            <h3 className="text-white font-bold text-xl">Create Route</h3>
            <button onClick={onClose} className="p-2 hover:bg-[#222] rounded-full text-gray-400">
              <X className="w-5 h-5"/>
            </button>
          </div>
          
          <div className="p-4 flex gap-4 border-b border-[#222]">
             <input 
               value={routeName}
               onChange={e => setRouteName(e.target.value)}
               placeholder="Route Name (e.g. Morning River Loop)"
               className="flex-1 bg-[#222] border border-[#333] rounded-xl px-4 py-2 text-white outline-none"
             />
             <div className="text-brand-500 font-bold bg-[#222] px-4 py-2 rounded-xl border border-[#333] flex items-center">
                {calculateDistance().toFixed(2)} km
             </div>
          </div>
          
          <div className="flex-1 relative bg-[#222]">
             <MapContainer center={[51.505, -0.09]} zoom={13} style={{ height: "100%", width: "100%" }}>
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />
                <MapEvents onAddPoint={handleAddPoint} />
                {points.length > 0 && <Marker position={points[0]} icon={customIcon} />}
                {points.length > 1 && <Marker position={points[points.length - 1]} icon={customIcon} />}
                {points.length > 1 && <Polyline positions={points} color="#CCFF00" weight={4} />}
             </MapContainer>
             <div className="absolute bottom-4 left-4 right-4 z-[400] bg-black/80 text-white text-xs p-3 rounded-xl backdrop-blur-md pointer-events-none">
                 Click on the map to draw your route. Add at least 2 points.
             </div>
          </div>
          
          <div className="p-4 border-t border-[#222] flex justify-end gap-3">
             <button onClick={() => setPoints([])} className="text-gray-400 hover:text-white px-4 py-2 font-medium">Clear Points</button>
             <button disabled={saving || points.length < 2 || !routeName.trim()} onClick={handleSave} className="bg-brand-500 text-black font-bold px-6 py-2 rounded-xl flex items-center gap-2 disabled:opacity-50">
               <Save className="w-4 h-4"/> {saving ? 'Saving...' : 'Save Route'}
             </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
