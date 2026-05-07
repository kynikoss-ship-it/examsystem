import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Users, AlertCircle, Trash2, Cloud } from 'lucide-react';
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

// ==========================================
// 컴포넌트 외부 상수 (렌더마다 재생성 방지)
// ==========================================
const DEFAULT_SCHEDULE_DAY = [
  { id: 1, period: 1, subject: '국어', code: '01', time: '09:00 - 09:45' },
  { id: 2, period: 2, subject: '과학', code: '04', time: '10:05 - 10:50' },
  { id: 3, period: 3, subject: '역사', code: '07', time: '11:10 - 11:55' },
];

const makeDefaultGradeData = () => {
  const buildSchedules = () => ({
    '1': DEFAULT_SCHEDULE_DAY.map(s => ({ ...s })),
    '2': DEFAULT_SCHEDULE_DAY.map(s => ({ ...s })),
    '3': DEFAULT_SCHEDULE_DAY.map(s => ({ ...s })),
  });
  return {
    '1': { announcement: '', schedules: buildSchedules() },
    '2': { announcement: '', schedules: buildSchedules() },
    '3': { announcement: '', schedules: buildSchedules() },
  };
};

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

  const [gradeData, setGradeData] = useState(makeDefaultGradeData);
  const [targetGrades, setTargetGrades] = useState(['1', '2', '3']);
  const [adminGlobalAnnInput, setAdminGlobalAnnInput] = useState('');
  const [adminGradeAnnInput, setAdminGradeAnnInput] = useState('');
  const [students, setStudents] = useState([]);

  // 항상 최신 gradeData를 참조하기 위한 ref (race condition 방지)
  const gradeDataRef = useRef(gradeData);
  useEffect(() => { gradeDataRef.current = gradeData; }, [gradeData]);

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
        if (data.gradeData) {
          setGradeData({ ...makeDefaultGradeData(), ...data.gradeData });
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
        setUploadStatus('데이터 저장 완료');
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
      // 깊은 복사로 immutability 보장
      const newData = JSON.parse(JSON.stringify(prev));
      if (!newData[grade]) newData[grade] = { announcement: '', schedules: {} };
      if (!newData[grade].schedules[day]) newData[grade].schedules[day] = DEFAULT_SCHEDULE_DAY.map(s => ({ ...s }));
      newData[grade].schedules[day] = newData[grade].schedules[day].map(s =>
        s.id === id ? { ...s, [field]: value } : s
      );
      return newData;
    });
  };

  // ref 사용으로 항상 최신 state를 Firestore에 저장 (race condition 방지)
  const saveSchedule = () => updateGlobalDoc({ gradeData: gradeDataRef.current });

  const handleApplyGlobalAnnouncement = async () => {
    await updateGlobalDoc({ globalAnnouncement: adminGlobalAnnInput });
    setAdminGlobalAnnInput('');
  };

  const handleApplyGradeAnnouncement = async () => {
    const newData = JSON.parse(JSON.stringify(gradeDataRef.current));
    targetGrades.forEach(g => {
      if (!newData[g]) newData[g] = { announcement: '', schedules: {} };
      newData[g].announcement = adminGradeAnnInput;
    });
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
    setStudents(newStudents);
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
    <div className="grid grid-cols-12 gap-6 flex-1">
      <div className="col-span-9 flex flex-col gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-12 bg-slate-50 text-slate-500 font-bold text-sm border-b border-slate-200 p-3 text-center">
            <div className="col-span-2">교시</div>
            <div className="col-span-6">과목 (코드)</div>
            <div className="col-span-4">시험 시간</div>
          </div>
          {currentGradeSchedule.map((item) => (
            <div key={item.id} className={`grid grid-cols-12 items-center border-b border-slate-100 last:border-0 p-6 ${item.period.toString() === globalConfig.period ? 'bg-blue-50/50' : ''}`}>
              <div className={`col-span-2 text-center text-3xl font-black ${item.period.toString() === globalConfig.period ? 'text-blue-600' : 'text-slate-300'}`}>{item.period}</div>
              <div className="col-span-6 text-center">
                <span className="text-3xl font-bold text-slate-800">{item.subject}</span>
                <span className="text-slate-400 text-xl ml-2 font-medium">({item.code})</span>
              </div>
              <div className={`col-span-4 text-center text-4xl font-black tracking-tighter ${item.period.toString() === globalConfig.period ? 'text-blue-700' : 'text-slate-600'}`}>{item.time}</div>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 flex-1 flex flex-col gap-8">
          <h3 className="font-bold text-slate-400 text-sm flex items-center gap-2 uppercase tracking-widest"><AlertCircle size={20}/> 본부 공지사항</h3>
          <div className="flex flex-col gap-6 flex-1 justify-center">
            {globalAnnouncement && (
              <div className="p-8 bg-red-50 border-l-8 border-red-500 rounded-r-2xl shadow-sm">
                <span className="text-red-600 text-xs font-black mb-3 block tracking-widest uppercase">전체 공통 공지</span>
                <p className="text-4xl font-black text-slate-800 leading-tight break-keep whitespace-pre-wrap">{globalAnnouncement}</p>
              </div>
            )}
            {currentAnnouncement && (
              <div className="p-8 bg-blue-50 border-l-8 border-blue-500 rounded-r-2xl shadow-sm">
                <span className="text-blue-600 text-xs font-black mb-3 block tracking-widest uppercase">{localConfig.grade}학년 공지</span>
                <p className="text-4xl font-black text-slate-800 leading-tight break-keep whitespace-pre-wrap">{currentAnnouncement}</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="col-span-3 flex flex-col gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 flex gap-4 text-center shadow-sm">
          <div className="flex-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">재적</span>
            <div className="text-3xl font-black text-slate-800">{stats.total}</div>
          </div>
          <div className="flex-1 border-l border-slate-100">
            <span className="text-[10px] text-blue-400 font-bold uppercase block mb-1">응시</span>
            <div className="text-3xl font-black text-blue-600">{stats.present}</div>
          </div>
          <div className="flex-1 border-l border-slate-100">
            <span className="text-[10px] text-red-400 font-bold uppercase block mb-1">결시</span>
            <div className="text-3xl font-black text-red-600">{stats.absent}</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-8 flex-1 overflow-y-auto shadow-sm">
          <h3 className="font-bold text-slate-400 mb-6 flex items-center gap-2 tracking-widest uppercase text-xs"><Users size={18}/> 결시자 명단</h3>
          <div className="flex flex-col gap-3">
            {students.filter(s => s.isAbsent).map(s => (
              <div key={s.id} className="p-4 border border-slate-100 rounded-xl flex justify-between items-center bg-slate-50/50 shadow-sm">
                <span className="text-lg font-bold text-slate-700">
                  <span className="text-slate-400 mr-2 font-medium">{s.id}</span> {s.name}
                </span>
                <span className="px-3 py-1 bg-red-100 text-red-600 rounded-full text-xs font-black ring-1 ring-red-200">{s.absenceReason}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderAdmin = () => (
    <div className="bg-white flex-1 rounded-2xl border border-slate-200 p-8 overflow-y-auto flex flex-col gap-10 text-slate-800 shadow-sm">
      <section>
        <h2 className="font-black border-b border-slate-100 pb-4 mb-6 text-xl tracking-tight flex items-center gap-2">1. 학생 명단 업로드 (CSV)</h2>
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 border-dashed">
          <input type="file" accept=".csv" onChange={handleFileUpload} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
          {uploadStatus && <p className="mt-4 text-blue-600 font-black text-sm">{uploadStatus}</p>}
        </div>
      </section>
      <section>
        <h2 className="font-black border-b border-slate-100 pb-4 mb-6 text-xl tracking-tight flex items-center gap-2">2. 시간표 설정 ({localConfig.grade}학년 {globalConfig.day}일차)</h2>
        <div className="flex flex-col gap-3">
          {currentGradeSchedule.map(item => (
            <div key={item.id} className="flex gap-4 items-center bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="w-16 font-black text-slate-400">{item.period}교시</span>
              <input type="text" value={item.subject} onChange={(e) => handleScheduleChange(item.id, 'subject', e.target.value)} onBlur={saveSchedule} className="bg-white border border-slate-200 p-3 rounded-lg flex-1 text-slate-800 font-bold outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="text" value={item.code} onChange={(e) => handleScheduleChange(item.id, 'code', e.target.value)} onBlur={saveSchedule} className="bg-white border border-slate-200 p-3 rounded-lg w-24 text-slate-800 text-center font-bold outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="text" value={item.time} onChange={(e) => handleScheduleChange(item.id, 'time', e.target.value)} onBlur={saveSchedule} className="bg-white border border-slate-200 p-3 rounded-lg flex-1 text-slate-800 text-center font-bold outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          ))}
        </div>
      </section>
      <section>
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-black text-xl tracking-tight">3. 학생 관리 ({localConfig.grade}학년 {localConfig.class}반)</h2>
          <div className="flex gap-3">
            <button onClick={handleResetClassStudents} className="bg-white text-slate-500 px-4 py-2 rounded-xl font-bold text-xs border border-slate-200 hover:bg-slate-50">명단 초기화</button>
            <button onClick={handleAddStudent} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-black text-xs shadow-md">+ 학생 추가</button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {students.map(s => (
            <div key={s.id} className={`p-4 border rounded-2xl transition-all shadow-sm ${s.isAbsent ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
              <div className="flex items-center gap-3 mb-3">
                <input type="checkbox" checked={s.isAbsent} onChange={() => toggleAbsence(s.id)} className="w-5 h-5 rounded-md accent-blue-600" />
                <span onClick={() => setEditingStudentId(s.id)} className="flex-1 cursor-pointer font-black text-lg">
                  {editingStudentId === s.id
                    ? <input value={s.name} onChange={(e) => handleNameChange(s.id, e.target.value)} onBlur={handleNameSave} autoFocus className="bg-transparent border-b-2 border-blue-400 w-full outline-none" />
                    : s.name}
                </span>
                <button onClick={() => handleDeleteStudent(s.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={18}/></button>
              </div>
              {s.isAbsent && (
                <select value={s.absenceReason} onChange={(e) => handleAbsenceReasonChange(s.id, e.target.value)} className="w-full bg-white border border-red-200 rounded-lg p-2 text-sm font-bold text-red-600 outline-none">
                  <option value="질병">질병</option>
                  <option value="인정">인정</option>
                  <option value="미인정">미인정</option>
                  <option value="기타">기타</option>
                  <option value="전출">전출</option>
                  <option value="위탁">위탁</option>
                </select>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-6 pb-12">
        <h2 className="font-black border-b border-slate-100 pb-4 text-xl tracking-tight">4. 실시간 전달사항 송출</h2>
        <div className="grid grid-cols-2 gap-8">
          <div className="p-8 bg-slate-50 rounded-3xl border border-slate-200 shadow-inner">
            <h3 className="text-slate-800 font-black mb-4 text-sm uppercase">공통 공지사항</h3>
            <textarea value={adminGlobalAnnInput} onChange={(e) => setAdminGlobalAnnInput(e.target.value)} className="w-full bg-white border border-slate-200 p-4 rounded-xl h-32 mb-4 text-slate-800 outline-none focus:ring-2 focus:ring-red-400 font-bold shadow-sm" placeholder="모든 학년에 표시될 내용을 입력하세요." />
            <button onClick={handleApplyGlobalAnnouncement} className="w-full bg-slate-800 text-white font-black py-4 rounded-xl shadow-lg active:scale-[0.98] transition-all">전체 학년 송출</button>
          </div>
          <div className="p-8 bg-slate-50 rounded-3xl border border-slate-200 shadow-inner">
            <h3 className="text-slate-800 font-black mb-4 text-sm uppercase">학년별 선택 공지</h3>
            <div className="flex gap-4 mb-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              {['1','2','3'].map(g => (
                <label key={g} className="flex gap-2 items-center font-black text-slate-600 cursor-pointer hover:text-blue-600">
                  <input type="checkbox" checked={targetGrades.includes(g)} onChange={() => setTargetGrades(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])} className="w-4 h-4 rounded accent-blue-600" />{g}학년
                </label>
              ))}
            </div>
            <textarea value={adminGradeAnnInput} onChange={(e) => setAdminGradeAnnInput(e.target.value)} className="w-full bg-white border border-slate-200 p-4 rounded-xl h-32 mb-4 text-slate-800 outline-none focus:ring-2 focus:ring-blue-400 font-bold shadow-sm" placeholder="선택한 학년의 화면에만 표시됩니다." />
            <button onClick={handleApplyGradeAnnouncement} className="w-full bg-blue-600 text-white font-black py-4 rounded-xl shadow-lg active:scale-[0.98] transition-all">선택 학년 송출</button>
          </div>
        </div>
      </section>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-6 font-sans flex flex-col gap-6 overflow-hidden">
      <header className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-10">
          <h1 className="text-2xl font-black text-slate-800 tracking-tighter leading-none">고사 상황판</h1>
          <div className="flex gap-6 items-center bg-slate-50 px-5 py-3 rounded-2xl border border-slate-200 text-xs font-black shadow-inner">
            <div className="flex items-center gap-3">
              <span className="text-slate-400">학년</span>
              <select value={localConfig.grade} onChange={(e) => setLocalConfig({ ...localConfig, grade: e.target.value })} className="bg-transparent text-slate-800 border-b-2 border-blue-500 outline-none cursor-pointer">
                {[1, 2, 3].map(n => <option key={n} value={n}>{n}학년</option>)}
              </select>
            </div>
            <div className="w-px bg-slate-200 h-4"></div>
            <div className="flex items-center gap-3">
              <span className="text-slate-400">반</span>
              <select value={localConfig.class} onChange={(e) => setLocalConfig({ ...localConfig, class: e.target.value })} className="bg-transparent text-slate-800 border-b-2 border-blue-500 outline-none cursor-pointer">
                {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}반</option>)}
              </select>
            </div>
            <div className="w-px bg-slate-200 h-4"></div>
            <div className="flex items-center gap-3">
              <span className="text-slate-400">일차</span>
              <select value={globalConfig.day} name="day" onChange={handleGlobalConfigChange} className="bg-transparent text-slate-800 border-b-2 border-blue-500 outline-none cursor-pointer">
                {[1, 2, 3].map(n => <option key={n} value={n}>{n}일차</option>)}
              </select>
            </div>
            <div className="w-px bg-slate-200 h-4"></div>
            <div className="flex items-center gap-3">
              <span className="text-slate-400">교시</span>
              <select value={globalConfig.period} name="period" onChange={handleGlobalConfigChange} className="bg-transparent text-blue-600 border-b-2 border-blue-600 outline-none font-black cursor-pointer">
                {[1, 2, 3].map(n => <option key={n} value={n}>{n}교시</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setView('dashboard')} className={`px-10 py-3 rounded-2xl font-black text-sm transition-all duration-300 ${view === 'dashboard' ? 'bg-slate-800 text-white shadow-xl shadow-slate-200' : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'}`}>상황판</button>
          <button onClick={() => isAuthenticated ? setView('admin') : setShowAuthModal(true)} className={`px-10 py-3 rounded-2xl font-black text-sm transition-all duration-300 ${view === 'admin' ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'}`}>관리 설정</button>
        </div>
      </header>
      {view === 'dashboard' ? renderDashboard() : renderAdmin()}
      {showAuthModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2.5rem] p-12 w-full max-w-sm shadow-2xl border border-white">
            <h3 className="text-3xl font-black text-slate-800 tracking-tight text-center mb-10">관리자 인증</h3>
            <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-6">
              <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 p-5 rounded-2xl text-center text-3xl tracking-[0.5em] outline-none focus:border-blue-500 focus:bg-white transition-all text-slate-800 font-black shadow-inner" placeholder="••••" autoFocus />
              {authError && <p className="text-red-500 text-center font-black animate-bounce text-sm">{authError}</p>}
              <button type="submit" className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-xl shadow-lg active:scale-95 transition-all">확인</button>
              <button type="button" onClick={() => setShowAuthModal(false)} className="text-slate-400 font-bold hover:text-slate-600 transition-colors text-xs uppercase tracking-widest mt-2">돌아가기</button>
            </form>
          </div>
        </div>
      )}
      {isSyncing && <div className="fixed bottom-10 right-10 bg-white/90 backdrop-blur-xl px-6 py-3 rounded-full border border-slate-200 shadow-2xl text-[10px] font-black flex items-center gap-3 text-blue-600 animate-pulse ring-4 ring-blue-50"><Cloud size={14}/> 실시간 동기화 중</div>}
    </div>
  );
}
