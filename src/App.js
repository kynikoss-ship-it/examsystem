import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Users, AlertCircle, Trash2, Cloud, X, Image as ImageIcon, Maximize2 } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection } from 'firebase/firestore';

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
  { id: 1, period: 1, subject: '국어', code: '02', time: '09:00 - 09:45' },
  { id: 2, period: 2, subject: '과학', code: '05', time: '10:05 - 10:50' },
  { id: 3, period: 3, subject: '역사', code: '04', time: '11:10 - 11:55' },
];

// 과목명 → 과목코드 자동 매핑 테이블 (시험 미실시 과목인 음악·미술·체육 제외, '교과' 추가)
const SUBJECT_CODE_MAP = {
  '교과': '',
  '도덕': '01', '국어': '02', '사회': '03', '역사': '04',
  '과학': '05', '기술가정': '09', '정보': '10',
  '수학': '11', '영어': '22', '한문': '33',
};

// 날짜 포맷: ISO date 문자열(YYYY-MM-DD) → "MM/DD (요일)" 또는 fallback
const DAYS_KR = ['일','월','화','수','목','금','토'];
const formatDateBadge = (isoDate, dayNum) => {
  if (!isoDate) return `${dayNum}일차`;
  const d = new Date(isoDate + 'T00:00:00');
  if (isNaN(d.getTime())) return `${dayNum}일차`;
  return `${d.getMonth() + 1}/${d.getDate()} (${DAYS_KR[d.getDay()]})`;
};

