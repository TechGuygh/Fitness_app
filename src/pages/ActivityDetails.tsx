import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { MapContainer, TileLayer, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { ChevronLeft } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip, BarChart, Bar } from "recharts";
import { Drawer } from "vaul";
import { formatDistance } from "@/src/lib/utils";

export default function ActivityDetails() {
  const { activityId } = useParams<{ activityId: string }>();
  const navigate = useNavigate();
  const [activity, setActivity] = useState<any>(null);

  useEffect(() => {
    if (!activityId) return;
    const fetchActivity = async () => {
      try {
        const docSnap = await getDoc(doc(db, "activities", activityId));
        if (docSnap.exists()) {
          setActivity({ id: docSnap.id, ...docSnap.data() });
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchActivity();
  }, [activityId]);

  if (!activity) return <div className="h-screen w-full bg-black flex items-center justify-center text-white">Loading...</div>;

  const mapboxUrl = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

  const mapCenter = activity.route && activity.route.length > 0 ? activity.route[0] : [0, 0];

  const m = Math.floor((activity.timeSeconds || 0) / 60);
  const s = Math.floor((activity.timeSeconds || 0) % 60);
  const timeFormatted = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;

  const pace = activity.pace || 0;
  const paceM = Math.floor(pace);
  const paceS = Math.floor((pace % 1) * 60).toString().padStart(2, '0');
  const paceFormatted = pace > 0 ? `${paceM}'${paceS}"` : "0'00\"";

  return (
    <div className="relative h-[100dvh] w-full bg-black overflow-hidden">
      <div className="absolute top-8 md:top-12 left-4 md:left-6 z-[500]">
        <button onClick={() => navigate('/')} className="bg-black/50 backdrop-blur-md p-3 rounded-full border border-white/10 text-white hover:bg-black/70 transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
      </div>

      <div className="absolute inset-0 z-0">
        <MapContainer 
          center={mapCenter as [number, number]} 
          zoom={15} 
          zoomControl={false}
          className="w-full h-full pb-[30vh]"
        >
          <TileLayer url={mapboxUrl} attribution="&copy; CARTO" />
          {activity.route && activity.route.length > 0 && (
            <Polyline positions={activity.route} color="#CCFF00" weight={6} opacity={0.8} />
          )}
        </MapContainer>
      </div>

      <Drawer.Root open={true} dismissible={false} snapPoints={[0.3, 0.6, 1]} activeSnapPoint={0.6} setActiveSnapPoint={() => {}}>
        <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 bg-black/10 z-[100]" />
            <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[200] max-h-[90dvh] flex flex-col bg-[#111]/90 backdrop-blur-2xl rounded-t-[40px] border-t border-[#333] shadow-2xl focus:outline-none">
              <Drawer.Title className="sr-only">Workout Details</Drawer.Title>
              <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-[#444] mb-8 mt-4" />
              <div className="flex-1 overflow-y-auto w-full max-w-[600px] mx-auto px-6 pb-12 scroller">
                 
                 <div className="text-center mb-10 shrink-0">
                    <p className="text-gray-400 font-medium tracking-widest uppercase text-sm mb-2">
                       Workout Summary
                    </p>
                    <div className="flex items-baseline justify-center gap-1">
                       <span className="font-display font-bold text-7xl tracking-tighter text-white">{formatDistance(activity.distance || 0).replace(/[a-z]/g, '')}</span>
                       <span className="text-xl text-gray-500 font-medium">{formatDistance(activity.distance || 0).replace(/[\d.]/g, '')}</span>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4 px-2 md:px-0 shrink-0 mb-8">
                    <div className="text-center bg-black p-4 rounded-2xl border border-[#222]">
                      <p className="text-gray-500 font-medium tracking-widest uppercase text-[10px] mb-1">Time</p>
                      <span className="font-display font-medium text-xl text-white">{timeFormatted}</span>
                    </div>
                    <div className="text-center bg-black p-4 rounded-2xl border border-[#222]">
                      <p className="text-gray-500 font-medium tracking-widest uppercase text-[10px] mb-1">Pace</p>
                      <span className="font-display font-medium text-xl text-white">{paceFormatted}</span>
                    </div>
                 </div>

                 {activity.splits && activity.splits.length > 0 && (
                     <div className="mb-8">
                         <h5 className="text-gray-300 text-xs font-bold mb-3 uppercase tracking-wider">Pace Splits (min/km)</h5>
                         <div className="h-40 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={activity.splits}>
                                    <XAxis dataKey="split" axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 10 }} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#111', borderColor: '#333', borderRadius: '8px' }}
                                        itemStyle={{ color: '#fff' }}
                                        cursor={{ fill: '#ffffff10' }}
                                    />
                                    <Bar dataKey="pace" fill="var(--color-brand-500)" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                         </div>
                     </div>
                 )}

                 {activity.routeData && activity.routeData.length > 0 && (
                    <div>
                         <h5 className="text-gray-300 text-xs font-bold mb-3 uppercase tracking-wider">Elevation (m)</h5>
                         <div className="h-40 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                               <AreaChart data={activity.routeData}>
                                   <defs>
                                     <linearGradient id="colorAlt" x1="0" y1="0" x2="0" y2="1">
                                       <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3}/>
                                       <stop offset="95%" stopColor="#4ade80" stopOpacity={0}/>
                                     </linearGradient>
                                   </defs>
                                   <Tooltip 
                                      contentStyle={{ backgroundColor: '#111', borderColor: '#333', borderRadius: '8px' }}
                                      itemStyle={{ color: '#fff' }}
                                      labelFormatter={() => ''}
                                   />
                                   <Area type="monotone" dataKey="altitude" stroke="#4ade80" fillOpacity={1} fill="url(#colorAlt)" />
                               </AreaChart>
                            </ResponsiveContainer>
                         </div>
                    </div>
                 )}
              </div>
            </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
      <style>{`
        .scroller::-webkit-scrollbar {
            width: 0px;
        }
      `}</style>
    </div>
  );
}
