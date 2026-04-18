import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  Users, 
  CheckCircle2, 
  Bell, 
  Plus, 
  LogOut, 
  ChevronRight,
  ShieldCheck,
  Clock,
  Book,
  Image,
  Sparkles,
  Loader2,
  Settings,
  Shield,
  UserPlus,
  LogIn,
  MessageSquare,
  Send,
  Trash2,
  AlertCircle,
  ShieldAlert,
  Copy,
  Check
} from 'lucide-react';
import { format, formatDistanceToNow, isToday } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { BIBLE_BOOKS, type Member, type ReadingLog, type FamilyGroup, type ReadingComment } from './types';
import { GoogleGenAI } from "@google/genai";
import { auth, db, signInWithGoogle, logout } from './firebase';
import { 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';

const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing. Please configure it in your environment variables.");
  }
  return new GoogleGenAI({ apiKey });
};

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const safeDate = (date: any): Date => {
  if (!date) return new Date();
  if (date instanceof Timestamp) return date.toDate();
  if (typeof date === 'string') return new Date(date);
  if (date instanceof Date) return date;
  return new Date();
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

const handleFirestoreError = (error: any, operationType: OperationType, path: string | null, setAsyncError?: (e: any) => void, setToast?: (t: { message: string, type: 'error' | 'success' | 'info' } | null) => void) => {
  const errorCode = error?.code;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || 'anonymous',
      email: auth.currentUser?.email || 'N/A',
      emailVerified: auth.currentUser?.emailVerified || false,
      isAnonymous: auth.currentUser?.isAnonymous || false,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName || 'N/A',
        email: provider.email || 'N/A',
        photoUrl: provider.photoURL || 'N/A'
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  
  let userMessage = "An unexpected error occurred. Please try again.";
  
  if (errorCode === 'permission-denied') {
    userMessage = "You don't have permission to perform this action. You might have been removed from the group or the group was deleted.";
    if (path?.includes('groups/')) {
      console.warn('Access denied to group path, likely removed from group:', path);
      if (setToast) setToast({ message: userMessage, type: 'error' });
      return true; 
    }
  } else if (errorCode === 'unavailable') {
    userMessage = "The service is temporarily unavailable. Please check your internet connection and try again.";
  } else if (errorCode === 'not-found') {
    userMessage = "The requested information could not be found.";
  } else if (errorCode === 'resource-exhausted') {
    userMessage = "The app's daily limit has been reached. Please try again tomorrow.";
  } else if (errorCode === 'unauthenticated') {
    userMessage = "Your session has expired. Please sign in again.";
  }

  if (setToast) {
    setToast({ message: userMessage, type: 'error' });
  }
  
  const finalError = new Error(JSON.stringify({ ...errInfo, userMessage }));
  if (setAsyncError) {
    setAsyncError(() => { throw finalError; });
  } else {
    throw finalError;
  }
};

const Avatar = ({ url, name, className }: { url: string | null, name: string, className?: string }) => {
  if (url) {
    return (
      <img 
        src={url} 
        alt={name} 
        className={cn("rounded-full object-cover", className)} 
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <div className={cn("rounded-full flex items-center justify-center text-white font-bold", className)}>
      {name ? name[0].toUpperCase() : '?'}
    </div>
  );
};

const CopyButton = ({ text, className }: { text: string, className?: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all active:scale-95",
        copied 
          ? "bg-emerald-500 text-white" 
          : "bg-[#5A5A40] text-white hover:bg-[#4a4a34]",
        className
      )}
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Copied!</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Copy Code</span>
        </>
      )}
    </button>
  );
};

const Toast = ({ message, type, onClose }: { message: string, type: 'error' | 'success' | 'info', onClose: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.9 }}
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-4 rounded-2xl shadow-2xl border flex items-center gap-3 min-w-[320px] max-w-[90vw]",
        type === 'error' ? "bg-red-50 border-red-100 text-red-800" : 
        type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-800" : 
        "bg-blue-50 border-blue-100 text-blue-800"
      )}
    >
      {type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : 
       type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : 
       <Sparkles className="w-5 h-5 shrink-0" />}
      <p className="text-sm font-bold leading-tight">{message}</p>
      <button onClick={onClose} className="ml-auto hover:opacity-70">
        <Plus className="w-4 h-4 rotate-45" />
      </button>
    </motion.div>
  );
};

