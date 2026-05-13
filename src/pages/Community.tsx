import { useState, useEffect, useRef } from "react";
import { Heart, MessageCircle, Share2, Trophy, Users, Send, UserPlus, UserCheck, PlusCircle, Bell, Check, Edit, Trash2, X, Filter, UserX, UserMinus } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { collection, query, where, orderBy, getDocs, setDoc, doc, serverTimestamp, onSnapshot, updateDoc, increment, deleteDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { handleFirestoreError, OperationType } from "@/src/lib/firebase-error";
import { format } from "date-fns";
import { useNavigate, useLocation } from "react-router-dom";
import { formatDistance } from "@/src/lib/utils";
import RouteCreatorModal from "@/src/components/RouteCreatorModal";

const TABS = ["Feed", "Challenges", "Friends", "Leaderboard"];

export default function Community() {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(location.state?.activeTab || "Feed");
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Form states
  const [newPost, setNewPost] = useState("");
  const [newChallenge, setNewChallenge] = useState({ title: "", goal: "100km this month" });
  const [newMessage, setNewMessage] = useState("");
  
  // Missing states
  const [feedPosts, setFeedPosts] = useState<any[]>([]);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [joinedChallenges, setJoinedChallenges] = useState<Set<string>>(new Set());
  const [editingChallenge, setEditingChallenge] = useState<any>(null);
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [friendshipIds, setFriendshipIds] = useState<Set<string>>(new Set()); // IDs of friends
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<Set<string>>(new Set()); // IDs of users requested
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Interaction states
  const [expandedComments, setExpandedComments] = useState<string | null>(null);
  const [postComments, setPostComments] = useState<Record<string, any[]>>({});
  const [newComment, setNewComment] = useState("");
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [followedUsers, setFollowedUsers] = useState<Record<string, string>>({}); // { followingId: followDocId }
  const [users, setUsers] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]); // New state
  const [selectedUser, setSelectedUser] = useState<string | null>(null); // null = global
  const [isRouteCreatorOpen, setIsRouteCreatorOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Feed infinite scroll
  const [displayCount, setDisplayCount] = useState(5);
  const feedBottomRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading) {
         setDisplayCount(prev => prev + 5);
      }
    }, { threshold: 0.1 });
    if (feedBottomRef.current) observer.observe(feedBottomRef.current);
    return () => observer.disconnect();
  }, [loading]);

  // Chat notification
  const prevMessagesLength = useRef(messages.length);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  useEffect(() => {
    if (messages.length > prevMessagesLength.current) {
        if (activeTab !== "Chat") {
            setUnreadChatCount(prev => prev + (messages.length - prevMessagesLength.current));
        }
    }
    prevMessagesLength.current = messages.length;
  }, [messages.length, activeTab]);

  useEffect(() => {
    if (activeTab === "Chat") {
        setUnreadChatCount(0);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "Chat") {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, activeTab]);

  // Notifications logic
  const unreadNotifications = notifications.filter(n => !n.read).length;

  // Core user-dependent listeners
  useEffect(() => {
    if (!user) return;

    // Listen to follows
    const unsubFollows = onSnapshot(query(collection(db, "follows"), where("followerId", "==", user.uid)), (snap) => {
      const followsMap: Record<string, string> = {};
      snap.docs.forEach(doc => {
         followsMap[doc.data().followingId] = doc.id;
      });
      setFollowedUsers(followsMap);
    });

    // Fetch Users
    getDocs(query(collection(db, "users"))).then(snapUsers => {
       setUsers(snapUsers.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(u => u.id !== user!.uid));
    });

    // Listen to Notifications
    const unsubNotifications = onSnapshot(query(collection(db, "notifications"), where("userId", "==", user.uid), orderBy("createdAt", "desc")), (snap) => {
       setNotifications(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Listen to joined challenges
    const unsubJoined = onSnapshot(query(collection(db, "challengeParticipants"), where("userId", "==", user.uid)), (snap) => {
       setJoinedChallenges(new Set(snap.docs.map(d => d.data().challengeId)));
    });

    // Listen to friendships
    const unsubFriends = onSnapshot(query(collection(db, "friendships"), where("userIds", "array-contains", user.uid)), (snap) => {
       const uids = new Set<string>();
       snap.docs.forEach(doc => {
          const ids = doc.data().userIds as string[];
          ids.forEach(id => { if (id !== user.uid) uids.add(id); });
       });
       setFriendshipIds(uids);
    });

    // Listen to incoming friend requests
    const unsubIncoming = onSnapshot(query(collection(db, "friendRequests"), where("toUserId", "==", user.uid), where("status", "==", "pending")), (snap) => {
       setIncomingRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Listen to outgoing friend requests
    const unsubOutgoing = onSnapshot(query(collection(db, "friendRequests"), where("fromUserId", "==", user.uid), where("status", "==", "pending")), (snap) => {
       setOutgoingRequests(new Set(snap.docs.map(d => d.data().toUserId)));
    });

    // Other Listeners (Leaderboard, Challenges)
    const unsubActsGlobal = onSnapshot(query(collection(db, "activities")), (snap) => {
        setActivities(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "activities"));

    getDocs(query(collection(db, "challenges"), orderBy("createdAt", "desc"))).then(snapChal => {
       setChallenges(snapChal.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubFollows();
      unsubNotifications();
      unsubJoined();
      unsubFriends();
      unsubIncoming();
      unsubOutgoing();
      unsubActsGlobal();
    };
  }, [user]);

  // 2. Feed listener (depends on friendsOnly and followedUsers)
  useEffect(() => {
    if (!user) return;

    const updateFeed = (snap: any, type: 'text_post' | 'activity') => {
      const items = snap.docs.map((doc: any) => {
        const data = doc.data();
        if (type === 'text_post') {
          return {
            id: doc.id,
            type: 'text_post',
            user: {
              id: data.userId,
              name: data.userName,
              avatar: data.userAvatar,
              level: 1
            },
            content: data.content,
            likes: data.likes || 0,
            comments: 0,
            date: data.createdAt?.toDate ? format(data.createdAt.toDate(), "MMM d, h:mm a") : "Just now",
            rawDate: data.createdAt?.toDate?.() || new Date()
          };
        } else {
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
               id: data.userId,
               name: data.userId === user.uid ? (user.displayName || "User") : (users.find(u => u.id === data.userId)?.displayName || "User"),
               avatar: data.userId === user.uid ? (user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.displayName}`) : (users.find(u => u.id === data.userId)?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=friend`),
               level: 1
            },
            activity: data.activityType === 'run' ? 'Morning Run' : 'Cycling Session',
            distance: `${data.distance.toFixed(2)} km`,
            pace: pace > 0 ? `${paceM}'${paceS}"/km` : "0'00\"/km",
            time: `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`,
            likes: data.likes || 0,
            comments: 0,
            date: format(date, "MMM d, h:mm a"),
            image: data.activityType === 'run' 
              ? "https://images.unsplash.com/photo-1541252860246-bea5bec28ef8?auto=format&fit=crop&q=80&w=600&h=400"
              : "https://images.unsplash.com/photo-1517646287270-a5a9ca602ebc?auto=format&fit=crop&q=80&w=600&h=400",
            rawDate: date,
            milestone: data.distance >= 10 ? "10K Milestone! 🎉" : data.distance >= 5 ? "5K Completed! 🏆" : null
          };
        }
      });

      setFeedPosts(prev => {
        const others = prev.filter(p => p.type !== type);
        const combined = [...others, ...items].sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());
        return combined;
      });
    };

    const friendIds = Object.keys(followedUsers);
    const feedUids = [user.uid, ...friendIds].slice(0, 10);

    const qPosts = friendsOnly 
      ? query(collection(db, "posts"), where("userId", "in", feedUids), orderBy("createdAt", "desc"))
      : query(collection(db, "posts"), orderBy("createdAt", "desc"));
    
    const unsubPosts = onSnapshot(qPosts, (snap) => updateFeed(snap, 'text_post'));

    const qActs = friendsOnly
      ? query(collection(db, "activities"), where("userId", "in", feedUids), orderBy("createdAt", "desc"))
      : query(collection(db, "activities"), orderBy("createdAt", "desc"));
      
    const unsubActsFeed = onSnapshot(qActs, (snap) => updateFeed(snap, 'activity'));

    return () => {
      unsubPosts();
      unsubActsFeed();
    };
  }, [user, friendsOnly, followedUsers, users]);

  const createNotification = async (targetUserId: string, type: string, targetId: string, targetType: string) => {
    if (!user || user.uid === targetUserId) return;
    try {
      const ref = doc(collection(db, "notifications"));
      await setDoc(ref, {
        userId: targetUserId,
        fromUserId: user.uid,
        fromUserName: user.displayName === "Athlete" ? (user.email?.split("@")[0] || "User") : (user.displayName || "User"),
        fromUserAvatar: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.displayName}`,
        type,
        targetId,
        targetType,
        read: false,
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.warn("Notification trigger failed", e);
    }
  };

  const leaderboardData = () => {
    // Aggregation based on user IDs
    const userStatsMap: Record<string, number> = {};
    activities.forEach(act => {
        if (!userStatsMap[act.userId]) {
            userStatsMap[act.userId] = 0;
        }
        userStatsMap[act.userId] += act.distance || 0;
    });                
    
    // Map to users state data
    return Object.entries(userStatsMap)
        .map(([uid, distance]) => {
            const userProfile = users.find(u => u.id === uid) || { displayName: "User", photoURL: "" };
            return { 
                uid,
                name: userProfile.displayName === "Athlete" ? "User" : (userProfile.displayName || "User"), 
                avatar: userProfile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile.displayName}`, 
                distance 
            };
        })
        .sort((a, b) => b.distance - a.distance);
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

  const handleCommentReaction = async (postId: string, commentId: string, emoji: string) => {
    if (!user) return;
    const comment = postComments[postId]?.find(c => c.id === commentId);
    if (!comment) return;
    const hasReacted = comment.reactions?.[emoji]?.includes(user.uid);
    
    // optimistic
    setPostComments(prev => {
      const updated = (prev[postId] || []).map(c => {
         if (c.id === commentId) {
            const reactions = c.reactions || {};
            const userList = reactions[emoji] || [];
            const newList = hasReacted ? userList.filter((uid: string) => uid !== user.uid) : [...userList, user.uid];
            return { ...c, reactions: { ...reactions, [emoji]: newList }};
         }
         return c;
      });
      return { ...prev, [postId]: updated };
    });

    try {
      const commentRef = doc(db, "comments", commentId);
      await updateDoc(commentRef, {
        [`reactions.${emoji}`]: hasReacted ? arrayRemove(user.uid) : arrayUnion(user.uid)
      });
    } catch(e) {
      handleFirestoreError(e, OperationType.UPDATE, "comments");
    }
  };

  const handleCreateComment = async (postId: string) => {
    if (!newComment.trim() || !user) return;
    try {
      const ref = doc(collection(db, "comments"));
      const c = {
        parentId: postId,
        userId: user.uid,
        userName: user.displayName === "Athlete" ? (user.email?.split("@")[0] || "User") : (user.displayName || "User"),
        userAvatar: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.displayName}`,
        text: newComment,
        createdAt: serverTimestamp()
      };
      await setDoc(ref, c);
      setNewComment("");
      
      const targetPost = feedPosts.find(p => p.id === postId);
      if (targetPost) {
        createNotification(targetPost.user.id, "comment", postId, targetPost.type);
      }

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
      
      if (!isLiked) {
         const targetPost = feedPosts.find(p => p.id === postId);
         if (targetPost) {
           createNotification(targetPost.user.id, "like", postId, targetPost.type);
         }
      }
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

  const handleUpdateChallengeProgress = async (challengeId: string) => {
    if (!user) return;
    const challenge = challenges.find(c => c.id === challengeId);
    if (!challenge) return;
    
    // Increment progress by 20%
    const currentProgress = challenge.progress || 0;
    const newProgress = Math.min(100, currentProgress + 20);
    
    if (newProgress === currentProgress) return;

    try {
      await updateDoc(doc(db, "challenges", challengeId), {
        progress: newProgress
      });
      
      // Optimistic update
      setChallenges(prev => prev.map(c => c.id === challengeId ? { ...c, progress: newProgress } : c));
      
      if (newProgress === 100 && currentProgress < 100) {
        // Trigger notification for completion
        await createNotification(
          user.uid, 
          "milestone", 
          `Challenge Completed: ${challenge.title}! 🏆`, 
          "activity"
        );
      }
    } catch(e) {
      handleFirestoreError(e, OperationType.UPDATE, "challenges");
    }
  };

  const handleJoinChallenge = async (challengeId: string) => {
    if (!user || joinedChallenges.has(challengeId)) return;
    try {
      const participantRef = doc(collection(db, "challengeParticipants"), `${challengeId}_${user.uid}`);
      await setDoc(participantRef, {
        userId: user.uid,
        challengeId: challengeId,
        joinedAt: serverTimestamp()
      });
      await updateDoc(doc(db, "challenges", challengeId), {
        participants: increment(1)
      });
      
      const chal = challenges.find(c => c.id === challengeId);
      if (chal) {
        createNotification(chal.creatorId, "milestone", `New athlete joined ${chal.title}!`, "activity");
      }
    } catch(e) {
      handleFirestoreError(e, OperationType.UPDATE, "challenges");
    }
  };

  const handleUpdateChallenge = async () => {
    if (!editingChallenge) return;
    try {
      await updateDoc(doc(db, "challenges", editingChallenge.id), {
        title: editingChallenge.title,
        goal: editingChallenge.goal,
        daysLeft: editingChallenge.daysLeft
      });
      setChallenges(prev => prev.map(c => c.id === editingChallenge.id ? { ...c, ...editingChallenge } : c));
      setEditingChallenge(null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteChallenge = async (id: string) => {
    if (!user || !confirm("Delete this challenge?")) return;
    try {
      await deleteDoc(doc(db, "challenges", id));
      setChallenges(prev => prev.filter(c => c.id !== id));
      setEditingChallenge(null);
    } catch (e) {
      console.error(e);
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
        createNotification(targetUserId, "follow", user.uid, "user");
      }
    } catch(e) {
      console.error(e);
      // Revert optimism if failed? Simply let them refresh or add revert logic
    }
  };

  const handleSendFriendRequest = async (targetUserId: string) => {
    if (!user || user.uid === targetUserId || friendshipIds.has(targetUserId) || outgoingRequests.has(targetUserId)) return;
    try {
      const ref = doc(collection(db, "friendRequests"));
      await setDoc(ref, {
        fromUserId: user.uid,
        toUserId: targetUserId,
        status: "pending",
        createdAt: serverTimestamp()
      });
      createNotification(targetUserId, "friend_request", ref.id, "user");
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, "friendRequests");
    }
  };

  const handleAcceptFriendRequest = async (request: any) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "friendRequests", request.id), { status: "accepted" });
      const friendshipRef = doc(collection(db, "friendships"));
      await setDoc(friendshipRef, {
        userIds: [request.fromUserId, user.uid],
        createdAt: serverTimestamp()
      });
      createNotification(request.fromUserId, "friend_accept", friendshipRef.id, "user");
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, "friendRequests");
    }
  };

  const handleRejectFriendRequest = async (requestId: string) => {
    try {
      await deleteDoc(doc(db, "friendRequests", requestId));
    } catch (e) {
       handleFirestoreError(e, OperationType.DELETE, "friendRequests");
    }
  };

  const handleRemoveFriend = async (targetUserId: string) => {
    if (!user || !confirm("Remove this friend?")) return;
    try {
      const q = query(collection(db, "friendships"), where("userIds", "array-contains", user.uid));
      const snap = await getDocs(q);
      const docToDelete = snap.docs.find(d => (d.data().userIds as string[]).includes(targetUserId));
      if (docToDelete) {
        await deleteDoc(doc(db, "friendships", docToDelete.id));
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, "friendships");
    }
  };

  const handleCreatePost = async () => {
    if (!newPost.trim() || !user) return;
    try {
      const ref = doc(collection(db, "posts"));
      await setDoc(ref, {
        userId: user.uid,
        userName: user.displayName === "Athlete" ? (user.email?.split("@")[0] || "User") : (user.displayName || "User"),
        userAvatar: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.displayName}`,
        content: newPost,
        likes: 0,
        createdAt: serverTimestamp()
      });
      setNewPost("");
      
      const newPostLocal = {
        id: ref.id,
        type: 'text_post',
        user: { name: user.displayName === "Athlete" ? (user.email?.split("@")[0] || "User") : (user.displayName || "User"), avatar: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.displayName}`, level: 1 },
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
        userName: user.displayName === "Athlete" ? (user.email?.split("@")[0] || "User") : (user.displayName || "User"),
        userAvatar: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.displayName}`,
        text: newMessage,
        createdAt: serverTimestamp()
      };
      if (selectedUser) {
        msg.from = user.uid;
        msg.to = selectedUser;
        msg.participants = [user.uid, selectedUser];
        // Trigger notification for DM
        createNotification(selectedUser, "message", ref.id, "chat");
      }
      await setDoc(ref, msg);
      setNewMessage("");
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, "messages");
    }
  };

  const markNotificationsRead = async () => {
    if (!user) return;
    try {
      const unread = notifications.filter(n => !n.read);
      await Promise.all(unread.map(n => updateDoc(doc(db, "notifications", n.id), { read: true })));
    } catch (e) {
      console.error("Failed to mark notifications read", e);
    }
  };

  if (!user) return null;

  return (
    <div className="p-4 md:p-8 pt-20 md:pt-8 min-h-screen max-w-3xl mx-auto flex flex-col h-screen overflow-hidden pb-16">
      
      {/* Header */}
      <div className="shrink-0 mb-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-display font-bold text-white">Community</h2>
          <div className="flex items-center gap-2">
              {incomingRequests.length > 0 && (
                 <button 
                   onClick={() => setActiveTab("Friends")}
                   className="p-3 bg-brand-500/10 border border-brand-500/50 rounded-2xl text-brand-500 hover:bg-brand-500/20 transition-all flex items-center gap-2"
                 >
                   <UserPlus className="w-6 h-6" />
                   <span className="text-xs font-bold">{incomingRequests.length}</span>
                 </button>
              )}
              <div className="relative">
                 <button 
                   onClick={() => {
                     setShowNotifications(!showNotifications);
                     if (!showNotifications) markNotificationsRead();
                   }} 
                   className="p-3 bg-[#111] border border-[#222] rounded-2xl text-white hover:border-brand-500 transition-all relative"
                 >
                    <Bell className="w-6 h-6" />
                    {unreadNotifications > 0 && (
                       <span className="absolute top-2 right-2 w-4 h-4 bg-brand-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center">
                         {unreadNotifications}
                       </span>
                    )}
                 </button>
                 
                 <AnimatePresence>
                    {showNotifications && (
                       <motion.div 
                         initial={{ opacity: 0, y: 10, scale: 0.95 }}
                         animate={{ opacity: 1, y: 0, scale: 1 }}
                         exit={{ opacity: 0, y: 10, scale: 0.95 }}
                         className="absolute right-0 mt-2 w-80 bg-[#111] border border-[#222] rounded-3xl shadow-2xl z-[500] max-h-[400px] overflow-y-auto"
                       >
                          <div className="p-4 border-b border-[#222] flex justify-between items-center bg-[#161616]">
                             <span className="text-sm font-bold text-white">Notifications</span>
                             <Trophy className="w-4 h-4 text-brand-500" />
                          </div>
                          <div className="p-2">
                            {notifications.length === 0 ? (
                               <div className="p-8 text-center text-gray-500 text-sm">No notifications yet</div>
                            ) : (
                               notifications.map(notif => (
                                  <div 
                                    key={notif.id} 
                                    className={cn("p-3 rounded-2xl flex gap-3 mb-1 transition-colors cursor-pointer hover:bg-[#1a1a1a]", notif.read ? "opacity-100" : "bg-[#222]")}
                                    onClick={() => {
                                      if (notif.type === 'message') {
                                        setActiveTab("Chat");
                                        setSelectedUser(notif.fromUserId);
                                        setShowNotifications(false);
                                      } else if (notif.type === 'friend_request') {
                                        setActiveTab("Friends");
                                        setShowNotifications(false);
                                      } else if (notif.type === 'follow') {
                                        // Maybe navigate to profile? For now just close
                                        setShowNotifications(false);
                                      } else {
                                        setActiveTab("Feed");
                                        setShowNotifications(false);
                                      }
                                    }}
                                  >
                                     <img src={notif.fromUserAvatar} className="w-10 h-10 rounded-full shrink-0" />
                                     <div className="flex-1">
                                        <p className="text-sm text-gray-200">
                                           <span className="font-bold text-white">{notif.fromUserName}</span>
                                           {notif.type === 'like' && " liked your post"}
                                           {notif.type === 'comment' && " commented on your post"}
                                           {notif.type === 'follow' && " started following you"}
                                           {notif.type === 'milestone' && ` reached a milestone: ${notif.targetId}`}
                                           {notif.type === 'message' && " sent you a direct message"}
                                           {notif.type === 'friend_request' && " sent you a friend request"}
                                           {notif.type === 'friend_accept' && " accepted your friend request"}
                                        </p>
                                        <p className="text-[10px] text-gray-500 mt-1 uppercase font-bold tracking-wider">
                                           {notif.createdAt?.toDate ? format(notif.createdAt.toDate(), "MMM d, h:mm a") : "Just now"}
                                        </p>
                                     </div>
                                     {!notif.read && <div className="w-2 h-2 bg-brand-500 rounded-full mt-2 shrink-0" />}
                                  </div>
                               ))
                            )}
                          </div>
                       </motion.div>
                    )}
                 </AnimatePresence>
              </div>
           </div>
        </div>
        <div className="flex bg-[#111] border border-[#222] p-1 rounded-xl">
          {TABS.map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 py-2 text-sm font-semibold rounded-lg transition-all relative",
                activeTab === tab ? "bg-[#222] text-white shadow-sm" : "text-gray-500 hover:text-gray-300"
              )}
            >
              {tab}
              {tab === "Chat" && unreadChatCount > 0 && (
                 <span className="absolute top-1 right-2 w-2 h-2 bg-brand-500 rounded-full animate-pulse"></span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-0 select-text pr-2 -mr-2">
        {activeTab === "Feed" && (
          <div className="space-y-6 pb-6">
            <div className="flex justify-between items-center px-1">
              <h3 className="text-white font-display font-bold text-lg">Activity Feed</h3>
              <button 
                onClick={() => setFriendsOnly(!friendsOnly)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all border",
                  friendsOnly 
                    ? "bg-brand-500 border-brand-500 text-black shadow-[0_0_15px_rgba(204,255,0,0.3)]" 
                    : "bg-[#111] border-[#222] text-gray-400 hover:text-white"
                )}
              >
                <Filter className="w-3.5 h-3.5" />
                {friendsOnly ? "Friends Only" : "Everyone"}
              </button>
            </div>
            
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
                  {friendsOnly ? "No friend activities yet. Start adding friends!" : "No public activities to show yet."}
               </div>
            ) : (
                feedPosts
                  .filter(post => !friendsOnly || friendshipIds.has(post.user.id) || post.user.id === user.uid)
                  .slice(0, displayCount)
                  .map(post => (
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
                          <div className="flex justify-between items-start mb-3">
                            <h3 className="font-display font-bold text-lg text-white">{post.activity}</h3>
                            {post.milestone && (
                               <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="bg-brand-500/20 text-brand-500 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                  <Trophy className="w-3 h-3" /> {post.milestone}
                               </motion.div>
                            )}
                          </div>
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
                      <div className="flex gap-4">
                        {post.type === 'activity' && (
                            <button onClick={() => navigate(`/activity?ghostId=${post.id}`)} className="flex items-center gap-1.5 text-brand-500 hover:text-brand-400 transition-colors">
                              <Trophy className="w-5 h-5 fill-brand-500/20" />
                              <span className="text-sm font-bold">Race</span>
                            </button>
                        )}
                        <button onClick={() => handleShare(post.id)} className="text-gray-400 hover:text-white transition-colors">
                          <Share2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    <AnimatePresence>
                      {expandedComments === post.id && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-[#222] bg-[#161616]">
                          <div className="p-4 flex flex-col gap-4">
                             <div className="space-y-4">
                                {postComments[post.id]?.map(comment => (
                                <motion.div key={comment.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex gap-3">
                                    <img src={comment.userAvatar} className="w-8 h-8 rounded-full shrink-0" />
                                    <div>
                                      <div className="bg-[#222] rounded-2xl p-3">
                                          <span className="text-xs font-semibold text-white mb-0.5 block">{comment.userName}</span>
                                          <p className="text-sm text-gray-300">{comment.text}</p>
                                      </div>
                                      <div className="flex items-center gap-2 mt-2">
                                         <button onClick={() => handleCommentReaction(post.id, comment.id, "🔥")} className={cn("text-xs font-bold px-2 py-1 rounded-full", comment.reactions?.["🔥"]?.includes(user!.uid) ? "bg-brand-500/20 text-brand-500" : "bg-[#222] text-gray-400 hover:text-white")}>
                                           🔥 {comment.reactions?.["🔥"]?.length || 0}
                                         </button>
                                         <button onClick={() => handleCommentReaction(post.id, comment.id, "👏")} className={cn("text-xs font-bold px-2 py-1 rounded-full", comment.reactions?.["👏"]?.includes(user!.uid) ? "bg-brand-500/20 text-brand-500" : "bg-[#222] text-gray-400 hover:text-white")}>
                                           👏 {comment.reactions?.["👏"]?.length || 0}
                                         </button>
                                      </div>
                                    </div>
                                </motion.div>
                                ))}
                             </div>
                             
                             <div className="flex gap-3 items-center pt-4 border-t border-[#222]">
                                <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.displayName}`} className="w-8 h-8 rounded-full shrink-0" />
                                <div className="flex-1 flex gap-2">
                                   <input 
                                     type="text" 
                                     placeholder="Write a comment..." 
                                     value={newComment}
                                     onChange={(e) => setNewComment(e.target.value)}
                                     onKeyDown={(e) => e.key === 'Enter' && handleCreateComment(post.id)}
                                     className="flex-1 bg-[#222] border border-[#333] rounded-full px-4 py-2 text-sm outline-none text-white focus:ring-1 ring-brand-500"
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
            {feedPosts.length > displayCount && (
               <div ref={feedBottomRef} className="py-8 flex justify-center">
                  <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
               </div>
            )}
          </div>
        )}

        {activeTab === "Challenges" && (
          <div className="space-y-4 pb-6">
            <AnimatePresence>
               {editingChallenge && (
                 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                    <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-[#111] border border-[#222] p-8 rounded-[40px] w-full max-w-md shadow-2xl relative">
                       <button onClick={() => setEditingChallenge(null)} className="absolute top-6 right-6 text-gray-500 hover:text-white">
                         <X className="w-6 h-6" />
                       </button>
                       <h3 className="text-2xl font-display font-bold text-white mb-2">Manage Challenge</h3>
                       <p className="text-gray-400 text-sm mb-8">Update your challenge details</p>
                       
                       <div className="space-y-4 mb-8">
                          <div>
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest ml-1 mb-1 block">Title</label>
                            <input value={editingChallenge.title} onChange={e => setEditingChallenge({...editingChallenge, title: e.target.value})} className="w-full bg-[#161616] border border-[#222] rounded-xl px-4 py-3 text-white outline-none focus:ring-1 ring-brand-500" />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest ml-1 mb-1 block">Goal Description</label>
                            <input value={editingChallenge.goal} onChange={e => setEditingChallenge({...editingChallenge, goal: e.target.value})} className="w-full bg-[#161616] border border-[#222] rounded-xl px-4 py-3 text-white outline-none focus:ring-1 ring-brand-500" />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest ml-1 mb-1 block">Days Left</label>
                            <input type="number" value={editingChallenge.daysLeft} onChange={e => setEditingChallenge({...editingChallenge, daysLeft: Number(e.target.value)})} className="w-full bg-[#161616] border border-[#222] rounded-xl px-4 py-3 text-white outline-none focus:ring-1 ring-brand-500" />
                          </div>
                       </div>

                       <div className="grid grid-cols-2 gap-4">
                         <button onClick={() => setEditingChallenge(null)} className="py-4 bg-[#222] text-white font-bold rounded-full hover:bg-[#2a2a2a] transition-all">Cancel</button>
                         <button onClick={handleUpdateChallenge} className="py-4 bg-brand-500 text-black font-bold rounded-full hover:bg-brand-400 transition-all">Save Changes</button>
                       </div>
                       
                       <button onClick={() => handleDeleteChallenge(editingChallenge.id)} className="w-full mt-6 py-2 text-red-500 text-xs font-bold hover:underline flex items-center justify-center gap-2">
                          <Trash2 className="w-3.5 h-3.5" /> Delete Challenge
                       </button>
                    </motion.div>
                 </motion.div>
               )}
            </AnimatePresence>

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
                challenges.map((challenge, i) => {
                  const isOwner = challenge.creatorId === user.uid;
                  const hasJoined = joinedChallenges.has(challenge.id) || isOwner;
                  
                  return (
                    <motion.div key={challenge.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-[#111] border border-[#222] rounded-3xl p-5 relative overflow-hidden group cursor-pointer hover:border-[#333] transition-colors">
                      <div className={cn("absolute right-0 top-0 w-32 h-32 blur-3xl opacity-20 rounded-full bg-gradient-to-br", challenge.color || "from-brand-500 to-accent-blue")} />
                      <div className="relative z-10">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-display font-bold text-xl text-white">{challenge.title}</h3>
                          <Trophy className="w-6 h-6 text-yellow-500" />
                        </div>
                        <p className="text-sm text-gray-400 mb-6">{challenge.goal}</p>
                        
                        <div className="mb-2 flex justify-between text-xs font-semibold">
                          <span className="text-brand-400">{challenge.progress || 0}% Complete</span>
                          <span className="text-gray-500">{challenge.daysLeft} days left</span>
                        </div>
                        <div className="h-2 w-full bg-[#222] rounded-full overflow-hidden mb-4">
                          <div className={cn("h-full bg-gradient-to-r", challenge.color || "from-brand-500 to-accent-blue")} style={{ width: `${challenge.progress || 0}%` }}></div>
                        </div>

                        <div className="flex items-center justify-between mt-4 border-t border-[#222] pt-4">
                          <div className="flex items-center gap-2 text-xs font-medium text-gray-400">
                            <Users className="w-4 h-4" />
                            {challenge.participants || 0} joined
                          </div>
                          
                          {isOwner ? (
                             <button 
                               onClick={(e) => { e.stopPropagation(); setEditingChallenge(challenge); }}
                               className="text-sm font-semibold bg-[#222] text-white px-4 py-1.5 rounded-lg hover:bg-[#333] transition-colors flex items-center gap-2"
                             >
                               <Edit className="w-3.5 h-3.5" /> Manage
                             </button>
                          ) : (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleJoinChallenge(challenge.id);
                              }}
                              disabled={hasJoined}
                              className={cn(
                                "text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors",
                                hasJoined ? "bg-[#222] text-gray-500 cursor-default" : "bg-white text-black hover:bg-gray-200"
                              )}
                            >
                              {hasJoined ? (
                                <div className="flex items-center gap-1.5">
                                  <Check className="w-4 h-4" /> Joined
                                </div>
                              ) : 'Join'}
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })
            )}
          </div>
        )}

        {/* Chat area removed - moved to separate Messages page */}
        
        {activeTab === "Friends" && (
          <div className="space-y-8 pb-6">
            {incomingRequests.length > 0 && (
               <div>
                  <h3 className="text-brand-500 font-display font-bold uppercase tracking-widest text-xs mb-4">Friend Requests</h3>
                  <div className="space-y-2">
                    {incomingRequests.map(req => {
                       const sender = users.find(u => u.id === req.fromUserId);
                       return (
                        <div key={req.id} className="bg-[#111] border border-[#222] rounded-2xl p-4 flex items-center justify-between">
                           <div className="flex items-center gap-3">
                              <img src={sender?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${sender?.displayName}`} className="w-10 h-10 rounded-full" />
                              <div>
                                 <p className="text-white font-bold">{sender?.displayName === "Athlete" ? "User" : (sender?.displayName || "User")}</p>
                                 <p className="text-xs text-gray-500">Sent a friend request</p>
                              </div>
                           </div>
                           <div className="flex gap-2">
                              <button onClick={() => handleAcceptFriendRequest(req)} className="bg-brand-500 text-black px-4 py-2 rounded-xl text-xs font-bold hover:bg-brand-400">Accept</button>
                              <button onClick={() => handleRejectFriendRequest(req.id)} className="bg-[#222] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-[#333]">Decline</button>
                           </div>
                        </div>
                       );
                    })}
                  </div>
               </div>
            )}

            <div>
               <h3 className="text-white font-display font-bold text-xl mb-4">Your Friends</h3>
               {friendshipIds.size === 0 ? (
                 <div className="bg-[#111] border border-[#222] rounded-3xl p-12 text-center">
                    <Users className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                    <p className="text-gray-500 font-medium mb-4">You haven't added any friends yet.</p>
                    <button onClick={() => setActiveTab("Leaderboard")} className="text-brand-500 text-sm font-bold border border-brand-500/30 px-6 py-2 rounded-full hover:bg-brand-500/10 transition-all">Find People</button>
                 </div>
               ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {users.filter(u => friendshipIds.has(u.id)).map(friend => (
                      <div key={friend.id} className="bg-[#111] border border-[#222] rounded-2xl p-4 flex items-center justify-between group">
                         <div className="flex items-center gap-3">
                            <img src={friend.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.displayName}`} className="w-10 h-10 rounded-full" />
                            <div>
                               <p className="text-white font-bold">{friend.displayName}</p>
                               <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Level {friend.level || 1}</p>
                            </div>
                         </div>
                         <button 
                           onClick={() => handleRemoveFriend(friend.id)}
                           className="p-2 text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                         >
                           <UserX className="w-5 h-5" />
                         </button>
                      </div>
                    ))}
                 </div>
               )}
            </div>

            <div>
               <h3 className="text-white font-display font-bold text-xl mb-4">Find Athletes</h3>
               <div className="space-y-2">
                  {users.filter(u => !friendshipIds.has(u.id)).slice(0, 5).map(u => (
                    <div key={u.id} className="bg-[#111] border border-[#222] rounded-2xl p-4 flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          <img src={u.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.displayName}`} className="w-10 h-10 rounded-full" />
                          <p className="text-white font-bold">{u.displayName}</p>
                       </div>
                       {outgoingRequests.has(u.id) ? (
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-[#222] px-3 py-1.5 rounded-full">Request Sent</span>
                       ) : (
                          <button 
                            onClick={() => handleSendFriendRequest(u.id)}
                            className="bg-brand-500 text-black px-4 py-2 rounded-xl text-xs font-bold hover:bg-brand-400 flex items-center gap-2"
                          >
                            <UserPlus className="w-4 h-4" /> Add Friend
                          </button>
                       )}
                    </div>
                  ))}
               </div>
            </div>
          </div>
        )}

        {activeTab === "Leaderboard" && (                
          <div className="bg-[#111] border border-[#222] rounded-3xl p-6 min-h-[400px]">
             <h3 className="text-white font-display font-bold text-xl mb-6">Top Athletes</h3>
             {leaderboardData().map((stats, i) => (
                 <div key={stats.uid} className="flex items-center gap-4 mb-4 p-3 bg-[#222] rounded-xl group transition-all hover:bg-[#282828]">
                    <span className="font-bold text-gray-500 w-6">#{i + 1}</span>
                    <img src={stats.avatar} className="w-10 h-10 rounded-full" />
                    <div className="flex-1">
                       <span className="text-white font-semibold flex items-center gap-2">
                          {stats.name}
                          {friendshipIds.has(stats.uid) && <UserCheck className="w-3.5 h-3.5 text-brand-500" />}
                       </span>
                       <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{formatDistance(stats.distance)} Total</p>
                    </div>
                    {user.uid !== stats.uid && !friendshipIds.has(stats.uid) && (
                       outgoingRequests.has(stats.uid) ? (
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-[#111] px-3 py-1.5 rounded-full border border-[#222]">Sent</span>
                       ) : (
                          <button 
                            onClick={() => handleSendFriendRequest(stats.uid)}
                            className="bg-brand-500/10 border border-brand-500/50 text-brand-500 hover:bg-brand-500 hover:text-black transition-all p-2 rounded-xl"
                            title="Add Friend"
                          >
                             <UserPlus className="w-4 h-4" />
                          </button>
                       )
                    )}
                    <span className="text-brand-500 font-bold hidden md:block">{formatDistance(stats.distance)}</span>
                 </div>
             ))}
          </div>                
        )}
      </div>
    </div>
  );
}