
import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, arrayUnion } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import { Play, Plus, Search, Calendar, MapPin, Navigation } from "lucide-react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import { GeoSearchControl, OpenStreetMapProvider } from "leaflet-geosearch";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-geosearch/dist/geosearch.css";

function SearchField({ provider, onResult }: { provider: any, onResult: (res: any) => void }) {
  const map = useMap();
  useEffect(() => {
    const searchControl = new (GeoSearchControl as any)({
      provider,
      showMarker: false,
      showPopup: false,
      autoClose: true,
      retainZoomLevel: false,
      animateZoom: true,
      keepResult: false,
      searchLabel: 'Enter address'
    });
    
    map.addControl(searchControl);
    
    const handleResult = (e: any) => {
        onResult(e);
    };
    
    map.on('geosearch/showlocation', handleResult);
    
    return () => {
        map.removeControl(searchControl);
        map.off('geosearch/showlocation', handleResult);
    };
  }, [map, provider, onResult]);
  return null;
}

function LocationPicker({ position, setPosition }: { position: [number, number] | null, setPosition: (pos: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });
  return position === null ? null : <Marker position={position} />;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function Runs() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [runs, setRuns] = useState<any[]>([]);
  const [formData, setFormData] = useState<any>({ title: "", date: "", time: "", distanceGoal: "", estimatedPace: "", maxParticipants: "", type: "casual", visibility: "public", location: null });

  useEffect(() => {
    // Fix Leaflet marker icons safely inside useEffect
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
  }, []);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
        },
        (error) => console.error("Error getting location", error)
      );
    }
  }, []);

  // Filter runs based on proximity (e.g., within 50km)
  const nearbyRuns = userLocation ? runs.filter(run => {
    if (!run.location) return false;
    const d = getDistance(userLocation[0], userLocation[1], run.location[0], run.location[1]);
    return d < 50; // Within 50km
  }) : [];

  useEffect(() => {
    const q = query(collection(db, "runs"));
    const unsub = onSnapshot(q, (snapshot) => {
        setRuns(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsub;
  }, []);

  const provider = React.useMemo(() => new OpenStreetMapProvider(), []);

  const createRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.location) return;
    await addDoc(collection(db, "runs"), {
        ...formData,
        creatorId: user.uid,
        createdAt: serverTimestamp()
    });
    setShowForm(false);
    setFormData({ title: "", date: "", time: "", distanceGoal: "", estimatedPace: "", maxParticipants: "", type: "casual", visibility: "public", location: null });
  };

  const joinRun = async (runId: string) => {
    if (!user) return;
    const runRef = doc(db, "runs", runId);
    await updateDoc(runRef, {
        participants: arrayUnion(user.uid)
    });
  };

  return (
    <div className="p-4 text-white">
      <h1 className="text-2xl font-bold mb-4">Scheduled Runs</h1>
      {nearbyRuns.length > 0 && (
         <div className="mb-6">
            <h2 className="text-lg font-bold mb-2">Runs Nearby</h2>
            <div className="space-y-4">
                {nearbyRuns.map(run => (
                   <div key={run.id} className="p-4 bg-[#111] rounded-xl border border-brand-500 cursor-pointer" onClick={() => navigate(`/runs/${run.id}`)}>
                      <p className="text-brand-500 text-xs font-bold uppercase tracking-wider mb-1">Nearby</p>
                      <h2 className="text-lg font-bold">{run.title}</h2>
                   </div>
                ))}
            </div>
         </div>
      )}
      <button onClick={() => setShowForm(!showForm)} className="mb-4 bg-brand-500 text-black px-4 py-2 rounded-xl text-sm font-bold">
        {showForm ? "Cancel" : "Create New Run"}
      </button>

      {showForm && (
        <form onSubmit={createRun} className="mb-6 p-4 bg-[#111] rounded-xl border border-[#333] space-y-2">
            <input placeholder="Title" required className="w-full bg-black p-2 rounded" onChange={e => setFormData({...formData, title: e.target.value})} />
            <div className="flex gap-2">
                <div className="w-full">
                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest block mb-1">Date</label>
                    <input type="date" required className="w-full bg-black p-2 rounded text-white" onChange={e => setFormData({...formData, date: e.target.value})} />
                </div>
                <div className="w-full">
                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest block mb-1">Time</label>
                    <input type="time" required className="w-full bg-black p-2 rounded text-white" onChange={e => setFormData({...formData, time: e.target.value})} />
                </div>
            </div>
            <input placeholder="Distance Goal (km)" type="number" required className="w-full bg-black p-2 rounded text-white" onChange={e => setFormData({...formData, distanceGoal: e.target.value})} />
            <input placeholder="Estimated Pace (min/km)" type="number" step="0.1" required className="w-full bg-black p-2 rounded text-white" onChange={e => setFormData({...formData, estimatedPace: e.target.value})} />
            <div className="h-64 rounded-xl overflow-hidden border border-[#333]">
                <MapContainer center={[5.6037, -0.1870]} zoom={13} className="h-full w-full">
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <LocationPicker position={formData.location} setPosition={(pos) => setFormData({...formData, location: pos})} />
                    <SearchField
                        provider={provider}
                        onResult={(result: any) => setFormData({...formData, location: [result.location.y, result.location.x]})}
                    />
                </MapContainer>
            </div>
            <select className="w-full bg-black p-2 rounded" onChange={e => setFormData({...formData, type: e.target.value})}>
                <option value="casual">Casual</option>
                <option value="training">Training</option>
                <option value="marathon">Marathon Prep</option>
            </select>
            <button type="submit" className="w-full bg-brand-500 text-black p-2 rounded-xl font-bold">Create Run</button>
        </form>
      )}

      <div className="space-y-4">
        {runs.map(run => (
          <div key={run.id} className="p-4 bg-[#111] rounded-xl border border-[#333] cursor-pointer" onClick={() => navigate(`/runs/${run.id}`)}>
              <h2 className="text-lg font-bold">{run.title}</h2>
              <p>Date: {run.date} | {run.time}</p>
              <p>Distance Goal: {run.distanceGoal} km</p>
              {user && (!run.participants || !run.participants.includes(user.uid)) && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    joinRun(run.id);
                  }} 
                  className="mt-4 w-full bg-brand-500 text-black px-4 py-2.5 rounded-xl text-sm font-bold active:scale-95 transition-all"
                >
                  Join Run
                </button>
              )}
              {user && run.participants && run.participants.includes(user.uid) && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/activity?runId=${run.id}`);
                  }} 
                  className="mt-4 w-full bg-white text-black px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                >
                  <Navigation className="w-4 h-4 fill-black" /> Track Live Now
                </button>
              )}
          </div>
        ))}
      </div>
    </div>
  );
}
