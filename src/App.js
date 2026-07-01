import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Users, AlertCircle, Trash2, Cloud, X, Image as ImageIcon, Lock, Unlock, GripHorizontal, Sun, Moon } from 'lucide-react';
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

const ADMIN_PASSWORD = '3328';
const ANNOUNCEMENT_LOCK_PASSWORD = '3328';

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
    '1': { schedules: buildSchedules(), announcement: '', announcementImage: '' },
    '2': { schedules: buildSchedules(), announcement: '', announcementImage: '' },
    '3': { schedules: buildSchedules(), announcement: '', announcementImage: '' },
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

  // 학년별 전달사항 (관리자 입력용)
  const [adminGradeAnnInput, setAdminGradeAnnInput] = useState('');
  const [adminGradeAnnImage, setAdminGradeAnnImage] = useState('');
  const [gradeImageUploadStatus, setGradeImageUploadStatus] = useState('');

  const [students, setStudents] = useState([]);
  // 반별 응시 현황 마감 여부
  const [isFinalized, setIsFinalized] = useState(false);

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

  // ==========================================
  // 화면꺼짐 방지 (Wake Lock) - 자동 작동
  // ==========================================
  const [wakeLockSupported, setWakeLockSupported] = useState(true);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockRef = useRef(null);

  const requestWakeLock = async () => {
    if (!('wakeLock' in navigator)) {
      setWakeLockSupported(false);
      return;
    }
    try {
      const lock = await navigator.wakeLock.request('screen');
      wakeLockRef.current = lock;
      setWakeLockActive(true);
      lock.addEventListener('release', () => {
        setWakeLockActive(false);
      });
    } catch (err) {
      // 권한/정책상 실패해도 앱 동작에는 영향 없음
      setWakeLockActive(false);
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try { await wakeLockRef.current.release(); } catch (err) {}
      wakeLockRef.current = null;
    }
    setWakeLockActive(false);
  };

  useEffect(() => {
    // 페이지 로드 시 자동 시도
    requestWakeLock();

    // 탭이 백그라운드로 갔다가 돌아오면 Wake Lock이 풀리므로 재요청
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, []);

  useEffect(() => { 
    gradeDataRef.current = gradeData; 
  }, [gradeData]);

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
        if (data.globalAnnouncementImage !== undefined) setGlobalAnnouncementImage(data.globalAnnouncementImage);
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
      if (docSnap.exists()) {
        const data = docSnap.data();
        setStudents(data.students || []);
        setIsFinalized(!!data.isFinalized);
      } else {
        setStudents([]);
        setIsFinalized(false);
      }
    });

    return () => { unsubGlobal(); unsubClass(); };
  }, [user, localConfig.grade, localConfig.class]);

  useEffect(() => {
    if (!user || !db || !isAuthenticated) {
      setAllClassesData({});
      return;
    }
    const examCollection = collection(db, 'artifacts', appId, 'public', 'data', 'examData');
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
    });
    return () => unsubAll();
  }, [user, isAuthenticated]);

  // 공지가 변경되거나 뷰가 바뀔 때 폰트 크기를 초기화
  useEffect(() => {
    setAnnouncementFontSize(22);
  }, [globalAnnouncement, globalAnnouncementImage, gradeData[localConfig.grade]?.announcement, gradeData[localConfig.grade]?.announcementImage, view]);

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
  }, [announcementFontSize, globalAnnouncement, globalAnnouncementImage, gradeData[localConfig.grade]?.announcement, gradeData[localConfig.grade]?.announcementImage, view]);

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

  const handleToggleFinalize = async () => {
    const newVal = !isFinalized;
    if (newVal) {
      if (!window.confirm(`${localConfig.grade}학년 ${localConfig.class}반 응시 현황을 마감하시겠습니까?\n마감 후에는 체크박스, 결시사유, 좌석 이동, 명단 관리가 잠깁니다.`)) return;
    } else {
      if (!window.confirm('마감을 취소하고 다시 수정하시겠습니까?')) return;
    }
    setIsFinalized(newVal);
    if (!user) return;
    const classDocId = `class_${localConfig.grade}_${localConfig.class}`;
    const classRef = doc(db, 'artifacts', appId, 'public', 'data', 'examData', classDocId);
    await setDoc(classRef, { isFinalized: newVal }, { merge: true });
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
          
          directory[key].push({ 
            id: parseInt(cols[2]), 
            name: cols[3].trim(), 
            isAbsent: false, 
            absenceReason: '질병'
          });
        }
        await updateGlobalDoc({ studentDirectory: directory });
        setUploadStatus('데이터 저장 완료');
      } catch (err) { setUploadStatus('오류 발생'); }
    };
    reader.readAsText(file, 'euc-kr');
  };

  const handleResetClassStudents = async () => {
    if (isFinalized) { alert('마감된 반입니다. 상단에서 마감을 취소한 후 이용해주세요.'); return; }
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

  const handleApplyGradeAnnouncement = async () => {
    const grade = localConfig.grade;
    const newData = JSON.parse(JSON.stringify(gradeDataRef.current));
    if (!newData[grade]) newData[grade] = { schedules: {} };
    newData[grade].announcement = adminGradeAnnInput;
    newData[grade].announcementImage = adminGradeAnnImage;
    gradeDataRef.current = newData;
    setGradeData(newData);
    try {
      await updateGlobalDoc({ gradeData: newData });
      setAdminGradeAnnInput('');
      setAdminGradeAnnImage('');
      setGradeImageUploadStatus('송출 완료');
      setTimeout(() => setGradeImageUploadStatus(''), 2000);
    } catch (err) {
      console.error('학년 공지 송출 실패:', err);
      setGradeImageUploadStatus(`송출 실패: ${err.message}`);
    }
  };

  const handleDeleteGradeAnnouncement = async () => {
    const grade = localConfig.grade;
    if (!window.confirm(`${grade}학년 전달사항을 삭제하시겠습니까?`)) return;
    const newData = JSON.parse(JSON.stringify(gradeDataRef.current));
    if (!newData[grade]) newData[grade] = { schedules: {} };
    newData[grade].announcement = '';
    newData[grade].announcementImage = '';
    gradeDataRef.current = newData;
    setGradeData(newData);
    await updateGlobalDoc({ gradeData: newData });
  };

  const handleGradeAnnouncementImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setGradeImageUploadStatus('이미지 파일만 가능합니다.');
      return;
    }
    try {
      setGradeImageUploadStatus('압축 중...');
      const compressed = await compressImage(file);
      const sizeKB = Math.round(compressed.length / 1024);
      if (sizeKB > 700) {
        setGradeImageUploadStatus(`크기가 너무 큽니다 (${sizeKB}KB). 더 작은 이미지를 사용해주세요.`);
        return;
      }
      setAdminGradeAnnImage(compressed);
      setGradeImageUploadStatus(`첨부 완료 (${sizeKB}KB)`);
    } catch (err) {
      setGradeImageUploadStatus('이미지 처리 실패');
    }
    e.target.value = '';
  };

  const toggleAbsence = async (id) => {
    if (isFinalized) return;
    const newStudents = studentsWithSeats.map(s => s.id === id ? { ...s, isAbsent: !s.isAbsent, absenceReason: '질병' } : s);
    setStudents(newStudents);
    await updateClassDoc(newStudents);
  };

  const handleAbsenceReasonChange = async (id, reason) => {
    if (isFinalized) return;
    const newStudents = studentsWithSeats.map(s => s.id === id ? { ...s, absenceReason: reason } : s);
    setStudents(newStudents);
    await updateClassDoc(newStudents);
  };

  const handleNameChange = (id, name) => setStudents(prev => prev.map(s => s.id === id ? { ...s, name } : s));
  const handleNameSave = () => { setEditingStudentId(null); updateClassDoc(studentsWithSeats); };
  
  const handleDeleteStudent = (id) => {
    if (isFinalized) { alert('마감된 반입니다. 상단에서 마감을 취소한 후 이용해주세요.'); return; }
    if (!window.confirm('학생을 명단에서 완전히 삭제하시겠습니까?')) return;
    const updated = studentsWithSeats.filter(s => s.id !== id);
    setStudents(updated);
    updateClassDoc(updated);
  };
  
  const handleAddStudent = () => {
    if (isFinalized) { alert('마감된 반입니다. 상단에서 마감을 취소한 후 이용해주세요.'); return; }
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
    if (isFinalized) { alert('마감된 반입니다. 상단에서 마감을 취소한 후 이용해주세요.'); return; }
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
    } else if (sendConfirm.type === 'grade') {
      await handleApplyGradeAnnouncement();
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
    if (isFinalized) return;
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
                  draggable={!isFinalized}
                  onDragStart={(e) => handleDragStart(e, student.id)}
                  className={`absolute inset-0 m-[1px] rounded-lg flex items-center justify-center shadow-sm border overflow-hidden ${isFinalized ? 'cursor-default opacity-90' : 'cursor-grab active:cursor-grabbing'} ${
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
                      disabled={isFinalized}
                      className={`w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 rounded-sm accent-blue-600 shrink-0 ${isFinalized ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`} 
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
                        onClick={(e) => { e.stopPropagation(); if (!isFinalized) setEditingStudentId(student.id); }} 
                        className={`font-black text-slate-800 truncate tracking-tighter text-center w-full leading-none text-base sm:text-lg md:text-xl lg:text-2xl 2xl:text-3xl pointer-events-auto ${isFinalized ? 'cursor-default' : 'cursor-text'}`} 
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
                        disabled={isFinalized}
                        className={`bg-white/95 border border-red-200 shadow-sm rounded font-black text-red-600 outline-none leading-none shrink-0 text-xs sm:text-sm md:text-base lg:text-lg 2xl:text-xl px-1 sm:px-1.5 py-0.5 max-w-[3.5rem] sm:max-w-none ${isFinalized ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        <option value="질병">질병</option>
                        <option value="인정">인정</option>
                        <option value="미인정">미인정</option>
                        <option value="기타">기타</option>
                        <option value="전출">전출</option>
                        <option value="위탁">위탁</option>
                      </select>
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-slate-300 font-bold pointer-events-none text-[10px] sm:text-sm">빈 자리</span>
              )}
            </div>
          );
        })
      ))}
    </div>
  );

  const renderDashboard = () => (
    <div className="flex flex-col gap-4 flex-1 h-full min-h-0 w-full">
      {/* 4:1:5 비율을 위해 grid-cols-10 사용 (col-span-4, col-span-1, col-span-5) */}
      <div className="grid grid-cols-10 gap-4 h-[42%] min-h-[300px] shrink-0">
        
        {/* 금일 시험 시간표 (비율 4) */}
        <div className="col-span-4 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
          <div className="bg-slate-50 text-slate-500 font-bold text-sm border-b border-slate-200 p-3 text-center uppercase tracking-widest shrink-0">금일 시험 시간표</div>
          <div className="flex flex-col justify-evenly flex-1 p-2">
            {currentGradeSchedule.map((item) => (
              <div key={item.id} className="flex flex-row items-center justify-between px-4 py-3 flex-1 border-b border-slate-100 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-500 text-lg shrink-0">{item.period}</span>
                  <div className="flex items-baseline gap-1.5 truncate">
                    <span className="text-2xl 2xl:text-3xl font-black text-slate-800 leading-none">{item.subject}</span>
                    {item.code && <span className="text-xl 2xl:text-2xl font-black text-slate-500 leading-none shrink-0">({item.code})</span>}
                  </div>
                </div>
                <div className="text-2xl 2xl:text-3xl font-black tracking-tighter text-slate-700 leading-none shrink-0">{item.time}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 응시 현황 (비율 1) */}
        <div className="col-span-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
            <div className="bg-slate-50 text-slate-500 font-bold text-xs 2xl:text-sm border-b border-slate-200 p-2 text-center uppercase tracking-widest shrink-0">응시 현황</div>
            <div className="flex flex-col justify-evenly flex-1 p-1">
                <div className="flex flex-col items-center justify-center px-1 py-2 flex-1 border-b border-slate-100 last:border-0 gap-1 text-center">
                    <span className="text-sm 2xl:text-base font-black text-slate-500 leading-none">재적</span>
                    <span className="text-xl 2xl:text-2xl font-black text-slate-800 leading-none">{stats.total}</span>
                </div>
                <div className="flex flex-col items-center justify-center px-1 py-2 flex-1 border-b border-slate-100 last:border-0 gap-1 text-center">
                    <span className="text-sm 2xl:text-base font-black text-blue-500 leading-none">응시</span>
                    <span className="text-xl 2xl:text-2xl font-black text-blue-600 leading-none">{stats.present}</span>
                </div>
                <div className="flex flex-col items-center justify-center px-1 py-2 flex-1 border-b border-slate-100 last:border-0 gap-1 text-center">
                    <span className="text-sm 2xl:text-base font-black text-red-500 leading-none">결시</span>
                    <span className="text-xl 2xl:text-2xl font-black text-red-600 leading-none">{stats.absent}</span>
                </div>
            </div>
        </div>
        
        {/* 전달사항 (비율 5) */}
        <div className="col-span-5 bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col h-full">
          <h3 className="font-bold text-slate-400 text-xs flex items-center gap-1.5 uppercase tracking-widest mb-3 shrink-0"><AlertCircle size={16}/> 전달사항</h3>
          <div className="flex flex-col gap-3 flex-1 overflow-hidden pr-2 min-h-0">
            {(globalAnnouncement || globalAnnouncementImage) ? (
              <div className="p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-lg shadow-sm flex-1 flex flex-col min-h-0">
                {globalAnnouncement && (
                  <p 
                    ref={announcementTextRef} 
                    style={{ fontSize: `${announcementFontSize}px`, lineHeight: 1.4 }} 
                    className="font-black text-slate-800 break-keep whitespace-pre-wrap flex-1 overflow-hidden min-h-0"
                  >
                    {globalAnnouncement}
                  </p>
                )}
                {globalAnnouncementImage && (
                  <img src={globalAnnouncementImage} alt="공지 이미지" onClick={() => setImageModalUrl(globalAnnouncementImage)} className="max-h-52 w-full object-contain rounded-md cursor-zoom-in shadow-sm ring-1 ring-slate-200 mt-3 bg-white/50 p-1 shrink-0" />
                )}
              </div>
            ) : (
              <p className="text-center text-slate-400 text-sm font-bold m-auto">등록된 전달사항이 없습니다.</p>
            )}
            {(currentGradeData.announcement || currentGradeData.announcementImage) && (
              <div className="p-3 bg-purple-50 border-l-4 border-purple-500 rounded-r-lg shadow-sm shrink-0 max-h-[38%] overflow-auto">
                <p className="text-[10px] font-black text-purple-500 uppercase tracking-widest mb-1">{localConfig.grade}학년 전달사항</p>
                <p className="text-sm font-bold text-slate-800 whitespace-pre-wrap break-keep">{currentGradeData.announcement}</p>
                {currentGradeData.announcementImage && (
                  <img src={currentGradeData.announcementImage} alt="학년 공지 이미지" onClick={() => setImageModalUrl(currentGradeData.announcementImage)} className="max-h-32 w-full object-contain rounded-md cursor-zoom-in shadow-sm ring-1 ring-slate-200 mt-2 bg-white/50 p-1" />
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 자리 배치도 영역 */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col flex-1 min-h-0 relative">
        <div className="flex justify-between items-center mb-3 shrink-0 px-2 relative min-h-[40px]">
          <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
            자리 배치도
            {isFinalized && (
              <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full ring-1 ring-emerald-200 flex items-center gap-1">
                <Lock size={10}/> 마감 완료
              </span>
            )}
          </h3>
          <div className="absolute left-1/2 -translate-x-1/2 bg-emerald-800 text-white text-center px-16 sm:px-24 py-1.5 sm:py-2 font-black tracking-[1em] rounded-lg shadow-md text-base sm:text-lg border-[3px] border-emerald-900 flex items-center justify-center z-10">
            칠 판
          </div>
          <button
            onClick={handleToggleFinalize}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 ${
              isFinalized
                ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100'
                : 'bg-slate-800 text-white hover:bg-slate-700'
            }`}
          >
            {isFinalized ? (<><Unlock size={13}/> 마감 취소</>) : (<><Lock size={13}/> 응시 마감</>)}
          </button>
        </div>
        
        <div className={`flex-1 rounded-xl border shadow-inner overflow-hidden relative ${isFinalized ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
          <SeatGrid />
        </div>
      </div>
    </div>
  );

  const renderAdmin = () => (
    <div className="bg-white flex-1 rounded-2xl border border-slate-200 p-8 overflow-y-auto flex flex-col gap-10 text-slate-800 shadow-sm">
      <section>
        <h2 className="font-black border-b border-slate-100 pb-4 mb-6 text-xl tracking-tight flex items-center gap-2">1. 학생 명단 초기 데이터 업로드 (CSV)</h2>
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 border-dashed flex flex-col gap-2">
          <input type="file" accept=".csv" onChange={handleFileUpload} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
          <p className="text-xs text-slate-400 font-bold mt-1">※ 업로드 시 좌석은 우선순위에 따라 자동 배정됩니다. 개별 좌석 이동은 상황판 대시보드에서 진행하세요.</p>
          {uploadStatus && <p className="mt-2 text-blue-600 font-black text-sm">{uploadStatus}</p>}
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
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">시험 일정 지정</h3>
          <div className="grid grid-cols-3 gap-3">
            {['1','2','3'].map(d => (
              <div key={d} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                <span className="font-black text-slate-500 text-sm whitespace-nowrap">{d}일차</span>
                <input type="date" value={globalConfig.dates?.[d] || ''} onChange={(e) => handleDateChange(d, e.target.value)} className="flex-1 bg-transparent text-slate-800 font-bold outline-none text-sm" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 mb-5 flex-wrap">
          <div className="flex bg-slate-100 rounded-xl p-1">
            {['1','2','3'].map(g => (
              <button key={g} onClick={() => setLocalConfig({ ...localConfig, grade: g })} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${localConfig.grade === g ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{g}학년</button>
            ))}
          </div>
          <div className="flex bg-slate-100 rounded-xl p-1">
            {['1','2','3'].map(d => (
              <button key={d} onClick={() => { const newConfig = { ...globalConfig, day: d }; setGlobalConfig(newConfig); updateGlobalDoc({ globalConfig: newConfig }); }} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${globalConfig.day === d ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{formatDateBadge(globalConfig.dates?.[d], d)}</button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {currentGradeSchedule.map(item => {
            const parts = (item.time || '').split(' - ');
            const startTime = (parts[0] || '').trim();
            const endTime = (parts[1] || '').trim();
            const isLegacyValue = item.subject && !Object.prototype.hasOwnProperty.call(SUBJECT_CODE_MAP, item.subject);
            return (
              <div key={item.id} className="grid grid-cols-12 gap-3 items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                <div className="col-span-1 flex justify-center">
                  <span className="w-10 h-10 flex items-center justify-center bg-blue-50 text-blue-600 rounded-lg font-black text-lg">{item.period}</span>
                </div>
                <select value={item.subject || ''} onChange={(e) => { handleScheduleChange(item.id, 'subject', e.target.value); saveSchedule(); }} className="col-span-5 bg-slate-50 border-2 border-transparent p-3 rounded-lg text-slate-800 font-bold outline-none focus:bg-white focus:border-blue-400">
                  <option value="">— 과목 선택 —</option>
                  {isLegacyValue && <option value={item.subject}>{item.subject} (구 데이터)</option>}
                  {Object.keys(SUBJECT_CODE_MAP).map(name => {
                    const isUsedElsewhere = usedInOtherDays.has(name) && name !== item.subject;
                    return <option key={name} value={name} disabled={isUsedElsewhere}>{name}{SUBJECT_CODE_MAP[name] ? ` (${SUBJECT_CODE_MAP[name]})` : ''}</option>;
                  })}
                </select>
                <input type="text" value={item.code} onChange={(e) => handleScheduleChange(item.id, 'code', e.target.value)} onBlur={saveSchedule} placeholder="—" className="col-span-2 bg-slate-50 border-2 border-transparent p-3 rounded-lg text-center font-bold outline-none focus:bg-white focus:border-blue-400" />
                <input type="time" value={startTime} onChange={(e) => handleScheduleChange(item.id, 'time', `${e.target.value} - ${endTime}`)} onBlur={saveSchedule} className="col-span-2 bg-slate-50 p-3 rounded-lg text-center font-bold focus:bg-white focus:border-blue-400" />
                <input type="time" value={endTime} onChange={(e) => handleScheduleChange(item.id, 'time', `${startTime} - ${e.target.value}`)} onBlur={saveSchedule} className="col-span-2 bg-slate-50 p-3 rounded-lg text-center font-bold focus:bg-white focus:border-blue-400" />
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-5 border-b border-slate-100 pb-4">
          <h2 className="font-black text-xl tracking-tight flex items-center gap-2">
            3. 학생 명단 관리 ({localConfig.grade}학년 {localConfig.class}반)
            {isFinalized && (
              <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full ring-1 ring-emerald-200 flex items-center gap-1">
                <Lock size={10}/> 마감됨
              </span>
            )}
          </h2>
          <div className="flex gap-2">
            <button onClick={handleResetClassStudents} disabled={isFinalized} className="bg-white text-slate-500 px-3 py-1.5 rounded-lg font-bold text-xs border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">명단 초기화</button>
            <button onClick={handleAddStudent} disabled={isFinalized} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg font-black text-xs shadow-md disabled:opacity-40 disabled:cursor-not-allowed">+ 빈 좌석 학생 추가</button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 bg-slate-50 p-5 rounded-2xl border border-slate-200">
          {studentsWithSeats.map(s => (
            <div key={s.id} className="p-3 border border-slate-200 rounded-xl flex justify-between items-center bg-white shadow-sm min-h-[50px]">
              {adminEditingId === s.id ? (
                <div className="flex flex-col gap-2 w-full">
                  <div className="flex gap-2">
                    <input 
                      type="number" 
                      value={adminEditForm.id} 
                      onChange={e => setAdminEditForm({...adminEditForm, id: e.target.value})} 
                      className="w-12 border border-slate-300 rounded px-1 text-sm outline-none" 
                      placeholder="번호" 
                    />
                    <input 
                      type="text" 
                      value={adminEditForm.name} 
                      onChange={e => setAdminEditForm({...adminEditForm, name: e.target.value})} 
                      className="flex-1 border border-slate-300 rounded px-1 text-sm outline-none" 
                      placeholder="이름" 
                    />
                  </div>
                  <div className="flex justify-end gap-1">
                    <button onClick={handleAdminSaveStudent} className="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded font-bold transition-colors">저장</button>
                    <button onClick={() => setAdminEditingId(null)} className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs rounded font-bold transition-colors">취소</button>
                  </div>
                </div>
              ) : (
                <>
                  <span 
                    className={`text-sm font-bold text-slate-700 transition-colors ${isFinalized ? 'cursor-default' : 'cursor-pointer hover:text-blue-600'}`}
                    onClick={() => { if (!isFinalized) handleAdminEditClick(s); }}
                  >
                    {s.name} <span className="text-[10px] text-slate-400 font-normal ml-1 bg-slate-100 px-1.5 py-0.5 rounded">{s.id}번 (좌석 {s.seatIndex + 1})</span>
                  </span>
                  <button onClick={() => handleDeleteStudent(s.id)} disabled={isFinalized} className="text-red-400 hover:text-red-600 p-1 bg-red-50 rounded-md shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"><Trash2 size={14} /></button>
                </>
              )}
            </div>
          ))}
          {studentsWithSeats.length === 0 && (
            <div className="col-span-4 text-center text-slate-400 text-sm py-8 font-bold">등록된 학생이 없습니다.</div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-6 pb-12">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h2 className="font-black text-xl tracking-tight">4. 실시간 전달사항 송출</h2>
          {isAnnouncementLocked ? (
            <button onClick={() => { setLockPasswordInput(''); setLockError(''); setShowLockModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-black hover:bg-slate-200 transition-colors ring-1 ring-slate-200"><Lock size={14} /> 잠금 (해제하려면 클릭)</button>
          ) : (
            <button onClick={() => setIsAnnouncementLocked(true)} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-black hover:bg-emerald-100 transition-colors ring-1 ring-emerald-200"><Unlock size={14} /> 잠금 해제됨 · 다시 잠그기</button>
          )}
        </div>

        {isAnnouncementLocked && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs font-bold text-amber-700 flex items-center gap-2"><Lock size={14} /> 전달사항 송출·삭제·이미지 첨부는 잠금 해제 후 가능합니다. 우측 상단 자물쇠를 클릭하여 해제하세요.</div>
        )}

        <div className="p-8 bg-slate-50 rounded-3xl border border-slate-200 shadow-inner mt-2">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-slate-800 font-black text-sm uppercase">전달사항 작성</h3>
            <button onClick={handleDeleteGlobalAnnouncement} disabled={isAnnouncementLocked || (!globalAnnouncement && !globalAnnouncementImage)} className="text-red-500 hover:text-red-700 font-black text-xs disabled:opacity-50 flex items-center gap-1">
              <Trash2 size={14} /> 현재 전달사항 삭제
            </button>
          </div>
          <textarea value={adminGlobalAnnInput} onChange={(e) => setAdminGlobalAnnInput(e.target.value)} disabled={isAnnouncementLocked} className={`w-full border border-slate-200 p-4 rounded-xl h-32 mb-4 outline-none focus:ring-2 focus:ring-blue-400 font-bold shadow-sm transition-colors ${isAnnouncementLocked ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white text-slate-800'}`} placeholder={isAnnouncementLocked ? '잠금 해제 후 입력 가능합니다.' : '모든 학년에 공통으로 표시될 전달사항을 입력하세요.'} />
          
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-4 flex items-center gap-4">
            <ImageIcon size={20} className="text-slate-400" />
            <input type="file" accept="image/*" onChange={handleAnnouncementImageUpload} disabled={isAnnouncementLocked} className={`block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold ${isAnnouncementLocked ? 'text-slate-300 file:bg-slate-100 file:text-slate-400 cursor-not-allowed' : 'text-slate-500 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100'}`} />
            {adminGlobalAnnImage && (
              <button onClick={() => { setAdminGlobalAnnImage(''); setImageUploadStatus(''); }} disabled={isAnnouncementLocked} className="text-red-500 hover:text-red-700 font-black text-xs whitespace-nowrap">
                이미지 제거
              </button>
            )}
          </div>
          {imageUploadStatus && <p className="mb-4 text-blue-600 font-black text-sm">{imageUploadStatus}</p>}

          <button onClick={() => setSendConfirm({ type: 'global' })} disabled={isAnnouncementLocked || (!adminGlobalAnnInput.trim() && !adminGlobalAnnImage)} className={`w-full font-black py-4 rounded-xl shadow-lg transition-all ${(isAnnouncementLocked || (!adminGlobalAnnInput.trim() && !adminGlobalAnnImage)) ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white active:scale-[0.98]'}`}>{isAnnouncementLocked ? <span className="inline-flex items-center gap-2"><Lock size={14}/> 전체 송출 (잠김)</span> : '전체 송출'}</button>
        </div>

        <div className="p-8 bg-slate-50 rounded-3xl border border-slate-200 shadow-inner">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-slate-800 font-black text-sm uppercase">학년별 전달사항 · {localConfig.grade}학년 대상</h3>
            <button onClick={handleDeleteGradeAnnouncement} disabled={isAnnouncementLocked || (!currentGradeData.announcement && !currentGradeData.announcementImage)} className="text-red-500 hover:text-red-700 font-black text-xs disabled:opacity-50 flex items-center gap-1">
              <Trash2 size={14} /> 현재 {localConfig.grade}학년 전달사항 삭제
            </button>
          </div>
          <p className="text-xs text-slate-400 font-bold mb-4">※ 상단 시험 시간표 설정의 학년 탭과 동일한 학년을 대상으로 합니다.</p>
          <textarea value={adminGradeAnnInput} onChange={(e) => setAdminGradeAnnInput(e.target.value)} disabled={isAnnouncementLocked} className={`w-full border border-slate-200 p-4 rounded-xl h-24 mb-4 outline-none focus:ring-2 focus:ring-purple-400 font-bold shadow-sm transition-colors ${isAnnouncementLocked ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white text-slate-800'}`} placeholder={isAnnouncementLocked ? '잠금 해제 후 입력 가능합니다.' : `${localConfig.grade}학년에만 표시될 전달사항을 입력하세요.`} />

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-4 flex items-center gap-4">
            <ImageIcon size={20} className="text-slate-400" />
            <input type="file" accept="image/*" onChange={handleGradeAnnouncementImageUpload} disabled={isAnnouncementLocked} className={`block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold ${isAnnouncementLocked ? 'text-slate-300 file:bg-slate-100 file:text-slate-400 cursor-not-allowed' : 'text-slate-500 file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100'}`} />
            {adminGradeAnnImage && (
              <button onClick={() => { setAdminGradeAnnImage(''); setGradeImageUploadStatus(''); }} disabled={isAnnouncementLocked} className="text-red-500 hover:text-red-700 font-black text-xs whitespace-nowrap">
                이미지 제거
              </button>
            )}
          </div>
          {gradeImageUploadStatus && <p className="mb-4 text-purple-600 font-black text-sm">{gradeImageUploadStatus}</p>}

          <button onClick={() => setSendConfirm({ type: 'grade' })} disabled={isAnnouncementLocked || (!adminGradeAnnInput.trim() && !adminGradeAnnImage)} className={`w-full font-black py-4 rounded-xl shadow-lg transition-all ${(isAnnouncementLocked || (!adminGradeAnnInput.trim() && !adminGradeAnnImage)) ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-purple-600 text-white active:scale-[0.98]'}`}>{isAnnouncementLocked ? <span className="inline-flex items-center gap-2"><Lock size={14}/> {localConfig.grade}학년 송출 (잠김)</span> : `${localConfig.grade}학년 송출`}</button>
        </div>
      </section>

      <section className="pb-12">
        <h2 className="font-black border-b border-slate-100 pb-4 mb-6 text-xl tracking-tight">5. 전체 학반 결시생 현황 요약</h2>
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
                  <span className={`text-sm font-black px-3 py-1 rounded-full ${gradeTotal > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-400'}`}>{gradeTotal}명 결시</span>
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
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${absent.length > 0 ? 'bg-red-200 text-red-700' : 'bg-slate-100 text-slate-400'}`}>{absent.length}명</span>
                        </div>
                        {absent.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {absent.map(s => <span key={s.id} className="text-xs bg-white px-2 py-1 rounded-md text-slate-700 ring-1 ring-red-200 font-bold">{s.name} <span className="text-red-500 font-black">· {s.absenceReason}</span></span>)}
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
      </section>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 font-sans flex flex-col gap-4 h-screen w-screen overflow-hidden">
      <header className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-8">
          <h1 className="text-xl font-black text-slate-800 tracking-tighter leading-none px-2">고사 상황판</h1>
          <div className="flex gap-4 items-center bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 text-xs font-black shadow-inner">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">학년</span>
              <select value={localConfig.grade} onChange={(e) => setLocalConfig({ ...localConfig, grade: e.target.value })} className="bg-transparent text-slate-800 border-b-2 border-blue-500 outline-none cursor-pointer">
                {[1, 2, 3].map(n => <option key={n} value={n}>{n}학년</option>)}
              </select>
            </div>
            <div className="w-px bg-slate-200 h-4"></div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">반</span>
              <select value={localConfig.class} onChange={(e) => setLocalConfig({ ...localConfig, class: e.target.value })} className="bg-transparent text-slate-800 border-b-2 border-blue-500 outline-none cursor-pointer">
                {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}반</option>)}
              </select>
            </div>
            <div className="w-px bg-slate-200 h-4"></div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">날짜</span>
              <select value={globalConfig.day} name="day" onChange={handleGlobalConfigChange} className="bg-transparent text-blue-600 border-b-2 border-blue-600 outline-none font-black cursor-pointer">
                {[1, 2, 3].map(n => <option key={n} value={n}>{formatDateBadge(globalConfig.dates?.[n], n)}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {/* 화면꺼짐 방지 상태 표시 (자동 작동, 정보 표시용) */}
          {wakeLockSupported && (
            <div
              title={wakeLockActive ? '화면꺼짐 방지 작동 중' : '화면꺼짐 방지 대기 중'}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black border shrink-0 ${
                wakeLockActive
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-50 text-slate-400 border-slate-200'
              }`}
            >
              {wakeLockActive ? <Sun size={13} /> : <Moon size={13} />}
              <span className="hidden xl:inline">{wakeLockActive ? '화면 유지 중' : '화면 유지 대기'}</span>
            </div>
          )}
          <button onClick={() => setView('dashboard')} className={`px-6 py-2.5 rounded-xl font-black text-xs transition-all duration-300 ${view === 'dashboard' ? 'bg-slate-800 text-white shadow-md shadow-slate-200' : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'}`}>상황판 (자리배치도)</button>
          <button onClick={() => isAuthenticated ? setView('admin') : setShowAuthModal(true)} className={`px-6 py-2.5 rounded-xl font-black text-xs transition-all duration-300 ${view === 'admin' ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'}`}>관리 설정</button>
        </div>
      </header>
      
      {view === 'dashboard' ? renderDashboard() : renderAdmin()}
      
      {/* 관리자 인증 모달 */}
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
      
      {/* 전달사항 잠금 모달 */}
      {showLockModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2.5rem] p-12 w-full max-w-sm shadow-2xl border border-white">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center ring-1 ring-amber-100"><Lock size={28} className="text-amber-600" /></div>
            </div>
            <h3 className="text-2xl font-black text-slate-800 tracking-tight text-center mb-2">공지 잠금 해제</h3>
            <p className="text-xs text-slate-400 text-center mb-8 font-bold">송출·삭제·이미지 첨부를 위해 인증이 필요합니다</p>
            <form onSubmit={handleUnlockSubmit} className="flex flex-col gap-6">
              <input type="password" value={lockPasswordInput} onChange={(e) => setLockPasswordInput(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 p-5 rounded-2xl text-center text-3xl tracking-[0.5em] outline-none focus:border-amber-500 focus:bg-white transition-all text-slate-800 font-black shadow-inner" placeholder="••••" autoFocus />
              {lockError && <p className="text-red-500 text-center font-black animate-bounce text-sm">{lockError}</p>}
              <button type="submit" className="w-full bg-amber-500 text-white py-5 rounded-2xl font-black text-xl shadow-lg active:scale-95 transition-all">잠금 해제</button>
              <button type="button" onClick={() => { setShowLockModal(false); setLockPasswordInput(''); setLockError(''); }} className="text-slate-400 font-bold hover:text-slate-600 transition-colors text-xs uppercase tracking-widest mt-2">취소</button>
            </form>
          </div>
        </div>
      )}
      
      {/* 송출 확인 모달 */}
      {sendConfirm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-10 w-full max-w-md shadow-2xl">
            <div className="flex justify-center mb-5">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ring-1 ${sendConfirm.type === 'grade' ? 'bg-purple-50 ring-purple-100' : 'bg-blue-50 ring-blue-100'}`}><AlertCircle size={26} className={sendConfirm.type === 'grade' ? 'text-purple-600' : 'text-blue-600'} /></div>
            </div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight text-center mb-3">
              {sendConfirm.type === 'grade' ? `${localConfig.grade}학년 학생에게 전달사항을 송출하시겠습니까?` : '전체 학생에게 전달사항을 송출하시겠습니까?'}
            </h3>
            <div className="bg-slate-50 rounded-2xl p-4 mb-6 border border-slate-200 max-h-40 overflow-auto">
              <p className="text-sm font-bold text-slate-700 whitespace-pre-wrap break-keep">{sendConfirm.type === 'grade' ? adminGradeAnnInput : adminGlobalAnnInput}</p>
              {(sendConfirm.type === 'grade' ? adminGradeAnnImage : adminGlobalAnnImage) && (
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 font-black"><ImageIcon size={12} /> 이미지 1장 포함</div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setSendConfirm(null)} className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black hover:bg-slate-200 transition-colors">취소</button>
              <button onClick={executeSend} className={`flex-1 text-white py-4 rounded-2xl font-black shadow-lg active:scale-[0.98] transition-all ${sendConfirm.type === 'grade' ? 'bg-purple-600' : 'bg-blue-600'}`}>송출</button>
            </div>
          </div>
        </div>
      )}

      {/* 이미지 확대 모달 */}
      {imageModalUrl && (
        <div onClick={() => setImageModalUrl(null)} className="fixed inset-0 bg-slate-900/95 backdrop-blur-md flex items-center justify-center z-50 p-8 cursor-zoom-out">
          <img src={imageModalUrl} alt="확대" className="max-w-full max-h-full rounded-2xl shadow-2xl" />
          <button onClick={(e) => { e.stopPropagation(); setImageModalUrl(null); }} className="absolute top-8 right-8 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full"><X size={28} /></button>
        </div>
      )}
      
      {isSyncing && <div className="fixed bottom-10 right-10 bg-white/90 backdrop-blur-xl px-6 py-3 rounded-full border border-slate-200 shadow-2xl text-[10px] font-black flex items-center gap-3 text-blue-600 animate-pulse ring-4 ring-blue-50"><Cloud size={14}/> 실시간 동기화 중</div>}
    </div>
  );
}