// 이미지 압축 (Firestore 1MB 제한 대응)
const compressImage = (file, maxWidth = 1024, quality = 0.75) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

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
  const [globalConfig, setGlobalConfig] = useState({ day: '1', dates: { '1': '', '2': '', '3': '' } });
  const [globalAnnouncement, setGlobalAnnouncement] = useState('');
  const [studentDirectory, setStudentDirectory] = useState({});
  const [uploadStatus, setUploadStatus] = useState('');

  const [gradeData, setGradeData] = useState(makeDefaultGradeData);
  const [targetGrades, setTargetGrades] = useState(['1', '2', '3']);
  const [adminGlobalAnnInput, setAdminGlobalAnnInput] = useState('');
  const [adminGradeAnnInput, setAdminGradeAnnInput] = useState('');
  const [adminGradeAnnImage, setAdminGradeAnnImage] = useState('');
  const [imageUploadStatus, setImageUploadStatus] = useState('');
  const [imageModalUrl, setImageModalUrl] = useState(null);
  const [expandedAnnouncement, setExpandedAnnouncement] = useState(null);
  const [announcementImages, setAnnouncementImages] = useState({});
  const [allClassesData, setAllClassesData] = useState({});
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
        if (data.globalConfig) {
          setGlobalConfig(prev => ({
            ...prev,
            ...data.globalConfig,
            dates: { ...(prev.dates || {}), ...(data.globalConfig.dates || {}) },
          }));
        }
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

    // 학년별 공지 이미지는 별도 문서로 분리 (1MB 한도 회피)
    const imagesRef = doc(db, 'artifacts', appId, 'public', 'data', 'examData', 'announcement_images');
    const unsubImages = onSnapshot(imagesRef, (docSnap) => {
      setAnnouncementImages(docSnap.exists() ? (docSnap.data() || {}) : {});
    });

    return () => { unsubGlobal(); unsubClass(); unsubImages(); };
  }, [user, localConfig.grade, localConfig.class]);

  // 관리자 인증 시에만 모든 학반의 결시 데이터를 구독 (개인정보 최소화)
  useEffect(() => {
    if (!user || !db || !isAuthenticated) {
      setAllClassesData({});
      return;
    }
    const examCollection = collection(db, 'artifacts', appId, 'public', 'data', 'examData');
    const unsubAll = onSnapshot(examCollection, (snapshot) => {
      const data = {};
      snapshot.forEach(docSnap => {
        // 'class_{grade}_{class}' 형식 문서만 필터링
        if (docSnap.id.startsWith('class_')) {
          const parts = docSnap.id.split('_');
          if (parts.length === 3) {
            data[`${parts[1]}-${parts[2]}`] = docSnap.data().students || [];
          }
        }
      });
      setAllClassesData(data);
    });
    return () => unsubAll();
  }, [user, isAuthenticated]);

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

  // 현재 학년 기준, 다른 날짜에 이미 등록된 과목명 집합 ('교과'는 중복 허용이므로 제외)
  const usedInOtherDays = useMemo(() => {
    const grade = localConfig.grade;
    const currentDay = globalConfig.day;
    const schedules = gradeData[grade]?.schedules || {};
    const used = new Set();
    Object.entries(schedules).forEach(([day, items]) => {
      if (day === currentDay) return;
      (items || []).forEach(item => {
        if (item.subject && item.subject !== '교과') used.add(item.subject);
      });
    });
    return used;
  }, [gradeData, localConfig.grade, globalConfig.day]);

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

  // select onChange는 onBlur가 동작하지 않아 즉시 저장 필요. ref도 동시 갱신해서 race 방지.
  const handleScheduleChange = (id, field, value) => {
    const grade = localConfig.grade;
    const day = globalConfig.day;
    const newData = JSON.parse(JSON.stringify(gradeDataRef.current));
    if (!newData[grade]) newData[grade] = { announcement: '', schedules: {} };
    if (!newData[grade].schedules[day]) {
      newData[grade].schedules[day] = DEFAULT_SCHEDULE_DAY.map(s => ({ ...s }));
    }
    newData[grade].schedules[day] = newData[grade].schedules[day].map(s => {
      if (s.id !== id) return s;
      const updated = { ...s, [field]: value };
      // 과목명 변경 시 매핑 테이블의 키와 일치하면 코드 자동 채움 ('교과'는 빈 문자열로 매핑됨)
      if (field === 'subject') {
        const trimmed = value.trim();
        if (Object.prototype.hasOwnProperty.call(SUBJECT_CODE_MAP, trimmed)) {
          updated.code = SUBJECT_CODE_MAP[trimmed];
        }
      }
      return updated;
    });
    gradeDataRef.current = newData;
    setGradeData(newData);
  };

  // ref 사용으로 항상 최신 state를 Firestore에 저장 (race condition 방지)
  const saveSchedule = () => updateGlobalDoc({ gradeData: gradeDataRef.current });

  const handleApplyGlobalAnnouncement = async () => {
    await updateGlobalDoc({ globalAnnouncement: adminGlobalAnnInput });
    setAdminGlobalAnnInput('');
  };

  const handleDeleteGlobalAnnouncement = async () => {
    if (!window.confirm('전체 공통 공지를 삭제하시겠습니까?')) return;
    await updateGlobalDoc({ globalAnnouncement: '' });
  };

  const handleDeleteGradeAnnouncement = async (grade) => {
    if (!window.confirm(`${grade}학년 공지(텍스트·이미지)를 삭제하시겠습니까?`)) return;
    try {
      const newData = JSON.parse(JSON.stringify(gradeDataRef.current));
      if (!newData[grade]) newData[grade] = { announcement: '', schedules: {} };
      newData[grade].announcement = '';
      await updateGlobalDoc({ gradeData: newData });
      const imagesRef = doc(db, 'artifacts', appId, 'public', 'data', 'examData', 'announcement_images');
      await setDoc(imagesRef, { [grade]: '' }, { merge: true });
    } catch (err) {
      console.error('공지 삭제 실패:', err);
      alert(`삭제 실패: ${err.message || '알 수 없는 오류'}`);
    }
  };

  const handleDateChange = (day, value) => {
    const newDates = { ...(globalConfig.dates || {}), [day]: value };
    const newConfig = { ...globalConfig, dates: newDates };
    setGlobalConfig(newConfig);
    updateGlobalDoc({ globalConfig: newConfig });
  };

  const handleApplyGradeAnnouncement = async () => {
    try {
      // 1) 텍스트 공지는 gradeData 문서에 저장
      const newData = JSON.parse(JSON.stringify(gradeDataRef.current));
      targetGrades.forEach(g => {
        if (!newData[g]) newData[g] = { announcement: '', schedules: {} };
        newData[g].announcement = adminGradeAnnInput;
      });
      await updateGlobalDoc({ gradeData: newData });

      // 2) 이미지는 별도 문서(announcement_images)에 학년별 키로 저장
      const imagesRef = doc(db, 'artifacts', appId, 'public', 'data', 'examData', 'announcement_images');
      const imageUpdates = {};
      targetGrades.forEach(g => { imageUpdates[g] = adminGradeAnnImage || ''; });
      await setDoc(imagesRef, imageUpdates, { merge: true });

      setAdminGradeAnnInput('');
      setAdminGradeAnnImage('');
      setImageUploadStatus('송출 완료');
      setTimeout(() => setImageUploadStatus(''), 2000);
    } catch (err) {
      console.error('학년 공지 송출 실패:', err);
      setImageUploadStatus(`송출 실패: ${err.message || '알 수 없는 오류'}`);
    }
  };

  const handleAnnouncementImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setImageUploadStatus('이미지 파일만 가능합니다.');
      return;
    }
    try {
      setImageUploadStatus('압축 중...');
      const compressed = await compressImage(file);
      // dataURL 자체의 길이가 Firestore에 저장될 실제 크기 (ASCII string)
      const sizeKB = Math.round(compressed.length / 1024);
      if (sizeKB > 700) {
        setImageUploadStatus(`크기가 너무 큽니다 (${sizeKB}KB). 더 작은 이미지를 사용해주세요.`);
        return;
      }
      setAdminGradeAnnImage(compressed);
      setImageUploadStatus(`첨부 완료 (${sizeKB}KB)`);
    } catch (err) {
      setImageUploadStatus('이미지 처리 실패');
    }
    e.target.value = ''; // 같은 파일 재선택 가능하도록 초기화
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
      <div className="col-span-10 flex flex-col gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-12 bg-slate-50 text-slate-500 font-bold text-sm border-b border-slate-200 p-3 text-center">
            <div className="col-span-2">교시</div>
            <div className="col-span-6">과목 (코드)</div>
            <div className="col-span-4">시험 시간</div>
          </div>
          {currentGradeSchedule.map((item) => (
            <div key={item.id} className="grid grid-cols-12 items-center border-b border-slate-100 last:border-0 p-6">
              <div className="col-span-2 text-center text-3xl font-black text-slate-400">{item.period}</div>
              <div className="col-span-6 text-center">
                <span className="text-3xl font-bold text-slate-800">{item.subject}</span>
                <span className="text-slate-400 text-xl ml-2 font-medium">({item.code})</span>
              </div>
              <div className="col-span-4 text-center text-4xl font-black tracking-tighter text-slate-700">{item.time}</div>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 flex-1 flex flex-col gap-8">
          <h3 className="font-bold text-slate-400 text-sm flex items-center gap-2 uppercase tracking-widest"><AlertCircle size={20}/> 본부 공지사항</h3>
          <div className="flex flex-col gap-6 flex-1 justify-center">
            {globalAnnouncement && (
              <div className="p-6 bg-red-50 border-l-8 border-red-500 rounded-r-2xl shadow-sm">
                <span className="text-red-600 text-xs font-black mb-3 block tracking-widest uppercase">전체 공통 공지</span>
                <p className="text-3xl font-black text-slate-800 leading-tight break-keep whitespace-pre-wrap">{globalAnnouncement}</p>
              </div>
            )}
            {(currentAnnouncement || announcementImages[localConfig.grade]) && (
              <div className="p-6 bg-blue-50 border-l-8 border-blue-500 rounded-r-2xl shadow-sm relative">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-blue-600 text-xs font-black tracking-widest uppercase">{localConfig.grade}학년 공지</span>
                  <button
                    onClick={() => setExpandedAnnouncement({
                      grade: localConfig.grade,
                      announcement: currentAnnouncement,
                      image: announcementImages[localConfig.grade] || ''
                    })}
                    className="bg-white/70 hover:bg-white text-blue-600 px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-colors shadow-sm ring-1 ring-blue-100"
                  >
                    <Maximize2 size={12} /> 크게 보기
                  </button>
                </div>
                {currentAnnouncement && (
                  <p className="text-3xl font-black text-slate-800 leading-tight break-keep whitespace-pre-wrap mb-4">{currentAnnouncement}</p>
                )}
                {announcementImages[localConfig.grade] && (
                  <img
                    src={announcementImages[localConfig.grade]}
                    alt="공지 이미지"
                    onClick={() => setImageModalUrl(announcementImages[localConfig.grade])}
                    className="max-h-64 rounded-xl cursor-zoom-in shadow-md hover:opacity-90 transition-opacity ring-1 ring-slate-200"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="col-span-2 flex flex-col gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex gap-2 text-center shadow-sm">
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
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex-1 overflow-y-auto shadow-sm">
          <h3 className="font-bold text-slate-400 mb-6 flex items-center gap-2 tracking-widest uppercase text-xs"><Users size={18}/> 결시자 명단</h3>
          <div className="flex flex-col gap-3">
            {students.filter(s => s.isAbsent).map(s => (
              <div key={s.id} className="p-3 border border-slate-100 rounded-xl flex flex-col gap-2 bg-slate-50/50 shadow-sm">
                <span className="text-base font-bold text-slate-700">
                  <span className="text-slate-400 mr-2 font-medium">{s.id}</span>{s.name}
                </span>
                <span className="self-start px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-black ring-1 ring-red-200">{s.absenceReason}</span>
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
        <div className="flex items-center justify-between mb-5 border-b border-slate-100 pb-4">
          <h2 className="font-black text-xl tracking-tight">2. 시험 시간표 설정</h2>
          <span className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-black ring-1 ring-blue-100">
            편집 중 · {localConfig.grade}학년 {formatDateBadge(globalConfig.dates?.[globalConfig.day], globalConfig.day)}
          </span>
        </div>

        <div className="bg-slate-50 rounded-2xl p-5 mb-5 border border-slate-200">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">시험 일정</h3>
          <div className="grid grid-cols-3 gap-3">
            {['1','2','3'].map(d => (
              <div key={d} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                <span className="font-black text-slate-500 text-sm whitespace-nowrap">{d}일차</span>
                <input
                  type="date"
                  value={globalConfig.dates?.[d] || ''}
                  onChange={(e) => handleDateChange(d, e.target.value)}
                  className="flex-1 bg-transparent text-slate-800 font-bold outline-none text-sm"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 mb-5 flex-wrap">
          <div className="flex bg-slate-100 rounded-xl p-1">
            {['1','2','3'].map(g => (
              <button
                key={g}
                onClick={() => setLocalConfig({ ...localConfig, grade: g })}
                className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${localConfig.grade === g ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {g}학년
              </button>
            ))}
          </div>
          <div className="flex bg-slate-100 rounded-xl p-1">
            {['1','2','3'].map(d => (
              <button
                key={d}
                onClick={() => {
                  const newConfig = { ...globalConfig, day: d };
                  setGlobalConfig(newConfig);
                  updateGlobalDoc({ globalConfig: newConfig });
                }}
                className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${globalConfig.day === d ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {formatDateBadge(globalConfig.dates?.[d], d)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-3 px-4 mb-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
          <div className="col-span-1 text-center">교시</div>
          <div className="col-span-5">과목명</div>
          <div className="col-span-2 text-center">코드</div>
          <div className="col-span-2 text-center">시작 시간</div>
          <div className="col-span-2 text-center">종료 시간</div>
        </div>

        <div className="flex flex-col gap-2">
          {currentGradeSchedule.map(item => {
            const parts = (item.time || '').split(' - ');
            const startTime = (parts[0] || '').trim();
            const endTime = (parts[1] || '').trim();
            // 매핑표에 없는 과거 데이터(예: 음악/미술/체육)를 보존하기 위한 플래그
            const isLegacyValue = item.subject && !Object.prototype.hasOwnProperty.call(SUBJECT_CODE_MAP, item.subject);
            return (
              <div key={item.id} className="grid grid-cols-12 gap-3 items-center bg-white p-3 rounded-xl border border-slate-200 hover:border-blue-300 transition-colors shadow-sm">
                <div className="col-span-1 flex justify-center">
                  <span className="w-10 h-10 flex items-center justify-center bg-blue-50 text-blue-600 rounded-lg font-black text-lg">{item.period}</span>
                </div>
                <select
                  value={item.subject || ''}
                  onChange={(e) => {
                    handleScheduleChange(item.id, 'subject', e.target.value);
                    saveSchedule();
                  }}
                  className="col-span-5 bg-slate-50 border-2 border-transparent p-3 rounded-lg text-slate-800 font-bold outline-none focus:bg-white focus:border-blue-400 transition-colors cursor-pointer"
                >
                  <option value="">— 과목 선택 —</option>
                  {isLegacyValue && (
                    <option value={item.subject}>{item.subject} (구 데이터)</option>
                  )}
                  {Object.keys(SUBJECT_CODE_MAP).map(name => {
                    // 현재 선택값은 disabled 처리하지 않음 (자기 자신은 항상 표시되어야 함)
                    const isUsedElsewhere = usedInOtherDays.has(name) && name !== item.subject;
                    return (
                      <option key={name} value={name} disabled={isUsedElsewhere}>
                        {name}
                        {SUBJECT_CODE_MAP[name] ? ` (${SUBJECT_CODE_MAP[name]})` : ''}
                        {isUsedElsewhere ? ' · 다른 날짜 사용 중' : ''}
                      </option>
                    );
                  })}
                </select>
                <input
                  type="text"
                  value={item.code}
                  onChange={(e) => handleScheduleChange(item.id, 'code', e.target.value)}
                  onBlur={saveSchedule}
                  placeholder="—"
                  className="col-span-2 bg-slate-50 border-2 border-transparent p-3 rounded-lg text-center text-slate-800 font-bold outline-none focus:bg-white focus:border-blue-400 transition-colors"
                />
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => handleScheduleChange(item.id, 'time', `${e.target.value} - ${endTime}`)}
                  onBlur={saveSchedule}
                  className="col-span-2 bg-slate-50 border-2 border-transparent p-3 rounded-lg text-center text-slate-800 font-bold outline-none focus:bg-white focus:border-blue-400 transition-colors"
                />
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => handleScheduleChange(item.id, 'time', `${startTime} - ${e.target.value}`)}
                  onBlur={saveSchedule}
                  className="col-span-2 bg-slate-50 border-2 border-transparent p-3 rounded-lg text-center text-slate-800 font-bold outline-none focus:bg-white focus:border-blue-400 transition-colors"
                />
              </div>
            );
          })}
        </div>

        <p className="mt-3 text-xs text-slate-400 leading-relaxed">
          💡 과목 선택 시 코드가 자동 매핑됩니다 · 다른 날짜에 등록된 과목은 비활성화 표시되며 '교과'만 중복 선택이 가능합니다.<br/>
          <span className="text-slate-500">교과(—) · 도덕(01) · 국어(02) · 사회(03) · 역사(04) · 과학(05) · 기술가정(09) · 정보(10) · 수학(11) · 영어(22) · 한문(33)</span>
        </p>
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

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">현재 게시 중인 공지</h3>
          {(() => {
            const hasGlobal = !!globalAnnouncement;
            const activeGrades = ['1','2','3'].filter(g => (gradeData[g]?.announcement) || announcementImages[g]);
            if (!hasGlobal && activeGrades.length === 0) {
              return <p className="text-sm text-slate-400 text-center py-6">현재 게시된 공지가 없습니다.</p>;
            }
            return (
              <div className="flex flex-col gap-2">
                {hasGlobal && (
                  <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl border border-red-200">
                    <span className="px-2 py-1 bg-red-500 text-white text-[10px] font-black rounded-full whitespace-nowrap mt-0.5">전체 공통</span>
                    <p className="flex-1 text-sm font-bold text-slate-700 whitespace-pre-wrap break-keep">{globalAnnouncement}</p>
                    <button
                      onClick={handleDeleteGlobalAnnouncement}
                      className="text-red-500 hover:bg-red-100 p-1.5 rounded-md flex-shrink-0 transition-colors"
                      title="공지 삭제"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
                {activeGrades.map(g => {
                  const ann = gradeData[g]?.announcement;
                  const img = announcementImages[g];
                  return (
                    <div key={g} className="flex items-start gap-3 p-3 bg-blue-50 rounded-xl border border-blue-200">
                      <span className="px-2 py-1 bg-blue-500 text-white text-[10px] font-black rounded-full whitespace-nowrap mt-0.5">{g}학년</span>
                      <div className="flex-1 flex items-start gap-3 min-w-0">
                        {ann && <p className="flex-1 text-sm font-bold text-slate-700 whitespace-pre-wrap break-keep min-w-0">{ann}</p>}
                        {img && (
                          <img
                            src={img}
                            alt=""
                            onClick={() => setImageModalUrl(img)}
                            className="w-16 h-16 object-cover rounded-md ring-1 ring-slate-200 cursor-zoom-in flex-shrink-0"
                          />
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteGradeAnnouncement(g)}
                        className="text-red-500 hover:bg-red-100 p-1.5 rounded-md flex-shrink-0 transition-colors"
                        title="공지 삭제"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

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

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-4">
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2 text-xs font-black text-slate-500 uppercase tracking-widest">
                  <ImageIcon size={14} /> 이미지 첨부 (선택)
                </label>
                {adminGradeAnnImage && (
                  <button
                    onClick={() => { setAdminGradeAnnImage(''); setImageUploadStatus(''); }}
                    className="text-red-500 hover:text-red-700 text-xs font-black"
                  >
                    × 제거
                  </button>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleAnnouncementImageUpload}
                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {imageUploadStatus && <p className="mt-3 text-blue-600 font-black text-xs">{imageUploadStatus}</p>}
              {adminGradeAnnImage && (
                <div className="mt-3">
                  <img src={adminGradeAnnImage} alt="미리보기" className="max-h-40 rounded-lg shadow-sm ring-1 ring-slate-200" />
                </div>
              )}
            </div>

            <button onClick={handleApplyGradeAnnouncement} className="w-full bg-blue-600 text-white font-black py-4 rounded-xl shadow-lg active:scale-[0.98] transition-all">선택 학년 송출</button>
          </div>
        </div>
      </section>
      <section className="pb-12">
        <h2 className="font-black border-b border-slate-100 pb-4 mb-6 text-xl tracking-tight">5. 전체 학반 결시생 현황</h2>
        <div className="grid grid-cols-3 gap-5">
          {['1','2','3'].map(grade => {
            const gradeTotal = [1,2,3,4,5,6].reduce((sum, cls) => {
              const list = allClassesData[`${grade}-${cls}`] || [];
              return sum + list.filter(s => s.isAbsent && !['전출','위탁'].includes(s.absenceReason)).length;
            }, 0);
            return (
              <div key={grade} className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
                <div className="flex justify-between items-baseline mb-4 pb-3 border-b border-slate-200">
                  <h3 className="font-black text-lg text-slate-800">{grade}학년</h3>
                  <span className={`text-sm font-black px-3 py-1 rounded-full ${gradeTotal > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-400'}`}>
                    {gradeTotal}명 결시
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {[1,2,3,4,5,6].map(cls => {
                    const key = `${grade}-${cls}`;
                    const list = allClassesData[key] || [];
                    const absent = list.filter(s => s.isAbsent && !['전출','위탁'].includes(s.absenceReason));
                    return (
                      <div key={cls} className={`p-3 rounded-xl border transition-colors ${absent.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'}`}>
                        <div className="flex justify-between items-center">
                          <span className="font-black text-slate-700 text-sm">{cls}반</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${absent.length > 0 ? 'bg-red-200 text-red-700' : 'bg-slate-100 text-slate-400'}`}>
                            {absent.length}명
                          </span>
                        </div>
                        {absent.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {absent.map(s => (
                              <span key={s.id} className="text-xs bg-white px-2 py-1 rounded-md text-slate-700 ring-1 ring-red-200 font-bold">
                                {s.name} <span className="text-red-500 font-black">· {s.absenceReason}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-slate-400">전출·위탁은 결시 집계에서 제외됩니다.</p>
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
              <span className="text-slate-400">날짜</span>
              <select value={globalConfig.day} name="day" onChange={handleGlobalConfigChange} className="bg-transparent text-blue-600 border-b-2 border-blue-600 outline-none font-black cursor-pointer">
                {[1, 2, 3].map(n => (
                  <option key={n} value={n}>
                    {formatDateBadge(globalConfig.dates?.[n], n)}
                  </option>
                ))}
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
      {expandedAnnouncement && (
        <div onClick={() => setExpandedAnnouncement(null)} className="fixed inset-0 bg-white z-50 cursor-pointer overflow-auto">
          <div className="min-h-full flex flex-col items-center justify-center p-12">
            <div className="text-blue-600 text-base font-black uppercase tracking-[0.3em] mb-10 px-4 py-2 bg-blue-50 rounded-full ring-1 ring-blue-100">
              {expandedAnnouncement.grade}학년 공지
            </div>
            {expandedAnnouncement.announcement && (
              <p className="text-7xl font-black leading-tight whitespace-pre-wrap break-keep text-center text-slate-800 mb-12 max-w-6xl">
                {expandedAnnouncement.announcement}
              </p>
            )}
            {expandedAnnouncement.image && (
              <img
                src={expandedAnnouncement.image}
                alt="공지 이미지"
                onClick={(e) => e.stopPropagation()}
                className="max-w-full max-h-[80vh] rounded-2xl shadow-2xl ring-1 ring-slate-200 cursor-default"
              />
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setExpandedAnnouncement(null); }}
            className="fixed top-8 right-8 bg-slate-100 hover:bg-slate-200 text-slate-600 p-3 rounded-full transition-colors shadow-md"
            aria-label="닫기"
          >
            <X size={28} />
          </button>
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 text-slate-400 text-xs font-bold tracking-widest uppercase">화면 아무 곳이나 클릭하면 닫힙니다</div>
        </div>
      )}
      {imageModalUrl && (
        <div onClick={() => setImageModalUrl(null)} className="fixed inset-0 bg-slate-900/95 backdrop-blur-md flex items-center justify-center z-50 p-8 cursor-zoom-out">
          <img src={imageModalUrl} alt="공지 이미지 크게 보기" className="max-w-full max-h-full rounded-2xl shadow-2xl" />
          <button
            onClick={(e) => { e.stopPropagation(); setImageModalUrl(null); }}
            className="absolute top-8 right-8 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full transition-colors"
            aria-label="닫기"
          >
            <X size={28} />
          </button>
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/60 text-xs font-bold tracking-widest uppercase">화면 아무 곳이나 클릭하면 닫힙니다</div>
        </div>
      )}
      {isSyncing && <div className="fixed bottom-10 right-10 bg-white/90 backdrop-blur-xl px-6 py-3 rounded-full border border-slate-200 shadow-2xl text-[10px] font-black flex items-center gap-3 text-blue-600 animate-pulse ring-4 ring-blue-50"><Cloud size={14}/> 실시간 동기화 중</div>}
    </div>
  );
}
