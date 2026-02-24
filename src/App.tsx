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
  Book
} from 'lucide-react';
import { format, formatDistanceToNow, isToday } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { BIBLE_BOOKS, type Member, type ReadingLog } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [roomCode, setRoomCode] = useState<string | null>(localStorage.getItem('roomCode'));
  const [member, setMember] = useState<Member | null>(JSON.parse(localStorage.getItem('member') || 'null'));
  const [nameInput, setNameInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  
  const [members, setMembers] = useState<Member[]>([]);
  const [logs, setLogs] = useState<ReadingLog[]>([]);
  const [isLogging, setIsLogging] = useState(false);
  const [selectedBook, setSelectedBook] = useState('Genesis');
  const [chapter, setChapter] = useState('1');

  const fetchState = useCallback(async (code: string) => {
    try {
      const res = await fetch(`/api/rooms/${code}/state`);
      const data = await res.json();
      setMembers(data.members);
      setLogs(data.logs);
    } catch (err) {
      console.error('Failed to fetch state', err);
    }
  }, []);

  useEffect(() => {
    if (roomCode) {
      fetchState(roomCode);
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}?roomCode=${roomCode}`);
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'NEW_LOG') {
          setLogs(prev => [data.log, ...prev]);
          setMembers(prev => prev.map(m => 
            m.id === data.log.member_id ? { ...m, last_read_at: data.log.read_at } : m
          ));
        } else if (data.type === 'LOG_CONFIRMED') {
          setLogs(prev => prev.map(l => l.id === data.log.id ? data.log : l));
        }
      };

      return () => ws.close();
    }
  }, [roomCode, fetchState]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput || !codeInput) return;

    const res = await fetch('/api/rooms/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: codeInput.toUpperCase(), name: nameInput }),
    });
    const data = await res.json();
    
    setRoomCode(data.room_code);
    setMember(data.member);
    localStorage.setItem('roomCode', data.room_code);
    localStorage.setItem('member', JSON.stringify(data.member));
  };

  const handleLogout = () => {
    localStorage.removeItem('roomCode');
    localStorage.removeItem('member');
    setRoomCode(null);
    setMember(null);
  };

  const handleLogReading = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member || !roomCode) return;

    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberId: member.id,
        roomCode,
        book: selectedBook,
        chapter: parseInt(chapter)
      }),
    });
    setIsLogging(false);
  };

  const handleConfirm = async (logId: number) => {
    if (!member || !roomCode) return;
    await fetch(`/api/logs/${logId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmerId: member.id, roomCode }),
    });
  };

  if (!roomCode || !member) {
    return (
      <div className="min-h-screen bg-[#f5f2ed] flex items-center justify-center p-6 font-serif">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-[32px] p-10 shadow-xl border border-[#e5e2dd]"
        >
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="w-16 h-16 bg-[#5A5A40] rounded-full flex items-center justify-center mb-4 shadow-lg">
              <BookOpen className="text-white w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold text-[#1a1a1a] mb-2">Family Bible Tracker</h1>
            <p className="text-[#5A5A40]/70 italic">Encouraging each other in the Word</p>
          </div>

          <form onSubmit={handleJoin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-[#1a1a1a] mb-2 uppercase tracking-widest">Your Name</label>
              <input 
                type="text" 
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-[#e5e2dd] focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20 bg-[#fcfbf9]"
                placeholder="e.g. John Doe"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1a1a1a] mb-2 uppercase tracking-widest">Family Room Code</label>
              <input 
                type="text" 
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 rounded-2xl border border-[#e5e2dd] focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20 bg-[#fcfbf9] font-mono"
                placeholder="ROOM123"
                required
              />
            </div>
            <button 
              type="submit"
              className="w-full bg-[#5A5A40] text-white py-4 rounded-full font-medium hover:bg-[#4a4a34] transition-all shadow-lg active:scale-95"
            >
              Enter Family Room
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  const needsReminder = (lastRead: string | null) => {
    if (!lastRead) return true;
    return !isToday(new Date(lastRead));
  };

  return (
    <div className="min-h-screen bg-[#f5f2ed] font-serif text-[#1a1a1a] pb-24 lg:pb-6">
      {/* Header */}
      <header className="bg-white border-b border-[#e5e2dd] sticky top-0 z-10 px-6 py-4 safe-top">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#5A5A40] rounded-full flex items-center justify-center shadow-sm">
              <BookOpen className="text-white w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight">Room: {roomCode}</h2>
              <p className="text-[10px] text-[#5A5A40]/70 uppercase tracking-widest font-sans font-semibold">Welcome, {member.name}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 hover:bg-[#f5f2ed] rounded-full transition-colors text-[#5A5A40] active:bg-[#e5e2dd]"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Mobile Quick Action - Visible only on small screens */}
        <div className="lg:hidden">
          {needsReminder(member.last_read_at) && (
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
          <section className="bg-white rounded-[32px] p-6 shadow-sm border border-[#e5e2dd]">
            <div className="flex items-center gap-2 mb-6">
              <Users className="w-5 h-5 text-[#5A5A40]" />
              <h3 className="text-sm font-bold uppercase tracking-widest font-sans">Family Members</h3>
            </div>
            <div className="space-y-4">
              {members.map(m => (
                <div key={m.id} className="flex items-center justify-between p-3 rounded-2xl hover:bg-[#fcfbf9] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-white font-bold",
                      m.id === member.id ? "bg-[#5A5A40]" : "bg-[#8a8a6a]"
                    )}>
                      {m.name[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium">{m.name}</p>
                      <p className="text-xs text-[#5A5A40]/60 italic">
                        {m.last_read_at ? `Read ${formatDistanceToNow(new Date(m.last_read_at))} ago` : 'No reading logged'}
                      </p>
                    </div>
                  </div>
                  {needsReminder(m.last_read_at) && (
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

        {/* Middle/Right Column: Activity Feed */}
        <div className="lg:col-span-2 space-y-6">
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
                    className="bg-white rounded-3xl p-5 shadow-sm border border-[#e5e2dd] flex items-start justify-between gap-3"
                  >
                    <div className="flex gap-4">
                      <div className="w-12 h-12 bg-[#f5f2ed] rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                        <BookOpen className="text-[#5A5A40] w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-bold text-base">{log.member_name}</span>
                          <span className="text-[#5A5A40]/40 text-xs italic">read</span>
                        </div>
                        <p className="text-lg font-semibold text-[#5A5A40] mb-1.5">
                          {log.book} {log.chapter}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#5A5A40]/60 font-sans uppercase tracking-wider font-medium">
                          <span>{format(new Date(log.read_at), 'MMM d, h:mm a')}</span>
                          {log.confirmer_name && (
                            <span className="flex items-center gap-1 text-emerald-600 font-bold">
                              <ShieldCheck className="w-3 h-3" />
                              Confirmed by {log.confirmer_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {!log.confirmed_by_id && log.member_id !== member.id && (
                      <button 
                        onClick={() => handleConfirm(log.id)}
                        className="shrink-0 bg-[#f5f2ed] text-[#5A5A40] p-2.5 rounded-2xl text-xs font-bold hover:bg-[#5A5A40] hover:text-white transition-all active:scale-90"
                        title="Confirm Reading"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                      </button>
                    )}
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#e5e2dd] px-6 py-3 pb-8 flex items-center justify-around z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <button className="flex flex-col items-center gap-1 text-[#5A5A40]">
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
          onClick={() => {
            // Simple toggle for members list on mobile could go here
            // For now just a placeholder for "Family"
          }}
          className="flex flex-col items-center gap-1 text-[#5A5A40]/40"
        >
          <Users className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-widest font-sans">Family</span>
        </button>
      </nav>

      {/* Log Reading Modal */}
      <AnimatePresence>
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
    </div>
  );
}
