
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

function LocationPicker({ position, setPosition }: { position: [number, number] | null, setPosition: (pos: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });
  return position === null ? null : <Marker position={position} />;
}

function Recenter({ lat, lng }: { lat: number, lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], 14);
  }, [lat, lng, map]);
  return null;
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
  const [formData, setFormData] = useState<any>({ title: "", date: "", time: "", distanceGoal: "", estimatedPace: "", maxParticipants: "", type: "casual", visibility: "public", startLocation: null, startLocationName: "", destinationLocation: null, destinationLocationName: "" });

  const [startSearch, setStartSearch] = useState("");
  const [startResults, setStartResults] = useState<any[]>([]);
  const [destSearch, setDestSearch] = useState("");
  const [destResults, setDestResults] = useState<any[]>([]);
  const [filterText, setFilterText] = useState("");

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
          const loc: [number, number] = [position.coords.latitude, position.coords.longitude];
          setUserLocation(loc);
          // Auto-set location for the form if it was empty, but maybe not overriding is better.
        },
        (error) => console.error("Error getting location", error)
      );
    }
  }, []);

  // Filter runs based on proximity (e.g., within 50km)
  const nearbyRuns = userLocation ? runs.filter(run => {
    const loc = run.startLocation || run.location;
    if (!loc) return false;
    const d = getDistance(userLocation[0], userLocation[1], loc[0], loc[1]);
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

  useEffect(() => {
    if (formData.startLocation && formData.destinationLocation) {
        fetch(`https://router.project-osrm.org/route/v1/foot/${formData.startLocation[1]},${formData.startLocation[0]};${formData.destinationLocation[1]},${formData.destinationLocation[0]}?overview=false`)
            .then(res => res.json())
            .then(data => {
                if (data.routes && data.routes.length > 0) {
                    const distanceKm = data.routes[0].distance / 1000;
                    const durationMin = data.routes[0].duration / 60;
                    const pace = (durationMin / distanceKm).toFixed(2);
                    setFormData((prev: any) => ({
                        ...prev,
                        distanceGoal: distanceKm.toFixed(2),
                        estimatedPace: pace
                    }));
                }
            })
            .catch(err => {
               console.error("Routing error", err);
               const dist = getDistance(formData.startLocation[0], formData.startLocation[1], formData.destinationLocation[0], formData.destinationLocation[1]);
               const pace = 5.5; 
               setFormData((prev: any) => ({
                   ...prev,
                   distanceGoal: dist.toFixed(2),
                   estimatedPace: pace.toFixed(2)
               }));
            });
    }
  }, [formData.startLocation, formData.destinationLocation]);

  const handleStartSearch = async () => {
    if (!startSearch) return;
    const results = await provider.search({ query: startSearch });
    setStartResults(results);
    if (results.length > 0) {
      setFormData({...formData, startLocation: [results[0].y, results[0].x], startLocationName: results[0].label});
    }
  };

  const handleDestSearch = async () => {
    if (!destSearch) return;
    const results = await provider.search({ query: destSearch });
    setDestResults(results);
    if (results.length > 0) {
      setFormData({...formData, destinationLocation: [results[0].y, results[0].x], destinationLocationName: results[0].label});
    }
  };

  const createRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.startLocation) return;
    await addDoc(collection(db, "runs"), {
        ...formData,
        creatorId: user.uid,
        createdAt: serverTimestamp()
    });
    setShowForm(false);
    setFormData({ title: "", date: "", time: "", distanceGoal: "", estimatedPace: "", maxParticipants: "", type: "casual", visibility: "public", startLocation: null, startLocationName: "", destinationLocation: null, destinationLocationName: "" });
    setStartSearch("");
    setDestSearch("");
  };

  const joinRun = async (runId: string) => {
    if (!user) return;
    const runRef = doc(db, "runs", runId);
    await updateDoc(runRef, {
        participants: arrayUnion(user.uid)
    });
  };

  const filteredRuns = runs.filter((run) => {
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    const titleMatch = run.title?.toLowerCase().includes(q);
    const dateMatch = run.date?.includes(q);
    const locationMatch = run.locationName?.toLowerCase().includes(q);
    return titleMatch || dateMatch || locationMatch;
  });

  return (
    <div className="text-white">
      <h1 className="font-display font-semibold text-lg text-gray-200 mb-4">Scheduled Runs</h1>
      {nearbyRuns.length > 0 && (
         <div className="mb-6">
            <h2 className="text-lg font-bold mb-2">Runs Nearby</h2>
            <div className="space-y-4">
                {nearbyRuns.map(run => (
                   <div key={run.id} className="p-4 bg-[#111] rounded-xl border border-brand-500 cursor-pointer" onClick={() => navigate(`/runs/${run.id}`)}>
                      <p className="text-brand-500 text-xs font-bold uppercase tracking-wider mb-1">Nearby</p>
                      <h2 className="text-lg font-bold">{run.title}</h2>
                      {run.startLocationName && <p className="text-gray-400 text-sm mt-1 truncate">{run.startLocationName} <span className="opacity-50">to</span> {run.destinationLocationName || 'Unknown'}</p>}
                      {!run.startLocationName && run.locationName && <p className="text-gray-400 text-sm mt-1 truncate">{run.locationName}</p>}
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
            <div className="flex gap-2">
                <div className="w-full">
                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest block mb-1">Distance Goal (km)</label>
                    <input placeholder="Distance Goal (km)" type="number" step="0.01" required className="w-full bg-black p-2 rounded text-white" value={formData.distanceGoal} onChange={e => setFormData({...formData, distanceGoal: e.target.value})} />
                </div>
                <div className="w-full">
                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest block mb-1">Pace (min/km)</label>
                    <input placeholder="Estimated Pace" type="number" step="0.1" required className="w-full bg-black p-2 rounded text-white" value={formData.estimatedPace} onChange={e => setFormData({...formData, estimatedPace: e.target.value})} />
                </div>
            </div>
            
            <div className="relative z-10 w-full mb-2">
                 <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest block mb-1">Start Location</label>
                 <div className="flex gap-2">
                     <input 
                         placeholder="Start location (e.g. London)" 
                         value={startSearch}
                         onChange={e => setStartSearch(e.target.value)}
                         onKeyDown={e => {
                             if (e.key === 'Enter') {
                                 e.preventDefault();
                                 handleStartSearch();
                             }
                         }}
                         className="flex-1 bg-black p-2 rounded text-white border border-[#333]" 
                     />
                     <button type="button" onClick={handleStartSearch} className="px-4 py-2 bg-brand-500 rounded text-black font-bold">Search</button>
                 </div>
                 {startResults.length > 0 && (
                     <div className="absolute z-20 mt-1 w-full bg-[#111] border border-[#333] rounded-lg max-h-48 overflow-y-auto">
                         {startResults.map((result, i) => (
                             <div 
                                 key={i} 
                                 className="p-2 border-b border-[#222] cursor-pointer hover:bg-[#222] text-sm text-white"
                                 onClick={() => {
                                     setFormData({...formData, startLocation: [result.y, result.x], startLocationName: result.label});
                                     setStartResults([]);
                                     setStartSearch(result.label);
                                 }}
                             >
                                 {result.label}
                             </div>
                         ))}
                     </div>
                 )}
            </div>

            <div className="relative z-0 w-full mb-2">
                 <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest block mb-1">Destination Location</label>
                 <div className="flex gap-2">
                     <input 
                         placeholder="Destination location (e.g. Paris)" 
                         value={destSearch}
                         onChange={e => setDestSearch(e.target.value)}
                         onKeyDown={e => {
                             if (e.key === 'Enter') {
                                 e.preventDefault();
                                 handleDestSearch();
                             }
                         }}
                         className="flex-1 bg-black p-2 rounded text-white border border-[#333]" 
                     />
                     <button type="button" onClick={handleDestSearch} className="px-4 py-2 bg-brand-500 rounded text-black font-bold">Search</button>
                 </div>
                 {destResults.length > 0 && (
                     <div className="absolute z-20 mt-1 w-full bg-[#111] border border-[#333] rounded-lg max-h-48 overflow-y-auto">
                         {destResults.map((result, i) => (
                             <div 
                                 key={i} 
                                 className="p-2 border-b border-[#222] cursor-pointer hover:bg-[#222] text-sm text-white"
                                 onClick={() => {
                                     setFormData({...formData, destinationLocation: [result.y, result.x], destinationLocationName: result.label});
                                     setDestResults([]);
                                     setDestSearch(result.label);
                                 }}
                             >
                                 {result.label}
                             </div>
                         ))}
                     </div>
                 )}
            </div>

            <div className="h-64 rounded-xl overflow-hidden border border-[#333] relative z-0">
                <MapContainer center={formData.startLocation || [5.6037, -0.1870]} zoom={13} className="h-full w-full">
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    {formData.startLocation && <LocationPicker position={formData.startLocation} setPosition={(pos) => setFormData({...formData, startLocation: pos})} />}
                    {formData.destinationLocation && <Marker position={formData.destinationLocation as [number, number]} />}
                    {formData.startLocation && <Recenter lat={formData.startLocation[0]} lng={formData.startLocation[1]} />}
                    {formData.destinationLocation && !formData.startLocation && <Recenter lat={formData.destinationLocation[0]} lng={formData.destinationLocation[1]} />}
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

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input 
            type="text" 
            placeholder="Search runs by title, date, or location..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full bg-[#111] p-3 pl-10 rounded-xl text-white border border-[#333] focus:border-brand-500 outline-none transition-colors"
          />
        </div>
      </div>

      <div className="space-y-4">
        {filteredRuns.map(run => (
          <div key={run.id} className="p-4 bg-[#111] rounded-xl border border-[#333] cursor-pointer" onClick={() => navigate(`/runs/${run.id}`)}>
              <h2 className="text-lg font-bold">{run.title}</h2>
              <p>Date: {run.date} | {run.time}</p>
              {run.startLocationName && <p className="text-gray-400 text-sm mb-1 truncate">{run.startLocationName} <span className="opacity-50">to</span> {run.destinationLocationName || 'Unknown'}</p>}
              {!run.startLocationName && run.locationName && <p className="text-gray-400 text-sm mb-1 truncate">{run.locationName}</p>}
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