export class ErrorBoundary extends React.Component<any, any> {
  public state: any;
  public props: any;
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let message = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) message = parsed.error;
      } catch (e) {
        message = this.state.error.message || message;
      }

      return (
        <div className="min-h-screen bg-[#f5f2ed] flex items-center justify-center p-6 font-serif">
          <div className="max-w-md w-full bg-white rounded-[32px] p-10 shadow-xl border border-[#e5e2dd] text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="text-red-600 w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-[#1a1a1a] mb-2">Application Error</h1>
            <p className="text-[#5A5A40]/70 mb-8">{message}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-[#5A5A40] text-white py-4 rounded-full font-bold hover:bg-[#4a4a34] transition-all shadow-lg active:scale-95"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const CommentSection = ({ groupId, logId, currentUser, member, setAsyncError, setToast }: { groupId: string, logId: string, currentUser: User, member: Member, setAsyncError: (e: any) => void, setToast: (t: { message: string, type: 'error' | 'success' | 'info' } | null) => void }) => {
  const [comments, setComments] = useState<ReadingComment[]>([]);
  const [text, setText] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const commentsRef = collection(db, 'groups', groupId, 'logs', logId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'asc'));
    const path = `groups/${groupId}/logs/${logId}/comments`;
    
    return onSnapshot(q, (snap) => {
      setComments(snap.docs.map(d => {
        const data = d.data();
        return { 
          id: d.id, 
          ...data,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : new Date().toISOString()
        } as ReadingComment;
      }));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path, setAsyncError, setToast);
    });
  }, [groupId, logId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      const commentsRef = collection(db, 'groups', groupId, 'logs', logId, 'comments');
      await addDoc(commentsRef, {
        memberUid: currentUser.uid,
        memberName: member.displayName,
        memberPhoto: member.photoURL,
        text: text.trim(),
        createdAt: serverTimestamp()
      });
      setText('');
      setIsExpanded(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `groups/${groupId}/logs/${logId}/comments`, setAsyncError, setToast);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      const commentRef = doc(db, 'groups', groupId, 'logs', logId, 'comments', commentId);
      await deleteDoc(commentRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `groups/${groupId}/logs/${logId}/comments/${commentId}`, setAsyncError, setToast);
    }
  };

  return (
    <div className="mt-4 border-t border-[#f5f2ed] pt-4">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#5A5A40]/40 hover:text-[#5A5A40] transition-colors"
      >
        <MessageSquare className="w-3 h-3" />
        {isExpanded ? 'Hide Comments' : `Comments (${comments.length})`}
      </button>

      {isExpanded && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 space-y-4"
        >
          <div className="space-y-3">
            {comments.map(c => (
              <div key={c.id} className="flex gap-3 items-start group">
                <Avatar url={c.memberPhoto} name={c.memberName} className="w-6 h-6 shrink-0 rounded-lg" />
                <div className="flex-1 bg-[#fcfbf9] p-3 rounded-2xl border border-[#e5e2dd] relative">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-[10px] uppercase tracking-wider text-[#5A5A40]/60">{c.memberName}</span>
                    {c.memberUid === currentUser.uid && (
                      <button onClick={() => handleDelete(c.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="w-3 h-3 text-red-400 hover:text-red-600" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-[#5A5A40] leading-relaxed">{c.text}</p>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input 
              type="text" 
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 bg-[#fcfbf9] border border-[#e5e2dd] rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#5A5A40]/20"
            />
            <button type="submit" className="bg-[#5A5A40] text-white p-2 rounded-xl hover:bg-[#4a4a34] transition-colors">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </motion.div>
      )}
    </div>
  );
};

export default function App() {
  const [_, setAsyncError] = useState<any>();
  const [toast, setToast] = useState<{ message: string, type: 'error' | 'success' | 'info' } | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [roomCode, setRoomCode] = useState<string | null>(() => {
    const saved = localStorage.getItem('roomCode');
    return (saved === 'null' || saved === 'undefined') ? null : saved;
  });
  const [group, setGroup] = useState<FamilyGroup | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [logs, setLogs] = useState<ReadingLog[]>([]);
  
  const [view, setView] = useState<'feed' | 'dashboard' | 'members' | 'settings'>('feed');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isLogging, setIsLogging] = useState(false);
  const [nudge, setNudge] = useState<string | null>(null);

  const handleLogin = async () => {
    console.log('Starting login process...');
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const u = await signInWithGoogle();
      console.log('signInWithGoogle returned:', u ? `User: ${u.displayName}` : 'No user');
    } catch (error: any) {
      const errorCode = error?.code;
      if (errorCode !== 'auth/popup-closed-by-user') {
        console.error('Login error caught in handleLogin:', error);
        setLoginError(`Sign-in failed: ${error.message || 'Please try again.'}`);
      } else {
        console.log('Login popup closed by user.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };
  const [groupNameInput, setGroupNameInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [selectedBook, setSelectedBook] = useState('Genesis');
  const [chapter, setChapter] = useState('1');
  const [notesInput, setNotesInput] = useState('');
  
  console.log('App Render:', { 
    user: user?.uid, 
    roomCode, 
    member: member?.uid, 
    isAuthLoading,
    isLoggingIn,
    loginError
  });

  // Auth state
  useEffect(() => {
    console.log('Setting up onAuthStateChanged listener');
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      console.log('Auth state changed:', u ? `User: ${u.displayName} (${u.uid})` : 'No user');
      setUser(u);
      setIsAuthLoading(false);
    });

    // Safety timeout: if auth doesn't resolve in 5 seconds, stop loading
    const timeout = setTimeout(() => {
      setIsAuthLoading(prev => {
        if (prev) {
          console.warn('Auth loading timed out after 5s');
          return false;
        }
        return prev;
      });
    }, 5000);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  // Sync with Firestore - Basic Info (Group & My Member Doc)
  useEffect(() => {
    if (!user || !roomCode) {
      setGroup(null);
      setMember(null);
      setMembers([]);
      setLogs([]);
      return;
    }

    const handleAccessDenied = () => {
      setRoomCode(null);
      localStorage.removeItem('roomCode');
      setMember(null);
      setGroup(null);
      setMembers([]);
      setLogs([]);
    };

    // Group info
    const groupRef = doc(db, 'groups', roomCode);
    const unsubGroup = onSnapshot(groupRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setGroup({ 
          id: docSnap.id, 
          ...data,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : new Date().toISOString()
        } as FamilyGroup);
      } else {
        handleAccessDenied();
      }
    }, (error) => {
      if (handleFirestoreError(error, OperationType.GET, `groups/${roomCode}`, setAsyncError, setToast)) {
        handleAccessDenied();
      }
    });

    // My Member info
    const memberRef = doc(db, 'groups', roomCode, 'members', user.uid);
    const unsubMember = onSnapshot(memberRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setMember({ 
          uid: docSnap.id, 
          ...data,
          joinedAt: data.joinedAt instanceof Timestamp ? data.joinedAt.toDate().toISOString() : new Date().toISOString(),
          lastReadAt: data.lastReadAt instanceof Timestamp ? data.lastReadAt.toDate().toISOString() : (data.lastReadAt || null)
        } as Member);
      } else {
        // If member doc doesn't exist but roomCode is set, user might have been removed
        // or they might be in the middle of joining
        setMember(null);
      }
    }, (error) => {
      // Don't handle access denied here aggressively, let it resolve or fail via group snap
      handleFirestoreError(error, OperationType.GET, `groups/${roomCode}/members/${user.uid}`, setAsyncError, setToast);
    });

    return () => {
      unsubGroup();
      unsubMember();
    };
  }, [user, roomCode]);

  // Sync with Firestore - Approved Data (Members List & Logs)
  useEffect(() => {
    if (!user || !roomCode || !member || member.status !== 'approved') {
      setMembers([]);
      setLogs([]);
      return;
    }

    const handleAccessDenied = () => {
      // If approved state fails, it's serious
      setRoomCode(null);
      localStorage.removeItem('roomCode');
      setMember(null);
      setGroup(null);
    };

    // Members list
    const membersRef = collection(db, 'groups', roomCode, 'members');
    const unsubMembers = onSnapshot(membersRef, (snap) => {
      const mList = snap.docs.map(d => {
        const data = d.data();
        return { 
          uid: d.id, 
          ...data,
          joinedAt: data.joinedAt instanceof Timestamp ? data.joinedAt.toDate().toISOString() : new Date().toISOString(),
          lastReadAt: data.lastReadAt instanceof Timestamp ? data.lastReadAt.toDate().toISOString() : (data.lastReadAt || null)
        } as Member;
      });
      setMembers(mList);
    }, (error) => {
      if (handleFirestoreError(error, OperationType.GET, `groups/${roomCode}/members`, setAsyncError, setToast)) {
        handleAccessDenied();
      }
    });

    // Logs list
    const logsRef = collection(db, 'groups', roomCode, 'logs');
    const q = query(logsRef, orderBy('readAt', 'desc'), limit(50));
    const unsubLogs = onSnapshot(q, (snap) => {
      const lList = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          readAt: data.readAt instanceof Timestamp ? data.readAt.toDate().toISOString() : new Date().toISOString()
        } as ReadingLog;
      });
      setLogs(lList);
    }, (error) => {
      if (handleFirestoreError(error, OperationType.GET, `groups/${roomCode}/logs`, setAsyncError, setToast)) {
        handleAccessDenied();
      }
    });

    return () => {
      unsubMembers();
      unsubLogs();
    };
  }, [user, roomCode, member?.status]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !groupNameInput) return;
    setIsCreating(true);

    const gCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const groupRef = doc(db, 'groups', gCode);
    
    try {
      await setDoc(groupRef, {
        name: groupNameInput,
        adminUid: user.uid,
        createdAt: serverTimestamp()
      });

      await setDoc(doc(db, 'groups', gCode, 'members', user.uid), {
        displayName: user.displayName || 'Anonymous',
        photoURL: user.photoURL,
        role: 'admin',
        status: 'approved',
        joinedAt: serverTimestamp(),
        lastReadAt: null
      });

      setRoomCode(gCode);
      localStorage.setItem('roomCode', gCode);
      setToast({ message: "Family group created successfully!", type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `groups/${gCode}`, setAsyncError, setToast);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !codeInput) return;
    setIsJoining(true);

    const code = codeInput.toUpperCase();
    const groupRef = doc(db, 'groups', code);
    setJoinError(null);
    
    try {
      const gSnap = await getDoc(groupRef);
      
      if (!gSnap.exists()) {
        setJoinError('Group not found. Please check the code.');
        return;
      }

      await setDoc(doc(db, 'groups', code, 'members', user.uid), {
        displayName: user.displayName || 'Anonymous',
        photoURL: user.photoURL,
        role: 'member',
        status: 'pending',
        joinedAt: serverTimestamp(),
        lastReadAt: null
      });

      setRoomCode(code);
      localStorage.setItem('roomCode', code);
      setToast({ message: "Request to join sent! Waiting for admin approval.", type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `groups/${code}/members/${user.uid}`, setAsyncError, setToast);
    } finally {
      setIsJoining(false);
    }
  };

  const handleLogReading = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !roomCode || !member) return;

    try {
      const logsRef = collection(db, 'groups', roomCode, 'logs');
      await addDoc(logsRef, {
        memberUid: user.uid,
        memberName: member.displayName,
        memberPhoto: member.photoURL,
        book: selectedBook,
        chapter: parseInt(chapter),
        notes: notesInput.trim(),
        readAt: serverTimestamp(),
        confirmedByUid: null,
        confirmerName: null
      });

      await updateDoc(doc(db, 'groups', roomCode, 'members', user.uid), {
        lastReadAt: serverTimestamp()
      });

      setIsLogging(false);
      setNotesInput('');
      setToast({ message: "Reading logged successfully!", type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `groups/${roomCode}/logs`, setAsyncError, setToast);
    }
  };

  const handleConfirm = async (logId: string) => {
    if (!user || !roomCode || !member) return;
    try {
      const logRef = doc(db, 'groups', roomCode, 'logs', logId);
      await updateDoc(logRef, {
        confirmedByUid: user.uid,
        confirmerName: member.displayName
      });
      setToast({ message: "Reading confirmed!", type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `groups/${roomCode}/logs/${logId}`, setAsyncError, setToast);
    }
  };

  const handleApproveMember = async (memberUid: string) => {
    if (!user || !roomCode || member?.role !== 'admin') return;
    try {
      const memberRef = doc(db, 'groups', roomCode, 'members', memberUid);
      await updateDoc(memberRef, {
        status: 'approved'
      });
      setToast({ message: "Member approved!", type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `groups/${roomCode}/members/${memberUid}`, setAsyncError, setToast);
    }
  };

  const handleToggleAdmin = async (targetUid: string, currentRole: string) => {
    if (!user || !roomCode || member?.role !== 'admin') return;
    
    const admins = members.filter(m => m.role === 'admin' && m.status === 'approved');
    if (targetUid === user.uid && currentRole === 'admin' && admins.length <= 1) {
      alert("You are the only admin. Please promote someone else before stepping down.");
      return;
    }

    try {
      const memberRef = doc(db, 'groups', roomCode, 'members', targetUid);
      await updateDoc(memberRef, {
        role: currentRole === 'admin' ? 'member' : 'admin'
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `groups/${roomCode}/members/${targetUid}`, setAsyncError, setToast);
    }
  };

  const handleRejectMember = async (memberUid: string) => {
    if (!user || !roomCode || member?.role !== 'admin') return;
    try {
      const memberRef = doc(db, 'groups', roomCode, 'members', memberUid);
      await deleteDoc(memberRef);
      setToast({ message: "Member rejected.", type: 'info' });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `groups/${roomCode}/members/${memberUid}`, setAsyncError, setToast);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !roomCode) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64 = reader.result as string;
        await updateDoc(doc(db, 'groups', roomCode, 'members', user.uid), {
          photoURL: base64
        });
        setIsUpdatingAvatar(false);
        setToast({ message: "Profile picture updated!", type: 'success' });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `groups/${roomCode}/members/${user.uid}`, setAsyncError, setToast);
        setIsUpdatingAvatar(false);
      }
    };
    reader.onerror = () => {
      setToast({ message: "Failed to read file.", type: 'error' });
      setIsUpdatingAvatar(false);
    };
    reader.readAsDataURL(file);
  };

  const generateAvatar = async () => {
    if (!user || !roomCode || !member) return;
    setIsGeneratingAvatar(true);
    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: `A minimalist, warm, hand-drawn style avatar for a person named ${member.displayName}. The style should be organic, soft, and friendly, using a palette of olive greens and creams to match a Bible study app theme. No text, just the character.` }]
        }
      });

      const candidate = response.candidates?.[0];
      if (!candidate) throw new Error("No image generated.");

      for (const part of candidate.content.parts) {
        if (part.inlineData) {
          const base64 = `data:image/png;base64,${part.inlineData.data}`;
          await updateDoc(doc(db, 'groups', roomCode, 'members', user.uid), {
            photoURL: base64
          });
          setToast({ message: "AI Avatar generated and saved!", type: 'success' });
          break;
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `groups/${roomCode}/members/${user.uid}`, setAsyncError, setToast);
    } finally {
      setIsGeneratingAvatar(false);
      setIsUpdatingAvatar(false);
    }
  };

  // Check for nudges
  useEffect(() => {
    if (!member || !member.reminderSettings?.enabled) return;

    const check = () => {
      const { frequency, time, lastNudgeAt } = member.reminderSettings!;
      const [hours, minutes] = time.split(':').map(Number);
      const now = new Date();
      const targetTime = new Date();
      targetTime.setHours(hours, minutes, 0, 0);

      if (now < targetTime) return;

      const lastRead = member.lastReadAt ? new Date(member.lastReadAt) : null;
      const lastNudge = lastNudgeAt ? new Date(lastNudgeAt) : null;

      if (frequency === 'daily') {
        const alreadyReadToday = lastRead && isToday(lastRead);
        const alreadyNudgedToday = lastNudge && isToday(lastNudge);

        if (!alreadyReadToday && !alreadyNudgedToday) {
          setNudge("It's time for your daily Bible reading! Would you like to mark it as complete?");
        }
      } else if (frequency === 'weekly') {
        // Simple weekly check: if last read was more than 7 days ago
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const readThisWeek = lastRead && lastRead > weekAgo;
        const nudgedThisWeek = lastNudge && lastNudge > weekAgo;

        if (!readThisWeek && !nudgedThisWeek) {
          setNudge("Don't forget your weekly Bible reading goal! Ready to dive in?");
        }
      }
    };

    check();
    const interval = setInterval(check, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [member]);

  const handleUpdateReminders = async (enabled: boolean, frequency: 'daily' | 'weekly', time: string) => {
    if (!user || !roomCode) return;
    try {
      await updateDoc(doc(db, 'groups', roomCode, 'members', user.uid), {
        reminderSettings: {
          enabled,
          frequency,
          time,
          lastNudgeAt: member?.reminderSettings?.lastNudgeAt || null
        }
      });
      setToast({ message: "Reminder settings saved!", type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `groups/${roomCode}/members/${user.uid}`, setAsyncError, setToast);
    }
  };

  const handleDismissNudge = async () => {
    if (!user || !roomCode || !member) return;
    setNudge(null);
    try {
      await updateDoc(doc(db, 'groups', roomCode, 'members', user.uid), {
        'reminderSettings.lastNudgeAt': serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `groups/${roomCode}/members/${user.uid}`, setAsyncError, setToast);
    }
  };

  const handleCompleteFromNudge = async () => {
    if (!user || !roomCode || !member) return;
    try {
      const logsRef = collection(db, 'groups', roomCode, 'logs');
      await addDoc(logsRef, {
        memberUid: user.uid,
        memberName: member.displayName,
        memberPhoto: member.photoURL,
        book: "Daily Reading",
        chapter: 1,
        notes: "Completed via reminder nudge.",
        readAt: serverTimestamp(),
        confirmedByUid: null,
        confirmerName: null
      });

      await updateDoc(doc(db, 'groups', roomCode, 'members', user.uid), {
        lastReadAt: serverTimestamp(),
        'reminderSettings.lastNudgeAt': serverTimestamp()
      });

      setNudge(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `groups/${roomCode}/logs`, setAsyncError, setToast);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#f5f2ed] flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-[#5A5A40] animate-spin" />
          <p className="text-[#5A5A40]/60 italic animate-pulse">Connecting to the Word...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#f5f2ed] flex flex-col items-center justify-center p-6 font-serif">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-2xl w-full bg-white rounded-[40px] overflow-hidden shadow-2xl border border-[#e5e2dd] flex flex-col md:flex-row"
        >
          {/* Left Side: Info/Features */}
          <div className="md:w-1/2 bg-[#5A5A40] p-10 text-white flex flex-col justify-center">
            <div className="w-20 h-20 bg-white/10 rounded-3xl flex items-center justify-center mb-8 backdrop-blur-sm border border-white/10 shadow-inner">
              <BookOpen className="w-14 h-14 text-white/40" />
            </div>
            <h2 className="text-3xl font-bold mb-4 leading-tight">Grow Together in the Word</h2>
            <p className="text-white/80 mb-8 italic">A private space for families to stay connected through daily scripture reading.</p>
            
            <ul className="space-y-4">
              {[
                { icon: <CheckCircle2 className="w-5 h-5" />, text: "Track daily reading progress" },
                { icon: <Users className="w-5 h-5" />, text: "See family activity in real-time" },
                { icon: <MessageSquare className="w-5 h-5" />, text: "Encourage with comments" },
                { icon: <Sparkles className="w-5 h-5" />, text: "AI-generated custom avatars" }
              ].map((feature, i) => (
                <motion.li 
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.1 }}
                  className="flex items-center gap-3 text-sm font-medium"
                >
                  <span className="text-white/40">{feature.icon}</span>
                  {feature.text}
                </motion.li>
              ))}
            </ul>
          </div>

          {/* Right Side: Login */}
          <div className="md:w-1/2 p-10 flex flex-col justify-center bg-white">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-[#1a1a1a] mb-1">Welcome</h1>
              <p className="text-[#5A5A40]/60 text-sm">Sign in to join your family group</p>
            </div>

            <div className="space-y-6">
              {loginError && (
                <div className="bg-red-50 text-red-600 text-xs p-4 rounded-2xl border border-red-100 flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {loginError}
                </div>
              )}
              
              <button 
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="w-full bg-[#5A5A40] text-white py-4 rounded-2xl font-bold hover:bg-[#4a4a34] transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {isLoggingIn ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <LogIn className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                )}
                {isLoggingIn ? 'Connecting...' : 'Sign in with Google'}
              </button>

              <div className="pt-6 border-t border-[#f5f2ed]">
                <p className="text-center text-[10px] text-[#5A5A40]/40 uppercase tracking-[0.2em] font-black">
                  Private & Secure
                </p>
              </div>
            </div>
          </div>
        </motion.div>
        
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-8 text-[#5A5A40]/40 text-xs italic"
        >
          "Thy word is a lamp unto my feet, and a light unto my path." — Psalm 119:105
        </motion.p>
      </div>
    );
  }

  if (!roomCode || !member) {
    return (
      <div className="min-h-screen bg-[#f5f2ed] flex items-center justify-center p-6 font-serif">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-[32px] p-10 shadow-xl border border-[#e5e2dd]"
        >
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="w-20 h-20 bg-[#5A5A40]/5 rounded-3xl flex items-center justify-center mb-6 border border-[#5A5A40]/10">
              <BookOpen className="w-14 h-14 text-[#5A5A40]/40" />
            </div>
            <h1 className="text-2xl font-bold text-[#1a1a1a]">Welcome, {user.displayName}</h1>
            <p className="text-[#5A5A40]/70 italic text-sm">Join or create a family group</p>
          </div>

          <div className="space-y-8">
            <form onSubmit={handleJoinGroup} className="space-y-4">
              <label className="block text-xs font-bold uppercase tracking-widest text-[#5A5A40]/60">Join Existing Group</label>
              {joinError && (
                <div className="bg-red-50 text-red-600 text-[10px] p-3 rounded-xl border border-red-100 flex items-center gap-2">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  {joinError}
                </div>
              )}
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  className="flex-1 px-4 py-3 rounded-2xl border border-[#e5e2dd] focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20 bg-[#fcfbf9] font-mono"
                  placeholder="ROOM123"
                  required
                />
                <button 
                  type="submit"
                  disabled={isJoining}
                  className="bg-[#5A5A40] text-white px-6 py-3 rounded-2xl font-bold hover:bg-[#4a4a34] transition-all disabled:opacity-50"
                >
                  {isJoining ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Join'}
                </button>
              </div>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-[#e5e2dd]"></span></div>
              <div className="relative flex justify-center text-xs uppercase tracking-widest"><span className="bg-white px-2 text-[#5A5A40]/40">Or</span></div>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-4">
              <label className="block text-xs font-bold uppercase tracking-widest text-[#5A5A40]/60">Create New Group</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={groupNameInput}
                  onChange={(e) => setGroupNameInput(e.target.value)}
                  className="flex-1 px-4 py-3 rounded-2xl border border-[#e5e2dd] focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20 bg-[#fcfbf9]"
                  placeholder="Family Name"
                  required
                />
                <button 
                  type="submit"
                  disabled={isCreating}
                  className="bg-[#5A5A40] text-white px-6 py-3 rounded-2xl font-bold hover:bg-[#4a4a34] transition-all disabled:opacity-50"
                >
                  {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create'}
                </button>
              </div>
            </form>

            <button 
              onClick={handleLogout}
              className="w-full text-[#5A5A40]/60 text-xs font-bold uppercase tracking-widest hover:text-[#5A5A40] transition-colors"
            >
              Sign Out
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (member.status === 'pending') {
    return (
      <div className="min-h-screen bg-[#f5f2ed] flex items-center justify-center p-6 font-serif">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-[32px] p-10 shadow-xl border border-[#e5e2dd] text-center"
        >
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock className="text-amber-600 w-8 h-8 animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold text-[#1a1a1a] mb-2">Waiting for Approval</h1>
          <p className="text-[#5A5A40]/70 mb-8">
            Your request to join <span className="font-bold text-[#5A5A40]">{group?.name || 'the group'}</span> is pending. 
            An admin needs to authorize your entry.
          </p>
          <div className="bg-[#fcfbf9] p-4 rounded-2xl border border-[#e5e2dd] mb-8">
            <p className="text-xs uppercase tracking-widest font-bold text-[#5A5A40]/40 mb-1">Room Code</p>
            <p className="text-xl font-mono font-bold text-[#5A5A40]">{roomCode}</p>
          </div>
          <button 
            onClick={() => {
              setRoomCode(null);
              localStorage.removeItem('roomCode');
            }}
            className="text-[#5A5A40]/60 text-xs font-bold uppercase tracking-widest hover:text-[#5A5A40] transition-colors"
          >
            Cancel Request
          </button>
        </motion.div>
      </div>
    );
  }

  const MembersView = () => {
    const approvedMembers = members.filter(m => m.status === 'approved');
    const pendingMembers = members.filter(m => m.status === 'pending');

    return (
      <div className="space-y-6">
        {member?.role === 'admin' && pendingMembers.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 text-amber-600 font-sans px-2">
              <Bell className="w-3 h-3" />
              Pending Requests ({pendingMembers.length})
            </h3>
            <div className="bg-amber-50 rounded-[32px] p-6 border border-amber-200 space-y-4">
              {pendingMembers.map(m => (
                <div key={m.uid} className="flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm border border-amber-100">
                  <div className="flex items-center gap-4">
                    <Avatar url={m.photoURL} name={m.displayName} className="w-12 h-12 bg-amber-200" />
                    <div>
                      <p className="font-bold text-lg">{m.displayName}</p>
                      <p className="text-xs text-amber-700/60 italic font-sans">Requested access</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleRejectMember(m.uid)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-amber-700 hover:bg-amber-100 transition-colors"
                    >
                      Reject
                    </button>
                    <button 
                      onClick={() => handleApproveMember(m.uid)}
                      className="bg-amber-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-amber-700 transition-colors shadow-sm"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-2">
          <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 text-[#5A5A40]/60 font-sans">
            <Users className="w-3 h-3" />
            Group Members
          </h3>
          <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-bold uppercase tracking-widest">
            <Shield className="w-3 h-3" />
            Private Group
          </div>
        </div>

        <div className="bg-white rounded-[32px] p-6 shadow-sm border border-[#e5e2dd] space-y-4">
          {approvedMembers.map(m => (
            <div key={m.uid} className="flex items-center justify-between p-4 rounded-2xl hover:bg-[#fcfbf9] transition-colors border border-transparent hover:border-[#e5e2dd]">
              <div className="flex items-center gap-4">
                <Avatar 
                  url={m.photoURL} 
                  name={m.displayName} 
                  className={cn("w-12 h-12", m.uid === user.uid ? "bg-[#5A5A40]" : "bg-[#8a8a6a]")} 
                />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-lg">{m.displayName}</p>
                    {m.role === 'admin' && (
                      <span className="bg-[#5A5A40] text-white text-[8px] px-2 py-0.5 rounded-full uppercase tracking-widest font-bold">Admin</span>
                    )}
                  </div>
                  <p className="text-xs text-[#5A5A40]/60 italic font-sans">
                    Joined {format(new Date(m.joinedAt), 'MMM d, yyyy')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-[10px] text-[#5A5A40]/40 uppercase tracking-widest font-bold mb-1">Status</p>
                  <div className="flex items-center gap-1.5">
                    <div className={cn("w-1.5 h-1.5 rounded-full", m.lastReadAt && isToday(new Date(m.lastReadAt)) ? "bg-emerald-500" : "bg-amber-400")} />
                    <span className="text-xs font-medium">{m.lastReadAt && isToday(new Date(m.lastReadAt)) ? 'Active Today' : 'Inactive'}</span>
                  </div>
                </div>
                {member.role === 'admin' && (
                  <button
                    onClick={() => handleToggleAdmin(m.uid, m.role)}
                    className={cn(
                      "p-2 rounded-xl transition-all border",
                      m.role === 'admin' 
                        ? "bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100" 
                        : "bg-[#f5f2ed] border-[#e5e2dd] text-[#5A5A40]/40 hover:text-[#5A5A40] hover:border-[#5A5A40]/20"
                    )}
                    title={m.role === 'admin' ? "Demote from Admin" : "Promote to Admin"}
                  >
                    <ShieldAlert className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          
          <div className="pt-4 border-t border-[#e5e2dd]">
            <div className="bg-[#fcfbf9] p-4 rounded-2xl border border-dashed border-[#e5e2dd] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <UserPlus className="w-5 h-5 text-[#5A5A40]/40" />
                <div>
                  <p className="text-sm font-bold">Invite Family</p>
                  <p className="text-[10px] text-[#5A5A40]/60">Share your room code with others</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-white px-3 py-1.5 rounded-xl border border-[#e5e2dd] font-mono font-bold text-[#5A5A40]">
                  {roomCode}
                </div>
                <CopyButton text={roomCode} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const needsReminder = (lastRead: string | null) => {
    if (!lastRead) return true;
    return !isToday(safeDate(lastRead));
  };

  const SettingsView = () => {
    const [enabled, setEnabled] = useState(member?.reminderSettings?.enabled || false);
    const [frequency, setFrequency] = useState<'daily' | 'weekly'>(member?.reminderSettings?.frequency || 'daily');
    const [time, setTime] = useState(member?.reminderSettings?.time || '08:00');

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 text-[#5A5A40]/60 font-sans">
            <Settings className="w-3 h-3" />
            Reminder Settings
          </h3>
        </div>

        <div className="bg-white rounded-[32px] p-8 shadow-sm border border-[#e5e2dd] space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-lg">Family Room Code</p>
              <p className="text-xs text-[#5A5A40]/60">Share this code to invite family members</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="bg-[#fcfbf9] px-4 py-2 rounded-2xl border border-[#e5e2dd] font-mono font-bold text-[#5A5A40]">
                {roomCode}
              </div>
              <CopyButton text={roomCode} />
            </div>
          </div>

          <div className="h-px bg-[#e5e2dd]" />

          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-lg">Enable Reminders</p>
              <p className="text-xs text-[#5A5A40]/60">Get nudged when you miss your reading goal</p>
            </div>
            <button 
              onClick={() => setEnabled(!enabled)}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                enabled ? "bg-emerald-500" : "bg-[#e5e2dd]"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                enabled ? "left-7" : "left-1"
              )} />
            </button>
          </div>

          <AnimatePresence>
            {enabled && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-6 overflow-hidden"
              >
                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-widest text-[#5A5A40]/60">Frequency</label>
                  <div className="flex gap-2">
                    {['daily', 'weekly'].map((f) => (
                      <button
                        key={f}
                        onClick={() => setFrequency(f as any)}
                        className={cn(
                          "flex-1 py-3 rounded-2xl font-bold text-sm border transition-all",
                          frequency === f 
                            ? "bg-[#5A5A40] text-white border-[#5A5A40]" 
                            : "bg-white text-[#5A5A40] border-[#e5e2dd] hover:bg-[#fcfbf9]"
                        )}
                      >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-widest text-[#5A5A40]/60">Reminder Time</label>
                  <input 
                    type="time" 
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border border-[#e5e2dd] focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20 bg-[#fcfbf9] font-mono font-bold text-lg"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            onClick={() => handleUpdateReminders(enabled, frequency, time)}
            className="w-full bg-[#5A5A40] text-white py-4 rounded-2xl font-bold hover:bg-[#4a4a34] transition-all shadow-lg active:scale-95"
          >
            Save Preferences
          </button>
        </div>
      </div>
    );
  };

  const Dashboard = () => {
    const approvedMembers = members.filter(m => m.status === 'approved');
    const stats = approvedMembers.map(m => {
      const memberLogs = logs.filter(l => l.memberUid === m.uid);
      const confirmedLogs = memberLogs.filter(l => l.confirmedByUid !== null);
      return {
        ...m,
        totalChapters: memberLogs.length,
        confirmations: confirmedLogs.length,
        confirmationRate: memberLogs.length > 0 ? Math.round((confirmedLogs.length / memberLogs.length) * 100) : 0
      };
    }).sort((a, b) => b.totalChapters - a.totalChapters);

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 text-[#5A5A40]/60 font-sans">
            <Users className="w-3 h-3" />
            Family Progress
          </h3>
        </div>

        <div className="grid gap-4">
          {stats.map((s, idx) => (
            <motion.div 
              key={s.uid}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-3xl p-6 shadow-sm border border-[#e5e2dd]"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Avatar 
                    url={s.photoURL} 
                    name={s.displayName} 
                    className={cn("w-12 h-12 rounded-2xl shadow-sm", s.uid === user.uid ? "bg-[#5A5A40]" : "bg-[#8a8a6a]")} 
                  />
                  <div>
                    <h4 className="font-bold text-lg leading-tight">{s.displayName}</h4>
                    <p className="text-xs text-[#5A5A40]/60 font-sans uppercase tracking-widest font-semibold">
                      {idx === 0 && s.totalChapters > 0 ? '🏆 Leading' : 'Member'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-bold text-[#5A5A40]">{s.totalChapters}</span>
                  <p className="text-[10px] text-[#5A5A40]/60 uppercase tracking-tighter font-bold">Chapters</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#5A5A40]/70 font-sans font-semibold uppercase tracking-wider">Confirmations</span>
                  <span className="font-bold">{s.confirmations} / {s.totalChapters}</span>
                </div>
                <div className="w-full bg-[#f5f2ed] h-2 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${s.confirmationRate}%` }}
                    className="h-full bg-emerald-500 rounded-full"
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-[#5A5A40]/50 italic">
                  <span>{s.confirmationRate}% Verified</span>
                  <span>Last read: {s.lastReadAt ? format(safeDate(s.lastReadAt), 'MMM d') : 'Never'}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Room Summary Card */}
        <div className="bg-[#5A5A40] text-white rounded-[32px] p-8 shadow-lg relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-sm font-bold uppercase tracking-[0.2em] opacity-70">Room Statistics</h4>
              <div className="flex items-center gap-3 bg-white/10 px-4 py-2 rounded-2xl backdrop-blur-sm border border-white/10">
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Room Code:</span>
                <span className="font-mono font-bold text-sm">{roomCode}</span>
                <CopyButton text={roomCode} className="bg-white text-[#5A5A40] hover:bg-white/90" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-4xl font-bold mb-1">{logs.length}</p>
                <p className="text-[10px] uppercase tracking-widest opacity-60 font-sans font-bold">Total Chapters</p>
              </div>
              <div>
                <p className="text-4xl font-bold mb-1">
                  {logs.filter(l => l.confirmed_by_id !== null).length}
                </p>
                <p className="text-[10px] uppercase tracking-widest opacity-60 font-sans font-bold">Confirmations</p>
              </div>
            </div>
          </div>
          <BookOpen className="absolute -right-8 -bottom-8 w-48 h-48 opacity-10 rotate-12" />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f5f2ed] font-serif text-[#1a1a1a] pb-24 lg:pb-6">
      {/* Header */}
      <header className="bg-white border-b border-[#e5e2dd] sticky top-0 z-10 px-6 py-4 safe-top">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <BookOpen className="w-8 h-8 text-[#5A5A40] hidden sm:block" />
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsUpdatingAvatar(true)}
                className="relative group"
              >
              <div className="w-10 h-10 bg-[#5A5A40] rounded-full flex items-center justify-center shadow-sm overflow-hidden border-2 border-white">
                <Avatar url={member.photoURL} name={member.displayName} className="w-full h-full bg-[#5A5A40]" />
              </div>
              <div className="absolute inset-0 bg-black/20 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Image className="w-4 h-4 text-white" />
              </div>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-lg leading-tight">{group?.name || 'Loading...'}</h2>
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Live Connection Active" />
              </div>
              <p className="text-[10px] text-[#5A5A40]/70 uppercase tracking-widest font-sans font-semibold">Room: {roomCode}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
            <button 
              onClick={() => setView('members')}
              className={cn(
                "p-2 rounded-full transition-colors",
                view === 'members' ? "bg-[#5A5A40] text-white" : "hover:bg-[#f5f2ed] text-[#5A5A40]"
              )}
            >
              <Users className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setView('settings')}
              className={cn(
                "p-2 rounded-full transition-colors",
                view === 'settings' ? "bg-[#5A5A40] text-white" : "hover:bg-[#f5f2ed] text-[#5A5A40]"
              )}
            >
              <Settings className="w-5 h-5" />
            </button>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-[#f5f2ed] rounded-full transition-colors text-[#5A5A40] active:bg-[#e5e2dd]"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Mobile Quick Action - Visible only on small screens */}
        <div className="lg:hidden">
          {view === 'feed' && needsReminder(member.lastReadAt) && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#5A5A40] text-white rounded-3xl p-5 shadow-lg mb-6"
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-lg">Daily Reading</h4>
                <Bell className="w-5 h-5 text-white/60 animate-pulse" />
              </div>
              <p className="text-white/80 text-sm mb-4 italic font-light">"Your word is a lamp for my feet..."</p>
              <button 
                onClick={() => setIsLogging(true)}
                className="w-full bg-white text-[#5A5A40] py-3 rounded-2xl font-bold text-sm active:scale-95 transition-transform"
              >
                Log Today's Reading
              </button>
            </motion.div>
          )}
        </div>

        {/* Left Column: Family Members & Reminders (Hidden on mobile, shown in bottom nav/modal or just below) */}
        <div className="hidden lg:block space-y-6">
          <div className="flex flex-col gap-2 mb-4">
            <button 
              onClick={() => setView('feed')}
              className={cn(
                "w-full text-left px-6 py-4 rounded-2xl font-bold text-sm transition-all flex items-center gap-3",
                view === 'feed' ? "bg-[#5A5A40] text-white shadow-md" : "bg-white text-[#5A5A40] border border-[#e5e2dd] hover:bg-[#fcfbf9]"
              )}
            >
              <Clock className="w-4 h-4" />
              Activity Feed
            </button>
            <button 
              onClick={() => setView('dashboard')}
              className={cn(
                "w-full text-left px-6 py-4 rounded-2xl font-bold text-sm transition-all flex items-center gap-3",
                view === 'dashboard' ? "bg-[#5A5A40] text-white shadow-md" : "bg-white text-[#5A5A40] border border-[#e5e2dd] hover:bg-[#fcfbf9]"
              )}
            >
              <Users className="w-4 h-4" />
              Family Dashboard
            </button>
            <button 
              onClick={() => setView('settings')}
              className={cn(
                "w-full text-left px-6 py-4 rounded-2xl font-bold text-sm transition-all flex items-center gap-3",
                view === 'settings' ? "bg-[#5A5A40] text-white shadow-md" : "bg-white text-[#5A5A40] border border-[#e5e2dd] hover:bg-[#fcfbf9]"
              )}
            >
              <Settings className="w-4 h-4" />
              Reminders
            </button>
          </div>

          <section className="bg-white rounded-[32px] p-6 shadow-sm border border-[#e5e2dd]">
            <div className="flex items-center gap-2 mb-6">
              <Users className="w-5 h-5 text-[#5A5A40]" />
              <h3 className="text-sm font-bold uppercase tracking-widest font-sans">Family Members</h3>
            </div>
            <div className="space-y-4">
              {members.filter(m => m.status === 'approved').map(m => (
                <div key={m.uid} className="flex items-center justify-between p-3 rounded-2xl hover:bg-[#fcfbf9] transition-colors">
                  <div className="flex items-center gap-3">
                    <Avatar 
                      url={m.photoURL} 
                      name={m.displayName} 
                      className={cn("w-10 h-10", m.uid === user.uid ? "bg-[#5A5A40]" : "bg-[#8a8a6a]")} 
                    />
                    <div>
                      <p className="font-medium">{m.displayName}</p>
                      <p className="text-xs text-[#5A5A40]/60 italic">
                        {m.lastReadAt ? `Read ${formatDistanceToNow(safeDate(m.lastReadAt))} ago` : 'No reading logged'}
                      </p>
                    </div>
                  </div>
                  {needsReminder(m.lastReadAt) && (
                    <div className="flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter">
                      <Bell className="w-3 h-3" />
                      Remind
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Middle/Right Column: Activity Feed or Dashboard */}
        <div className="lg:col-span-2 space-y-6">
          {view === 'feed' ? (
            <>
              <div className="flex items-center justify-between px-2">
                <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 text-[#5A5A40]/60 font-sans">
                  <Clock className="w-3 h-3" />
                  Recent Activity
                </h3>
                <button 
                  onClick={() => setIsLogging(true)}
                  className="hidden lg:flex bg-[#5A5A40] text-white px-5 py-2.5 rounded-full text-sm font-bold items-center gap-2 hover:shadow-md transition-all active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  Log Reading
                </button>
              </div>

              <div className="space-y-4">
                <AnimatePresence mode="popLayout">
                  {logs.length === 0 ? (
                    <div className="bg-white rounded-[32px] p-12 text-center border border-dashed border-[#e5e2dd]">
                      <Book className="w-12 h-12 text-[#e5e2dd] mx-auto mb-4" />
                      <p className="text-[#5A5A40]/50 italic">No reading logged yet. Be the first!</p>
                    </div>
                  ) : (
                    logs.map(log => (
                      <motion.div 
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        key={log.id} 
                        className="bg-white rounded-3xl p-5 shadow-sm border border-[#e5e2dd]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex gap-4">
                            <div className="w-12 h-12 bg-[#f5f2ed] rounded-2xl flex items-center justify-center shrink-0 shadow-inner overflow-hidden">
                              {log.memberPhoto ? (
                                <img src={log.memberPhoto} alt={log.memberName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <BookOpen className="text-[#5A5A40] w-6 h-6" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-bold text-base">{log.memberName}</span>
                                <span className="text-[#5A5A40]/40 text-xs italic">read</span>
                              </div>
                              <p className="text-lg font-semibold text-[#5A5A40] mb-1.5">
                                {log.book} {log.chapter}
                              </p>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#5A5A40]/60 font-sans uppercase tracking-wider font-medium">
                                <span>{format(safeDate(log.readAt), 'MMM d, h:mm a')}</span>
                                {log.confirmerName && (
                                  <span className="flex items-center gap-1 text-emerald-600 font-bold">
                                    <ShieldCheck className="w-3 h-3" />
                                    Confirmed by {log.confirmerName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {!log.confirmedByUid && log.memberUid !== user.uid && (
                            <button 
                              onClick={() => handleConfirm(log.id)}
                              className="shrink-0 bg-[#f5f2ed] text-[#5A5A40] p-2.5 rounded-2xl text-xs font-bold hover:bg-[#5A5A40] hover:text-white transition-all active:scale-90"
                              title="Confirm Reading"
                            >
                              <CheckCircle2 className="w-5 h-5" />
                            </button>
                          )}
                        </div>

                        {log.notes && (
                          <div className="mt-4 bg-[#fcfbf9] p-4 rounded-2xl border border-[#e5e2dd] italic text-sm text-[#5A5A40]/80 leading-relaxed">
                            "{log.notes}"
                          </div>
                        )}

                        <CommentSection 
                          groupId={roomCode} 
                          logId={log.id} 
                          currentUser={user} 
                          member={member} 
                          setAsyncError={setAsyncError}
                          setToast={setToast}
                        />
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </>
          ) : view === 'dashboard' ? (
            <Dashboard />
          ) : view === 'settings' ? (
            <SettingsView />
          ) : (
            <MembersView />
          )}
        </div>
      </main>

      {/* Nudge Banner */}
      <AnimatePresence>
        {nudge && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-4 right-4 lg:bottom-8 lg:left-auto lg:right-8 lg:max-w-md z-50"
          >
            <div className="bg-[#5A5A40] text-white p-6 rounded-[32px] shadow-2xl border border-white/10 backdrop-blur-md">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
                  <Bell className="w-6 h-6 animate-bounce" />
                </div>
                <div>
                  <h4 className="font-bold text-lg leading-tight mb-1">Gentle Nudge</h4>
                  <p className="text-white/80 text-sm italic">{nudge}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={handleCompleteFromNudge}
                  className="flex-1 bg-white text-[#5A5A40] py-3 rounded-xl font-bold text-sm hover:bg-emerald-50 transition-colors"
                >
                  Mark as Read
                </button>
                <button 
                  onClick={handleDismissNudge}
                  className="px-6 py-3 rounded-xl font-bold text-sm text-white/60 hover:text-white transition-colors"
                >
                  Later
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#e5e2dd] px-6 py-3 pb-8 flex items-center justify-around z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <button 
          onClick={() => setView('feed')}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors",
            view === 'feed' ? "text-[#5A5A40]" : "text-[#5A5A40]/40"
          )}
        >
          <Clock className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-widest font-sans">Feed</span>
        </button>
        <button 
          onClick={() => setIsLogging(true)}
          className="w-14 h-14 bg-[#5A5A40] rounded-full flex items-center justify-center text-white -mt-10 shadow-lg border-4 border-[#f5f2ed] active:scale-90 transition-transform"
        >
          <Plus className="w-8 h-8" />
        </button>
        <button 
          onClick={() => setView('dashboard')}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors",
            view === 'dashboard' ? "text-[#5A5A40]" : "text-[#5A5A40]/40"
          )}
        >
          <Users className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-widest font-sans">Stats</span>
        </button>
      </nav>

      {/* Log Reading Modal */}
      <AnimatePresence>
        {isUpdatingAvatar && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsUpdatingAvatar(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[32px] p-8 w-full max-w-sm shadow-2xl border border-[#e5e2dd] text-center"
            >
              <h3 className="text-2xl font-bold mb-6">Profile Picture</h3>
              <div className="w-32 h-32 mx-auto bg-[#f5f2ed] rounded-full mb-8 overflow-hidden border-4 border-[#5A5A40]/10">
                <Avatar url={member.photoURL} name={member.displayName} className="w-full h-full" />
              </div>
              
              <div className="space-y-3">
                <label className="block w-full bg-[#5A5A40] text-white py-4 rounded-full font-bold cursor-pointer hover:bg-[#4a4a34] transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2">
                  <Image className="w-5 h-5" />
                  Upload Photo
                  <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                </label>
                
                <button 
                  onClick={generateAvatar}
                  disabled={isGeneratingAvatar}
                  className="w-full bg-white text-[#5A5A40] border-2 border-[#5A5A40] py-4 rounded-full font-bold hover:bg-[#f5f2ed] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isGeneratingAvatar ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Sparkles className="w-5 h-5" />
                  )}
                  Generate with AI
                </button>
                
                <button 
                  onClick={() => setIsUpdatingAvatar(false)}
                  className="w-full py-2 text-[#5A5A40]/60 text-sm font-bold uppercase tracking-widest"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {isLogging && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsLogging(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[32px] p-8 w-full max-w-lg shadow-2xl border border-[#e5e2dd]"
            >
              <h3 className="text-2xl font-bold mb-6">Log Reading</h3>
              <form onSubmit={handleLogReading} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest mb-2">Book</label>
                    <select 
                      value={selectedBook}
                      onChange={(e) => setSelectedBook(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-[#e5e2dd] bg-[#fcfbf9] focus:outline-none"
                    >
                      {BIBLE_BOOKS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest mb-2">Chapter</label>
                    <input 
                      type="number" 
                      min="1"
                      value={chapter}
                      onChange={(e) => setChapter(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-[#e5e2dd] bg-[#fcfbf9] focus:outline-none"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest mb-2">Notes & Reflections</label>
                  <textarea 
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border border-[#e5e2dd] bg-[#fcfbf9] focus:outline-none h-32 resize-none text-sm"
                    placeholder="What did you learn from this chapter?"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsLogging(false)}
                    className="flex-1 py-4 rounded-full font-bold text-[#5A5A40] hover:bg-[#f5f2ed] transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-[#5A5A40] text-white py-4 rounded-full font-bold shadow-lg hover:bg-[#4a4a34] transition-all"
                  >
                    Log Chapter
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {toast && (
          <Toast 
            message={toast.message} 
            type={toast.type} 
            onClose={() => setToast(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
