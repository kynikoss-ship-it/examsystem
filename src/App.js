고사 현황 대시보드 배포 가이드 (CodeSandbox 파일 수정 방식)

첨부하신 CodeSandbox 'React' 템플릿 환경(공개/ 및 src/ 폴더 구조)에 맞춘 직관적인 파일 설정 가이드입니다.

1. 패키지(Dependencies) 설치

좌측 탐색 창 하단의 Dependencies 입력란에 아래 2가지 패키지를 검색하여 클릭(추가)합니다.

firebase

lucide-react
(※ Tailwind CSS는 충돌 방지를 위해 아래 index.html 단계에서 CDN 방식으로 처리합니다.)

2. 파일별 코드 수정 내역

기존 생성되어 있는 파일들의 내용을 모두 지우고, 아래 제공된 코드로 덮어씁니다.

① 공개/index.html

Tailwind CSS 스크립트를 추가하여 스타일이 정상적으로 렌더링되도록 합니다.

<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
  <title>고사 현황 대시보드</title>
  <!-- Tailwind CSS CDN (CodeSandbox 환경 빌드 오류 방지용) -->
  <script src="[https://cdn.tailwindcss.com](https://cdn.tailwindcss.com)"></script>
</head>
<body>
  <noscript>이 앱을 실행하려면 JavaScript를 활성화해야 합니다.</noscript>
  <div id="root"></div>
</body>
</html>


② src/index.js

React 애플리케이션을 HTML의 root 요소에 연결하는 진입점 파일입니다. (기본값과 동일하나 확인용으로 덮어씁니다.)

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);


③ src/styles.css

Tailwind를 CDN으로 처리했으므로 복잡한 설정 없이 기본 여백 초기화만 남깁니다.

body {
  margin: 0;
  font-family: sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}


④ src/App.js (또는 App.jsx)

