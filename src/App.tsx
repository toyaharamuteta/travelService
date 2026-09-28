// src/App.tsx
import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  signOut, 
  type User 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';
import heic2any from 'heic2any';
import { auth, googleProvider, db } from './firebase';
import type { TravelLog, DayLog } from './types/travel';
import './App.css';

// 📱 iPhoneのHEIC画像を自動でJPG形式に変換する機能
const convertHeicToJpg = async (file: File): Promise<File> => {
  const isHeic = file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic' || file.type === 'image/heif';

  if (!isHeic) return file;

  try {
    const convertedBlob = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.8,
    });

    const blobResult = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
    const newFileName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    return new File([blobResult], newFileName, { type: 'image/jpeg' });
  } catch (error) {
    console.error('HEIC変換エラー:', error);
    throw error;
  }
};

// ⚡ 画像を自動で最適サイズ・高圧縮（約100KB）にする機能
const compressImage = (file: File, maxWidth = 500, quality = 0.4): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('Canvas error');
        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

function App() {
  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');

  // Data State
  const [travels, setTravels] = useState<TravelLog[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // UI State (展開されている旅行IDの一覧)
  const [expandedTravelIds, setExpandedTravelIds] = useState<string[]>([]);

  // Form State
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [rating, setRating] = useState(5);
  const [memo, setMemo] = useState('');
  const [days, setDays] = useState<Omit<DayLog, 'id'>[]>([
    { dayNumber: 1, title: '', description: '', photoUrls: [] },
  ]);

  // 1. ログイン状態の監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. ログイン中ユーザーの旅行ログをFirestoreからリアルタイム取得
  useEffect(() => {
    if (!user) {
      setTravels([]);
      return;
    }

    setDataLoading(true);
    const q = query(
      collection(db, 'travels'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs: TravelLog[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as TravelLog[];
      
      // 日付降順ソート
      logs.sort((a, b) => (b.startDate > a.startDate ? 1 : -1));
      setTravels(logs);
      setDataLoading(false);
    }, (error) => {
      console.error('Firestore 読み込みエラー:', error);
      setDataLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // 折りたたみの開閉トグル
  const toggleExpand = (id: string) => {
    setExpandedTravelIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // 認証ハンドラー
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setAuthError(err.message || '認証に失敗しました');
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setAuthError(err.message || 'Googleログインに失敗しました');
    }
  };

  const handleLogout = () => {
    signOut(auth);
  };

  // フォームリセット
  const resetForm = () => {
    setTitle('');
    setDestination('');
    setStartDate('');
    setEndDate('');
    setTotalCost('');
    setRating(5);
    setMemo('');
    setDays([{ dayNumber: 1, title: '', description: '', photoUrls: [] }]);
    setEditingId(null);
    setShowForm(false);
  };

  const handleEditStart = (travel: TravelLog) => {
    setEditingId(travel.id);
    setTitle(travel.title);
    setDestination(travel.destination);
    setStartDate(travel.startDate);
    setEndDate(travel.endDate);
    setTotalCost(travel.totalCost.toString());
    setRating(travel.rating);
    setMemo(travel.memo || '');
    setDays(
      (travel.days || []).map((d) => ({
        dayNumber: d.dayNumber,
        title: d.title,
        description: d.description,
        photoUrls: d.photoUrls || [],
      }))
    );
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('この旅行の思い出を削除してもよろしいですか？')) {
      try {
        await deleteDoc(doc(db, 'travels', id));
      } catch (e) {
        alert('削除に失敗しました');
      }
    }
  };

  const handleAddDay = () => {
    setDays([
      ...days,
      { dayNumber: days.length + 1, title: '', description: '', photoUrls: [] },
    ]);
  };

  const handleDayChange = (
    index: number,
    field: keyof Omit<DayLog, 'id'>,
    value: any
  ) => {
    const updatedDays = [...days];
    updatedDays[index] = { ...updatedDays[index], [field]: value };
    setDays(updatedDays);
  };

  // 写真選択時の処理 (HEIC変換 ➔ リサイズ圧縮)
  const handlePhotoUpload = async (index: number, files: FileList | null) => {
    if (!files || files.length === 0) return;

    try {
      const fileArray = Array.from(files);

      // 1. HEIC画像があればJPGに自動変換
      const convertedFiles = await Promise.all(
        fileArray.map((file) => convertHeicToJpg(file))
      );

      // 2. 変換後のファイルを軽量化（リサイズ・圧縮）
      const compressedDataUrls = await Promise.all(
        convertedFiles.map((file) => compressImage(file))
      );

      const currentPhotos = days[index].photoUrls || [];
      handleDayChange(index, 'photoUrls', [...currentPhotos, ...compressedDataUrls]);
    } catch (e) {
      console.error(e);
      alert('画像の処理に失敗しました');
    }
  };

  const handleRemovePhoto = (dayIndex: number, photoIndex: number) => {
    const currentPhotos = days[dayIndex].photoUrls || [];
    const updated = currentPhotos.filter((_, i) => i !== photoIndex);
    handleDayChange(dayIndex, 'photoUrls', updated);
  };

  // 保存処理 (Firestore)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!title || !destination || !startDate || !endDate) {
      alert('タイトル、行き先、日程を入力してください');
      return;
    }

    const travelPayload = {
      userId: user.uid,
      title,
      destination,
      startDate,
      endDate,
      totalCost: Number(totalCost) || 0,
      rating: Number(rating),
      memo: memo || '',
      days: days.map((d, i) => ({
        ...d,
        id: `day-${Date.now()}-${i}`,
      })),
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'travels', editingId), travelPayload);
      } else {
        await addDoc(collection(db, 'travels'), {
          ...travelPayload,
          createdAt: serverTimestamp(),
        });
      }
      resetForm();
    } catch (e) {
      console.error('保存エラー:', e);
      alert('保存に失敗しました。画像の枚数を減らすか、サイズを確認してください。');
    }
  };

  if (authLoading) {
    return <div style={{ textAlign: 'center', marginTop: '50px' }}>読み込み中...</div>;
  }

  // 未ログイン時のログイン画面
  if (!user) {
    return (
      <div style={{ maxWidth: '400px', margin: '60px auto', padding: '24px', border: '1px solid #ddd', borderRadius: '12px', backgroundColor: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontFamily: 'sans-serif' }}>
        <h2 style={{ textAlign: 'center', color: '#2c3e50', marginBottom: '20px' }}>
          ✈️ 旅行思い出アルバム
        </h2>
        <h3 style={{ textAlign: 'center', fontSize: '16px', color: '#666', marginBottom: '24px' }}>
          {isRegistering ? '新規アカウント作成' : 'ログイン'}
        </h3>

        {authError && (
          <div style={{ padding: '10px', backgroundColor: '#fde8e8', color: '#e74c3c', borderRadius: '6px', marginBottom: '16px', fontSize: '13px' }}>
            {authError}
          </div>
        )}

        <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
          />
          <input
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
          />
          <button
            type="submit"
            style={{ padding: '12px', backgroundColor: '#3498db', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', marginTop: '8px' }}
          >
            {isRegistering ? '登録する' : 'ログイン'}
          </button>
        </form>

        <div style={{ margin: '20px 0', textAlign: 'center', position: 'relative' }}>
          <span style={{ backgroundColor: '#fff', padding: '0 10px', color: '#888', fontSize: '12px' }}>または</span>
          <hr style={{ border: 'none', borderTop: '1px solid #eee', position: 'absolute', top: '50%', width: '100%', zIndex: -1, margin: 0 }} />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          style={{ width: '100%', padding: '10px', backgroundColor: '#4285F4', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          Googleでログイン
        </button>

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '14px', color: '#666' }}>
          {isRegistering ? 'アカウントをお持ちですか？' : 'アカウントをお持ちでないですか？'}{' '}
          <button
            type="button"
            onClick={() => setIsRegistering(!isRegistering)}
            style={{ background: 'none', border: 'none', color: '#3498db', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
          >
            {isRegistering ? 'ログイン画面へ' : '新規登録へ'}
          </button>
        </p>
      </div>
    );
  }

  // ログイン後のメイン画面
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <header style={{ borderBottom: '2px solid #eaeaea', paddingBottom: '12px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: '#2c3e50', fontSize: '24px', margin: 0 }}>✈️ 旅行思い出アルバム</h1>
          <span style={{ fontSize: '12px', color: '#7f8c8d' }}>👤 {user.email}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => {
              if (showForm) resetForm();
              else setShowForm(true);
            }}
            style={{
              backgroundColor: showForm ? '#e74c3c' : '#3498db',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 14px',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            {showForm ? '閉じる' : '＋ 新しい旅行を追加'}
          </button>
          <button
            onClick={handleLogout}
            style={{
              backgroundColor: '#95a5a6',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 12px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            ログアウト
          </button>
        </div>
      </header>

      <main>
        {showForm && (
          <form
            onSubmit={handleSubmit}
            style={{
              backgroundColor: '#f8f9fa',
              border: `2px solid ${editingId ? '#f39c12' : '#3498db'}`,
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h3 style={{ margin: 0, color: editingId ? '#d35400' : '#2c3e50' }}>
              {editingId ? '✏️ 旅行の記憶を編集' : '✏️ 基本情報'}
            </h3>

            <input
              type="text"
              placeholder="旅行タイトル（例: 京都・嵐山もみじ狩り旅）"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            />

            <input
              type="text"
              placeholder="行き先（例: 京都府京都市）"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            />

            <div style={{ display: 'flex', gap: '12px' }}>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <input
                type="number"
                placeholder="合計費用 (円)"
                value={totalCost}
                onChange={(e) => setTotalCost(e.target.value)}
                style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
              />
              <select
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #ccc', backgroundColor: '#fff' }}
              >
                <option value={5}>満足度: ★★★★★ (5)</option>
                <option value={4}>満足度: ★★★★☆ (4)</option>
                <option value={3}>満足度: ★★★☆☆ (3)</option>
                <option value={2}>満足度: ★★☆☆☆ (2)</option>
                <option value={1}>満足度: ★☆☆☆☆ (1)</option>
              </select>
            </div>

            <textarea
              placeholder="旅行全体の感想やメモ"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            />

            <hr style={{ border: 'none', borderTop: '1px dashed #ccc', margin: '8px 0' }} />

            <h3 style={{ margin: 0, color: '#2c3e50' }}>📸 日ごとの思い出と写真</h3>

            {days.map((day, dayIdx) => (
              <div
                key={dayIdx}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <span style={{ fontWeight: 'bold', color: '#e67e22' }}>🗓 {day.dayNumber} 日目</span>

                <input
                  type="text"
                  placeholder="その日の見出し（例: 渡月橋と竹林の小径）"
                  value={day.title}
                  onChange={(e) => handleDayChange(dayIdx, 'title', e.target.value)}
                  style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                />

                <textarea
                  placeholder="その日の思い出やエピソード"
                  value={day.description}
                  onChange={(e) => handleDayChange(dayIdx, 'description', e.target.value)}
                  rows={2}
                  style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                />

                <div>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
                    写真を選択（自動で軽量化して保存されます）:
                  </label>
                  <input
                    type="file"
                    accept="image/*,.heic,.heif"
                    multiple
                    onChange={(e) => handlePhotoUpload(dayIdx, e.target.files)}
                  />
                </div>

                {day.photoUrls && day.photoUrls.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                    {day.photoUrls.map((url, photoIdx) => (
                      <div key={photoIdx} style={{ position: 'relative' }}>
                        <img
                          src={url}
                          alt="プレビュー"
                          style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px' }}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(dayIdx, photoIdx)}
                          style={{
                            position: 'absolute',
                            top: '-6px',
                            right: '-6px',
                            backgroundColor: '#e74c3c',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '50%',
                            width: '20px',
                            height: '20px',
                            fontSize: '10px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={handleAddDay}
              style={{
                backgroundColor: '#9b59b6',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                alignSelf: 'flex-start',
              }}
            >
              ＋ 日数を追加する
            </button>

            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
              <button
                type="submit"
                style={{
                  flex: 1,
                  backgroundColor: editingId ? '#f39c12' : '#2ecc71',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px',
                  fontWeight: 'bold',
                  fontSize: '16px',
                  cursor: 'pointer',
                }}
              >
                {editingId ? '変更を保存する' : 'クラウドに保存する'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  style={{
                    backgroundColor: '#95a5a6',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px 20px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  キャンセル
                </button>
              )}
            </div>
          </form>
        )}

        {/* 旅行ログカード一覧 */}
        {dataLoading ? (
          <p style={{ textAlign: 'center', color: '#888' }}>データを読み込んでいます...</p>
        ) : travels.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', backgroundColor: '#f9f9f9', borderRadius: '12px', color: '#7f8c8d' }}>
            <p style={{ fontSize: '18px', margin: '0 0 8px 0' }}>まだ旅行の思い出が登録されていません 🌴</p>
            <p style={{ fontSize: '14px', margin: 0 }}>「＋ 新しい旅行を追加」ボタンから最初の旅を記録してみましょう！</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '20px' }}>
            {travels.map((travel) => {
              const isExpanded = expandedTravelIds.includes(travel.id);
              const isDayTrip = travel.startDate === travel.endDate || (travel.days || []).length <= 1;

              return (
                <div
                  key={travel.id}
                  style={{
                    border: '1px solid #e0e0e0',
                    borderRadius: '12px',
                    padding: '20px',
                    backgroundColor: '#ffffff',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, color: '#2c3e50', fontSize: '20px' }}>{travel.title}</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ color: '#f1c40f', fontSize: '18px' }}>
                        {'★'.repeat(travel.rating)}{'☆'.repeat(5 - travel.rating)}
                      </span>
                      <button
                        onClick={() => handleEditStart(travel)}
                        style={{
                          backgroundColor: '#f39c12',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontSize: '12px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                        }}
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(travel.id)}
                        style={{
                          backgroundColor: '#e74c3c',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontSize: '12px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </div>

                  <p style={{ margin: '6px 0 12px 0', color: '#666', fontSize: '14px' }}>
                    📍 {travel.destination} ｜ 🗓 {travel.startDate === travel.endDate ? travel.startDate : `${travel.startDate} 〜 ${travel.endDate}`} ｜ 💰 ¥{travel.totalCost.toLocaleString()}
                  </p>

                  {travel.memo && (
                    <p style={{ margin: '0 0 12px 0', padding: '8px 12px', backgroundColor: '#fdfefe', borderLeft: '3px solid #bdc3c7', borderRadius: '4px', fontSize: '13px', color: '#555' }}>
                      📝 {travel.memo}
                    </p>
                  )}

                  {/* アコーディオン開閉ボタン */}
                  <div style={{ marginTop: '8px' }}>
                    <button
                      type="button"
                      onClick={() => toggleExpand(travel.id)}
                      style={{
                        backgroundColor: '#f1f2f6',
                        color: '#2f3542',
                        border: '1px solid #dcdde1',
                        borderRadius: '6px',
                        padding: '6px 14px',
                        fontSize: '13px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        width: '100%',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      {isExpanded ? '▲ 日程・詳細をたたむ' : `▼ 日程・詳細を見る (${(travel.days || []).length}件)`}
                    </button>
                  </div>

                  {/* 日ごとのタイムライン (アコーディオン開閉) */}
                  {isExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
                      {(travel.days || []).map((day) => (
                        <div
                          key={day.id || day.dayNumber}
                          style={{
                            backgroundColor: '#f8f9fa',
                            borderLeft: '4px solid #3498db',
                            borderRadius: '0 8px 8px 0',
                            padding: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          {/* 日帰りでなければ「◯日目」を表示 */}
                          {!isDayTrip && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#e67e22', backgroundColor: '#fef5e7', padding: '2px 8px', borderRadius: '4px' }}>
                                {day.dayNumber} 日目
                              </span>
                            </div>
                          )}

                          {day.title && <h4 style={{ margin: 0, color: '#333', fontSize: '15px' }}>{day.title}</h4>}
                          {day.description && <p style={{ margin: 0, fontSize: '13px', color: '#555', lineHeight: '1.4' }}>{day.description}</p>}

                          {day.photoUrls && day.photoUrls.length > 0 && (
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                              {day.photoUrls.map((url, pIdx) => (
                                <img
                                  key={pIdx}
                                  src={url}
                                  alt={`${day.title || '写真'} - ${pIdx + 1}`}
                                  style={{
                                    width: '120px',
                                    height: '90px',
                                    objectFit: 'cover',
                                    borderRadius: '8px',
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;