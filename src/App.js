import React, { useState, useMemo, useEffect } from 'react';
import { Settings, MonitorPlay, Users, AlertCircle, Lock, X, Trash2, Plus, Cloud, CloudOff, Send } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// ==========================================
// Firebase 설정
// ==========================================
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
    signInAnonymously(auth).catch(err => console.error(err));
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
        if (data.gradeData) {
          setGradeData(prev => ({ ...defaultGradeData, ...data.gradeData }));
        }
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
          const cols = rows[i].split(',');
          if (cols.length < 4) continue;
          const key = `${cols[0].trim()}-${cols[1].trim()}`;
          if (!directory[key]) directory[key] = [];
          directory[key].push({ id: parseInt(cols[2]), name: cols[3].trim(), isAbsent: false, absenceReason: '질병' });
        }
        await updateGlobalDoc({ studentDirectory: directory });
        setUploadStatus('저장 완료');
      } catch (err) { setUploadStatus('오류 발생'); }
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
    else setAuthError('오답');
  };

  const renderDashboard = () => (
    <div className="grid grid-cols-12 gap-4 flex-1">
      <div className="col-span-9 flex flex-col gap-4">
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="grid grid-cols-12 bg-slate-100 text-slate-600 font-medium text-sm border-b p-2">
            <div className="col-span-2 text-center">교시</div>
            <div className="col-span-6 text-center">과목 (코드)</div>
            <div className="col-span-4 text-center">시간</div>
          </div>
          {currentGradeSchedule.map((item) => (
            <div key={item.id} className={`grid grid-cols-12 items-center border-b p-4 ${item.period.toString() === globalConfig.period ? 'bg-blue-50' : ''}`}>
              <div className="col-span-2 text-center text-xl font-bold">{item.period}</div>
              <div className="col-span-6 text-center text-2xl font-bold">{item.subject} <span className="text-slate-400">({item.code})</span></div>
              <div className="col-span-4 text-center text-3xl font-bold text-blue-700">{item.time}</div>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-6 flex-1 flex flex-col gap-4">
          <h3 className="font-bold text-slate-500 flex items-center gap-2"><AlertCircle size={18}/> 본부 전달사항</h3>
          {globalAnnouncement && <div className="p-6 bg-red-50 border-red-100 border rounded-xl text-3xl font-bold">{globalAnnouncement}</div>}
          {currentAnnouncement && <div className="p-6 bg-blue-50 border-blue-100 border rounded-xl text-3xl font-bold">{currentAnnouncement}</div>}
        </div>
      </div>
      <div className="col-span-3 flex flex-col gap-4">
        <div className="bg-white rounded-xl border p-4 flex gap-2 text-center">
          <div className="flex-1 bg-slate-50 p-2 rounded">재적<br/><b className="text-xl">{stats.total}</b></div>
          <div className="flex-1 bg-blue-50 p-2 rounded text-blue-700">응시<br/><b className="text-xl">{stats.present}</b></div>
          <div className="flex-1 bg-red-50 p-2 rounded text-red-600">결시<br/><b className="text-xl">{stats.absent}</b></div>
        </div>
        <div className="bg-white rounded-xl border p-5 flex-1 overflow-y-auto">
          <h3 className="font-bold mb-4 flex items-center gap-2"><Users size={18}/> 결시자 명단</h3>
          <div className="flex flex-col gap-2">
            {students.filter(s => s.isAbsent).map(s => (
              <div key={s.id} className="p-3 border rounded-lg flex justify-between bg-red-50">
                <span><b>{s.id}번</b> {s.name}</span>
                <span className="text-red-600 font-bold">{s.absenceReason}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderAdmin = () => (
    <div className="bg-white flex-1 rounded-xl border p-6 overflow-y-auto flex flex-col gap-8">
      <section>
        <h2 className="font-bold border-b pb-2 mb-4 text-lg">1. 명렬표 CSV 업로드</h2>
        <input type="file" accept=".csv" onChange={handleFileUpload} className="p-2 border rounded w-full bg-slate-50" />
        {uploadStatus && <p className="mt-2 text-blue-600 font-bold">{uploadStatus}</p>}
      </section>
      <section>
        <h2 className="font-bold border-b pb-2 mb-4 text-lg">2. 시간표 관리 ({localConfig.grade}학년 {globalConfig.day}일차)</h2>
        <div className="grid grid-cols-1 gap-2">
          {currentGradeSchedule.map(item => (
            <div key={item.id} className="flex gap-2 items-center">
              <span className="w-12 font-bold">{item.period}교시</span>
              <input type="text" value={item.subject} onChange={(e) => handleScheduleChange(item.id, 'subject', e.target.value)} onBlur={saveSchedule} className="border p-2 rounded flex-1" placeholder="과목" />
              <input type="text" value={item.code} onChange={(e) => handleScheduleChange(item.id, 'code', e.target.value)} onBlur={saveSchedule} className="border p-2 rounded w-20" placeholder="코드" />
              <input type="text" value={item.time} onChange={(e) => handleScheduleChange(item.id, 'time', e.target.value)} onBlur={saveSchedule} className="border p-2 rounded flex-1" placeholder="시간" />
            </div>
          ))}
        </div>
      </section>
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-lg">3. 학생 관리 ({localConfig.grade}학년 {localConfig.class}반)</h2>
          <div className="flex gap-2">
            <button onClick={handleResetClassStudents} className="bg-red-50 text-red-700 p-2 rounded font-bold text-sm">명단 초기화</button>
            <button onClick={handleAddStudent} className="bg-blue-600 text-white p-2 rounded font-bold text-sm">+ 추가</button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {students.map(s => (
            <div key={s.id} className={`p-3 border rounded-xl ${s.isAbsent ? 'bg-red-50 border-red-200' : 'bg-slate-50'}`}>
              <div className="flex items-center gap-2 mb-2">
                <input type="checkbox" checked={s.isAbsent} onChange={() => toggleAbsence(s.id)} className="w-4 h-4" />
                <span onClick={() => setEditingStudentId(s.id)} className="flex-1 cursor-pointer font-bold">
                  {editingStudentId === s.id ? <input value={s.name} onChange={(e) => handleNameChange(s.id, e.target.value)} onBlur={handleNameSave} autoFocus className="w-full border-b" /> : s.name}
                </span>
                <button onClick={() => handleDeleteStudent(s.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={16}/></button>
              </div>
              {s.isAbsent && (
                <select value={s.absenceReason} onChange={(e) => handleAbsenceReasonChange(s.id, e.target.value)} className="w-full border rounded p-1 text-sm">
                  <option value="질병">질병</option><option value="인정">인정</option><option value="미인정">미인정</option><option value="기타">기타</option><option value="전출">전출</option><option value="위탁">위탁</option>
                </select>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="font-bold border-b pb-2 text-lg">4. 전달사항 송출</h2>
        <div className="p-4 bg-red-50 rounded-xl">
          <textarea value={adminGlobalAnnInput} onChange={(e) => setAdminGlobalAnnInput(e.target.value)} className="w-full border p-3 rounded-lg h-24 mb-2" placeholder="전체 공통 내용" />
          <button onClick={handleApplyGlobalAnnouncement} className="w-full bg-red-600 text-white font-bold py-3 rounded-lg">전체 적용</button>
        </div>
        <div className="p-4 bg-blue-50 rounded-xl">
          <div className="flex gap-4 mb-3">
            {['1','2','3'].map(g => (
              <label key={g} className="flex gap-1 items-center font-bold"><input type="checkbox" checked={targetGrades.includes(g)} onChange={() => setTargetGrades(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])} />{g}학년</label>
            ))}
          </div>
          <textarea value={adminGradeAnnInput} onChange={(e) => setAdminGradeAnnInput(e.target.value)} className="w-full border p-3 rounded-lg h-24 mb-2" placeholder="선택 학년 개별 내용" />
          <button onClick={handleApplyGradeAnnouncement} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg">선택 학년 적용</button>
        </div>
      </section>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 p-4 font-sans flex flex-col gap-4">
      <header className="bg-white p-4 rounded-2xl shadow-sm border flex justify-between items-center">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-black text-blue-800">고사 현황</h1>
          <div className="flex gap-4 items-center bg-slate-50 p-2 rounded-xl border text-sm font-bold">
            학년 <select value={localConfig.grade} onChange={(e) => setLocalConfig({ ...localConfig, grade: e.target.value })} className="bg-transparent border-b border-blue-500">
              {[1, 2, 3].map(n => <option key={n} value={n}>{n}학년</option>)}
            </select>
            반 <select value={localConfig.class} onChange={(e) => setLocalConfig({ ...localConfig, class: e.target.value })} className="bg-transparent border-b border-blue-500">
              {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}반</option>)}
            </select>
            일자 <select value={globalConfig.day} name="day" onChange={handleGlobalConfigChange} className="bg-transparent border-b border-blue-500">
              {[1, 2, 3].map(n => <option key={n} value={n}>{n}일차</option>)}
            </select>
            교시 <select value={globalConfig.period} name="period" onChange={handleGlobalConfigChange} className="bg-transparent border-b border-blue-500 text-blue-600">
              {[1, 2, 3].map(n => <option key={n} value={n}>{n}교시</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView('dashboard')} className={`px-6 py-2 rounded-xl font-bold transition-all ${view === 'dashboard' ? 'bg-slate-800 text-white shadow-lg' : 'bg-white border text-slate-500'}`}>대시보드</button>
          <button onClick={() => isAuthenticated ? setView('admin') : setShowAuthModal(true)} className={`px-6 py-2 rounded-xl font-bold transition-all ${view === 'admin' ? 'bg-slate-800 text-white shadow-lg' : 'bg-white border text-slate-500'}`}>관리자</button>
        </div>
      </header>
      {view === 'dashboard' ? renderDashboard() : renderAdmin()}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
            <h3 className="text-2xl font-black mb-6 flex items-center gap-2"><Lock size={24}/> 관리자 인증</h3>
            <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
              <input 입력="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} className="w-full border-2 p-4 rounded-2xl text-center text-2xl tracking-widest outline-none focus:border-blue-500 transition-all" placeholder="비밀번호" autoFocus />
              {authError && <p className="text-red-500 text-center font-bold">인증 실패</p>}
              <button 입력="submit" className="w-full bg-slate-800 text-white py-4 rounded-2xl font-black text-xl shadow-lg active:scale-95 transition-all">확인</button>
              <button 입력="button" onClick={() => setShowAuthModal(false)} className="text-slate-400 font-bold hover:text-slate-600">취소</button>
            </form>
          </div>
        </div>
      )}
      {isSyncing && <div className="fixed bottom-6 right-6 bg-white/80 backdrop-blur px-4 py-2 rounded-full border shadow-xl text-xs font-bold flex items-center gap-2 text-blue-600 animate-pulse"><Cloud size={16}/> 실시간 동기화 중...</div>}
    </div>
  );
}
