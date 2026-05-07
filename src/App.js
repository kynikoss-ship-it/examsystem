import React, { useState, useMemo, useEffect } from 'react';
import { Settings, MonitorPlay, Users, AlertCircle, Lock, X, Trash2, Plus, Cloud, CloudOff, Send } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyCuydLyh83vbG1nR6-HV5MuNgJNhdJSuUI",
  authDomain: "exam-system-9bcd7.firebaseapp.com",
  projectId: "exam-system-9bcd7",
  storageBucket: "exam-system-9bcd7.firebasestorage.app",
  messagingSenderId: "654691831598",
  appId: "1:654691831598:web:c41cf4d02bd433824574bf",
  measurementId: "G-36DXM2SY8N"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "school-exam-dashboard"; 

export default function App() {
  const [user, setUser] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [view, setView] = useState('dashboard');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');
  const [editingStudentId, setEditingStudentId] = useState(null);

  const [localConfig, setLocalConfig] = useState({ grade: '2', class: '5' });
  const [globalConfig, setGlobalConfig] = useState({ day: '1', period: '1' });
  const [globalAnnouncement, setGlobalAnnouncement] = useState('');
  const [studentDirectory, setStudentDirectory] = useState({});
  const [uploadStatus, setUploadStatus] = useState('');

  const defaultScheduleDay = [
    { id: 1, period: 1, subject: '국어', code: '01', time: '09:00 - 09:45' },
    { id: 2, period: 2, subject: '과학', code: '04', time: '10:05 - 10:50' },
    { id: 3, period: 3, subject: '역사', code: '07', time: '11:10 - 11:55' },
  ];

  const defaultGradeData = {
    '1': { announcement: '', schedules: { '1': [...defaultScheduleDay], '2': [...defaultScheduleDay], '3': [...defaultScheduleDay] } },
    '2': { announcement: '', schedules: { '1': [...defaultScheduleDay], '2': [...defaultScheduleDay], '3': [...defaultScheduleDay] } },
    '3': { announcement: '', schedules: { '1': [...defaultScheduleDay], '2': [...defaultScheduleDay], '3': [...defaultScheduleDay] } },
  };

  const [gradeData, setGradeData] = useState(defaultGradeData);
  const [targetGrades, setTargetGrades] = useState(['1', '2', '3']);
  const [adminGlobalAnnInput, setAdminGlobalAnnInput] = useState('');
  const [adminGradeAnnInput, setAdminGradeAnnInput] = useState('');
  const [students, setStudents] = useState([]);

  useEffect(() => {
    signInAnonymously(auth).catch(err => console.error("인증 실패:", err));
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    setIsSyncing(true);

    const globalRef = doc(db, 'artifacts', appId, 'public', 'data', 'examData', 'global');
    const unsubGlobal = onSnapshot(globalRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.globalConfig) setGlobalConfig(data.globalConfig);
        if (data.globalAnnouncement !== undefined) setGlobalAnnouncement(data.globalAnnouncement);
        if (data.studentDirectory) setStudentDirectory(data.studentDirectory);
        if (data.gradeData) setGradeData(prev => ({ ...defaultGradeData, ...data.gradeData }));
      }
      setIsSyncing(false);
    });

    const classDocId = `class_${localConfig.grade}_${localConfig.class}`;
    const classRef = doc(db, 'artifacts', appId, 'public', 'data', 'examData', classDocId);
    const unsubClass = onSnapshot(classRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().students) {
        setStudents(docSnap.data().students);
      } else {
        setStudents([]);
      }
    });

    return () => { unsubGlobal(); unsubClass(); };
  }, [user, localConfig.grade, localConfig.class]);

  const stats = useMemo(() => {
    const transfer = students.filter(s => s.isAbsent && s.absenceReason === '전출').length;
    const entrusted = students.filter(s => s.isAbsent && s.absenceReason === '위탁').length;
    const absent = students.filter(s => s.isAbsent && !['전출', '위탁'].includes(s.absenceReason)).length;
    const total = students.length - transfer - entrusted; 
    return { total, present: total - absent, absent, transfer, entrusted };
  }, [students]);

  const currentGradeData = gradeData[localConfig.grade] || {};
  const currentGradeSchedule = (currentGradeData.schedules && currentGradeData.schedules[globalConfig.day]) || [];
  const currentAnnouncement = currentGradeData.announcement || '';

  const updateGlobalDoc = async (updates) => {
    if (!user) return;
    const globalRef = doc(db, 'artifacts', appId, 'public', 'data', 'examData', 'global');
    await setDoc(globalRef, updates, { merge: true });
  };

  const updateClassDoc = async (newStudents) => {
    if (!user) return;
    const classDocId = `class_${localConfig.grade}_${localConfig.class}`;
    const classRef = doc(db, 'artifacts', appId, 'public', 'data', 'examData', classDocId);
    await setDoc(classRef, { students: newStudents }, { merge: true });
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadStatus('업로드 중...');
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const rows = text.split(/\r?\n/);
        const directory = {};
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i].trim();
          if (!row) continue;
          const cols = row.split(',');
          if (cols.length < 4) continue;
          
          const grade = cols[0].trim();
          const cls = cols[1].trim();
          const num = parseInt(cols[2].trim());
          const name = cols[3].trim();

          if (isNaN(num)) continue;

          const key = `${grade}-${cls}`;
          if (!directory[key]) directory[key] = [];
          directory[key].push({ id: num, name: name, isAbsent: false, absenceReason: '질병' });
        }
        await updateGlobalDoc({ studentDirectory: directory });
        setUploadStatus('저장 완료');
      } catch (err) { 
        console.error(err);
        setUploadStatus('오류 발생 (브라우저 콘솔 확인)'); 
      }
    };
    reader.readAsText(file, 'euc-kr');
  };

  const handleResetClassStudents = async () => {
    const dirKey = `${localConfig.grade}-${localConfig.class}`;
    const dirData = studentDirectory[dirKey] || [];
    if (dirData.length === 0) return;
    setStudents(dirData);
    await updateClassDoc(dirData);
  };

  const handleGlobalConfigChange = (e) => {
    const { name, value } = e.target;
    const newConfig = { ...globalConfig, [name]: value };
    setGlobalConfig(newConfig);
    updateGlobalDoc({ globalConfig: newConfig });
  };

  const handleScheduleChange = (id, field, value) => {
    const grade = localConfig.grade;
    const day = globalConfig.day;
    setGradeData(prev => {
      const newData = { ...prev };
      newData[grade].schedules[day] = newData[grade].schedules[day].map(s => s.id === id ? { ...s, [field]: value } : s);
      return newData;
    });
  };

  const saveSchedule = () => updateGlobalDoc({ gradeData });

  const handleApplyGlobalAnnouncement = async () => {
    await updateGlobalDoc({ globalAnnouncement: adminGlobalAnnInput });
    setAdminGlobalAnnInput('');
  };

  const handleApplyGradeAnnouncement = async () => {
    const newData = { ...gradeData };
    targetGrades.forEach(g => { newData[g].announcement = adminGradeAnnInput; });
    await updateGlobalDoc({ gradeData: newData });
    setAdminGradeAnnInput('');
  };

  const toggleAbsence = async (id) => {
    const newStudents = students.map(s => s.id === id ? { ...s, isAbsent: !s.isAbsent, absenceReason: '질병' } : s);
    setStudents(newStudents);
    await updateClassDoc(newStudents);
  };

  const handleAbsenceReasonChange = async (id, reason) => {
    const newStudents = students.map(s => s.id === id ? { ...s, absenceReason: reason } : s);
    await updateClassDoc(newStudents);
  };

  const handleNameChange = (id, name) => setStudents(prev => prev.map(s => s.id === id ? { ...s, name } : s));
  const handleNameSave = () => { setEditingStudentId(null); updateClassDoc(students); };
  const handleDeleteStudent = (id) => updateClassDoc(students.filter(s => s.id !== id));
  const handleAddStudent = () => {
    const nextId = students.length > 0 ? Math.max(...students.map(s => s.id)) + 1 : 1;
    updateClassDoc([...students, { id: nextId, name: '새 학생', isAbsent: false, absenceReason: '질병' }]);
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (passwordInput === '3328') { setIsAuthenticated(true); setShowAuthModal(false); setView('admin'); }
    else setAuthError('비밀번호가 틀렸습니다.');
  };

  const renderDashboard = () => (
    <div className="grid grid-cols-12 gap-4 flex-1">
      <div className="col-span-9 flex flex-col gap-4">
        <div className="bg-slate-900 rounded-xl shadow-lg border border-slate-800 overflow-hidden">
          <div className="grid grid-cols-12 bg-slate-800 text-slate-400 font-bold text-sm border-b border-slate-700 p-2">
            <div className="col-span-2 text-center">교시</div>
            <div className="col-span-6 text-center">과목 (코드)</div>
            <div className="col-span-4 text-center">시간</div>
          </div>
          {currentGradeSchedule.map((item) => (
            <div key={item.id} className={`grid grid-cols-12 items-center border-b border-slate-800/50 p-5 ${item.period.toString() === globalConfig.period ? 'bg-blue-900/30' : ''}`}>
              <div className="col-span-2 text-center text-2xl font-black text-slate-500">{item.period}</div>
              <div className="col-span-6 text-center text-3xl font-bold text-slate-100">{item.subject} <span className="text-slate-500 text-xl font-medium">({item.code})</span></div>
              <div className="col-span-4 text-center text-4xl font-black text-blue-400 tracking-tighter">{item.time}</div>
            </div>
          ))}
        </div>
        <div className="bg-slate-900 rounded-xl shadow-lg border border-slate-800 p-8 flex-1 flex flex-col gap-6">
          <h3 className="font-black text-slate-500 text-lg flex items-center gap-2 uppercase tracking-widest"><AlertCircle size={24}/> 본부 전달사항</h3>
          <div className="flex flex-col gap-4 flex-1 justify-center">
            {globalAnnouncement && (
              <div className="p-8 bg-red-950/40 border-l-8 border-red-600 rounded-r-2xl shadow-inner">
                <span className="text-red-500 text-sm font-black mb-2 block tracking-widest uppercase">전체 공통</span>
                <p className="text-4xl font-black text-slate-100 leading-tight break-keep">{globalAnnouncement}</p>
              </div>
            )}
            {currentAnnouncement && (
              <div className="p-8 bg-blue-950/40 border-l-8 border-blue-600 rounded-r-2xl shadow-inner">
                <span className="text-blue-500 text-sm font-black mb-2 block tracking-widest uppercase">{localConfig.grade}학년 공지</span>
                <p className="text-4xl font-black text-slate-100 leading-tight break-keep">{currentAnnouncement}</p>
              </div>
            )}
            {!globalAnnouncement && !currentAnnouncement && (
              <div className="text-center text-slate-700 text-2xl font-bold italic">현재 전달사항이 없습니다.</div>
            )}
          </div>
        </div>
      </div>
      <div className="col-span-3 flex flex-col gap-4">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 flex gap-3 text-center">
          <div className="flex-1 bg-slate-800/50 p-3 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-500 font-bold uppercase">재적</span>
            <div className="text-3xl font-black text-slate-200">{stats.total}</div>
          </div>
          <div className="flex-1 bg-blue-900/20 p-3 rounded-lg border border-blue-900/50">
            <span className="text-[10px] text-blue-500 font-bold uppercase">응시</span>
            <div className="text-3xl font-black text-blue-400">{stats.present}</div>
          </div>
          <div className="flex-1 bg-red-900/20 p-3 rounded-lg border border-red-900/50">
            <span className="text-[10px] text-red-500 font-bold uppercase">결시</span>
            <div className="text-3xl font-black text-red-400">{stats.absent}</div>
          </div>
        </div>
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 flex-1 overflow-y-auto">
          <h3 className="font-black text-slate-400 mb-6 flex items-center gap-2 tracking-widest uppercase"><Users size={20}/> 결시자 명단</h3>
          <div className="flex flex-col gap-3">
            {students.filter(s => s.isAbsent).map(s => (
              <div key={s.id} className="p-4 border border-slate-800 rounded-xl flex justify-between items-center bg-slate-800/30">
                <span className="text-lg font-bold text-slate-300">
                  <span className="text-slate-600 mr-2">{s.id}</span> {s.name}
                </span>
                <span className="px-3 py-1 bg-red-900/40 text-red-400 rounded-full text-xs font-black ring-1 ring-red-500/30">{s.absenceReason}</span>
              </div>
            ))}
            {students.filter(s => s.isAbsent).length === 0 && (
              <div className="text-center py-10 text-slate-700 font-bold">결시자 없음</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderAdmin = () => (
    <div className="bg-slate-900 flex-1 rounded-xl border border-slate-800 p-8 overflow-y-auto flex flex-col gap-10 text-slate-200">
      <section>
        <h2 className="font-black border-b border-slate-800 pb-3 mb-6 text-xl text-blue-500 tracking-wider">1. 학생 명렬표 CSV 업로드</h2>
        <input type="file" accept=".csv" onChange={handleFileUpload} className="p-4 border border-slate-800 rounded-xl w-full bg-slate-800/50 text-slate-400" />
        {uploadStatus && <p className="mt-3 text-green-500 font-black flex items-center gap-2"><Cloud size={16}/> {uploadStatus}</p>}
      </section>
      <section>
        <h2 className="font-black border-b border-slate-800 pb-3 mb-6 text-xl text-blue-500 tracking-wider">2. 시간표 관리 ({localConfig.grade}학년 {globalConfig.day}일차)</h2>
        <div className="flex flex-col gap-3">
          {currentGradeSchedule.map(item => (
            <div key={item.id} className="flex gap-4 items-center bg-slate-800/30 p-3 rounded-xl border border-slate-800">
              <span className="w-14 font-black text-slate-500">{item.period}교시</span>
              <input type="text" value={item.subject} onChange={(e) => handleScheduleChange(item.id, 'subject', e.target.value)} onBlur={saveSchedule} className="bg-slate-900 border border-slate-700 p-3 rounded-lg flex-1 text-slate-100 font-bold" placeholder="과목" />
              <input type="text" value={item.code} onChange={(e) => handleScheduleChange(item.id, 'code', e.target.value)} onBlur={saveSchedule} className="bg-slate-900 border border-slate-700 p-3 rounded-lg w-24 text-slate-100 text-center font-bold" placeholder="코드" />
              <input type="text" value={item.time} onChange={(e) => handleScheduleChange(item.id, 'time', e.target.value)} onBlur={saveSchedule} className="bg-slate-900 border border-slate-700 p-3 rounded-lg flex-1 text-slate-100 text-center font-bold tracking-tighter" placeholder="시간" />
            </div>
          ))}
        </div>
      </section>
      <section>
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-black text-xl text-blue-500 tracking-wider">3. 학생 관리 ({localConfig.grade}학년 {localConfig.class}반)</h2>
          <div className="flex gap-3">
            <button onClick={handleResetClassStudents} className="bg-red-900/30 text-red-400 px-4 py-2 rounded-xl font-black text-xs border border-red-900/50 hover:bg-red-900/50 transition-all">명단 초기화</button>
            <button onClick={handleAddStudent} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-black text-xs shadow-lg shadow-blue-900/40">+ 학생 추가</button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {students.map(s => (
            <div key={s.id} className={`p-4 border rounded-2xl transition-all ${s.isAbsent ? 'bg-red-950/20 border-red-900/50' : 'bg-slate-800/40 border-slate-800'}`}>
              <div className="flex items-center gap-3 mb-3">
                <input type="checkbox" checked={s.isAbsent} onChange={() => toggleAbsence(s.id)} className="w-5 h-5 rounded-md accent-blue-600" />
                <span onClick={() => setEditingStudentId(s.id)} className="flex-1 cursor-pointer font-black text-lg">
                  {editingStudentId === s.id ? <input value={s.name} onChange={(e) => handleNameChange(s.id, e.target.value)} onBlur={handleNameSave} autoFocus className="bg-transparent border-b-2 border-blue-500 w-full outline-none" /> : s.name}
                </span>
                <button onClick={() => handleDeleteStudent(s.id)} className="text-slate-600 hover:text-red-500 transition-colors"><Trash2 size={18}/></button>
              </div>
              {s.isAbsent && (
                <select value={s.absenceReason} onChange={(e) => handleAbsenceReasonChange(s.id, e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm font-bold text-slate-300 outline-none focus:border-red-500">
                  <option value="질병">질병</option><option value="인정">인정</option><option value="미인정">미인정</option><option value="기타">기타</option><option value="전출">전출</option><option value="위탁">위탁</option>
                </select>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-6">
        <h2 className="font-black border-b border-slate-800 pb-3 text-xl text-blue-500 tracking-wider">4. 전달사항 송출</h2>
        <div className="grid grid-cols-2 gap-6">
          <div className="p-6 bg-red-950/20 rounded-2xl border border-red-900/30">
            <h3 className="text-red-500 font-black mb-4 flex items-center gap-2"><AlertCircle size={20}/> 전체 공통 내용</h3>
            <textarea value={adminGlobalAnnInput} onChange={(e) => setAdminGlobalAnnInput(e.target.value)} className="w-full bg-slate-900 border border-slate-800 p-4 rounded-xl h-32 mb-4 text-slate-100 outline-none focus:border-red-600 font-bold" placeholder="모든 학년에 표시됩니다." />
            <button onClick={handleApplyGlobalAnnouncement} className="w-full bg-red-600 text-white font-black py-4 rounded-xl shadow-lg shadow-red-950/50 active:scale-[0.98] transition-all">전체 학년 송출</button>
          </div>
          <div className="p-6 bg-blue-950/20 rounded-2xl border border-blue-900/30">
            <h3 className="text-blue-500 font-black mb-4 flex items-center gap-2"><Send size={20}/> 학년별 개별 내용</h3>
            <div className="flex gap-4 mb-4 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
              {['1','2','3'].map(g => (
                <label key={g} className="flex gap-2 items-center font-black text-slate-400 cursor-pointer hover:text-slate-100 transition-colors">
                  <input type="checkbox" checked={targetGrades.includes(g)} onChange={() => setTargetGrades(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])} className="w-4 h-4" />{g}학년
                </label>
              ))}
            </div>
            <textarea value={adminGradeAnnInput} onChange={(e) => setAdminGradeAnnInput(e.target.value)} className="w-full bg-slate-900 border border-slate-800 p-4 rounded-xl h-32 mb-4 text-slate-100 outline-none focus:border-blue-600 font-bold" placeholder="선택한 학년에만 표시됩니다." />
            <button onClick={handleApplyGradeAnnouncement} className="w-full bg-blue-600 text-white font-black py-4 rounded-xl shadow-lg shadow-blue-900/40 active:scale-[0.98] transition-all">선택 학년 송출</button>
          </div>
        </div>
      </section>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 font-sans flex flex-col gap-4 overflow-hidden">
      <header className="bg-slate-900 p-5 rounded-2xl shadow-2xl border border-slate-800 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-8">
          <div className="flex flex-col">
            <h1 className="text-2xl font-black text-slate-100 tracking-tighter leading-none">고사 상황판</h1>
            <span className="text-[10px] font-bold text-blue-500 tracking-[0.3em] uppercase mt-1">Status Board</span>
          </div>
          <div className="flex gap-5 items-center bg-slate-950/50 p-3 rounded-xl border border-slate-800 text-xs font-black shadow-inner">
            <div className="flex items-center gap-2">
              <span className="text-slate-600 uppercase">Grade</span>
              <select value={localConfig.grade} onChange={(e) => setLocalConfig({ ...localConfig, grade: e.target.value })} className="bg-transparent text-slate-100 border-b border-blue-500 outline-none cursor-pointer">
                {[1, 2, 3].map(n => <option key={n} value={n} className="bg-slate-900">{n}학년</option>)}
              </select>
            </div>
            <div className="w-px h-4 bg-slate-800"></div>
            <div className="flex items-center gap-2">
              <span className="text-slate-600 uppercase">Class</span>
              <select value={localConfig.class} onChange={(e) => setLocalConfig({ ...localConfig, class: e.target.value })} className="bg-transparent text-slate-100 border-b border-blue-500 outline-none cursor-pointer">
                {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n} className="bg-slate-900">{n}반</option>)}
              </select>
            </div>
            <div className="w-px h-4 bg-slate-800"></div>
            <div className="flex items-center gap-2">
              <span className="text-slate-600 uppercase">Day</span>
              <select value={globalConfig.day} name="day" onChange={handleGlobalConfigChange} className="bg-transparent text-slate-100 border-b border-blue-500 outline-none cursor-pointer">
                {[1, 2, 3].map(n => <option key={n} value={n} className="bg-slate-900">{n}일차</option>)}
              </select>
            </div>
            <div className="w-px h-4 bg-slate-800"></div>
            <div className="flex items-center gap-2">
              <span className="text-slate-600 uppercase">Period</span>
              <select value={globalConfig.period} name="period" onChange={handleGlobalConfigChange} className="bg-transparent text-blue-400 border-b border-blue-500 outline-none font-black cursor-pointer">
                {[1, 2, 3].map(n => <option key={n} value={n} className="bg-slate-900">{n}교시</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setView('dashboard')} className={`px-8 py-3 rounded-xl font-black text-sm transition-all duration-300 ${view === 'dashboard' ? 'bg-slate-100 text-slate-900 shadow-xl shadow-white/10' : 'bg-slate-800 text-slate-500 border border-slate-700 hover:bg-slate-700'}`}>상황판</button>
          <button onClick={() => isAuthenticated ? setView('admin') : setShowAuthModal(true)} className={`px-8 py-3 rounded-xl font-black text-sm transition-all duration-300 ${view === 'admin' ? 'bg-blue-600 text-white shadow-xl shadow-blue-900/20' : 'bg-slate-800 text-slate-500 border border-slate-700 hover:bg-slate-700'}`}>관리 설정</button>
        </div>
      </header>
      {view === 'dashboard' ? renderDashboard() : renderAdmin()}
      {showAuthModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-3xl p-10 w-full max-w-sm shadow-2xl border border-slate-800">
            <h3 className="text-3xl font-black text-slate-100 mb-6 flex items-center gap-2"><Lock size={24}/> 관리자 인증</h3>
            <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-6">
              <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} className="w-full bg-slate-950 border-2 border-slate-800 p-5 rounded-2xl text-center text-3xl tracking-[0.5em] outline-none focus:border-blue-500 transition-all text-slate-100 font-black shadow-inner" placeholder="••••" autoFocus />
              {authError && <p className="text-red-500 text-center font-black">{authError}</p>}
              <button type="submit" className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-xl shadow-lg shadow-blue-900/40 active:scale-95 transition-all">확인</button>
              <button type="button" onClick={() => setShowAuthModal(false)} className="text-slate-600 font-black hover:text-slate-400">취소</button>
            </form>
          </div>
        </div>
      )}
      {isSyncing && <div className="fixed bottom-8 right-8 bg-slate-900/80 backdrop-blur-xl px-6 py-3 rounded-full border border-slate-700 shadow-2xl text-[10px] font-black flex items-center gap-3 text-blue-400 animate-pulse ring-1 ring-blue-500/20"><Cloud size={14}/> LIVE SYNC ACTIVE</div>}
    </div>
  );
}
