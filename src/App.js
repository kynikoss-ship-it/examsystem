④ src/App.js (또는 App.jsx)

중복 선언을 제거하고 방어 로직을 강화한 최신 코드입니다. 이 코드 전체를 복사하여 App.js에 덮어쓰세요.

import React, { useState, useMemo, useEffect } from 'react';
import { 설정, MonitorPlay, 사용자, AlertCircle, Lock, X, Trash2, Plus, Cloud, CloudOff, 보내기 } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// ==========================================
// Firebase 설정 및 초기화 영역
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

// 중복 선언 방지를 위해 한 번만 초기화합니다.
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "school-exam-dashboard"; 
// ==========================================

export 기본 function App() {
  // --- Auth & Sync State ---
  const [user, setUser] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // --- UI State ---
  const [view, setView] = useState('dashboard');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');
  const [editingStudentId, setEditingStudentId] = useState(null);

  // --- Local Config (기기별 독립 설정) ---
  const [localConfig, setLocalConfig] = useState({
    grade: '2',
    class: '5',
  });

  // --- Global State (전교 공통 동기화) ---
  const [globalConfig, setGlobalConfig] = useState({
    day: '1',
    period: '1',
  });
  const [globalAnnouncement, setGlobalAnnouncement] = useState('');
  const [studentDirectory, setStudentDirectory] = useState({});
  const [uploadStatus, setUploadStatus] = useState('');

  // --- Grade-specific Data (학년별 데이터) ---
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

  // --- Firebase Auth Setup ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("인증 실패:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // --- Real-time Data Listeners ---
  useEffect(() => {
    if (!user || !db) return;
    setIsSyncing(true);

    const globalRef = doc(db, 'artifacts', appId, 'public', 'data', 'examData', 'global');
    const unsubGlobal = onSnapshot(globalRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.globalConfig) setGlobalConfig(data.globalConfig);
        if (data.globalAnnouncement !== undefined) setGlobalAnnouncement(data.globalAnnouncement);
        if (data.studentDirectory) setStudentDirectory(data.studentDirectory);
        
        if (data.gradeData) {
          setGradeData(prev => {
            const merged = { ...defaultGradeData };
            Object.keys(data.gradeData).forEach(key => {
              merged[key] = {
                announcement: data.gradeData[key]?.announcement || '',
                schedules: data.gradeData[key]?.schedules || defaultGradeData[key].schedules
              };
            });
            return merged;
          });
        }
      } else {
        await setDoc(globalRef, { globalConfig, gradeData: defaultGradeData, globalAnnouncement: '', studentDirectory: {} }, { merge: true });
      }
      setIsSyncing(false);
    }, (err) => console.error(err));

    const classDocId = `class_${localConfig.grade}_${localConfig.class}`;
    const classRef = doc(db, 'artifacts', appId, 'public', 'data', 'examData', classDocId);
    const unsubClass = onSnapshot(classRef, async (docSnap) => {
      if (docSnap.exists() && docSnap.data().students) {
        setStudents(docSnap.data().students);
      } else {
        setStudents([]);
      }
    }, (err) => console.error(err));

    return () => {
      unsubGlobal();
      unsubClass();
    };
  }, [user, localConfig.grade, localConfig.class]);

  // --- Derived Data ---
  const stats = useMemo(() => {
    const transfer = students.filter(s => s.isAbsent && s.absenceReason === '전출').length;
    const entrusted = students.filter(s => s.isAbsent && s.absenceReason === '위탁').length;
    const absent = students.filter(s => s.isAbsent && !['전출', '위탁'].includes(s.absenceReason)).length;
    const total = students.length - transfer - entrusted; 
    return { total, present: total - absent, absent, transfer, entrusted };
  }, [students]);

  const currentGradeData = gradeData[localConfig.grade] || {};
  const currentSchedules = currentGradeData.schedules || {};
  const currentGradeSchedule = currentSchedules[globalConfig.day] || [];
  const currentAnnouncement = currentGradeData.announcement || '';

  // --- Write to Firestore Functions ---
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

  // --- Handlers ---
  const handleFileUpload = (e) => {
    const file = e.target.파일[0];
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
          const num = parseInt(cols[2].trim(), 10);
          const name = cols[3].trim();

          if (!grade || !cls || isNaN(num) || !name) continue;

          const key = `${grade}-${cls}`;
          if (!directory[key]) directory[key] = [];
          directory[key].push({
            id: num,
            name: name,
            isAbsent: false,
            absenceReason: '질병'
          });
        }

        Object.keys(directory).forEach(key => {
          directory[key].sort((a, b) => a.id - b.id);
        });

        await updateGlobalDoc({ studentDirectory: directory });
        setUploadStatus('명렬표 데이터가 전교 DB에 저장되었습니다.');
        setTimeout(() => setUploadStatus(''), 3000);
      } catch (err) {
        setUploadStatus('파일 처리 오류가 발생했습니다.');
      }
    };
    reader.readAsText(file, 'euc-kr');
  };

  const handleResetClassStudents = async () => {
    const dirKey = `${localConfig.grade}-${localConfig.class}`;
    const dirData = studentDirectory[dirKey] || [];
    if (dirData.length === 0) {
      setUploadStatus('해당 학급 명단이 원본 파일에 없습니다.');
      setTimeout(() => setUploadStatus(''), 3000);
      return;
    }
    setStudents(dirData);
    await updateClassDoc(dirData);
  };

  const handleLocalConfigChange = (e) => {
    const { name, value } = e.target;
    setLocalConfig(prev => ({ ...prev, [name]: value }));
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
      if (!newData[grade]) newData[grade] = { announcement: '', schedules: {} };
      if (!newData[grade].schedules) newData[grade].schedules = {};
      if (!newData[grade].schedules[day]) newData[grade].schedules[day] = [];

      const updatedSchedule = newData[grade].schedules[day].map(s => s.id === id ? { ...s, [field]: value } : s);
      newData[grade].schedules[day] = updatedSchedule;
      return newData;
    });
  };

  const saveSchedule = () => {
    updateGlobalDoc({ gradeData });
  };

  const handleApplyGlobalAnnouncement = async () => {
    setGlobalAnnouncement(adminGlobalAnnInput);
    await updateGlobalDoc({ globalAnnouncement: adminGlobalAnnInput });
    setAdminGlobalAnnInput('');
  };

  const handleApplyGradeAnnouncement = async () => {
    if (targetGrades.length === 0) return;
    const newGradeData = { ...gradeData };
    targetGrades.forEach(grade => {
      if (!newGradeData[grade]) newGradeData[grade] = { announcement: '', schedules: {} };
      newGradeData[grade].announcement = adminGradeAnnInput;
    });
    setGradeData(newGradeData);
    await updateGlobalDoc({ gradeData: newGradeData });
    setAdminGradeAnnInput('');
  };

  const toggleTargetGrade = (grade) => {
    setTargetGrades(prev => 
      prev.includes(grade) ? prev.filter(g => g !== grade) : [...prev, grade]
    );
  };

  const toggleAbsence = async (studentId) => {
    const newStudents = students.map(s => 
      s.id === studentId ? { ...s, isAbsent: !s.isAbsent, absenceReason: s.absenceReason || '질병' } : s
    );
    setStudents(newStudents);
    await updateClassDoc(newStudents);
  };

  const handleAbsenceReasonChange = async (studentId, reason) => {
    const newStudents = students.map(s => 
      s.id === studentId ? { ...s, absenceReason: reason } : s
    );
    setStudents(newStudents);
    await updateClassDoc(newStudents);
  };

  const handleNameChange = (studentId, newName) => {
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, name: newName } : s));
  };

  const handleNameSave = async () => {
    setEditingStudentId(null);
    await updateClassDoc(students);
  };

  const handleDeleteStudent = async (studentId) => {
    const newStudents = students.filter(s => s.id !== studentId);
    setStudents(newStudents);
    await updateClassDoc(newStudents);
  };

  const handleAddStudent = async () => {
    const nextId = students.length > 0 ? Math.max(...students.map(s => s.id)) + 1 : 1;
    const newStudents = [...students, {
      id: nextId,
      name: `${localConfig.grade}-${localConfig.class} 신규학생${nextId}`,
      isAbsent: false,
      absenceReason: '질병'
    }];
    setStudents(newStudents);
    await updateClassDoc(newStudents);
  };

  const handleAdminClick = () => {
    if (isAuthenticated) setView('admin');
    else setShowAuthModal(true);
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (passwordInput === '3328') {
      setIsAuthenticated(true);
      setShowAuthModal(false);
      setPasswordInput('');
      setView('admin');
      setAuthError('');
    } else {
      setAuthError('비밀번호가 일치하지 않습니다.');
    }
  };

  const renderDashboard = () => (
    <div className="grid grid-cols-12 gap-4 flex-1">
      <div className="col-span-9 flex flex-col gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-12 bg-slate-100 text-slate-600 font-medium text-sm border-b border-slate-200">
            <div className="col-span-2 py-2 px-4 text-center border-r border-slate-200">교시</div>
            <div className="col-span-6 py-2 px-4 text-center border-r border-slate-200">과목 (코드)</div>
            <div className="col-span-4 py-2 px-4 text-center">시간</div>
          </div>
          <div className="flex flex-col">
            {currentGradeSchedule.map((item) => {
              const isActive = item.period.toString() === globalConfig.period;
              return (
                <div key={item.id} className={`grid grid-cols-12 items-center border-b border-slate-100 last:border-0 ${isActive ? 'bg-blue-50/50' : ''}`}>
                  <div className={`col-span-2 py-4 px-4 text-center text-xl font-bold ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>
                    {item.period}
                  </div>
                  <div className="col-span-6 py-4 px-4 text-center flex items-center justify-center gap-2">
                    <span className={`text-2xl font-bold tracking-tight ${isActive ? 'text-slate-800' : 'text-slate-600'}`}>
                      {item.subject}
                    </span>
                    <span className="text-slate-500 font-medium text-lg">({item.code})</span>
                  </div>
                  <div className={`col-span-4 py-4 px-4 text-center text-3xl font-bold tracking-tighter ${isActive ? 'text-blue-700' : 'text-slate-500'}`}>
                    {item.time}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col flex-1">
          <h3 className="text-sm font-bold text-slate-500 mb-4 flex items-center gap-2">
            <AlertCircle size={16} /> 본부 전달사항 <span className="text-xs font-normal text-slate-400">({localConfig.grade}학년)</span>
          </h3>
          <div className="flex-1 flex flex-col gap-3">
            {(!globalAnnouncement && !currentAnnouncement) ? (
              <div className="flex-1 flex items-center justify-center p-6 bg-slate-50 rounded-lg border border-slate-100 text-center">
                <p className="text-slate-500 font-medium text-lg">등록된 전달사항이 없습니다.</p>
              </div>
            ) : (
              <>
                {globalAnnouncement && (
                  <div className="flex-1 bg-red-50 rounded-xl border border-red-100 p-6 flex flex-col justify-center">
                    <span className="inline-block self-start px-3 py-1 bg-red-100 text-red-700 text-sm font-bold rounded-lg mb-3">전체 공통</span>
                    <p className="text-slate-800 font-bold text-3xl leading-snug whitespace-pre-wrap break-keep">
                      {globalAnnouncement}
                    </p>
                  </div>
                )}
                {currentAnnouncement && (
                  <div className="flex-1 bg-blue-50 rounded-xl border border-blue-100 p-6 flex flex-col justify-center">
                    <span className="inline-block self-start px-3 py-1 bg-blue-100 text-blue-700 text-sm font-bold rounded-lg mb-3">{localConfig.grade}학년</span>
                    <p className="text-slate-800 font-bold text-3xl leading-snug whitespace-pre-wrap break-keep">
                      {currentAnnouncement}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="col-span-3 flex flex-col gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex gap-2">
           <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 text-center flex flex-col justify-center">
              <span className="text-[10px] font-semibold text-slate-500 mb-1">재적</span>
              <span className="text-xl font-bold text-slate-800">{stats.total}</span>
           </div>
           <div className="flex-1 bg-blue-50 border border-blue-200 rounded-lg p-2 text-center flex flex-col justify-center">
              <span className="text-[10px] font-semibold text-blue-600 mb-1">응시</span>
              <span className="text-xl font-bold text-blue-700">{stats.present}</span>
           </div>
           <div className="flex-1 bg-red-50 border border-red-200 rounded-lg p-2 text-center flex flex-col justify-center">
              <span className="text-[10px] font-semibold text-red-600 mb-1">결시</span>
              <span className="text-xl font-bold text-red-600">{stats.absent}</span>
           </div>
           {stats.transfer > 0 && (
             <div className="flex-1 bg-slate-100 border border-slate-200 rounded-lg p-2 text-center flex flex-col justify-center">
                <span className="text-[10px] font-semibold text-slate-600 mb-1">전출</span>
                <span className="text-xl font-bold text-slate-600">{stats.transfer}</span>
             </div>
           )}
           {stats.entrusted > 0 && (
             <div className="flex-1 bg-slate-100 border border-slate-200 rounded-lg p-2 text-center flex flex-col justify-center">
                <span className="text-[10px] font-semibold text-slate-600 mb-1">위탁</span>
                <span className="text-xl font-bold text-slate-600">{stats.entrusted}</span>
             </div>
           )}
        </div>

         <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-500 flex items-center gap-2">
              <Users size={16} /> 결시자 명단
            </h3>
            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">
              {localConfig.grade}학년 {localConfig.class}반
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {(stats.absent === 0 && stats.transfer === 0 && stats.entrusted === 0) ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm">
                <p>현재 결시자가 없습니다.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {students.filter(s => s.isAbsent).map(student => {
                  const isExcluded = ['전출', '위탁'].includes(student.absenceReason);
                  return (
                    <li key={student.id} className={`flex items-center justify-between p-3 border rounded-lg
                      ${isExcluded ? 'bg-slate-50 border-slate-200' : 'bg-red-50 border-red-100'}
                    `}>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold px-2 py-1 rounded
                          ${isExcluded ? 'bg-slate-200 text-slate-700' : 'bg-red-200 text-red-800'}
                        `}>
                          {student.id}번
                        </span>
                        <span className={`font-medium ${isExcluded ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                          {student.name}
                        </span>
                      </div>
                      <span className={`text-sm font-medium ${isExcluded ? 'text-slate-500' : 'text-red-600'}`}>
                        {student.absenceReason}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderAdmin = () => (
    <div className="bg-white flex-1 rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col gap-8 overflow-y-auto">
      <div>
        <h2 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b">1. 학생 명렬표 CSV 업로드</h2>
        <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
          <input 
            입력="file" 
            accept=".csv"
            onChange={handleFileUpload}
            className="text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {uploadStatus && (
            <span className={`text-sm font-bold ${uploadStatus.includes('오류') ? 'text-red-500' : 'text-green-600'}`}>
              {uploadStatus}
            </span>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b">
          2. 학년별 시간표 관리 <span className="text-sm font-normal text-blue-600 ml-2">({localConfig.grade}학년 {globalConfig.day}일차 기준)</span>
        </h2>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 border-b">
              <tr>
                <th className="p-3 font-semibold text-center w-20">교시</th>
                <th className="p-3 font-semibold">과목명</th>
                <th className="p-3 font-semibold w-32">과목코드</th>
                <th className="p-3 font-semibold w-48">시험 시간</th>
              </tr>
            </thead>
            <tbody>
              {currentGradeSchedule.map(item => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="p-3 text-center font-bold">{item.period}</td>
                  <td className="p-3">
                    <input type="text" value={item.subject} onChange={(e) => handleScheduleChange(item.id, 'subject', e.target.value)} onBlur={saveSchedule} className="w-full border rounded p-2 outline-none focus:ring-1 focus:ring-blue-500" />
                  </td>
                  <td className="p-3">
                    <input type="text" value={item.code} onChange={(e) => handleScheduleChange(item.id, 'code', e.target.value)} onBlur={saveSchedule} className="w-full border rounded p-2 outline-none focus:ring-1 focus:ring-blue-500" />
                  </td>
                  <td className="p-3">
                    <input type="text" value={item.time} onChange={(e) => handleScheduleChange(item.id, 'time', e.target.value)} onBlur={saveSchedule} className="w-full border rounded p-2 outline-none focus:ring-1 focus:ring-blue-500" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-4 pb-2 border-b">
          <h2 className="text-lg font-bold text-slate-800">3. 학생 및 결시자 관리</h2>
          <div className="flex gap-2">
            <button onClick={handleResetClassStudents} className="bg-red-50 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-100 text-sm font-bold">원본 명단 초기화</button>
            <button onClick={handleAddStudent} className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100 text-sm font-bold"><Plus size={16} className="inline" /> 학생 추가</button>
          </div>
        </div>
        
        {students.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-lg">반 명단이 없습니다. [원본 명단 초기화]를 누르세요.</div>
        ) : (
          <div className="grid grid-cols-5 gap-3">
            {students.map(student => {
              const isEx = ['전출', '위탁'].includes(student.absenceReason);
              return (
                <div key={student.id} className={`flex flex-col p-3 border rounded-lg ${!student.isAbsent ? 'bg-slate-50' : isEx ? 'bg-slate-100' : 'bg-red-50'}`}>
                  <div className="flex items-center justify-between gap-2 mb-1 overflow-hidden">
                    <input 입력="checkbox" checked={student.isAbsent} onChange={() => toggleAbsence(student.id)} className="w-4 h-4" />
                    <span onClick={() => setEditingStudentId(student.id)} className="text-sm font-medium truncate flex-1 cursor-pointer">
                      {editingStudentId === student.id ? 
                        <input value={student.name} onChange={(e) => handleNameChange(student.id, e.target.value)} onBlur={handleNameSave} autoFocus className="w-full border-b" /> 
                        : student.name}
                    </span>
                    <button onClick={() => handleDeleteStudent(student.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                  {student.isAbsent && (
                    <select value={student.absenceReason} onChange={(e) => handleAbsenceReasonChange(student.id, e.target.value)} className="text-xs border rounded">
                      <option value="질병">질병</option><option value="인정">인정</option><option value="미인정">미인정</option><option value="기타">기타</option><option value="전출">전출</option><option value="위탁">위탁</option>
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b">4. 전달사항 관리</h2>
        <div className="flex flex-col gap-4">
          <textarea value={adminGlobalAnnInput} onChange={(e) => setAdminGlobalAnnInput(e.target.value)} className="w-full border rounded p-3 h-20" placeholder="전체 공통 전달사항" />
          <button onClick={handleApplyGlobalAnnouncement} className="bg-red-600 text-white font-bold py-2 rounded">전체 적용</button>
          <div className="flex gap-4 items-center bg-blue-50 p-3 rounded">
            {['1', '2', '3'].map(g => (
              <label key={g}><input type="checkbox" checked={targetGrades.includes(g)} onChange={() => toggleTargetGrade(g)} /> {g}학년</label>
            ))}
          </div>
          <textarea value={adminGradeAnnInput} onChange={(e) => setAdminGradeAnnInput(e.target.value)} className="w-full border rounded p-3 h-20" placeholder="학년별 전달사항" />
          <button onClick={handleApplyGradeAnnouncement} className="bg-blue-600 text-white font-bold py-2 rounded">선택 학년 적용</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 font-sans flex flex-col">
      <header className="flex items-center justify-between bg-white p-3 rounded-xl shadow-sm border border-slate-200 mb-4">
        <div className="flex items-center space-x-6">
          <span className="px-3 py-1 bg-blue-100 text-blue-800 font-bold rounded-md text-sm">정기고사</span>
          <div className="flex space-x-4 text-sm items-center bg-slate-50 px-4 py-1.5 rounded-lg border">
            학년 <select value={localConfig.grade} onChange={(e) => setLocalConfig({...localConfig, grade: e.target.value})} className="bg-transparent font-bold">
              {[1, 2, 3].map(n => <option key={n} value={n}>{n}학년</option>)}
            </select>
            반 <select value={localConfig.class} onChange={(e) => setLocalConfig({...localConfig, class: e.target.value})} className="bg-transparent font-bold">
              {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}반</option>)}
            </select>
            일자 <select value={globalConfig.day} onChange={handleGlobalConfigChange} name="day" className="bg-transparent font-bold">
              {[1, 2, 3].map(n => <option key={n} value={n}>{n}일차</option>)}
            </select>
            교시 <select value={globalConfig.period} onChange={handleGlobalConfigChange} name="period" className="bg-transparent font-bold text-blue-600">
              {[1, 2, 3].map(n => <option key={n} value={n}>{n}교시</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={() => setView('dashboard')} className={`px-4 py-2 rounded-lg ${view === 'dashboard' ? 'bg-slate-800 text-white' : 'bg-white border'}`}>대시보드</button>
          <button onClick={handleAdminClick} className={`px-4 py-2 rounded-lg ${view === 'admin' ? 'bg-slate-800 text-white' : 'bg-white border'}`}>관리자</button>
        </div>
      </header>
      {view === 'dashboard' ? renderDashboard() : renderAdmin()}
      {showAuthModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm">
            <h3 className="font-bold mb-4">관리자 인증</h3>
            <input 입력="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} className="w-full border p-3 rounded mb-2" autoFocus />
            {authError && <p className="text-red-500 text-xs mb-2">{authError}</p>}
            <button onClick={handlePasswordSubmit} className="w-full bg-slate-800 text-white py-3 rounded-lg font-bold">확인</button>
            <button onClick={() => setShowAuthModal(false)} className="w-full mt-2 text-slate-400 text-sm">취소</button>
          </div>
        </div>
      )}
    </div>
  );
}


3. DependencyNotFoundError 문제 해결법

만약 코드를 적용했는데도 Could not find dependency: 'firebase/app' 오류가 계속된다면 다음을 수행하세요:

CodeSandbox 좌측 사이드바의 Dependencies 섹션을 봅니다.

firebase 항목 옆의 X 아이콘을 눌러 삭제합니다.

다시 추가하기 Dependency를 눌러 firebase를 검색하고 설치합니다.

웹 브라우저 미리보기 창을 새로고침합니다.
