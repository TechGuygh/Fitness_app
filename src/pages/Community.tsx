import { useState, useEffect, useRef } from "react";
import { Heart, MessageCircle, Share2, Trophy, Users, Send, UserPlus, UserCheck } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { collection, query, where, orderBy, getDocs, setDoc, doc, serverTimestamp, onSnapshot, updateDoc, increment, deleteDoc } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { handleFirestoreError, OperationType } from "@/src/lib/firebase-error";
import { format } from "date-fns";

const TABS = ["Feed", "Challenges", "Chat", "Leaderboard"];

export default function Community() {
  const [activeTab, setActiveTab] = useState("Feed");
  const { user } = useAuth();
  
  const [feedPosts, setFeedPosts] = useState<any[]>([]);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [newPost, setNewPost] = useState("");
  const [newChallenge, setNewChallenge] = useState({ title: "", goal: "100km this month" });
  const [newMessage, setNewMessage] = useState("");
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Interaction states
  const [expandedComments, setExpandedComments] = useState<string | null>(null);
  const [postComments, setPostComments] = useState<Record<string, any[]>>({});
  const [newComment, setNewComment] = useState("");
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [followedUsers, setFollowedUsers] = useState<Record<string, string>>({}); // { followingId: followDocId }
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null); // null = global

  useEffect(() => {
    if (activeTab === "Chat") {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, activeTab]);

  useEffect(() => {
    if (!user) return;

    let unsubMessages: () => void = () => {};
    let unsubActsGlobal: () => void = () => {};

    async function fetchData() {
      setLoading(true);
      try {
        // Fetch Feed (Current user activities + Global posts for simplicity)
        const qPosts = query(collection(db, "posts"), orderBy("createdAt", "desc"));
        const snapPosts = await getDocs(qPosts);
        const postsData = snapPosts.docs.map(doc => ({
          id: doc.id,
          type: 'text_post',
          user: {
            id: doc.data().userId,
            name: doc.data().userName,
            avatar: doc.data().userAvatar,
            level: 1
          },
          content: doc.data().content,
          likes: doc.data().likes || 0,
          comments: 0,
          date: doc.data().createdAt?.toDate ? format(doc.data().createdAt.toDate(), "MMM d, h:mm a") : "Just now",
          rawDate: doc.data().createdAt?.toDate?.() || new Date()
        }));

        // Fetch Users
        const qUsers = query(collection(db, "users"));
        const snapUsers = await getDocs(qUsers);
        setUsers(snapUsers.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(u => u.id !== user!.uid));

        const qActs = query(collection(db, "activities"), where("userId", "==", user!.uid), orderBy("createdAt", "desc"));
        const snapActs = await getDocs(qActs);
        const actsData = snapActs.docs.map(doc => {
          const data = doc.data();
          const date = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
          const m = Math.floor(data.timeSeconds / 60);
          const s = data.timeSeconds % 60;
          const pace = data.pace;
          const paceM = Math.floor(pace);
          const paceS = Math.floor((pace % 1) * 60).toString().padStart(2, '0');
          
          return {
            id: doc.id,
            type: 'activity',
            user: {
              id: user?.uid,
              name: user?.displayName || "Athlete",
              avatar: user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.displayName}`,
              level: 1
            },
            activity: data.activityType === 'run' ? 'Morning Run' : 'Cycling Session',
            distance: `${data.distance.toFixed(2)} km`,
            pace: pace > 0 ? `${paceM}'${paceS}"/km` : "0'00\"/km",
            time: `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`,
            likes: 0,
            comments: 0,
            date: format(date, "MMM d, h:mm a"),
            image: data.activityType === 'run' 
              ? "https://images.unsplash.com/photo-1541252860246-bea5bec28ef8?auto=format&fit=crop&q=80&w=600&h=400"
              : "https://images.unsplash.com/photo-1517646287270-a5a9ca602ebc?auto=format&fit=crop&q=80&w=600&h=400",
            rawDate: date
          };
        });

        const combined = [...postsData, ...actsData].sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());
        setFeedPosts(combined);

        // Fetch Follows
        const qFollows = query(collection(db, "follows"), where("followerId", "==", user.uid));
        const snapFollows = await getDocs(qFollows);
        const followsMap: Record<string, string> = {};
        snapFollows.docs.forEach(doc => {
           followsMap[doc.data().followingId] = doc.id;
        });
        setFollowedUsers(followsMap);

        // Fetch Challenges
        const qChal = query(collection(db, "challenges"), orderBy("createdAt", "desc"));
        const snapChal = await getDocs(qChal);
        setChallenges(snapChal.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error: any) {
        if (error.message.includes("users")) handleFirestoreError(error, OperationType.LIST, "users");
        else if (error.message.includes("posts")) handleFirestoreError(error, OperationType.LIST, "posts");
        else if (error.message.includes("activities")) handleFirestoreError(error, OperationType.LIST, "activities");
        else if (error.message.includes("follows")) handleFirestoreError(error, OperationType.LIST, "follows");
        else if (error.message.includes("challenges")) handleFirestoreError(error, OperationType.LIST, "challenges");
        else handleFirestoreError(error, OperationType.LIST, "community-aggregated");
      } finally {
        setLoading(false);
      }
    }

    fetchData();

    // Listen to messages
    const qMsgs = query(collection(db, "messages"), orderBy("createdAt", "asc"));
    unsubMessages = onSnapshot(qMsgs, (snap) => {
      setMessages(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "messages"));
    
    // Listen to activities for leaderboard
    const qActsGlobal = query(collection(db, "activities"));
    unsubActsGlobal = onSnapshot(qActsGlobal, (snap) => {
        setActivities(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "activities"));

    return () => {
      unsubMessages();
      unsubActsGlobal();
    };
  }, [user]);

  const leaderboardData = () => {
    // Basic calculation for prototype
    const userStats: Record<string, { name: string, avatar: string, distance: number }> = {};
    activities.forEach(act => {
        if (!userStats[act.userId]) {
            userStats[act.userId] = { name: act.userName || "Athlete", avatar: act.userAvatar || "", distance: 0 };
        }
        userStats[act.userId].distance += act.distance || 0;
    });                
    return Object.entries(userStats).sort((a, b) => b[1].distance - a[1].distance);
  };

  const toggleComments = async (postId: string) => {
    if (expandedComments === postId) {
      setExpandedComments(null);
      return;
    }
    setExpandedComments(postId);
    if (!postComments[postId]) {
      try {
        const qC = query(collection(db, "comments"), where("parentId", "==", postId), orderBy("createdAt", "asc"));
        const snap = await getDocs(qC);
        setPostComments(prev => ({
          ...prev,
          [postId]: snap.docs.map(d => ({ id: d.id, ...d.data() }))
        }));
      } catch(e) {
        handleFirestoreError(e, OperationType.LIST, "comments");
      }
    }
  };

  const handleCreateComment = async (postId: string) => {
    if (!newComment.trim() || !user) return;
    try {
      const ref = doc(collection(db, "comments"));
      const c = {
        parentId: postId,
        userId: user.uid,
        userName: user.displayName || "Athlete",
        userAvatar: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.displayName}`,
        text: newComment,
        createdAt: serverTimestamp()
      };
      await setDoc(ref, c);
      setNewComment("");
      setPostComments(prev => ({
        ...prev,
        [postId]: [...(prev[postId] || []), { ...c, id: ref.id, date: "Just now" }]
      }));
      setFeedPosts(prev => prev.map(p => p.id === postId ? { ...p, comments: (p.comments || 0) + 1 } : p));
    } catch(e) {
      handleFirestoreError(e, OperationType.CREATE, "comments");
    }
  };

  const handleLike = async (postId: string, type: string) => {
    if (!user) return;
    const isLiked = likedPosts.has(postId);
    const incVal = isLiked ? -1 : 1;
    
    // Optimistic
    setLikedPosts(prev => {
      const copy = new Set(prev);
      if (isLiked) copy.delete(postId); else copy.add(postId);
      return copy;
    });
    setFeedPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: Math.max(0, (p.likes || 0) + incVal) } : p));

    try {
      const cName = type === 'activity' ? 'activities' : 'posts';
      await updateDoc(doc(db, cName, postId), {
        likes: increment(incVal)
      });
    } catch (e) {
      // Revert if error
      setLikedPosts(prev => {
        const copy = new Set(prev);
        if (isLiked) copy.add(postId); else copy.delete(postId);
        return copy;
      });
      setFeedPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: Math.max(0, (p.likes || 0) - incVal) } : p));
      console.error("Like error", e);
    }
  };

  const handleShare = async (postId: string) => {
    try {
       await navigator.clipboard.writeText(window.location.origin + "/share/" + postId);
       alert("Link copied!");
    } catch (err) {
       console.error("Failed to copy link", err);
    }
  };

  const handleJoinChallenge = async (challengeId: string, currentParticipants: number) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "challenges", challengeId), {
        participants: increment(1)
      });
      // Optimistic update
      setChallenges(prev => prev.map(c => c.id === challengeId ? { ...c, participants: currentParticipants + 1 } : c));
    } catch(e) {
      handleFirestoreError(e, OperationType.UPDATE, "challenges");
    }
  };

  const handleFollowUser = async (targetUserId: string) => {
    if (!user || user.uid === targetUserId) return;
    try {
      const followId = followedUsers[targetUserId];
      if (followId) {
        // Unfollow
        const copy = { ...followedUsers };
        delete copy[targetUserId];
        setFollowedUsers(copy);
        await deleteDoc(doc(db, "follows", followId));
      } else {
        // Follow
        const ref = doc(collection(db, "follows"));
        setFollowedUsers(prev => ({ ...prev, [targetUserId]: ref.id }));
        await setDoc(ref, {
          followerId: user.uid,
          followingId: targetUserId,
          createdAt: serverTimestamp()
        });
      }
    } catch(e) {
      console.error(e);
      // Revert optimism if failed? Simply let them refresh or add revert logic
    }
  };

  const handleCreatePost = async () => {
    if (!newPost.trim() || !user) return;
    try {
      const ref = doc(collection(db, "posts"));
      await setDoc(ref, {
        userId: user.uid,
        userName: user.displayName || "Athlete",
        userAvatar: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.displayName}`,
        content: newPost,
        likes: 0,
        createdAt: serverTimestamp()
      });
      setNewPost("");
      
      const newPostLocal = {
        id: ref.id,
        type: 'text_post',
        user: { name: user.displayName || "Athlete", avatar: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.displayName}`, level: 1 },
        content: newPost,
        likes: 0,
        comments: 0,
        date: "Just now",
        rawDate: new Date()
      };
      setFeedPosts(prev => [newPostLocal, ...prev]);

    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, "posts");
    }
  };

  const handleCreateChallenge = async () => {
    if (!newChallenge.title.trim() || !user) return;
    try {
      const ref = doc(collection(db, "challenges"));
      const chalData = {
        creatorId: user.uid,
        title: newChallenge.title,
        goal: newChallenge.goal,
        participants: 1,
        daysLeft: 30,
        progress: 0,
        color: "from-brand-500 to-brand-700",
        createdAt: serverTimestamp()
      };
      await setDoc(ref, chalData);
      setNewChallenge({ title: "", goal: "100km this month" });
      setChallenges(prev => [{ id: ref.id, ...chalData }, ...prev]);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, "challenges");
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !user) return;
    try {
      const ref = doc(collection(db, "messages"));
      const msg: any = {
        userId: user.uid,
        userName: user.displayName || "Athlete",
        userAvatar: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.displayName}`,
        text: newMessage,
        createdAt: serverTimestamp()
      };
      if (selectedUser) {
        msg.from = user.uid;
        msg.to = selectedUser;
      }
      await setDoc(ref, msg);
      setNewMessage("");
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, "messages");
    }
  };

  if (!user) return null;

  return (
    <div className="p-4 md:p-8 pt-20 md:pt-8 min-h-screen max-w-3xl mx-auto flex flex-col h-screen overflow-hidden pb-16">
      
      {/* Header */}
      <div className="shrink-0 mb-6">
        <h2 className="text-3xl font-display font-bold text-white mb-6">Community</h2>
        <div className="flex bg-[#111] border border-[#222] p-1 rounded-xl">
          {TABS.map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 py-2 text-sm font-semibold rounded-lg transition-all",
                activeTab === tab ? "bg-[#222] text-white shadow-sm" : "text-gray-500 hover:text-gray-300"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 select-text pr-2 -mr-2">
        {activeTab === "Feed" && (
          <div className="space-y-6 pb-6">
            <div className="bg-[#111] border border-[#222] rounded-3xl p-4 flex gap-3">
              <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.displayName}`} alt="Avatar" className="w-10 h-10 rounded-full shrink-0" />
              <div className="flex-1">
                <textarea 
                  value={newPost}
                  onChange={(e) => setNewPost(e.target.value)}
                  placeholder="Share a tip, update, or ask a question..."
                  className="w-full bg-transparent text-white border-b border-[#333] focus:border-brand-500 outline-none pb-2 mb-3 resize-none h-10 min-h-10 text-sm"
                />
                <div className="flex justify-end">
                  <button onClick={handleCreatePost} className="bg-white text-black px-4 py-1.5 rounded-full text-xs font-bold hover:bg-gray-200">
                    Post
                  </button>
                </div>
              </div>
            </div>

            {feedPosts.length === 0 ? (
               <div className="bg-[#111] border border-[#222] rounded-3xl p-8 text-center text-gray-500 font-medium">
                  No public activities to show yet.
               </div>
            ) : (
                feedPosts.map(post => (
                  <motion.div key={post.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-[#111] border border-[#222] rounded-3xl overflow-hidden">
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img src={post.user.avatar} className="w-10 h-10 rounded-full bg-[#222]" />
                        <div>
                          <h4 className="font-semibold text-white text-sm">{post.user.name}</h4>
                          <p className="text-xs text-gray-500 font-medium">{post.date}</p>
                        </div>
                      </div>
                      {user.uid !== post.user.id && (
                        <button 
                          onClick={() => handleFollowUser(post.user.id)}
                          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all", followedUsers[post.user.id] ? "bg-[#222] text-white hover:bg-[#333]" : "bg-white text-black hover:bg-gray-200")}
                        >
                          {followedUsers[post.user.id] ? <><UserCheck className="w-3.5 h-3.5" /> Following</> : <><UserPlus className="w-3.5 h-3.5" /> Follow</>}
                        </button>
                      )}
                    </div>
                    
                    {post.type === 'activity' ? (
                      <>
                        <div className="px-4 pb-3">
                          <h3 className="font-display font-bold text-lg text-white mb-3">{post.activity}</h3>
                          <div className="flex gap-6">
                            <div>
                              <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">Distance</p>
                              <p className="font-semibold text-white">{post.distance}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">Pace</p>
                              <p className="font-semibold text-white">{post.pace}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">Time</p>
                              <p className="font-semibold text-white">{post.time}</p>
                            </div>
                          </div>
                        </div>
                        <div className="h-48 w-full bg-[#222]">
                          <img src={post.image} className="w-full h-full object-cover saturate-50 hover:saturate-100 transition-all duration-500" />
                        </div>
                      </>
                    ) : (
                       <div className="px-4 pb-4">
                         <p className="text-gray-200 text-sm whitespace-pre-wrap">{post.content}</p>
                       </div>
                    )}

                    <div className="p-4 flex items-center justify-between border-t border-[#222]">
                      <div className="flex gap-4">
                        <button onClick={() => handleLike(post.id, post.type)} className={cn("flex items-center gap-1.5 transition-colors", likedPosts.has(post.id) ? "text-brand-500" : "text-gray-400 hover:text-brand-400")}>
                          <Heart className={cn("w-5 h-5", likedPosts.has(post.id) ? "fill-brand-500" : "")} />
                          <span className="text-sm font-medium">{post.likes}</span>
                        </button>
                        <button onClick={() => toggleComments(post.id)} className={cn("flex items-center gap-1.5 transition-colors", expandedComments === post.id ? "text-white" : "text-gray-400 hover:text-white")}>
                          <MessageCircle className={cn("w-5 h-5", expandedComments === post.id ? "fill-white" : "")} />
                          <span className="text-sm font-medium">{post.comments || (postComments[post.id]?.length || 0)}</span>
                        </button>
                      </div>
                      <button onClick={() => handleShare(post.id)} className="text-gray-400 hover:text-white transition-colors">
                        <Share2 className="w-5 h-5" />
                      </button>
                    </div>

                    <AnimatePresence>
                      {expandedComments === post.id && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-[#222] bg-[#161616]">
                          <div className="p-4 space-y-4">
                            {postComments[post.id]?.map(comment => (
                              <div key={comment.id} className="flex gap-3">
                                <img src={comment.userAvatar} className="w-6 h-6 rounded-full" />
                                <div>
                                  <div className="bg-[#222] rounded-xl rounded-tl-sm px-3 py-2">
                                    <span className="text-xs font-semibold text-white block mb-0.5">{comment.userName}</span>
                                    <span className="text-sm text-gray-300">{comment.text}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                            <div className="flex gap-3 items-center mt-2">
                               <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.displayName}`} className="w-6 h-6 rounded-full shrink-0" />
                               <div className="flex-1 flex gap-2">
                                  <input 
                                    type="text" 
                                    placeholder="Write a comment..." 
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreateComment(post.id)}
                                    className="flex-1 bg-[#222] border-none rounded-full px-4 py-1.5 text-sm outline-none text-white focus:ring-1 ring-brand-500"
                                  />
                                  <button onClick={() => handleCreateComment(post.id)} className="text-brand-500 hover:text-brand-400 shrink-0 font-semibold text-sm">Post</button>
                               </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))
            )}
          </div>
        )}

        {activeTab === "Challenges" && (
          <div className="space-y-4 pb-6">
            <div className="bg-[#111] border border-[#222] rounded-3xl p-5 mb-8">
              <h3 className="text-white font-display font-semibold mb-3">Create a Challenge</h3>
              <input type="text" placeholder="Challenge Title (e.g. June 50k)" value={newChallenge.title} onChange={e => setNewChallenge({...newChallenge, title: e.target.value})} className="w-full bg-[#222] border border-[#333] rounded-lg px-3 py-2 text-white text-sm outline-none mb-3" />
              <input type="text" placeholder="Goal detail (e.g. Run 50km this month)" value={newChallenge.goal} onChange={e => setNewChallenge({...newChallenge, goal: e.target.value})} className="w-full bg-[#222] border border-[#333] rounded-lg px-3 py-2 text-white text-sm outline-none mb-4" />
              <button onClick={handleCreateChallenge} className="bg-brand-500 text-black px-4 py-2 rounded-lg text-sm font-bold w-full hover:bg-brand-400">Launch Challenge</button>
            </div>

            {challenges.length === 0 ? (
               <div className="bg-[#111] border border-[#222] rounded-3xl p-8 text-center text-gray-500 font-medium">
                  No active challenges right now. Be the first to create one!
               </div>
            ) : (
                challenges.map((challenge, i) => (
                  <motion.div key={challenge.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-[#111] border border-[#222] rounded-3xl p-5 relative overflow-hidden group cursor-pointer hover:border-[#333] transition-colors">
                    <div className={cn("absolute right-0 top-0 w-32 h-32 blur-3xl opacity-20 rounded-full bg-gradient-to-br", challenge.color)} />
                    <div className="relative z-10">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-display font-bold text-xl text-white">{challenge.title}</h3>
                        <Trophy className="w-6 h-6 text-yellow-500" />
                      </div>
                      <p className="text-sm text-gray-400 mb-6">{challenge.goal}</p>
                      
                      <div className="mb-2 flex justify-between text-xs font-semibold">
                        <span className="text-brand-400">{challenge.progress}% Complete</span>
                        <span className="text-gray-500">{challenge.daysLeft} days left</span>
                      </div>
                      <div className="h-2 w-full bg-[#222] rounded-full overflow-hidden mb-4">
                        <div className={cn("h-full bg-gradient-to-r", challenge.color)} style={{ width: `${challenge.progress}%` }}></div>
                      </div>

                      <div className="flex items-center justify-between mt-4 border-t border-[#222] pt-4">
                        <div className="flex items-center gap-2 text-xs font-medium text-gray-400">
                          <Users className="w-4 h-4" />
                          {challenge.participants} joined
                        </div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            if(challenge.creatorId !== user.uid) {
                               handleJoinChallenge(challenge.id, challenge.participants);
                            }
                          }}
                          className="text-sm font-semibold bg-white text-black px-4 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          {challenge.creatorId === user.uid ? 'Manage' : 'Join'}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))
            )}
          </div>
        )}

        {activeTab === "Chat" && (
          <div className="flex h-full bg-[#111] border border-[#222] rounded-3xl overflow-hidden min-h-[400px]">
            {/* User List */}
            <div className="w-1/3 border-r border-[#222] p-2 overflow-y-auto">
              <button 
                onClick={() => setSelectedUser(null)}
                className={cn("w-full text-left p-2 rounded-lg text-sm font-semibold mb-2", selectedUser === null ? "bg-[#222] text-white" : "text-gray-500")}
              >
                Global Chat
              </button>
              {users.map(u => (
                <button 
                  key={u.id}
                  onClick={() => setSelectedUser(u.id)}
                  className={cn("w-full flex items-center gap-2 p-2 rounded-lg text-sm", selectedUser === u.id ? "bg-[#222] text-white" : "text-gray-400 hover:text-white")}
                >
                  <img src={u.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.displayName}`} className="w-6 h-6 rounded-full" />
                  {u.displayName}
                </button>
              ))}
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col">
              <div className="p-4 border-b border-[#222] bg-[#161616] shrink-0">
                <p className="text-center font-display font-semibold text-gray-300">
                  {selectedUser ? users.find(u => u.id === selectedUser)?.displayName : "Global Runners Chat"}
                </p>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages
                  .filter(m => selectedUser ? (m.from === selectedUser && m.to === user.uid) || (m.from === user.uid && m.to === selectedUser) : !m.to)
                  .map(msg => (
                  <div key={msg.id} className={cn("flex gap-3", msg.userId === user.uid ? "flex-row-reverse" : "flex-row")}>
                    <img src={msg.userAvatar} className="w-8 h-8 rounded-full shrink-0" alt="avatar" />
                    <div className={cn("flex flex-col", msg.userId === user.uid ? "items-end" : "items-start")}>
                      <span className="text-[10px] text-gray-500 mb-1 mx-1">{msg.userName}</span>
                      <div className={cn("px-4 py-2 rounded-2xl max-w-[240px] md:max-w-md text-sm", msg.userId === user.uid ? "bg-brand-500 text-black rounded-tr-sm" : "bg-[#222] text-white rounded-tl-sm")}>
                        {msg.text}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <div className="p-3 border-t border-[#222] bg-[#161616] shrink-0">
                 <div className="flex items-center gap-2 bg-[#222] rounded-full p-1 pl-4">
                    <input 
                      type="text" 
                      placeholder={selectedUser ? `Message ${users.find(u => u.id === selectedUser)?.displayName}...` : "Type a message..."} 
                      className="flex-1 bg-transparent border-none outline-none text-white text-sm"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    />
                    <button onClick={handleSendMessage} className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center shrink-0 hover:bg-brand-400">
                      <Send className="w-4 h-4 text-black" />
                    </button>
                 </div>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === "Leaderboard" && (                
          <div className="bg-[#111] border border-[#222] rounded-3xl p-6 min-h-[400px]">
             <h3 className="text-white font-display font-bold text-xl mb-6">Top Athletes</h3>
             {leaderboardData().map(([uid, stats], i) => (
                 <div key={uid} className="flex items-center gap-4 mb-4 p-3 bg-[#222] rounded-xl">
                    <span className="font-bold text-gray-500 w-6">#{i + 1}</span>
                    <img src={stats.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${stats.name}`} className="w-10 h-10 rounded-full" />
                    <span className="text-white font-semibold flex-1">{stats.name}</span>
                    <span className="text-brand-500 font-bold">{stats.distance.toFixed(1)} km</span>
                 </div>
             ))}
          </div>                
        )}
      </div>

    </div>
  );
}
