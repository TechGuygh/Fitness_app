import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { doc, getDoc, onSnapshot, collection, query, where, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export default function RunDetails() {
    const { runId } = useParams<{ runId: string }>();
    const [run, setRun] = useState<any>(null);
    const [participants, setParticipants] = useState<any[]>([]);
    const [liveData, setLiveData] = useState<any[]>([]);
    const [myFriends, setMyFriends] = useState<any[]>([]);
    const { user } = useAuth(); // Need to import this hook

    useEffect(() => {
        if (!runId) return;

        const runDocRef = doc(db, "runs", runId);
        getDoc(runDocRef).then(docSnap => {
            if (docSnap.exists()) {
                setRun({ id: docSnap.id, ...docSnap.data() });
            }
        });

        const qParts = query(collection(db, "runParticipants"), where("runId", "==", runId));
        const unsub = onSnapshot(qParts, (snapshot) => {
            setParticipants(snapshot.docs.map(doc => doc.data()));
        });
        
        // Listen to live tracking for this run
        const qLive = query(collection(db, "liveTracking"), where("routeId", "==", runId));
        const unsubLive = onSnapshot(qLive, (snapshot) => {
            setLiveData(snapshot.docs.map(doc => doc.data()));
        });

        return () => {
            unsub();
            unsubLive();
        };
    }, [runId]);

    useEffect(() => {
        if (!user) return;
        const q = query(collection(db, "friendships"), where("userIds", "array-contains", user.uid));
        const unsub = onSnapshot(q, async (snap) => {
            const friendIds = snap.docs.flatMap(d => d.data().userIds as string[]).filter(id => id !== user.uid);
            const userDocs = await Promise.all(friendIds.map(fid => getDoc(doc(db, "users", fid))));
            setMyFriends(userDocs.filter(d => d.exists()).map(d => ({ id: d.id, ...d.data() })));
        });
        return unsub;
    }, [user]);

    const inviteFriend = async (friendId: string) => {
        if (!runId || !user) return;
        try {
            await addDoc(collection(db, "invites"), {
                runId,
                fromUserId: user.uid,
                toUserId: friendId,
                status: 'pending',
                createdAt: serverTimestamp()
            });
            alert("Invite sent!");
        } catch(e) {
            console.error(e);
        }
    };

    if (!run) return <div className="p-4 text-white">Loading...</div>;

    return (
        <div className="p-4 text-white">
            <h1 className="text-2xl font-bold mb-4">{run.title}</h1>
            <p className="mb-2">Type: {run.type}</p>
            <p className="mb-2">Goal: {run.distanceGoal} km @ {run.estimatedPace} min/km</p>
            <p className="mb-2">Time: {run.date} {run.time}</p>
            
            <div className="h-64 mt-4 rounded-xl overflow-hidden border border-[#333]">
                <MapContainer center={run.location || [5.6, -0.1]} zoom={13} className="h-full w-full">
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    {liveData.map(user => (
                        <Marker key={user.userId} position={user.position as [number, number]}>
                            <Popup>{user.userName}</Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </div>

            <h2 className="text-xl font-bold mt-6 mb-2">Participants</h2>
            <ul className="space-y-2">
                {participants.map((p, i) => <li key={i}>{p.userId}</li>)}
            </ul>
            
            <h2 className="text-xl font-bold mt-6 mb-2">Invite Friends</h2>
            <ul className="space-y-2">
                {myFriends.map((f) => (
                    <li key={f.id} className="flex justify-between items-center bg-[#111] p-2 rounded">
                        {f.displayName}
                        <button onClick={() => inviteFriend(f.id)} className="bg-brand-500 text-black p-1 rounded-sm text-xs font-bold">Invite</button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
