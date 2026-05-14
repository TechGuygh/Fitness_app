import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { doc, getDoc, onSnapshot, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/src/lib/firebase";

export default function RunDetails() {
    const { runId } = useParams<{ runId: string }>();
    const [run, setRun] = useState<any>(null);
    const [participants, setParticipants] = useState<any[]>([]);

    useEffect(() => {
        if (!runId) return;

        const runDocRef = doc(db, "runs", runId);
        getDoc(runDocRef).then(docSnap => {
            if (docSnap.exists()) {
                setRun({ id: docSnap.id, ...docSnap.data() });
            }
        });

        const q = query(collection(db, "runParticipants"), where("runId", "==", runId));
        return onSnapshot(q, (snapshot) => {
            setParticipants(snapshot.docs.map(doc => doc.data()));
        });
    }, [runId]);

    if (!run) return <div className="p-4 text-white">Loading...</div>;

    return (
        <div className="p-4 text-white">
            <h1 className="text-2xl font-bold mb-4">{run.title}</h1>
            <p className="mb-2">Type: {run.type}</p>
            <p className="mb-2">Goal: {run.distanceGoal} km @ {run.estimatedPace} min/km</p>
            <p className="mb-2">Time: {run.date} {run.time}</p>
            <h2 className="text-xl font-bold mt-6 mb-2">Participants</h2>
            <ul className="space-y-2">
                {participants.map((p, i) => <li key={i}>{p.userId}</li>)}
            </ul>
        </div>
    );
}