가장 핵심이 되는 메인 화면 코드입니다. 질문자님께서 제공해주신 Firebase Config를 반영하여 중복 선언 문제를 해결한 버전입니다. 파일 전체를 아래 코드로 덮어쓰기 하십시오.

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
        if (data.gradeData) setGradeData(data.gradeData);
        if (data.globalAnnouncement !== undefined) setGlobalAnnouncement(data.globalAnnouncement);
        if (data.studentDirectory) setStudentDirectory(data.studentDirectory);
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

  const currentGradeSchedule = gradeData[localConfig.grade]?.schedules[globalConfig.day] || [];
  const currentAnnouncement = gradeData[localConfig.grade]?.announcement || '';

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
              <사용자 size={16} /> 결시자 명단
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
        <h2 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b">1. 학생 명렬표 CSV 업로드 (전교 원본 데이터 교체)</h2>
        <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
          <input 
            입력="file" 
            accept=".csv"
            onChange={handleFileUpload}
            className="text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {uploadStatus && (
            <span className={`text-sm font-bold ${uploadStatus.includes('오류') || uploadStatus.includes('없습니다') ? 'text-red-500' : 'text-green-600'}`}>
              {uploadStatus}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          * 제공하신 양식(학년,반,번호,성명)의 CSV 파일을 엑셀에서 저장 후 업로드하세요. (인코딩: EUC-KR 기본 적용)
        </p>
      </div>

      <div>
        <h2 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b">
          2. 학년별 시간표 관리 <span className="text-sm font-normal text-blue-600 ml-2">({localConfig.grade}학년 {globalConfig.day}일차 기준)</span>
        </h2>
        <p className="text-sm text-slate-500 mb-4">현재 선택된 학년과 일차의 시간표를 수정합니다. 상단 뷰 설정에서 학년/일차를 변경하여 다른 시간표를 제어할 수 있습니다.</p>
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
                    <input 
                      type="text" 
                      value={item.subject} 
                      onChange={(e) => handleScheduleChange(item.id, 'subject', e.target.value)}
                      onBlur={saveSchedule}
                      className="w-full border rounded p-2 outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="p-3">
                    <input 
                      type="text" 
                      value={item.code} 
                      onChange={(e) => handleScheduleChange(item.id, 'code', e.target.value)}
                      onBlur={saveSchedule}
                      className="w-full border rounded p-2 outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="p-3">
                    <input 
                      type="text" 
                      value={item.time} 
                      onChange={(e) => handleScheduleChange(item.id, 'time', e.target.value)}
                      onBlur={saveSchedule}
                      className="w-full border rounded p-2 outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-4 pb-2 border-b">
          <h2 className="text-lg font-bold text-slate-800">
            3. 학생 및 결시자 관리 <span className="text-sm font-normal text-blue-600 ml-2">({localConfig.grade}학년 {localConfig.class}반 기준)</span>
          </h2>
          <div className="flex gap-2">
            <button
              onClick={handleResetClassStudents}
              className="flex items-center gap-1 bg-red-50 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors text-sm font-bold"
            >
              원본 명단으로 초기화
            </button>
            <button
              onClick={handleAddStudent}
              className="flex items-center gap-1 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors text-sm font-bold"
            >
              <Plus size={16} /> 학생 추가
            </button>
          </div>
        </div>
        <p className="text-sm text-slate-500 mb-4">해당 학급 학생의 결시 여부를 체크하고 사유를 선택하세요. 상단의 [원본 명단으로 초기화] 버튼을 누르면 업로드한 CSV 데이터를 기반으로 현재 반의 명단이 리셋됩니다.</p>
        
        {students.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-lg">
            <p className="text-slate-500 font-medium">현재 반에 등록된 학생이 없습니다.</p>
            <p className="text-sm text-slate-400 mt-1">상단의 [원본 명단으로 초기화] 버튼을 눌러 명단을 불러오세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-3">
            {students.map(student => {
              const isExcluded = ['전출', '위탁'].includes(student.absenceReason);
              return (
                <div 
                  key={student.id} 
                  className={`flex flex-col p-3 border rounded-lg transition-colors
                    ${!student.isAbsent 
                      ? 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                      : isExcluded
                        ? 'bg-slate-100 border-slate-300'
                        : 'bg-red-50 border-red-300'
                    }
                  `}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 flex-1 overflow-hidden">
                      <input 
                        입력="checkbox" 
                        id={`absent-${student.id}`}
                        checked={student.isAbsent}
                        onChange={() => toggleAbsence(student.id)}
                        className="w-4 h-4 text-red-600 rounded border-slate-300 focus:ring-red-500 cursor-pointer shrink-0"
                      />
                      <div className="flex items-center gap-1 flex-1 overflow-hidden">
                        <label htmlFor={`absent-${student.id}`} className="text-xs text-slate-500 cursor-pointer shrink-0">
                          {student.id}번
                        </label>
                        
                        {/* 이름 수정 영역 */}
                        {editingStudentId === student.id ? (
                          <input
                            입력="text"
                            value={student.name}
                            onChange={(e) => handleNameChange(student.id, e.target.value)}
                            onBlur={handleNameSave}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleNameSave();
                            }}
                            autoFocus
                            className="w-full text-sm font-medium border-b border-blue-500 outline-none bg-transparent px-1 text-slate-800"
                          />
                        ) : (
                          <span 
                            onClick={(e) => {
                              e.preventDefault();
                              setEditingStudentId(student.id);
                            }}
                            className={`font-medium text-sm px-1 rounded cursor-text hover:bg-slate-200 transition-colors truncate w-full
                              ${student.isAbsent ? (isExcluded ? 'text-slate-500' : 'text-red-700') : 'text-slate-800'}
                            `}
                            title="클릭하여 이름 수정"
                          >
                            {student.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteStudent(student.id)}
                      className="text-slate-400 hover:text-red-500 p-1 shrink-0 transition-colors"
                      title="명단에서 삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  
                  {student.isAbsent && (
                    <select
                      value={student.absenceReason}
                      onChange={(e) => handleAbsenceReasonChange(student.id, e.target.value)}
                      className="mt-1 block w-full px-2 py-1 text-xs border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md bg-white border text-slate-700"
                    >
                      <option value="질병">질병</option>
                      <option value="인정">인정</option>
                      <option value="미인정">미인정</option>
                      <option value="기타">기타</option>
                      <option value="전출">전출</option>
                      <option value="위탁">위탁</option>
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
        <div className="flex flex-col gap-6">
          
          {/* 전체 전달사항 */}
          <div className="bg-red-50 p-4 rounded-lg border border-red-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-red-700">전체 공통 전달사항</span>
            </div>
            <div className="flex gap-2">
              <textarea 
                value={adminGlobalAnnInput}
                onChange={(e) => setAdminGlobalAnnInput(e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-red-500 min-h-[80px] resize-none text-slate-700"
                placeholder="전교에 송출할 공통 전달사항을 입력하세요."
              />
              <button 
                onClick={handleApplyGlobalAnnouncement}
                disabled={!adminGlobalAnnInput.trim()}
                className="bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-bold px-6 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors"
              >
                <보내기 size={20} />
                <span>전체 적용</span>
              </button>
            </div>
            {globalAnnouncement && (
              <div className="mt-3 bg-white border border-slate-200 rounded p-3">
                <span className="text-xs font-bold text-red-500 block mb-1">현재 송출 중인 전체 내용</span>
                <p className="text-sm text-slate-600 whitespace-pre-wrap break-keep">{globalAnnouncement}</p>
              </div>
            )}
          </div>

          {/* 학년별 전달사항 */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
            <div className="flex items-center gap-4 mb-3">
              <span className="text-sm font-bold text-blue-700">학년별 전달사항</span>
              <div className="flex items-center gap-3">
                {['1', '2', '3'].map(g => (
                  <label key={`target-${g}`} className="flex items-center gap-1 cursor-pointer">
                    <input 
                      입력="checkbox" 
                      checked={targetGrades.includes(g)}
                      onChange={() => toggleTargetGrade(g)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700">{g}학년</span>
                  </label>
                ))}
              </div>
            </div>
            
            <div className="flex gap-2">
              <textarea 
                value={adminGradeAnnInput}
                onChange={(e) => setAdminGradeAnnInput(e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-none text-slate-700"
                placeholder="선택한 학년에 송출할 전달사항을 입력하세요."
              />
              <button 
                onClick={handleApplyGradeAnnouncement}
                disabled={targetGrades.length === 0 || !adminGradeAnnInput.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold px-6 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors"
              >
                <보내기 size={20} />
                <span>선택 적용</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-3">
              {['1', '2', '3'].map(g => (
                <div key={`current-${g}`} className="bg-white border border-slate-200 rounded p-3">
                  <span className="text-xs font-bold text-blue-500 block mb-1">{g}학년 현재 내용</span>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap break-keep">
                    {gradeData[g]?.announcement || '등록된 내용 없음'}
                  </p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 font-sans flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between bg-white p-3 rounded-xl shadow-sm border border-slate-200 mb-4">
        <div className="flex items-center space-x-6">
          <div className="flex space-x-2">
            <span className="px-3 py-1 bg-blue-100 text-blue-800 font-bold rounded-md text-sm border border-blue-200 shadow-sm">
              정기고사
            </span>
            {/* Sync Status Indicator */}
            {user ? (
              <span className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-md border border-green-200">
                <Cloud size={14} /> {isSyncing ? '동기화 중...' : '연결됨'}
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-500 text-xs font-bold rounded-md border border-slate-200">
                <CloudOff size={14} /> 연결 대기
              </span>
            )}
          </div>
          
          <div className="flex space-x-4 text-sm items-center bg-slate-50 px-4 py-1.5 rounded-lg border border-slate-200">
            {/* 학년 Select (Local) */}
            <div className="flex items-center space-x-2">
              <span className="text-slate-500 font-medium">학년</span>
              <select 
                name="grade" 
                value={localConfig.grade} 
                onChange={handleLocalConfigChange}
                className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
              >
                {[1, 2, 3].map(n => <option key={n} value={n}>{n}학년</option>)}
              </select>
            </div>
            <div className="w-px h-4 bg-slate-300"></div>
            
            {/* 반 Select (Local) */}
            <div className="flex items-center space-x-2">
              <span className="text-slate-500 font-medium">반</span>
              <select 
                name="class" 
                value={localConfig.class} 
                onChange={handleLocalConfigChange}
                className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
              >
                {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}반</option>)}
              </select>
            </div>
            <div className="w-px h-4 bg-slate-300"></div>

            {/* 일차 Select (Global) */}
            <div className="flex items-center space-x-2">
              <span className="text-slate-500 font-medium">일자</span>
              <select 
                name="day" 
                value={globalConfig.day} 
                onChange={handleGlobalConfigChange}
                className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
              >
                {[1, 2, 3].map(n => <option key={n} value={n}>{n}일차</option>)}
              </select>
            </div>
            <div className="w-px h-4 bg-slate-300"></div>

            {/* 교시 Select (Global) */}
            <div className="flex items-center space-x-2">
              <span className="text-slate-500 font-medium">교시</span>
              <select 
                name="period" 
                value={globalConfig.period} 
                onChange={handleGlobalConfigChange}
                className="bg-transparent font-bold text-blue-600 outline-none cursor-pointer"
              >
                {[1, 2, 3].map(n => <option key={n} value={n}>{n}교시</option>)}
              </select>
            </div>
          </div>

        </div>

        <div className="flex items-center space-x-2 text-sm font-medium">
          <button 
            onClick={() => setView('dashboard')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${view === 'dashboard' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
          >
            <MonitorPlay size={16} /> 대시보드
          </button>
          <button 
            onClick={handleAdminClick}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${view === 'admin' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
          >
            <설정 size={16} /> 관리자
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      {view === 'dashboard' ? renderDashboard() : renderAdmin()}

      {/* Password Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Lock size={18} className="text-slate-500" />
                관리자 인증
              </h3>
              <button onClick={() => {setShowAuthModal(false); setAuthError(''); setPasswordInput('');}} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handlePasswordSubmit} className="p-6">
              <p className="text-sm text-slate-600 mb-4">관리자 페이지에 접근하려면 비밀번호를 입력하세요.</p>
              <input
                입력="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="비밀번호"
                className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500 mb-2 text-slate-800"
                autoFocus
              />
              {authError && <p className="text-xs text-red-500 mb-4">{authError}</p>}
              <button
                입력="submit"
                className="w-full bg-slate-800 text-white font-bold py-3 rounded-lg hover:bg-slate-700 transition-colors mt-2"
              >
                확인
              </button>
            </form>
          </div>
        </div>
      )}
      
    </div>
  );
}
