import React, { useState, useEffect, useRef } from "react";
import { Search, Send, User, ChevronLeft, MoreVertical, Check, CheckCheck } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { formatDistanceToNow } from "date-fns";
import { handleFirestoreError, OperationType } from "@/src/lib/firebase-error";
import { useNavigate } from "react-router-dom";

interface ChatMessage {
  id: string;
  from: string;
  to: string;
  text: string;
  createdAt: any;
  read: boolean;
}

interface ChatUser {
  id: string;
  displayName: string;
  photoURL: string;
  lastMessage?: string;
  lastMessageTime?: any;
  unreadCount?: number;
}

export default function Messages() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [allLatestMessages, setAllLatestMessages] = useState<Record<string, ChatMessage>>({});
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobileListVisible, setIsMobileListVisible] = useState(true);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch all users
  useEffect(() => {
    if (!user) return;
    const fetchUsers = async () => {
      try {
        const q = query(collection(db, "users"), where("__name__", "!=", user.uid));
        const snap = await getDocs(q);
        setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatUser)));
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, "users");
      }
    };
    fetchUsers();
  }, [user]);

  // Listen to ALL messages for this user to populate last messages in sidebar
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "messages"),
      where("participants", "array-contains", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const latest: Record<string, ChatMessage> = {};
      snap.docs.forEach(doc => {
        const msg = { id: doc.id, ...doc.data() } as ChatMessage;
        const otherId = msg.from === user.uid ? msg.to : msg.from;
        if (!latest[otherId]) {
          latest[otherId] = msg;
        }
      });
      setAllLatestMessages(latest);

      // If there's a selected user, update the main message thread too
      if (selectedUserId) {
         const threadMsgs = snap.docs
           .map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage))
           .filter(m => (m.from === selectedUserId && m.to === user.uid) || (m.from === user.uid && m.to === selectedUserId))
           .sort((a,b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
         
         setMessages(threadMsgs);

         // Mark unread as read
         snap.docs.forEach(d => {
            const data = d.data();
            if (data.to === user.uid && data.from === selectedUserId && !data.read) {
               updateDoc(doc(db, "messages", d.id), { read: true });
            }
         });
      }
    }, (e) => {
        handleFirestoreError(e, OperationType.LIST, "messages");
    });

    return () => unsubscribe();
  }, [user, selectedUserId]);

  useEffect(() => {
    if (selectedUserId && !allLatestMessages[selectedUserId]) {
        // Clear messages if switching to someone with no history yet
        // but we are already filtering in the listener above.
    }
  }, [selectedUserId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!user || !selectedUserId || !newMessage.trim()) return;

    try {
      await addDoc(collection(db, "messages"), {
        from: user.uid,
        to: selectedUserId,
        participants: [user.uid, selectedUserId],
        text: newMessage.trim(),
        createdAt: serverTimestamp(),
        read: false
      });
      setNewMessage("");
      setTimeout(() => {
        const textarea = document.getElementById('chat-textarea') as HTMLTextAreaElement;
        if (textarea) {
          textarea.style.height = 'auto';
        }
      }, 0);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, "messages");
    }
  };

  const selectedUser = users.find(u => u.id === selectedUserId);

  // Filter users by search
  const filteredUsers = users.filter(u => 
    u.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100dvh-144px)] mt-16 md:mt-0 md:h-[100dvh] bg-black overflow-hidden relative">
      {/* Sidebar - User List */}
      <div className={cn(
        "flex-col w-full md:w-80 border-r border-[#222] bg-[#0a0a0a]",
        !isMobileListVisible ? "hidden md:flex" : "flex"
      )}>
        <div className="p-6 border-b border-[#222]">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-2xl font-display font-bold text-white">Messages</h2>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input 
              type="text" 
              placeholder="Search athletes..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#111] border border-[#222] rounded-xl py-2 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 ring-brand-500/50"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm italic">
              No athletes found.
            </div>
          ) : (
            filteredUsers.map(u => (
              <button 
                key={u.id}
                onClick={() => {
                  setSelectedUserId(u.id);
                  setIsMobileListVisible(false);
                }}
                className={cn(
                  "w-full flex items-center gap-4 p-4 hover:bg-[#111] transition-colors",
                  selectedUserId === u.id && "bg-[#111] border-r-2 border-brand-500"
                )}
              >
                <div className="relative">
                  <img 
                    src={u.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.displayName}`} 
                    className="w-12 h-12 rounded-full border border-[#222] bg-[#222]" 
                  />
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#0a0a0a] rounded-full"></div>
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex justify-between items-start mb-0.5">
                    <p className="font-bold text-white truncate">{u.displayName === "Athlete" ? "User" : u.displayName}</p>
                    <span className="text-[10px] text-gray-500">
                      {allLatestMessages[u.id]?.createdAt?.toDate ? formatDistanceToNow(allLatestMessages[u.id].createdAt.toDate(), { addSuffix: false }) : ""}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 truncate">
                    {allLatestMessages[u.id] 
                      ? (allLatestMessages[u.id].from === user?.uid ? "You: " : "") + allLatestMessages[u.id].text
                      : "Start a conversation"}
                  </p>
                </div>
                {allLatestMessages[u.id] && !allLatestMessages[u.id].read && allLatestMessages[u.id].to === user?.uid && (
                   <div className="w-2 h-2 bg-brand-500 rounded-full"></div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={cn(
        "flex-1 flex flex-col bg-[#050505]",
        isMobileListVisible ? "hidden md:flex" : "flex"
      )}>
        {selectedUserId ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-[#222] bg-black/80 backdrop-blur-xl flex items-center justify-between z-10">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsMobileListVisible(true)}
                  className="md:hidden p-2 -ml-2 text-gray-400 hover:text-white"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <img 
                  src={selectedUser?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedUser?.displayName}`} 
                  className="w-10 h-10 rounded-full border border-[#222]" 
                />
                <div>
                  <h3 className="font-bold text-white">{selectedUser?.displayName === "Athlete" ? "User" : selectedUser?.displayName}</h3>
                  <p className="text-[10px] text-brand-500 font-bold uppercase tracking-widest">Online</p>
                </div>
              </div>
              <button className="p-2 text-gray-500 hover:text-white transition-colors">
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>

            {/* Message Thread */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4 scroll-smooth"
            >
              <div className="text-center mb-8">
                <div className="inline-block px-3 py-1 bg-[#111] rounded-full text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                  Encryption Secured
                </div>
              </div>

              {messages.map((msg, idx) => {
                const isMe = msg.from === user?.uid;
                const showTime = idx === 0 || 
                  (msg.createdAt && messages[idx-1].createdAt && 
                   msg.createdAt.seconds - messages[idx-1].createdAt.seconds > 300);

                return (
                  <div key={msg.id} className="flex flex-col">
                    {showTime && msg.createdAt && (
                       <span className="text-center text-[10px] text-gray-600 font-bold uppercase tracking-widest my-4">
                         {formatDistanceToNow(msg.createdAt.toDate(), { addSuffix: true })}
                       </span>
                    )}
                    <div className={cn(
                      "flex items-end gap-2 max-w-[85%] md:max-w-[70%]",
                      isMe ? "ml-auto flex-row-reverse" : "mr-auto"
                    )}>
                      <img 
                        src={isMe 
                          ? (user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.displayName}`) 
                          : (selectedUser?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedUser?.displayName}`)
                        } 
                        className="w-6 h-6 rounded-full mb-1 shrink-0 bg-[#222]" 
                      />
                      <div className={cn(
                        "p-4 rounded-3xl text-sm leading-relaxed",
                        isMe 
                          ? "bg-brand-500 text-black font-medium rounded-br-none" 
                          : "bg-[#161616] text-white border border-[#222] rounded-bl-none"
                      )}>
                        {msg.text}
                        <div className={cn(
                          "flex items-center gap-2 mt-1 justify-end",
                          isMe ? "text-black/70" : "text-gray-500"
                        )}>
                          <span className="text-[10px] font-semibold">
                            {msg.createdAt?.toDate 
                              ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : ""}
                          </span>
                          {isMe && (
                            msg.read 
                             ? <span className="text-[10px] font-bold flex items-center gap-0.5"><CheckCheck className="w-3.5 h-3.5 text-blue-600" /> Read</span> 
                             : <span className="text-[10px] font-semibold flex items-center gap-0.5 opacity-70"><Check className="w-3.5 h-3.5" /> Sent</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input Overlay */}
            <div className="p-4 md:p-6 bg-black border-t border-[#222]">
              <form 
                onSubmit={handleSendMessage}
                className="flex items-end gap-3 bg-[#111] border border-[#222] rounded-2xl p-2 pl-4 flex-none focus-within:ring-1 ring-brand-500/30 transition-all shadow-lg overflow-hidden"
              >
                <textarea 
                  id="chat-textarea"
                  value={newMessage}
                  onChange={(e) => {
                    setNewMessage(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (newMessage.trim()) {
                        handleSendMessage(e as unknown as React.FormEvent);
                      }
                    }
                  }}
                  placeholder="Message" 
                  rows={1}
                  autoCapitalize="sentences"
                  autoCorrect="on"
                  spellCheck={true}
                  dir="auto"
                  className="flex-1 bg-transparent border-none outline-none text-base text-white resize-none max-h-32 py-2.5 overflow-y-auto min-h-[40px]"
                  style={{ height: 'auto' }}
                />
                <button 
                  type="submit"
                  disabled={!newMessage.trim()}
                  className="w-10 h-10 shrink-0 bg-brand-500 text-black rounded-full flex items-center justify-center hover:bg-brand-400 disabled:opacity-50 disabled:hover:bg-brand-500 transition-all active:scale-95 mb-0.5"
                >
                  <Send className="w-5 h-5 ml-0.5" />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 bg-[#111] rounded-3xl flex items-center justify-center mb-6">
              <Send className="w-10 h-10 text-gray-500 opacity-20" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Your Conversations</h3>
            <p className="text-sm text-gray-400 max-w-xs">
              Select an athlete from the list to start messaging or view previous chats.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
