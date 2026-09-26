// 日ごとの思い出の型定義
export interface DayLog {
  id: string;
  dayNumber: number;
  title: string;
  description: string;
  photoUrls?: string[]; // 👈 複数枚（配列）に変更！
}

// 旅行ログ全体の型定義
export interface TravelLog {
  id: string;
  userId: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  totalCost: number;
  rating: number;
  memo?: string;
  days: DayLog[];
}

export type CreateTravelLogInput = Omit<
  TravelLog,
  'id' | 'userId' | 'createdAt' | 'updatedAt'
>;