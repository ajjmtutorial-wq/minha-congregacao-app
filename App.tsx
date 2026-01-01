
import React, { useState, useEffect, useCallback } from 'react';
import { User, Designation, AccountStatus, MonthlyProgram, CongregationMessage, AuditLog, UserRole, UserSession, Privilege } from './types';
import { INITIAL_USERS, ADMIN_MASTER_ID, ADMIN_ROLE_NAME, APP_NAME } from './constants';
import { createSession } from './services/authService';
import { LoginScreen } from './components/LoginScreen';
import { AdminPanel } from './components/AdminPanel';
import { ChatInterface } from './components/ChatInterface';
import { RegistrationForm } from './components/RegistrationForm';
import { MonthlyProgramPage } from './components/MonthlyProgramPage';
import { ChatCongregacional } from './components/ChatCongregacional';
import { SearchModule } from './components/SearchModule';
import { sendConfirmationEmail, resendConfirmationEmail } from './services/emailService';

const DB_KEY = 'chingo_core_secure_db';
const SESSION_KEY = 'chingo_core_session';

const App: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<'chat_ai' | 'chat_cong' | 'profile' | 'admin' | 'program'>('chat_ai');
  const [chatChannel, setChatChannel] = useState<'geral' | 'anciaos' | 'servos_anciaos'>('geral');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);

  const [designations, setDesignations] = useState<Designation[]>([]);
  const [programs, setPrograms] = useState<MonthlyProgram[]>([]);
  const [messages, setMessages] = useState<CongregationMessage[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isChatActive, setIsChatActive] = useState(true);

  const dbSync = useCallback((updates: any) => {
    const existing = localStorage.getItem(DB_KEY);
    const db = existing ? JSON.parse(existing) : {};
    const newDb = { ...db, ...updates };
    localStorage.setItem(DB_KEY, JSON.stringify(newDb));
  }, []);

  const bootDatabase = useCallback(() => {
    const raw = localStorage.getItem(DB_KEY);
    let db = raw ? JSON.parse(raw) : {};
    if (!db.users) {
      db.users = INITIAL_USERS;
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    }
    setUsers(db.users || []);
    setDesignations(db.designations || []);
    setPrograms(db.programs || []);
    setMessages(db.messages || []);
    setAuditLogs(db.auditLogs || []);
    setIsLoading(false);
  }, []);

  const checkSessionSecurity = useCallback(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      setCurrentUser(null);
      return;
    }
    try {
      const session: UserSession = JSON.parse(raw);
      if (Date.now() > session.expiresAt) {
        handleLogout('Sessão Expirada (24h)');
      } else {
        const user = users.find(u => u.id === session.userId);
        if (user) {
          if (user.status === AccountStatus.ACTIVE || user.role === UserRole.ADMIN_PRINCIPAL) {
            setCurrentUser(user);
          } else {
            handleLogout('Conta Inativada ou Pendente');
          }
        }
      }
    } catch (e) {
      localStorage.removeItem(SESSION_KEY);
    }
  }, [users]);

  useEffect(() => { bootDatabase(); }, [bootDatabase]);
  useEffect(() => { if (!isLoading) checkSessionSecurity(); }, [isLoading, checkSessionSecurity]);

  const addAuditLog = (action: string, targetId?: string, details?: string, actor?: User) => {
    const logActor = actor || currentUser;
    const newLog: AuditLog = {
      id: `LOG-${Date.now()}`,
      adminId: logActor?.id || 'SISTEMA',
      adminName: logActor ? `${logActor.firstName} ${logActor.lastName}` : 'System',
      action,
      targetId,
      timestamp: new Date().toISOString(),
      details
    };
    const updated = [newLog, ...auditLogs];
    setAuditLogs(updated);
    dbSync({ auditLogs: updated });
  };

  const handleLogin = (user: User) => {
    const session = createSession(user.id);
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    const updatedUsers = users.map(u => u.id === user.id ? { ...u, loginAttempts: 0, lockedUntil: undefined } : u);
    setUsers(updatedUsers);
    dbSync({ users: updatedUsers });
    setCurrentUser(user);
    addAuditLog('LOGIN_SUCCESS', user.id, undefined, user);
  };

  const handleLogout = (reason: string = 'Logout Manual') => {
    localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
    setActiveTab('chat_ai');
    setChatChannel('geral');
    if (currentUser) addAuditLog(`LOGOUT: ${reason}`, currentUser.id);
  };

  const handleRegister = async (u: User) => {
    const isFirstRegistration = users.length === 0;
    const finalUser: User = {
      ...u,
      id: isFirstRegistration ? ADMIN_MASTER_ID : u.id,
      role: isFirstRegistration ? UserRole.ADMIN_PRINCIPAL : UserRole.USER,
      status: isFirstRegistration ? AccountStatus.ACTIVE : AccountStatus.PENDING,
      privilege: isFirstRegistration ? Privilege.ELDER : u.privilege,
      isEmailVerified: isFirstRegistration ? true : false,
      emailResendCount: 0
    };
    const updated = [...users, finalUser];
    setUsers(updated);
    dbSync({ users: updated });
    let emailSent = true;
    if (!isFirstRegistration) {
      const result = await sendConfirmationEmail(finalUser);
      emailSent = result.success;
      addAuditLog(emailSent ? 'EMAIL_CADASTRO_ENVIADO' : 'FALHA_ENVIO_EMAIL_CADASTRO', finalUser.id, result.error);
    }
    return { success: true, emailSent };
  };

  const handleResendEmail = async (emailOrId: string): Promise<{ success: boolean; message: string }> => {
    const target = emailOrId.trim();
    const user = users.find(u => u.email === target.toLowerCase() || u.id === target.toUpperCase());
    
    if (!user) return { success: false, message: "E-mail não encontrado no sistema institucional." };
    if (user.isEmailVerified || user.status === AccountStatus.ACTIVE) return { success: false, message: "Este cadastro já foi aprovado." };
    if (user.status !== AccountStatus.PENDING) return { success: false, message: "Status da conta inválido para reenvio." };

    const now = new Date();
    const lastResendAt = user.lastEmailResendAt ? new Date(user.lastEmailResendAt) : null;
    const diffHours = lastResendAt ? (now.getTime() - lastResendAt.getTime()) / (1000 * 60 * 60) : 25;

    let currentCount = user.emailResendCount || 0;
    if (diffHours >= 24) currentCount = 0;

    if (currentCount >= 3) {
      addAuditLog('BLOQUEIO_REENVIO_COTA', user.id, 'Limite de 3 tentativas atingido.');
      return { success: false, message: "Limite atingido (Máximo 3 reenvios por 24h)." };
    }

    const result = await resendConfirmationEmail(user);
    if (result.success) {
      const updatedUsers = users.map(u => 
        u.id === user.id ? { ...u, emailResendCount: currentCount + 1, lastEmailResendAt: now.toISOString() } : u
      );
      setUsers(updatedUsers);
      dbSync({ users: updatedUsers });
      addAuditLog('REENVIO_EMAIL_SUCESSO', user.id);
      return { success: true, message: `Reenvio realizado para ${user.email}.` };
    } else {
      addAuditLog('REENVIO_EMAIL_ERRO', user.id, result.error);
      return { success: false, message: "Erro ao reenviar e-mail. Tente mais tarde." };
    }
  };

  const handlePasswordResetRequest = async (email: string, userId: string): Promise<boolean> => {
    const user = users.find(u => u.email === email && u.id === userId);
    if (!user) { alert("Dados não coincidem."); return false; }
    const updatedUsers = users.map(u => u.id === user.id ? { ...u, status: AccountStatus.PENDING_RESET } : u);
    setUsers(updatedUsers);
    dbSync({ users: updatedUsers });
    addAuditLog(`PEDIDO_REDEFINIÇÃO: ${user.id}`, user.id);
    return true;
  };

  const secureUpdateUser = (userId: string, updates: Partial<User>) => {
    const updatedUsers = users.map(u => u.id === userId ? { ...u, ...updates } : u);
    setUsers(updatedUsers);
    dbSync({ users: updatedUsers });
    addAuditLog(`USER_UPDATE: ${userId}`, userId);
  };

  if (isLoading) return <div className="h-screen bg-slate-900 flex items-center justify-center"><div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {!currentUser ? (
        <LoginScreen 
          users={users} onLogin={handleLogin} onRegister={handleRegister} 
          onResetPassword={handlePasswordResetRequest} onResendEmail={handleResendEmail}
          onFailedAttempt={(userId) => {
            const u = users.find(usr => usr.id === userId || usr.email === userId);
            if (u) {
              const newAttempts = u.loginAttempts + 1;
              const updates: any = { loginAttempts: newAttempts };
              if (newAttempts >= 5) updates.lockedUntil = Date.now() + (15 * 60 * 1000);
              const updatedUsers = users.map(usr => usr.id === u.id ? { ...usr, ...updates } : usr);
              setUsers(updatedUsers);
              dbSync({ users: updatedUsers });
            }
          }}
        />
      ) : (
        <>
          <header className="bg-white border-b sticky top-0 z-50 p-4 shadow-sm">
            <div className="max-w-6xl mx-auto flex justify-between items-center">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white"><i className="fas fa-book-open"></i></div>
                 <h1 className="font-black text-xl tracking-tighter">{APP_NAME}</h1>
              </div>
              <div className="flex items-center gap-2">
                 <button onClick={() => setShowSearch(true)} className="w-10 h-10 flex items-center justify-center text-slate-500 rounded-full"><i className="fas fa-search"></i></button>
                 <button onClick={() => handleLogout()} className="px-4 py-2 bg-slate-50 text-slate-600 rounded-xl border border-slate-200 font-black text-[10px] uppercase">Sair</button>
              </div>
            </div>
          </header>
          {showSearch && <SearchModule user={currentUser} designations={designations} onClose={() => setShowSearch(false)} />}
          <main className="max-w-6xl mx-auto px-4 mt-6">
            {activeTab === 'chat_ai' && <ChatInterface users={users} designations={designations} />}
            {activeTab === 'chat_cong' && (
              <div className="space-y-4">
                {(currentUser.privilege === Privilege.ELDER || currentUser.privilege === Privilege.MINISTERIAL_SERVANT || currentUser.role === UserRole.ADMIN_PRINCIPAL) && (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    <button onClick={() => setChatChannel('geral')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase ${chatChannel === 'geral' ? 'bg-blue-600 text-white' : 'bg-white border text-slate-500'}`}>Geral</button>
                    {(currentUser.privilege === Privilege.ELDER || currentUser.role === UserRole.ADMIN_PRINCIPAL) && (
                      <button onClick={() => setChatChannel('anciaos')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase ${chatChannel === 'anciaos' ? 'bg-slate-900 text-white' : 'bg-white border text-slate-500'}`}>Corpo Anciãos</button>
                    )}
                    <button onClick={() => setChatChannel('servos_anciaos')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase ${chatChannel === 'servos_anciaos' ? 'bg-emerald-700 text-white' : 'bg-white border text-slate-500'}`}>Servos e Anciãos</button>
                  </div>
                )}
                <ChatCongregacional 
                  user={currentUser} users={users} 
                  messages={messages.filter(m => (m.caption?.includes(`CHANNEL:${chatChannel}`) || (!m.caption && chatChannel === 'geral')))} 
                  onSendMessage={(m) => { 
                    const nm = { ...m, id: `MSG-${Date.now()}`, senderId: currentUser.id, senderName: `${currentUser.firstName} ${currentUser.lastName}`, timestamp: new Date().toISOString(), caption: `CHANNEL:${chatChannel}` } as CongregationMessage; 
                    const up = [...messages, nm]; setMessages(up); dbSync({ messages: up }); 
                  }} 
                  onDeleteMessage={(id) => { const up = messages.filter(m => m.id !== id); setMessages(up); dbSync({ messages: up }); }} 
                  isChatActive={isChatActive} 
                />
              </div>
            )}
            {activeTab === 'admin' && currentUser.role === UserRole.ADMIN_PRINCIPAL && <AdminPanel users={users} auditLogs={auditLogs} currentUser={currentUser} designations={designations} programs={programs} messages={messages} isChatActive={isChatActive} onToggleStatus={(id) => secureUpdateUser(id, { status: users.find(u => u.id === id)?.status === AccountStatus.ACTIVE ? AccountStatus.INACTIVE : AccountStatus.ACTIVE, isEmailVerified: true })} onUpdateUserPrivilege={(id, p) => secureUpdateUser(id, { privilege: p })} onToggleChatStatus={() => { setIsChatActive(!isChatActive); dbSync({ isChatActive: !isChatActive }); }} onSendNotification={(userId, type) => addAuditLog(`NOTIF_SENT: ${type}`, userId)} onManageDesignation={(a, d) => { let up = [...designations]; if (a === 'add') up.push({ ...d, id: `D-${Date.now()}` }); else if (a === 'delete') up = up.filter(x => x.id !== d); setDesignations(up); dbSync({ designations: up }); }} onTogglePinMessage={(id) => { const up = messages.map(m => m.id === id ? { ...m, isPinned: !m.isPinned } : m); setMessages(up); dbSync({ messages: up }); }} onUpdateProgram={(p) => { const up = [p, ...programs]; setPrograms(up); dbSync({ programs: up }); }} onDeleteChatMessage={(id) => { const up = messages.filter(m => m.id !== id); setMessages(up); dbSync({ messages: up }); }} />}
            {activeTab === 'profile' && <RegistrationForm currentUser={currentUser} onRegister={handleRegister} onUpdateUser={secureUpdateUser} />}
            {activeTab === 'program' && <MonthlyProgramPage user={currentUser} programs={programs} />}
          </main>
          <nav className="fixed bottom-0 left-0 right-0 bg-white border-t px-2 py-4 flex justify-around md:hidden shadow-lg z-40">
             <button onClick={() => setActiveTab('chat_ai')} className={`flex flex-col items-center gap-1 ${activeTab === 'chat_ai' ? 'text-blue-600' : 'text-slate-500'}`}><i className="fas fa-robot text-xl"></i><span className="text-[10px] font-black uppercase">Assistente</span></button>
             <button onClick={() => setActiveTab('chat_cong')} className={`flex flex-col items-center gap-1 ${activeTab === 'chat_cong' ? 'text-blue-600' : 'text-slate-500'}`}><i className="fas fa-users text-xl"></i><span className="text-[10px] font-black uppercase">Chat</span></button>
             <button onClick={() => setActiveTab('program')} className={`flex flex-col items-center gap-1 ${activeTab === 'program' ? 'text-blue-600' : 'text-slate-500'}`}><i className="fas fa-calendar text-xl"></i><span className="text-[10px] font-black uppercase">Programa</span></button>
             {currentUser.role === UserRole.ADMIN_PRINCIPAL && <button onClick={() => setActiveTab('admin')} className={`flex flex-col items-center gap-1 ${activeTab === 'admin' ? 'text-blue-600' : 'text-slate-500'}`}><i className="fas fa-shield-alt text-xl"></i><span className="text-[10px] font-black uppercase">Admin</span></button>}
             <button onClick={() => setActiveTab('profile')} className={`flex flex-col items-center gap-1 ${activeTab === 'profile' ? 'text-blue-600' : 'text-slate-500'}`}><i className="fas fa-user-circle text-xl"></i><span className="text-[10px] font-black uppercase">Perfil</span></button>
          </nav>
        </>
      )}
    </div>
  );
};

export default App;
