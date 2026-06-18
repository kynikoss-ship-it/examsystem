import React, { useState, useMemo, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection } from 'firebase/firestore';

// ==========================================
// Firebase 설정 (환경 변수 또는 로컬 하드코딩 대체)
// ==========================================
const defaultFirebaseConfig = {
  apiKey: "AIzaSyDuI0jv-wSUORdPL8rDGvkiFiB9KW0wGuw",
  authDomain: "exam-system-9bcd7.firebaseapp.com",
  projectId: "exam-system-9bcd7",
  storageBucket: "exam-system-9bcd7.firebasestorage.app",
  messagingSenderId: "654691831598",
  appId: "1:654691831598:web:c41cf4d02bd433824574bf",
  measurementId: "G-36DXM2SY8N"
};

// 1. 기본 백업 프로젝트 초기화 (사용자 전용 고유 서버)
const backupApp = initializeApp(defaultFirebaseConfig, "backupProject");
const backupAuth = getAuth(backupApp);
const backupDb = getFirestore(backupApp);

// 2. 플랫폼 연동 공용 프로젝트 초기화 시도
let platformApp = null;
let platformAuth = null;
let platformDb = null;
let platformConfigExists = false;

if (typeof __firebase_config !== 'undefined' && __firebase_config) {
  try {
    const config = JSON.parse(__firebase_config);
    platformApp = initializeApp(config); // Default app
    platformAuth = getAuth(platformApp);
    platformDb = getFirestore(platformApp);
    platformConfigExists = true;
  } catch (e) {
    console.error("공용 플랫폼 Firebase 초기화 실패:", e);
  }
}

const ADMIN_PASSWORD = '3328';
const ANNOUNCEMENT_LOCK_PASSWORD = '3328';

// ==========================================
// 표준 6-세그먼트(문서) 및 5-세그먼트(컬렉션) Firestore 경로 생성기
// ==========================================
const getGlobalDocRef = (database, currentAppId) => {
  return doc(database, 'artifacts', currentAppId, 'public', 'data', 'examData', 'global');
};

const getClassDocRef = (database, currentAppId, grade, cls) => {
  return doc(database, 'artifacts', currentAppId, 'public', 'data', 'examData', `class_${grade}_${cls}`);
};

const getClassesCollectionRef = (database, currentAppId) => {
  return collection(database, 'artifacts', currentAppId, 'public', 'data', 'examData');
};

// ==========================================
// 고성능 경량 인라인 SVG 아이콘 컴포넌트
// ==========================================
const AlertCircle = ({ size = 24, className = "" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const Trash2 = ({ size = 24, className = "" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const Cloud = ({ size = 24, className = "" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
  </svg>
);

const X = ({ size = 24, className = "" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ImageIcon = ({ size = 24, className = "" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const Lock = ({ size = 24, className = "" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const Unlock = ({ size = 24, className = "" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
  </svg>
);

// 교실 좌석 설정 (가로 5열, 세로 6행 = 30석)
const COLS = 5;
const ROWS = 6;
const TOTAL_SEATS = COLS * ROWS;

// 좌석 할당 우선순위
const PREFERRED_SEAT_ORDER = [
  0, 1, 2, 3, 4,
  6, 7, 8, 9, 10,
  12, 13, 14, 15, 16,
  18, 19, 20, 21, 22,
  24, 25, 26, 27, 28,
  5, 11, 17, 23, 29
];

const DEFAULT_SCHEDULE_DAY = [
  { id: 1, period: 1, subject: '국어', code: '02', time: '09:00 - 09:45' },
  { id: 2, period: 2, subject: '과학', code: '05', time: '10:05 - 10:50' },
  { id: 3, period: 3, subject: '역사', code: '04', time: '11:10 - 11:55' },
];

const SUBJECT_CODE_MAP = {
  '교과': '',
  '도덕': '01', '국어': '02', '사회': '03', '역사': '04',
  '과학': '05', '기술가정': '09', '정보': '10',
  '수학': '11', '영어': '22', '한문': '33',
};

const DAYS_KR = ['일','월','화','수','목','금','토'];
const formatDateBadge = (isoDate, dayNum) => {
  if (!isoDate) return `${dayNum}일차`;
  const d = new Date(isoDate + 'T00:00:00');
  if (isNaN(d.getTime())) return `${dayNum}일차`;
  return `${d.getMonth() + 1}/${d.getDate()} (${DAYS_KR[d.getDay()]})`;
};

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
    '1': { schedules: buildSchedules() },
    '2': { schedules: buildSchedules() },
    '3': { schedules: buildSchedules() },
  };
};

export default function App() {
  // 플랫폼 공용서버의 오류 여부에 따라 로컬 백업 서버로 자동 우회 활성화 플래그
  const [isFallback, setIsFallback] = useState(!platformConfigExists);
  
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false); // 인증 완료 플래그
  const [isSyncing, setIsSyncing] = useState(false);
  const [view, setView] = useState('dashboard');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');
  const [editingStudentId, setEditingStudentId] = useState(null);

  // 관리자 페이지 학생 정보 수정 폼 상태
  const [adminEditingId, setAdminEditingId] = useState(null);
  const [adminEditForm, setAdminEditForm] = useState({ id: '', name: '' });

  const [localConfig, setLocalConfig] = useState({ grade: '1', class: '1' });
  const [globalConfig, setGlobalConfig] = useState({ day: '1', dates: { '1': '', '2': '', '3': '' } });
  const [globalAnnouncement, setGlobalAnnouncement] = useState('');
  const [globalAnnouncementImage, setGlobalAnnouncementImage] = useState('');
  const [studentDirectory, setStudentDirectory] = useState({});
  const [uploadStatus, setUploadStatus] = useState('');

  const [gradeData, setGradeData] = useState(makeDefaultGradeData);
  const [adminGlobalAnnInput, setAdminGlobalAnnInput] = useState('');
  const [adminGlobalAnnImage, setAdminGlobalAnnImage] = useState('');
  const [imageUploadStatus, setImageUploadStatus] = useState('');
  const [imageModalUrl, setImageModalUrl] = useState(null);
  const [allClassesData, setAllClassesData] = useState({});
  
  const [students, setStudents] = useState([]);

  const [isAnnouncementLocked, setIsAnnouncementLocked] = useState(true);
  const [showLockModal, setShowLockModal] = useState(false);
  const [lockPasswordInput, setLockPasswordInput] = useState('');
  const [lockError, setLockError] = useState('');
  const [sendConfirm, setSendConfirm] = useState(null);

  const dragStudentId = useRef(null);
  const gradeDataRef = useRef(gradeData);
  
  // 전달사항 폰트 크기 자동 조절 상태 (기본 22px)
  const [announcementFontSize, setAnnouncementFontSize] = useState(22);
  const announcementTextRef = useRef(null);

  // 동적 상태에 맞춰 알맞은 Firebase 모듈을 매핑합니다.
  const currentDb = isFallback ? backupDb : (platformDb || backupDb);
  const currentAuth = isFallback ? backupAuth : (platformAuth || backupAuth);
  const currentAppId = isFallback 
    ? "school-exam-dashboard" 
    : (typeof __app_id !== 'undefined' ? __app_id.split('/')[0] : "school-exam-dashboard");

  useEffect(() => { 
    gradeDataRef.current = gradeData; 
  }, [gradeData]);

  // Firebase 초기화 및 인증 수립 (서버 연동 상태에 반응하여 동적으로 복구)
  useEffect(() => {
    setAuthReady(false);
    const initAuth = async () => {
      try {
        if (!isFallback && typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(currentAuth, __initial_auth_token);
        } else {
          await signInAnonymously(currentAuth);
        }
        setAuthReady(true);
      } catch (err) {
        console.error("인증 실패:", err);
        // 공용 서버 인증 실패 시 로컬 백업 서버로 조용히 전환
        if (!isFallback) {
          console.warn("공용 고사 서버 인증 실패로 로컬 백업 서버로 즉시 우회합니다.");
          setIsFallback(true);
        } else {
          setAuthReady(true); // 백업 마저 실패한 경우 동작 유지를 위해 true 처리
        }
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(currentAuth, setUser);
    return () => unsubscribe();
  }, [isFallback]);

  // 전역 설정 및 학반 데이터 실시간 동기화 (오류 발생 시 백업 서버 전환 통합)
  useEffect(() => {
    if (!user || !authReady || !currentDb) return;
    setIsSyncing(true);

    const globalRef = getGlobalDocRef(currentDb, currentAppId);
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
        if (data.globalAnnouncementImage !== undefined) setGlobalAnnouncementImage(data.globalAnnouncementImage);
        if (data.studentDirectory) setStudentDirectory(data.studentDirectory);
        if (data.gradeData) {
          setGradeData({ ...makeDefaultGradeData(), ...data.gradeData });
        }
      }
      setIsSyncing(false);
    }, (error) => {
      console.error("전역 설정 구독 오류:", error);
      // 권한 누락 발생 시 로컬 백업 서버로 안전전환 수행
      if (error.code === 'permission-denied' && !isFallback) {
        console.warn("권한 누락 감지: 로컬 백업 서버로 실시간 자동 우회합니다.");
        setIsFallback(true);
      }
    });

    const classRef = getClassDocRef(currentDb, currentAppId, localConfig.grade, localConfig.class);
    const unsubClass = onSnapshot(classRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().students) {
        setStudents(docSnap.data().students);
      } else {
        setStudents([]);
      }
    }, (error) => {
      console.error("학반 학생 구독 오류:", error);
      if (error.code === 'permission-denied' && !isFallback) {
        console.warn("권한 누락 감지: 로컬 백업 서버로 실시간 자동 우회합니다.");
        setIsFallback(true);
      }
    });

    return () => { unsubGlobal(); unsubClass(); };
  }, [user, authReady, localConfig.grade, localConfig.class, isFallback, currentDb, currentAppId]);

  // 전체 학반 정보 모니터링
  useEffect(() => {
    if (!user || !authReady || !currentDb || !isAuthenticated) {
      setAllClassesData({});
      return;
    }
    const examCollection = getClassesCollectionRef(currentDb, currentAppId);
    const unsubAll = onSnapshot(examCollection, (snapshot) => {
      const data = {};
      snapshot.forEach(docSnap => {
        if (docSnap.id.startsWith('class_')) {
          const parts = docSnap.id.split('_');
          if (parts.length === 3) {
            data[`${parts[1]}-${parts[2]}`] = docSnap.data().students || [];
          }
        }
      });
      setAllClassesData(data);
    }, (error) => {
      console.error("전체 학반 구독 오류:", error);
      if (error.code === 'permission-denied' && !isFallback) {
        setIsFallback(true);
      }
    });
    return () => unsubAll();
  }, [user, authReady, isAuthenticated, isFallback, currentDb, currentAppId]);

  // 공지가 변경되거나 뷰가 바뀔 때 폰트 크기를 초기화
  useEffect(() => {
    setAnnouncementFontSize(22);
  }, [globalAnnouncement, globalAnnouncementImage, view]);

  // 컨테이너 크기에 맞춰 점진적으로 폰트 축소
  useEffect(() => {
    if (view !== 'dashboard' || !globalAnnouncement) return;
    
    const checkOverflow = () => {
      const textEl = announcementTextRef.current;
      if (!textEl) return;
      
      if (textEl.scrollHeight > textEl.clientHeight && announcementFontSize > 12) {
        setAnnouncementFontSize(prev => prev - 1);
      }
    };

    const timerId = setTimeout(checkOverflow, 10);
    return () => clearTimeout(timerId);
  }, [announcementFontSize, globalAnnouncement, globalAnnouncementImage, view]);

  const studentsWithSeats = useMemo(() => {
    let patched = [...students];
    const occupied = new Set(patched.filter(s => s.seatIndex !== undefined).map(s => s.seatIndex));

    return patched.map(s => {
      if (s.seatIndex === undefined) {
        let assignedSeat = -1;
        for (let seat of PREFERRED_SEAT_ORDER) {
          if (!occupied.has(seat)) {
            assignedSeat = seat;
            break;
          }
        }
        if (assignedSeat === -1) {
          let seat = 0;
          while (occupied.has(seat)) seat++;
          assignedSeat = seat;
        }
        occupied.add(assignedSeat);
        return { ...s, seatIndex: assignedSeat };
      }
      return s;
    });
  }, [students]);

  const stats = useMemo(() => {
    const transfer = students.filter(s => s.isAbsent && s.absenceReason === '전출').length;
    const entrusted = students.filter(s => s.isAbsent && s.absenceReason === '위탁').length;
    const absent = students.filter(s => s.isAbsent && !['전출', '위탁'].includes(s.absenceReason)).length;
    const total = students.length - transfer;
    return { total, present: total - absent, absent, transfer, entrusted };
  }, [students]);

  const currentGradeData = gradeData[localConfig.grade] || {};
  const currentGradeSchedule = (currentGradeData.schedules && currentGradeData.schedules[globalConfig.day]) || [];

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
    if (!user || !authReady) return;
    const globalRef = getGlobalDocRef(currentDb, currentAppId);
    await setDoc(globalRef, updates, { merge: true });
  };

  const updateClassDoc = async (newStudents) => {
    if (!user || !authReady) return;
    const classRef = getClassDocRef(currentDb, currentAppId, localConfig.grade, localConfig.class);
    await setDoc(classRef, { students: newStudents }, { merge: true });
  };

  // CSV 데이터 정제 업로드 함수 개선
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadStatus('업로드 및 정제 중...');
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const rows = text.split(/\r?\n/).filter(r => r.trim() !== '');
        const directory = {};

        for (let i = 1; i < rows.length; i++) {
          const cols = rows[i].split(',');
          if (cols.length < 4) continue;

          // UTF-8 BOM(\ufeff) 제거 및 양 끝 공백 청소
          const rawGrade = cols[0].replace(/^\ufeff/, '').trim();
          const rawClass = cols[1].trim();
          const rawId = cols[2].trim();
          const name = cols[3].trim();

          // 정규식으로 숫자 이외의 문자(예: "학년", "반" 등)를 제거한 뒤 순수 정수 파싱
          const gradeNum = parseInt(rawGrade.replace(/[^0-9]/g, ''), 10);
          const classNum = parseInt(rawClass.replace(/[^0-9]/g, ''), 10);
          const idNum = parseInt(rawId.replace(/[^0-9]/g, ''), 10);

          if (isNaN(gradeNum) || isNaN(classNum) || isNaN(idNum) || !name) {
            console.warn(`스킵된 행 ${i + 1} (데이터 형식 오류):`, rows[i]);
            continue;
          }

          // 학반 키값을 "1-1", "1-2" 등 대시보드 로컬 설정 값 포맷에 강제 매칭
          const gradeStr = gradeNum.toString();
          const classStr = classNum.toString();
          const key = `${gradeStr}-${classStr}`;

          if (!directory[key]) directory[key] = [];
          directory[key].push({ id: idNum, name, isAbsent: false, absenceReason: '질병' });
        }

        console.log('정제 완료된 학반 키 목록:', Object.keys(directory));

        await updateGlobalDoc({ studentDirectory: directory });

        const writeResults = [];
        for (const [key, list] of Object.entries(directory)) {
          const [grade, cls] = key.split('-');
          const classRef = getClassDocRef(currentDb, currentAppId, grade, cls);
          console.log(`쓰기 시도: ${classRef.id}, 학생 수: ${list.length}`);
          
          // merge: false를 주어 기존 불완전 데이터 덮어쓰기 처리
          await setDoc(classRef, { students: list }, { merge: false });
          writeResults.push(classRef.id);
        }

        console.log('쓰기 완료된 학반 문서 목록:', writeResults);
        setStudentDirectory(directory);
        setUploadStatus(`데이터 정제 및 반영 완료 (${writeResults.length}개 학반 성공)`);
      } catch (err) {
        console.error('CSV 업로드 중 오류 발생:', err);
        setUploadStatus(`오류 발생: ${err.message}`);
      }
    };
    reader.readAsText(file, 'euc-kr');
  };

  const handleResetClassStudents = async () => {
    if (!window.confirm('명단을 초기화 하시겠습니까?')) return;
    const dirKey = `${localConfig.grade}-${localConfig.class}`;
    const dirData = studentDirectory[dirKey] || [];
    if (dirData.length === 0) return;
    const resetData = dirData.map(s => { const { seatIndex, ...rest } = s; return rest; });
    setStudents(resetData);
    await updateClassDoc(resetData);
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
    const newData = JSON.parse(JSON.stringify(gradeDataRef.current));
    if (!newData[grade]) newData[grade] = { schedules: {} };
    if (!newData[grade].schedules[day]) {
      newData[grade].schedules[day] = DEFAULT_SCHEDULE_DAY.map(s => ({ ...s }));
    }
    newData[grade].schedules[day] = newData[grade].schedules[day].map(s => {
      if (s.id !== id) return s;
      const updated = { ...s, [field]: value };
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

  const saveSchedule = () => updateGlobalDoc({ gradeData: gradeDataRef.current });

  const handleDateChange = (day, value) => {
    const newDates = { ...(globalConfig.dates || {}), [day]: value };
    const newConfig = { ...globalConfig, dates: newDates };
    setGlobalConfig(newConfig);
    updateGlobalDoc({ globalConfig: newConfig });
  };

  const handleApplyGlobalAnnouncement = async () => {
    try {
      await updateGlobalDoc({ 
        globalAnnouncement: adminGlobalAnnInput,
        globalAnnouncementImage: adminGlobalAnnImage
      });
      setAdminGlobalAnnInput('');
      setAdminGlobalAnnImage('');
      setImageUploadStatus('송출 완료');
      setTimeout(() => setImageUploadStatus(''), 2000);
    } catch (err) {
      console.error('공지 송출 실패:', err);
      setImageUploadStatus(`송출 실패: ${err.message}`);
    }
  };

  const handleDeleteGlobalAnnouncement = async () => {
    if (!window.confirm('전달사항을 삭제하시겠습니까?')) return;
    await updateGlobalDoc({ globalAnnouncement: '', globalAnnouncementImage: '' });
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
      const sizeKB = Math.round(compressed.length / 1024);
      if (sizeKB > 700) {
        setImageUploadStatus(`크기가 너무 큽니다 (${sizeKB}KB). 더 작은 이미지를 사용해주세요.`);
        return;
      }
      setAdminGlobalAnnImage(compressed);
      setImageUploadStatus(`첨부 완료 (${sizeKB}KB)`);
    } catch (err) {
      setImageUploadStatus('이미지 처리 실패');
    }
    e.target.value = '';
  };

  const toggleAbsence = async (id) => {
    const newStudents = studentsWithSeats.map(s => s.id === id ? { ...s, isAbsent: !s.isAbsent, absenceReason: '질병' } : s);
    setStudents(newStudents);
    await updateClassDoc(newStudents);
  };

  const handleAbsenceReasonChange = async (id, reason) => {
    const newStudents = studentsWithSeats.map(s => s.id === id ? { ...s, absenceReason: reason } : s);
    setStudents(newStudents);
    await updateClassDoc(newStudents);
  };

  const handleNameChange = (id, name) => setStudents(prev => prev.map(s => s.id === id ? { ...s, name } : s));
  const handleNameSave = () => { setEditingStudentId(null); updateClassDoc(studentsWithSeats); };
  
  const handleDeleteStudent = (id) => {
    if (!window.confirm('학생을 명단에서 완전히 삭제하시겠습니까?')) return;
    const updated = studentsWithSeats.filter(s => s.id !== id);
    setStudents(updated);
    updateClassDoc(updated);
  };
  
  const handleAddStudent = () => {
    const nextId = studentsWithSeats.length > 0 ? Math.max(...studentsWithSeats.map(s => s.id)) + 1 : 1;
    const occupied = new Set(studentsWithSeats.map(s => s.seatIndex));
    
    let assignedSeat = -1;
    for (let seat of PREFERRED_SEAT_ORDER) {
      if (!occupied.has(seat)) {
        assignedSeat = seat;
        break;
      }
    }
    
    if (assignedSeat === -1 || assignedSeat >= TOTAL_SEATS) {
        alert("교실의 빈 좌석이 없습니다.");
        return;
    }

    const newStudents = [...studentsWithSeats, { id: nextId, name: '새 학생', isAbsent: false, absenceReason: '질병', seatIndex: assignedSeat }];
    setStudents(newStudents);
    updateClassDoc(newStudents);
  };

  const handleAdminEditClick = (student) => {
    setAdminEditingId(student.id);
    setAdminEditForm({ id: student.id, name: student.name });
  };

  const handleAdminSaveStudent = () => {
    const newId = parseInt(adminEditForm.id, 10);
    if (isNaN(newId)) {
      alert('번호는 숫자만 입력 가능합니다.');
      return;
    }

    if (newId !== adminEditingId && studentsWithSeats.some(s => s.id === newId)) {
      alert('이미 존재하는 번호입니다.');
      return;
    }

    const newStudents = studentsWithSeats.map(s => {
      if (s.id === adminEditingId) {
        return { ...s, id: newId, name: adminEditForm.name };
      }
      return s;
    });

    setStudents(newStudents);
    updateClassDoc(newStudents);
    setAdminEditingId(null);
  };

  useEffect(() => {
    if (view !== 'admin' || !isAuthenticated) {
      setIsAnnouncementLocked(true);
    }
  }, [view, isAuthenticated]);

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (passwordInput === ADMIN_PASSWORD) { setIsAuthenticated(true); setShowAuthModal(false); setView('admin'); }
    else setAuthError('비밀번호가 틀렸습니다.');
  };

  const handleUnlockSubmit = (e) => {
    e.preventDefault();
    if (lockPasswordInput === ANNOUNCEMENT_LOCK_PASSWORD) {
      setIsAnnouncementLocked(false);
      setShowLockModal(false);
      setLockPasswordInput('');
      setLockError('');
    } else {
      setLockError('비밀번호가 틀렸습니다.');
    }
  };

  const executeSend = async () => {
    if (!sendConfirm) return;
    if (sendConfirm.type === 'global') {
      await handleApplyGlobalAnnouncement();
    }
    setSendConfirm(null);
  };

  const handleDragStart = (e, studentId) => {
    dragStudentId.current = studentId;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault(); 
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e, targetSeatIndex) => {
    e.preventDefault();
    const draggedId = dragStudentId.current;
    if (draggedId === null) return;

    const draggedStudent = studentsWithSeats.find(s => s.id === draggedId);
    const targetStudent = studentsWithSeats.find(s => s.seatIndex === targetSeatIndex);

    if (!draggedStudent || draggedStudent.seatIndex === targetSeatIndex) return;

    const newStudents = studentsWithSeats.map(s => {
      if (s.id === draggedId) return { ...s, seatIndex: targetSeatIndex };
      if (targetStudent && s.id === targetStudent.id) return { ...s, seatIndex: draggedStudent.seatIndex };
      return s;
    });

    setStudents(newStudents);
    await updateClassDoc(newStudents);
    dragStudentId.current = null;
  };

  const SeatGrid = () => (
    <div className="grid grid-cols-5 grid-rows-6 h-full gap-2 pt-2 pb-2 px-2">
      {Array.from({ length: ROWS }).map((_, rowIndex) => (
        Array.from({ length: COLS }).map((_, colIndex) => {
          const logicalSeatIndex = colIndex * ROWS + rowIndex;
          const student = studentsWithSeats.find(s => s.seatIndex === logicalSeatIndex);

          return (
            <div 
              key={`seat-${logicalSeatIndex}`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, logicalSeatIndex)}
              className="rounded-xl flex items-center justify-center relative transition-colors bg-white/50 border-2 border-dashed border-slate-300 w-full h-full"
            >
              {student ? (
                <div
                  draggable
                  onDragStart={(e) => handleDragStart(e, student.id)}
                  className={`absolute inset-0 m-[1px] rounded-lg flex items-center justify-center shadow-sm cursor-grab active:cursor-grabbing border overflow-hidden ${
                    student.isAbsent ? 'bg-red-50 border-red-300' : 'bg-white border-slate-300 hover:border-blue-400 hover:shadow-md'
                  }`}
                >
                  {/* 번호 및 체크박스 (좌측 절대 고정) */}
                  <div className="absolute left-1 sm:left-2 flex items-center gap-1 sm:gap-1.5 z-20">
                    <input 
                      type="checkbox" 
                      checked={student.isAbsent} 
                      onChange={() => toggleAbsence(student.id)} 
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 rounded-sm accent-blue-600 cursor-pointer shrink-0" 
                    />
                    <span className="font-black text-slate-800 opacity-70 leading-none shrink-0 text-sm sm:text-base md:text-lg lg:text-xl 2xl:text-2xl">
                      {student.id}
                    </span>
                  </div>
                  
                  {/* 학생 이름 (정중앙, 고정) */}
                  <div className="flex-1 flex justify-center items-center w-full px-12 sm:px-14 lg:px-20 z-10 pointer-events-none">
                    {editingStudentId === student.id ? (
                      <input 
                        value={student.name} 
                        onChange={(e) => handleNameChange(student.id, e.target.value)} 
                        onBlur={handleNameSave} 
                        autoFocus 
                        onClick={(e) => e.stopPropagation()}
                        className="bg-transparent border-b border-blue-400 w-full min-w-0 outline-none text-center font-black leading-none text-base sm:text-lg md:text-xl lg:text-2xl 2xl:text-3xl pointer-events-auto" 
                      />
                    ) : (
                      <span 
                        onClick={(e) => { e.stopPropagation(); setEditingStudentId(student.id); }} 
                        className="font-black text-slate-800 cursor-text truncate tracking-tighter text-center w-full leading-none text-base sm:text-lg md:text-xl lg:text-2xl 2xl:text-3xl pointer-events-auto" 
                        title={student.name}
                      >
                        {student.name}
                      </span>
                    )}
                  </div>

                  {/* 결시 사유 드롭박스 (우측 절대 고정, 결시인 경우에만 표시) */}
                  {student.isAbsent && (
                    <div className="absolute right-1 sm:right-2 z-20 flex items-center">
                      <select 
                        value={student.absenceReason} 
                        onChange={(e) => handleAbsenceReasonChange(student.id, e.target.value)} 
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="bg-white/95 border border-red-200 shadow-sm rounded font-black text-red-600 outline-none leading-none shrink-0 text-xs sm:text-sm md:text-base lg:text-lg 2xl:text-xl px-1 sm:px-1.5 py-0.5 max-w-[3.5rem] sm:max-w-none"
                      >
                        <option value
